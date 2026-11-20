import { get, getAny, remove, upsert } from "@/services/movie.store";
import {
  hasManifest,
  getManifestPublicUrl,
  saveManifest,
  saveManifestFromUpstream,
  normalizeMoviePath,
  type SaveManifestOptions,
} from "@/services/minio.service";
import { rewriteManifest } from "@/utils/m3u8";
import type { Url } from "@/types/movie";
import { inferProviderFromLink } from "@/utils/utils";

/**
 * Resolves a cached stream URL from either MinIO bucket or persistent store.
 * Returns null if no valid, non-expired stream is cached.
 */
export async function resolveCachedStream(path: string, providerId?: string): Promise<Url | null> {
  const cleanPath = normalizeMoviePath(path);
  if (!cleanPath) return null;
  const targetProvider = providerId || inferProviderFromLink(path) || "sololatino";

  // 1. Check if the manifest exists in MinIO bucket
  try {
    const inMinio = await hasManifest(cleanPath);
    if (inMinio) {
      const appUrl = getManifestPublicUrl(cleanPath);
      try {
        upsert(targetProvider, path, { movieUrl: appUrl });
        if (cleanPath !== path) {
          upsert(targetProvider, cleanPath, { movieUrl: appUrl });
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
  const cached = providerId
    ? get(providerId, path) || (cleanPath !== path ? get(providerId, cleanPath) : undefined)
    : getAny(path) || (cleanPath !== path ? getAny(cleanPath) : undefined);

  if (cached?.movieUrl) {
    const movieUrl = cached.movieUrl;
    const cacheProvider = cached.provider || targetProvider;

    // Purge corrupted legacy paths
    if (movieUrl.includes("path=https") || movieUrl.includes("sololatino.net")) {
      remove(cacheProvider, path);
      if (cleanPath !== path) remove(cacheProvider, cleanPath);
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
      remove(cacheProvider, path);
      if (cleanPath !== path) remove(cacheProvider, cleanPath);
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

export type PersistManifestOptions = SaveManifestOptions;

/**
 * Persists an upstream M3U8 manifest into MinIO bucket, rewriting segments for local proxying,
 * and updates SQLite persistent store. Returns the public stream URL.
 */
export async function persistUpstreamManifest(
  path: string,
  rawM3u8Url: string,
  options?: PersistManifestOptions,
  providerId?: string,
): Promise<string | null> {
  const cleanPath = normalizeMoviePath(path);
  const targetProvider = providerId || inferProviderFromLink(path) || "sololatino";

  try {
    console.info(`[StreamCache] Uploading M3U8 to MinIO bucket for: ${cleanPath}...`);
    const minioAppUrl = await saveManifestFromUpstream(cleanPath, rawM3u8Url, options);

    try {
      upsert(targetProvider, path, { movieUrl: minioAppUrl });
      if (cleanPath !== path) {
        upsert(targetProvider, cleanPath, { movieUrl: minioAppUrl });
      }
    } catch {
      // Ignore store upsert failure
    }

    console.info(`[StreamCache] Successfully saved in MinIO bucket: ${cleanPath}`);
    return minioAppUrl;
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("player.pelisserieshoy.com")
    ) {
      console.warn(
        `[StreamCache] Skipping StreamCache for ${cleanPath}: manifest is host-bound (player.pelisserieshoy.com).`,
      );
      return null;
    }

    console.warn(`[StreamCache] Failed to save manifest in MinIO for ${cleanPath}:`, err);
    const fallbackUrl = `/api/video/m3u8?path=${encodeURIComponent(cleanPath)}&url=${encodeURIComponent(rawM3u8Url)}`;

    try {
      upsert(targetProvider, path, { movieUrl: fallbackUrl });
      if (cleanPath !== path) {
        upsert(targetProvider, cleanPath, { movieUrl: fallbackUrl });
      }
    } catch {
      // Ignore store upsert failure
    }

    return fallbackUrl;
  }
}

/**
 * Persists an in-memory M3U8 manifest directly into MinIO bucket,
 * rewriting segments for local proxying, and updates SQLite persistent store.
 */
export async function persistManifestContent(
  path: string,
  content: string,
  manifestUrl: string,
  referer?: string,
  providerId?: string,
): Promise<string | null> {
  const cleanPath = normalizeMoviePath(path);
  if (!cleanPath) return null;
  const targetProvider = providerId || inferProviderFromLink(path) || "sololatino";

  try {
    const origin =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL;
    const rewritten = rewriteManifest(content, manifestUrl, {
      baseOrigin: origin,
      directSegments: true,
      referer: referer,
    });

    const appUrl = await saveManifest(cleanPath, rewritten);
    try {
      upsert(targetProvider, path, { movieUrl: appUrl });
      if (cleanPath !== path) {
        upsert(targetProvider, cleanPath, { movieUrl: appUrl });
      }
    } catch {
      // Ignore store upsert failure
    }

    return appUrl;
  } catch (err) {
    console.warn(`[StreamCache] Failed to save in-memory manifest for ${cleanPath}:`, err);
    return null;
  }
}

/**
 * Persists any resolved stream URL to the local store for quick retrieval.
 */
export function persistStreamUrl(path: string, streamUrl: string, providerId?: string): void {
  const cleanPath = normalizeMoviePath(path);
  const targetProvider = providerId || inferProviderFromLink(path) || "sololatino";
  try {
    upsert(targetProvider, path, { movieUrl: streamUrl });
    if (cleanPath !== path) {
      upsert(targetProvider, cleanPath, { movieUrl: streamUrl });
    }
  } catch (err) {
    console.warn(`[StreamCache] Failed to persist stream url for ${path}:`, err);
  }
}
