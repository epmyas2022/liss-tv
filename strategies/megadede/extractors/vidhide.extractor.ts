export function unpackDeanEdwards(packedCode: string): string | null {
  try {
    const trimmed = packedCode.trim();
    if (/^eval\s*\(\s*function\s*\(/.test(trimmed)) {
      const runnable = trimmed.replace(/^eval\s*\(/, "return (");
      const fn = new Function(runnable);
      const res = fn();
      if (typeof res === "string" && res.length > 0) {
        return res;
      }
    }
  } catch {}

  const match = packedCode.match(
    /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*([a-zA-Z0-9_]+)\s*\)[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\2\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\6\.split\(['"]\|['"]\)/
  );
  if (!match) return null;

  let p = match[3];
  const aStr = match[4];
  const cStr = match[5];
  const kStr = match[7];
  const a = parseInt(aStr, 10);
  let c = parseInt(cStr, 10);
  const dict = kStr.split("|");

  const baseN = (num: number, radix: number): string => {
    return (
      (num < radix ? "" : baseN(Math.floor(num / radix), radix)) +
      ((num = num % radix) > 35 ? String.fromCharCode(num + 29) : num.toString(36))
    );
  };

  while (c--) {
    if (dict[c]) {
      const token = baseN(c, a);
      p = p.replace(new RegExp("\\b" + token + "\\b", "g"), dict[c]);
    }
  }

  return p;
}

const DEAD_CDNS = [
  "radiantgroveproduction.cfd",
  "riverstonelearninghub.sbs",
];

export function isDeadCdn(url: string): boolean {
  if (!url) return false;
  return DEAD_CDNS.some((d) => url.toLowerCase().includes(d));
}

export function extractM3u8FromUnpacked(unpacked: string, embedUrl: string): string | null {
  // 1. Look for var links = { ... } object used by JWPlayer in Vidhide/Morencius
  const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[\s\S]*?\});/);
  if (linksMatch) {
    try {
      const parseFn = new Function(`return ${linksMatch[1]}`);
      const links = parseFn() as Record<string, string>;
      const prioritizedKeys = ["hls", "hls4", "hls2", "hls1", "hls3"];
      const candidateList = [
        ...prioritizedKeys.map((k) => links[k]).filter(Boolean),
        ...Object.values(links),
      ];

      for (const candidate of candidateList) {
        if (candidate && !isDeadCdn(candidate)) {
          const resolved = new URL(candidate, embedUrl).href;
          if (!isDeadCdn(resolved)) {
            return resolved;
          }
        }
      }
    } catch {
      // Continue to next checks
    }
  }

  // 2. Check for jwplayer sources array: sources: [{ file: "..." }]
  const sourcesMatch = unpacked.match(
    /sources\s*:\s*\[\s*\{\s*(?:file|source|src)\s*:\s*["']([^"']+)["']/,
  );
  if (sourcesMatch) {
    const resolved = new URL(sourcesMatch[1], embedUrl).href;
    if (!isDeadCdn(resolved)) {
      return resolved;
    }
  }

  // 3. Check for JWPlayer/HTML5 direct property: file: "..." or source: "..." or src: "..."
  const fileMatch = unpacked.match(
    /\b(?:file|source|src)\s*:\s*["']([^"']+(?:\.m3u8|\.txt|master\.|index\.)[^"']*)["']/i
  );
  if (fileMatch) {
    const resolved = new URL(fileMatch[1], embedUrl).href;
    if (!isDeadCdn(resolved)) {
      return resolved;
    }
  }

  // 4. Check for direct absolute m3u8 or master/index playlist
  const directMatches = unpacked.matchAll(
    /(https?:\/\/[^"'\s]+(?:\.m3u8|\.txt|master\.|index\.)[^"'\s]*)/g
  );
  for (const m of directMatches) {
    if (m[1] && !isDeadCdn(m[1])) {
      return m[1];
    }
  }

  // 5. Check for relative master/index playlist
  const relativeMatches = unpacked.matchAll(
    /["'](\/[^"'\s]+(?:\.m3u8|\.txt|master\.|index\.)[^"'\s]*)["']/g
  );
  for (const m of relativeMatches) {
    if (m[1] && !isDeadCdn(m[1])) {
      const resolved = new URL(m[1], embedUrl).href;
      if (!isDeadCdn(resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

export async function extractVidhideM3u8(embedUrl: string): Promise<string | null> {
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
