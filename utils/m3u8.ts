export const M3U8_PROXY_PATH = "/api/video/m3u8";

export function resolveUrl(uri: string, manifestUrl: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  const base = new URL(manifestUrl);
  base.pathname = base.pathname.replace(/\/[^/]*$/, "/");
  return new URL(uri, base).href;
}

export function rewriteManifest(
  body: string,
  manifestUrl: string,
  baseOrigin?: string,
): string {
  const validOrigin =
    baseOrigin && !baseOrigin.includes("0.0.0.0")
      ? baseOrigin.replace(/\/+$/, "")
      : "";
  const prefix = validOrigin
    ? `${validOrigin}${M3U8_PROXY_PATH}`
    : M3U8_PROXY_PATH;

  return body
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // Filter out tracking/ad networks and image trackers
      if (
        trimmed.includes("tiktokcdn.com") ||
        trimmed.includes("doubleclick.net") ||
        trimmed.includes("googleads") ||
        trimmed.includes("googlesyndication")
      ) {
        return false;
      }
      return true;
    })
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("#") && trimmed.includes("URI=")) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri: string) => {
          const absolute = resolveUrl(uri, manifestUrl);
          return `URI="${prefix}?url=${encodeURIComponent(absolute)}"`;
        });
      }

      if (trimmed !== "" && !trimmed.startsWith("#")) {
        const absolute = resolveUrl(trimmed, manifestUrl);
        return `${prefix}?url=${encodeURIComponent(absolute)}`;
      }

      return line;
    })
    .join("\n");
}
