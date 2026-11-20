import { unpackDeanEdwards, extractM3u8FromUnpacked, isDeadCdn } from "./vidhide.extractor";

export async function extractStreamwishM3u8(embedUrl: string): Promise<string | null> {
  if (isDeadCdn(embedUrl)) return null;

  try {
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://megadede.mobi/",
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    const redirectMatch = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (redirectMatch) {
      return extractStreamwishM3u8(new URL(redirectMatch[1], embedUrl).href);
    }

    // 1. Check packed script first (where JWPlayer setup and links are defined)
    const packedMatch = html.match(
      /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)[\s\S]*?\)\)/,
    );
    if (packedMatch) {
      const unpacked = unpackDeanEdwards(packedMatch[0]);
      if (unpacked) {
        const stream = extractM3u8FromUnpacked(unpacked, embedUrl);
        if (stream && !isDeadCdn(stream)) return stream;
      }
    }

    // 2. Check unpacked/raw HTML as fallback
    const rawStream = extractM3u8FromUnpacked(html, embedUrl);
    if (rawStream && !isDeadCdn(rawStream)) return rawStream;

    return null;
  } catch {
    return null;
  }
}
