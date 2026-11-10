import { get, remove, upsert } from "@/services/movie.store";
import {
  hasManifest,
  getManifestPublicUrl,
  saveManifestFromUpstream,
  normalizeMoviePath,
} from "@/services/minio.service";
import { Url } from "@/types/movie";

/**
 * Resolves a cached stream URL from either MinIO bucket or persistent store.
 * Returns null if no valid, non-expired stream is cached.
 */
export async function resolveCachedStream(path: string): Promise<Url | null> {
  const cleanPath = normalizeMoviePath(path);
  if (!cleanPath) return null;

  // 1. Check if the manifest exists in MinIO bucket
  try {
    const inMinio = await hasManifest(cleanPath);
    if (inMinio) {
      const appUrl = getManifestPublicUrl(cleanPath);
      try {
        upsert(path, { movieUrl: appUrl });
        if (cleanPath !== path) {
          upsert(cleanPath, { movieUrl: appUrl });
        }
      } catch {
        // Ignore store upsert failure
      }

      return {
        url: appUrl,
        fallbackUrl: appUrl,
      };
    }
  } catch (err) {
    console.warn(`[StreamCache] MinIO check failed for ${cleanPath}:`, err);
  }

  // 2. Check SQLite persistent store for clean, non-expired manifest URLs
  const cached = get(path) || (cleanPath !== path ? get(cleanPath) : undefined);
  if (cached?.movieUrl) {
    const movieUrl = cached.movieUrl;

    // Purge corrupted legacy paths
    if (movieUrl.includes("path=https") || movieUrl.includes("sololatino.net")) {
      remove(path);
      if (cleanPath !== path) remove(cleanPath);
      return null;
    }

    // Clean API manifest URL (/api/video/m3u8?path=...)
    if (
      movieUrl.startsWith("/api/video/m3u8?path=") &&
      !movieUrl.includes("&url=")
    ) {
      return {
        url: movieUrl,
        fallbackUrl: movieUrl,
      };
    }

    // Purge ephemeral upstream tokens that are not backed by MinIO
    if (
      movieUrl.includes("player.pelisserieshoy.com") ||
      movieUrl.includes("p.php") ||
      movieUrl.includes(".ts") ||
      movieUrl.includes("&url=") ||
      movieUrl.includes("?url=")
    ) {
      remove(path);
      if (cleanPath !== path) remove(cleanPath);
      return null;
    }

    // Direct proxy or generic streaming URL
    if (movieUrl.startsWith("/api/")) {
      return {
        url: movieUrl,
        fallbackUrl: movieUrl,
      };
    }
  }

  return null;
}

/**
 * Persists an upstream M3U8 manifest into MinIO bucket, rewriting segments for local proxying,
 * and updates SQLite persistent store. Returns the public stream URL.
 */
export async function persistUpstreamManifest(
  path: string,
  rawM3u8Url: string,
): Promise<string> {
  const cleanPath = normalizeMoviePath(path);

  try {
    console.info(`[StreamCache] Uploading M3U8 to MinIO bucket for: ${cleanPath}...`);
    const minioAppUrl = await saveManifestFromUpstream(cleanPath, rawM3u8Url);

    try {
      upsert(path, { movieUrl: minioAppUrl });
      if (cleanPath !== path) {
        upsert(cleanPath, { movieUrl: minioAppUrl });
      }
    } catch {
      // Ignore store upsert failure
    }

    console.info(`[StreamCache] Successfully saved in MinIO bucket: ${cleanPath}`);
    return minioAppUrl;
  } catch (err) {
    console.warn(`[StreamCache] Failed to save manifest in MinIO for ${cleanPath}:`, err);
    const fallbackUrl = `/api/video/m3u8?path=${encodeURIComponent(cleanPath)}&url=${encodeURIComponent(rawM3u8Url)}`;

    try {
      upsert(path, { movieUrl: fallbackUrl });
      if (cleanPath !== path) {
        upsert(cleanPath, { movieUrl: fallbackUrl });
      }
    } catch {
      // Ignore store upsert failure
    }

    return fallbackUrl;
  }
}

/**
 * Persists any resolved stream URL to the local store for quick retrieval.
 */
export function persistStreamUrl(path: string, streamUrl: string): void {
  const cleanPath = normalizeMoviePath(path);
  try {
    upsert(path, { movieUrl: streamUrl });
    if (cleanPath !== path) {
      upsert(cleanPath, { movieUrl: streamUrl });
    }
  } catch (err) {
    console.warn(`[StreamCache] Failed to persist stream url for ${path}:`, err);
  }
}
