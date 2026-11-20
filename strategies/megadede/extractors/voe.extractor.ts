export async function extractVoeM3u8(embedUrl: string): Promise<string | null> {
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
      return extractVoeM3u8(new URL(redirectMatch[1], embedUrl).href);
    }

    // 1. Direct hls/mp4 properties in script or JSON config
    const hlsMatch = html.match(/'hls':\s*'([^']+)'/) || html.match(/"hls":\s*"([^"]+)"/);
    if (hlsMatch) return hlsMatch[1];

    const mp4Match = html.match(/'mp4':\s*'([^']+)'/) || html.match(/"mp4":\s*"([^"]+)"/);
    if (mp4Match) return mp4Match[1];

    // 2. Base64 encoded payload (modern VOE: 'ey...' JSON, atob, or reversed strings)
    const b64Candidates = html.matchAll(/['"]([A-Za-z0-9+/=]{20,})['"]/g);
    for (const match of b64Candidates) {
      const token = match[1];
      // Try direct base64 decode
      try {
        const decoded = Buffer.from(token, "base64").toString("utf-8");
        const m3u8Match = decoded.match(/(https?:\/\/[^\s'"\\]+\.m3u8[^\s'"\\]*)/);
        if (m3u8Match) return m3u8Match[1];
        const hlsJson = decoded.match(/"hls"\s*:\s*"([^"]+)"/);
        if (hlsJson) return hlsJson[1];
      } catch {}

      // Try reversed base64 decode (common obfuscation in video hosters)
      try {
        const reversed = token.split("").reverse().join("");
        const decodedRev = Buffer.from(reversed, "base64").toString("utf-8");
        const m3u8Match = decodedRev.match(/(https?:\/\/[^\s'"\\]+\.m3u8[^\s'"\\]*)/);
        if (m3u8Match) return m3u8Match[1];
        const hlsJson = decodedRev.match(/"hls"\s*:\s*"([^"]+)"/);
        if (hlsJson) return hlsJson[1];
      } catch {}
    }

    // 3. Fallback: direct m3u8 URL anywhere in html
    const directMatch = html.match(/(https?:\/\/[^\s'"\\]+\.m3u8[^\s'"\\]*)/);
    if (directMatch) return directMatch[1];

    return null;
  } catch {
    return null;
  }
}
