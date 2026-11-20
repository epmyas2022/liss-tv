import { unpackDeanEdwards, extractM3u8FromUnpacked, isDeadCdn } from "./vidhide.extractor";

const STREAMWISH_MIRRORS = [
  "streamwish.to",
  "strwish.com",
  "wishembed.pro",
  "swishsrv.com",
  "awish.pro",
  "hglink.to",
];

async function fetchStreamwishPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://megadede.mobi/",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      return await res.text();
    }
  } catch {
    // Network / timeout failure on this mirror
  }
  return null;
}

export async function extractStreamwishM3u8(
  embedUrl: string,
  depth = 0
): Promise<string | null> {
  if (depth > 2 || isDeadCdn(embedUrl)) return null;

  try {
    let html = await fetchStreamwishPage(embedUrl);

    // If initial embedUrl failed (e.g. hglink.to returns 522/Cloudflare block), try alternate mirrors
    if (!html) {
      const parsed = new URL(embedUrl);
      const isKnownMirror = STREAMWISH_MIRRORS.some((m) => parsed.hostname.includes(m));
      if (isKnownMirror) {
        for (const mirror of STREAMWISH_MIRRORS) {
          if (!parsed.hostname.includes(mirror)) {
            const alternateUrl = `${parsed.protocol}//${mirror}${parsed.pathname}${parsed.search}`;
            html = await fetchStreamwishPage(alternateUrl);
            if (html) {
              embedUrl = alternateUrl;
              break;
            }
          }
        }
      }
    }

    if (!html) return null;

    // 1. Follow client-side redirect if present
    const redirectMatch = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (redirectMatch) {
      return extractStreamwishM3u8(new URL(redirectMatch[1], embedUrl).href, depth + 1);
    }

    // 2. Check for intermediate iframe
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch) {
      const iframeUrl = new URL(iframeMatch[1], embedUrl).href;
      if (iframeUrl !== embedUrl) {
        const streamFromIframe = await extractStreamwishM3u8(iframeUrl, depth + 1);
        if (streamFromIframe) return streamFromIframe;
      }
    }

    // 3. Check packed script first (where JWPlayer setup and links are defined)
    const packedMatch = html.match(
      /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\(['"]\|['"]\)[\s\S]*?\)\)/,
    );
    if (packedMatch) {
      const unpacked = unpackDeanEdwards(packedMatch[0]);
      if (unpacked) {
        const stream = extractM3u8FromUnpacked(unpacked, embedUrl);
        if (stream && !isDeadCdn(stream)) return stream;
      }
    }

    // 4. Check unpacked/raw HTML as fallback
    const rawStream = extractM3u8FromUnpacked(html, embedUrl);
    if (rawStream && !isDeadCdn(rawStream)) return rawStream;

    return null;
  } catch {
    return null;
  }
}
