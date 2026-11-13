/**
 * Checks whether an M3U8 manifest is safe and reusable across multiple clients for caching in MinIO.
 * If the manifest contains ephemeral or IP-bound URLs (such as player.pelisserieshoy.com),
 * it must NOT be saved in MinIO / StreamCache.
 */
export function isManifestReusable(manifestContent: string): boolean {
  if (!manifestContent || typeof manifestContent !== "string") {
    return false;
  }

  // Reject IP-bound or token-bound player URLs
  if (manifestContent.includes("player.pelisserieshoy.com")) {
    return false;
  }

  return true;
}
