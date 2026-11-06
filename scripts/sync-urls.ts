import fs from "fs";
import path from "path";
import Database, { Database as DatabaseType } from "better-sqlite3";
import { GetUrl } from "@/strategies/sololatino/get-url.operation";
import { GetDetail } from "@/strategies/sololatino/get-detail.operation";
import { get } from "@/services/movie.store";
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
  detailDelayMs: number;
  force: boolean;
  limit?: number;
  watch: boolean;
  pollIntervalMs: number;
  detailsOnly: boolean;
  videosOnly: boolean;
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    delayMs: 5000,
    detailDelayMs: 2000,
    force: false,
    watch: false,
    pollIntervalMs: 30000,
    detailsOnly: false,
    videosOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--watch" || arg === "-w") {
      options.watch = true;
    } else if (arg === "--details-only") {
      options.detailsOnly = true;
    } else if (arg === "--videos-only") {
      options.videosOnly = true;
    } else if (arg === "--delay" || arg === "-d") {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val >= 0) options.delayMs = val;
    } else if (arg === "--detail-delay") {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val >= 0) options.detailDelayMs = val;
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

function isEpisodeLink(link: string): boolean {
  return (
    link.includes("/temporada-") ||
    link.includes("/temporada/") ||
    link.includes("/episodio-") ||
    link.includes("/episodio/") ||
    link.includes("-temporada-") ||
    link.includes("-capitulo-")
  );
}

function isSeriesRoot(link: string): boolean {
  if (!link.includes("/serie/")) return false;
  return !isEpisodeLink(link);
}

interface DiscoveredCatalog {
  movieLinks: Set<string>;
  seriesRoots: Set<string>;
}

/**
 * Scans SQLite database to discover all unique movie links and series root links.
 */
function scanCatalogFromDatabase(db: DatabaseType): DiscoveredCatalog {
  const rows = db.prepare("SELECT key, data FROM movie_cache").all() as Array<{
    key: string;
    data: string;
  }>;

  const movieLinks = new Set<string>();
  const seriesRoots = new Set<string>();

  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.data);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== "object") continue;

    // 1. Check direct keys
    if (row.key.includes("/pelicula/")) {
      movieLinks.add(row.key);
    } else if (isSeriesRoot(row.key)) {
      seriesRoots.add(row.key);
    }

    // 2. Check stored detail object link
    const stored = parsed as StoredMovie;
    if (typeof stored.link === "string") {
      if (stored.link.includes("/pelicula/")) {
        movieLinks.add(stored.link);
      } else if (isSeriesRoot(stored.link)) {
        seriesRoots.add(stored.link);
      }
    }

    // 3. Check list collections (home, categories, search results)
    const listEntry = parsed as MovieListEntry;
    if (Array.isArray(listEntry.movies)) {
      for (const item of listEntry.movies) {
        if (!item?.link || typeof item.link !== "string") continue;
        if (item.link.includes("/pelicula/")) {
          movieLinks.add(item.link);
        } else if (isSeriesRoot(item.link)) {
          seriesRoots.add(item.link);
        }
      }
    }
  }

  return { movieLinks, seriesRoots };
}

/**
 * Stage 1: Hydrate details for all series (seasons & episodes) and movies into SQLite.
 */
async function hydrateMetadataAndEpisodes(
  catalog: DiscoveredCatalog,
  getDetailStrategy: GetDetail,
  options: CliOptions,
): Promise<void> {
  const { seriesRoots, movieLinks } = catalog;

  console.info("\n=================================================");
  console.info("📚 STAGE 1: Hydrating Metadata & Series Episodes");
  console.info("=================================================");
  console.info(`Found ${seriesRoots.size} series and ${movieLinks.size} movies to verify in SQLite.`);

  // 1. Process all series: ensure seasons and episodes are cached
  let seriesCount = 0;
  for (const serieLink of seriesRoots) {
    seriesCount++;
    const prefix = `[Series ${seriesCount}/${seriesRoots.size}]`;

    const cached = get(serieLink);
    if (cached?.episodes && cached.episodes.length > 0) {
      const epTotal = cached.episodes.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);
      console.info(`${prefix} [CACHE] Already has ${epTotal} episode(s) across ${cached.episodes.length} season(s) for: ${serieLink}`);
      continue;
    }


    const serieLinkCleaned = serieLink.replace("/serie", "serie");
    console.info(`${prefix} [🌐] Fetching series details and episode list for: ${serieLinkCleaned}...`);
    try {
      const detail = await getDetailStrategy.operation(serieLinkCleaned);
      if (detail?.episodes && detail.episodes.length > 0) {
        const epTotal = detail.episodes.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);
        console.info(`${prefix} [✅] Saved ${epTotal} episode(s) across ${detail.episodes.length} season(s) into SQLite for: ${serieLink}`);
      } else {
        console.warn(`${prefix} [WARN] No episodes found on remote page for: ${serieLink}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${prefix} [❌] Failed to fetch series details for ${serieLink}: ${message}`);
    }

    await sleep(options.detailDelayMs);
  }

  // 2. Process all movies: ensure synopsis, backdrop and info are cached
  let movieCount = 0;
  for (const movieLink of movieLinks) {
    movieCount++;
    const prefix = `[Movie ${movieCount}/${movieLinks.size}]`;

    const cached = get(movieLink);
    if (cached?.title && (cached?.caption || cached?.backgroundImage)) {
      continue; // Movie metadata already hydrated
    }

    console.info(`${prefix} [🌐] Fetching movie metadata for: ${movieLink}...`);
    try {
      const detail = await getDetailStrategy.operation(movieLink);
      if (detail?.title) {
        console.info(`${prefix} [✅] Saved movie details for: ${detail.title} (${movieLink})`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${prefix} [❌] Failed to fetch movie details for ${movieLink}: ${message}`);
    }

    await sleep(options.detailDelayMs);
  }

  console.info("-------------------------------------------------");
  console.info("✅ STAGE 1 Complete: Catalog metadata and episodes hydrated.");
  console.info("-------------------------------------------------");
}

/**
 * Stage 2: Collect all playable items (movies & individual episodes) and sync their .m3u8 manifests to MinIO.
 */
async function syncPlayableVideos(
  db: DatabaseType,
  getUrlStrategy: GetUrl,
  options: CliOptions,
): Promise<{ processed: number; skipped: number; errors: number }> {
  console.info("\n=================================================");
  console.info("🎬 STAGE 2: Resolving Video URLs & Storing M3U8 in MinIO");
  console.info("=================================================");

  // Read all hydrated items from SQLite
  const rows = db.prepare("SELECT key, data FROM movie_cache").all() as Array<{
    key: string;
    data: string;
  }>;

  const playableItems = new Set<string>();

  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.data);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== "object") continue;

    const stored = parsed as StoredMovie;

    // Add all episodes from series
    if (Array.isArray(stored.episodes) && stored.episodes.length > 0) {
      for (const season of stored.episodes) {
        if (!Array.isArray(season?.episodes)) continue;
        for (const ep of season.episodes) {
          if (ep?.link && typeof ep.link === "string") {
            playableItems.add(ep.link);
          }
        }
      }
    }

    // Add movie link
    if (row.key.includes("/pelicula/")) {
      playableItems.add(row.key);
    } else if (stored.link && stored.link.includes("/pelicula/")) {
      playableItems.add(stored.link);
    }
  }

  const allItems = Array.from(playableItems).filter((link) => {
    return link.includes("/pelicula/") || isEpisodeLink(link);
  });

  console.info(`Found ${allItems.length} total playable media item(s) (movies & individual episodes).`);

  let targetItems = allItems;
  if (options.limit && options.limit > 0) {
    targetItems = targetItems.slice(0, options.limit);
    console.info(`[⚙️] Processing limited to ${targetItems.length} item(s).`);
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < targetItems.length; i++) {
    const link = targetItems[i];
    const indexStr = `[Video ${i + 1}/${targetItems.length}]`;
    const cleanPath = normalizeMoviePath(link);

    // 1. Check if manifest already exists in MinIO
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

    // 2. Resolve URL and save manifest to MinIO and SQLite
    console.info(`${indexStr} [▶️] Resolving video URL & storing M3U8 for: ${link}`);
    try {
      const result = await getUrlStrategy.operation(link);
      const savedUrl = result.fallbackUrl || result.url || "N/A";
      console.info(`${indexStr} [✅] Success! Stored M3U8: ${savedUrl}`);
      processed++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${indexStr} [❌] Failed to resolve URL for ${link}: ${message}`);
    }

    // 3. Delay between video scrapings (default 5 seconds)
    if (i < targetItems.length - 1) {
      console.info(`[⏳] Waiting ${options.delayMs / 1000}s before next video...`);
      await sleep(options.delayMs);
    }
  }

  return { processed, skipped, errors };
}

async function runSyncPass(
  db: DatabaseType,
  getDetailStrategy: GetDetail,
  getUrlStrategy: GetUrl,
  options: CliOptions,
): Promise<{ processed: number; skipped: number; errors: number }> {
  // 1. Discover all movies and series in catalog
  const catalog = scanCatalogFromDatabase(db);

  // 2. Stage 1: Hydrate all series (seasons & episodes) and movies into SQLite
  if (!options.videosOnly) {
    await hydrateMetadataAndEpisodes(catalog, getDetailStrategy, options);
  }

  // 3. Stage 2: Resolve video streams and upload .m3u8 to MinIO
  if (!options.detailsOnly) {
    return await syncPlayableVideos(db, getUrlStrategy, options);
  }

  return { processed: 0, skipped: 0, errors: 0 };
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  console.info("=================================================");
  console.info("🚀 Media Catalog & MinIO Video Sync Worker");
  console.info("=================================================");
  console.info(`Video request delay: ${options.delayMs / 1000}s`);
  console.info(`Detail request delay: ${options.detailDelayMs / 1000}s`);
  console.info(`Force re-scrape: ${options.force ? "YES" : "NO"}`);
  console.info(`Mode: ${options.watch ? `Watch / Daemon (poll interval: ${options.pollIntervalMs / 1000}s)` : "Single run"}`);
  if (options.limit) console.info(`Limit per pass: ${options.limit}`);
  if (options.detailsOnly) console.info("Filter: Details only (Stage 1)");
  if (options.videosOnly) console.info("Filter: Videos only (Stage 2)");
  console.info("=================================================");

  let db: DatabaseType;
  try {
    db = getDatabase();
  } catch (err) {
    console.error("[FATAL] Could not open database:", err);
    process.exit(1);
  }

  const getDetailStrategy = new GetDetail();
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
    const summary = await runSyncPass(db, getDetailStrategy, getUrlStrategy, options);
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
