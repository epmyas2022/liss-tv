import fs from "fs";
import path from "path";
import Database, { Database as DatabaseType } from "better-sqlite3";
import { GetUrl } from "@/strategies/sololatino/get-url.operation";
import { hasManifest, normalizeMoviePath } from "@/services/minio.service";
import { StoredMovie } from "@/types/movie";

// Load environment variables if available
const envFiles = [".env.local", ".env"];
for (const envFile of envFiles) {
  const fullPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(fullPath) && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(fullPath);
    } catch {
      // Ignore errors loading env file
    }
  }
}

interface CliOptions {
  delayMs: number;
  force: boolean;
  limit?: number;
  watch: boolean;
  pollIntervalMs: number;
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    delayMs: 5000,
    force: false,
    watch: false,
    pollIntervalMs: 30000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--watch" || arg === "-w") {
      options.watch = true;
    } else if (arg === "--delay" || arg === "-d") {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val >= 0) options.delayMs = val;
    } else if (arg === "--limit" || arg === "-l") {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) options.limit = val;
    } else if (arg === "--poll" || arg === "-p") {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) options.pollIntervalMs = val * 1000;
    }
  }

  return options;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDatabase(): DatabaseType {
  const dbPath = path.join(process.cwd(), "data", "movies.db");
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found at ${dbPath}`);
  }
  return new Database(dbPath, { readonly: false });
}

interface MovieListEntry {
  movies?: Array<{ link?: string }>;
}

/**
 * Scans SQLite movie_cache table to discover all target movie and episode links.
 */
function extractLinksFromDatabase(db: DatabaseType): string[] {
  const rows = db.prepare("SELECT key, data FROM movie_cache").all() as Array<{
    key: string;
    data: string;
  }>;

  const links = new Set<string>();

  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.data);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== "object") continue;

    // Case 1: Stored movie/series with episodes
    const stored = parsed as StoredMovie;
    if (Array.isArray(stored.episodes) && stored.episodes.length > 0) {
      for (const season of stored.episodes) {
        if (!Array.isArray(season?.episodes)) continue;
        for (const ep of season.episodes) {
          if (ep?.link && typeof ep.link === "string") {
            links.add(ep.link);
          }
        }
      }
    } else if (
      row.key.includes("/pelicula/") ||
      row.key.includes("/serie/") ||
      (typeof stored.link === "string" && (stored.link.includes("/pelicula/") || stored.link.includes("/serie/")))
    ) {
      links.add(stored.link || row.key);
    }

    // Case 2: List caches like 'home' or categories containing movies array
    const listEntry = parsed as MovieListEntry;
    if (Array.isArray(listEntry.movies)) {
      for (const movie of listEntry.movies) {
        if (movie?.link && typeof movie.link === "string") {
          links.add(movie.link);
        }
      }
    }
  }

  return Array.from(links).filter((link) => {
    return link.includes("/pelicula/") || link.includes("/serie/");
  });
}

async function runSyncPass(
  db: DatabaseType,
  getUrlStrategy: GetUrl,
  options: CliOptions,
): Promise<{ processed: number; skipped: number; errors: number }> {
  const allLinks = extractLinksFromDatabase(db);
  console.info(`\n[🔍] Discovered ${allLinks.length} total media link(s) in SQLite.`);

  let targetLinks = allLinks;
  if (options.limit && options.limit > 0) {
    targetLinks = targetLinks.slice(0, options.limit);
    console.info(`[⚙️] Processing limited to ${targetLinks.length} item(s).`);
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < targetLinks.length; i++) {
    const link = targetLinks[i];
    const indexStr = `[${i + 1}/${targetLinks.length}]`;
    const cleanPath = normalizeMoviePath(link);

    // 1. Check if MinIO already has the manifest
    if (!options.force) {
      try {
        const exists = await hasManifest(cleanPath);
        if (exists) {
          console.info(`${indexStr} [SKIP] Already stored in MinIO: ${cleanPath}`);
          skipped++;
          continue;
        }
      } catch (err) {
        console.warn(`${indexStr} [WARN] Failed to verify MinIO status for ${cleanPath}:`, err);
      }
    }

    // 2. Resolve URL and generate/upload manifest
    console.info(`${indexStr} [▶️] Resolving URL and storing manifest for: ${link}`);
    try {
      const result = await getUrlStrategy.operation(link);
      console.info(`${indexStr} [✅] Success! Result URL: ${result.url || result.fallbackUrl || "N/A"}`);
      processed++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${indexStr} [❌] Failed to resolve URL for ${link}: ${message}`);
    }

    // 3. Delay before next item (default 5 seconds)
    if (i < targetLinks.length - 1) {
      console.info(`[⏳] Waiting ${options.delayMs / 1000}s before next request...`);
      await sleep(options.delayMs);
    }
  }

  return { processed, skipped, errors };
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  console.info("=================================================");
  console.info("🚀 Media URL Generator & MinIO Sync Worker");
  console.info("=================================================");
  console.info(`Delay between requests: ${options.delayMs / 1000}s`);
  console.info(`Force re-scrape: ${options.force ? "YES" : "NO"}`);
  console.info(`Mode: ${options.watch ? `Watch / Daemon (interval: ${options.pollIntervalMs / 1000}s)` : "Single run"}`);
  if (options.limit) console.info(`Limit per pass: ${options.limit}`);
  console.info("=================================================");

  let db: DatabaseType;
  try {
    db = getDatabase();
  } catch (err) {
    console.error("[FATAL] Could not open database:", err);
    process.exit(1);
  }

  const getUrlStrategy = new GetUrl();

  let isRunning = true;
  process.on("SIGINT", () => {
    console.info("\n[🛑] Received SIGINT. Shutting down gracefully...");
    isRunning = false;
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.info("\n[🛑] Received SIGTERM. Shutting down gracefully...");
    isRunning = false;
    process.exit(0);
  });

  do {
    const summary = await runSyncPass(db, getUrlStrategy, options);
    console.info("\n-------------------------------------------------");
    console.info(`📊 Pass complete: ${summary.processed} processed, ${summary.skipped} skipped, ${summary.errors} errors.`);
    console.info("-------------------------------------------------");

    if (options.watch && isRunning) {
      console.info(`[💤] Sleeping for ${options.pollIntervalMs / 1000}s before next scan...`);
      await sleep(options.pollIntervalMs);
    }
  } while (options.watch && isRunning);

  console.info("[🏁] Sync finished.");
}

main().catch((err) => {
  console.error("[FATAL] Unexpected error in sync script:", err);
  process.exit(1);
});
