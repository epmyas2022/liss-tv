import { BROWSER_UA } from "@/utils/browser";
import { CINECALIDAD_BASE_URL } from "../client";

export function unpackVimeosPacker(packedCode: string): string | null {
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
    /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[a-zA-Z0-9_]+\s*\)[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/,
  );
  if (!match) return null;

  let payload = match[2];
  const radix = parseInt(match[3], 10);
  let count = parseInt(match[4], 10);
  const dict = match[6].split("|");

  const encodeToken = (num: number, base: number): string => {
    return (
      (num < base ? "" : encodeToken(Math.floor(num / base), base)) +
      ((num = num % base) > 35 ? String.fromCharCode(num + 29) : num.toString(36))
    );
  };

  while (count--) {
    if (dict[count]) {
      const token = encodeToken(count, radix);
      payload = payload.replace(new RegExp(`\\b${token}\\b`, "g"), () => dict[count]);
    }
  }

  return payload;
}

function extractStreamFromText(text: string, embedUrl: string): string | null {
  const linksMatch = text.match(/var\s+links\s*=\s*(\{[\s\S]*?\});/);
  if (linksMatch) {
    try {
      const parseFn = new Function(`return ${linksMatch[1]}`);
      const links = parseFn() as Record<string, string>;
      const prioritizedKeys = ["hls4", "hls2", "hls3", "hls", "hls1"];
      const candidates = [
        ...prioritizedKeys.map((k) => links[k]).filter(Boolean),
        ...Object.values(links),
      ];
      for (const candidate of candidates) {
        if (candidate && (candidate.includes(".m3u8") || candidate.includes(".txt"))) {
          return new URL(candidate, embedUrl).href;
        }
      }
    } catch {}
  }

  const sourcesMatch = text.match(
    /sources\s*:\s*\[\s*\{\s*(?:file|source|src)\s*:\s*["']([^"']+)["']/,
  );
  if (sourcesMatch?.[1]) {
    return new URL(sourcesMatch[1], embedUrl).href;
  }

  const directMatch = text.match(
    /(https?:\/\/[^"'\s]+(?:\.m3u8|\.txt|master\.)[^"'\s]*)/i,
  );
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  return null;
}

export async function extractVimeosM3u8(
  embedUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  if (!embedUrl) return null;

  try {
    const res = await fetchFn(embedUrl, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: `${CINECALIDAD_BASE_URL}/`,
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    const packedMatches = html.matchAll(
      /eval\(function\(p,a,c,k,e,[a-zA-Z0-9_]+\)[\s\S]*?\.split\(['"]\|['"]\)[\s\S]*?\)\)/g,
    );

    for (const packedMatch of packedMatches) {
      const unpacked = unpackVimeosPacker(packedMatch[0]);
      if (unpacked) {
        const extracted = extractStreamFromText(unpacked, embedUrl);
        if (extracted) return extracted;
      }
    }

    return extractStreamFromText(html, embedUrl);
  } catch {
    return null;
  }
}
