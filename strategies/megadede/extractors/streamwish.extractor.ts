import { unpackDeanEdwards, extractM3u8FromUnpacked, isDeadCdn } from "./vidhide.extractor";

const STREAMWISH_MIRRORS = [
  "hanerix.com",
  "streamwish.to",
  "strwish.com",
  "wishembed.pro",
  "swishsrv.com",
  "awish.pro",
  "hglink.to",
];

async function fetchStreamwishPage(url: string): Promise<string | null> {
  let originReferer: string | undefined;
  try {
    const parsed = new URL(url);
    originReferer = `${parsed.protocol}//${parsed.host}/`;
  } catch {}

  // 1. First candidate: same-origin referer (simulates direct browsing in new window, bypassing iframe embed guards)
  // 2. Second candidate: no referer (clean direct navigation)
  // 3. Third candidate: megadede referer
  const refererCandidates: (string | undefined)[] = [
    originReferer,
    undefined,
    "https://megadede.mobi/",
  ];

  for (const referer of refererCandidates) {
    try {
      const headers: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      };
      if (referer) {
        headers["Referer"] = referer;
      }

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const text = await res.text();
        // If it returns the anti-embed block page, reject it so next candidate (e.g. origin/no-referer) can succeed
        if (
          text.includes("will not allow") ||
          text.includes("embedded it") ||
          text.includes("To protect your security")
        ) {
          continue;
        }
        return text;
      }
    } catch {
      // Continue to next candidate
    }
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
