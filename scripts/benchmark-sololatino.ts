import fs from "fs";
import path from "path";
import { GetUrl } from "@/strategies/sololatino/get-url.operation";
import { remove } from "@/services/movie.store";

// Load environment variables
if (fs.existsSync(".env.local") && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch (_) {}
}

const testMovies = [
  "/pelicula/carolina-caroline",
  "/pelicula/hashtag-proposal",
  "/pelicula/un-plan-brillante",
];

async function runBenchmark() {
  console.log("=== SoloLatino Fast GetUrl Benchmark ===");
  const getUrl = new GetUrl();
  const results: Array<{ path: string; durationMs: number; url: string | null; fallbackUrl: string | null }> = [];

  for (const moviePath of testMovies) {
    console.log(`\n-----------------------------------------`);
    console.log(`🎬 Testing: ${moviePath}`);
    // Clear any local cache so we measure real extraction time
    remove(moviePath);

    const start = performance.now();
    try {
      const res = await getUrl.operation(moviePath);
      const durationMs = Math.round(performance.now() - start);
      console.log(`✅ Success for ${moviePath} in ${durationMs}ms`);
      console.log(`   url: ${res.url}`);
      console.log(`   fallbackUrl: ${res.fallbackUrl}`);
      results.push({ path: moviePath, durationMs, url: res.url, fallbackUrl: res.fallbackUrl });
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      console.error(`❌ Error testing ${moviePath} after ${durationMs}ms:`, err);
      results.push({ path: moviePath, durationMs, url: null, fallbackUrl: null });
    }
  }

  console.log("\n================ SUMMARY ================");
  console.table(results);

  const allPassed = results.every((r) => r.url !== null);
  const avgDuration = Math.round(results.reduce((acc, r) => acc + r.durationMs, 0) / results.length);
  console.log(`Average duration: ${avgDuration}ms`);

  process.exit(allPassed ? 0 : 1);
}

runBenchmark().catch((err) => {
  console.error("Benchmark crashed:", err);
  process.exit(1);
});
