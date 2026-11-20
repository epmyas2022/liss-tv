import * as cheerio from "cheerio";
import type { GetUrlOptions, StrategyGetUrl, Url } from "@/types/movie";
import { persistManifestContent } from "@/services/stream-cache.service";
import { gnulaFetch, GNULA_BASE_URL, GnulaError } from "./client";

const DEFAULT_X_GN_SCR = "1920x1080|1920x1040|1920x969|1|0|0|8|8|24|0|1|hw";
const DEFAULT_X_GN_DEV = "4f8a2c1b9e3d";
const XOR_KEY = [103, 78, 55, 100];

export interface GnulaServer {
  title: string;
  src: string;
}

export interface GnulaLanguage {
  label: string;
  flag?: string;
  servers: GnulaServer[];
}

export interface GnulaPlayerPayload {
  t?: string;
  langs?: GnulaLanguage[];
}

interface ScriptTokens {
  pid?: string;
  tok?: string;
  vdResolve?: string;
  vdAuth?: string;
  sfResolve?: string;
  sfAuth?: string;
  ttResolve?: string;
  ttAuth?: string;
}

export function gnrdUnpack(s: string): GnulaPlayerPayload | null {
  if (!s || typeof s !== "string") return null;

  try {
    const rawBytes = Buffer.from(s, "base64");
    if (!rawBytes.length) return null;

    const decodedBytes = new Uint8Array(rawBytes.length);
    for (let i = 0; i < rawBytes.length; i++) {
      decodedBytes[i] = rawBytes[i] ^ XOR_KEY[i & 3];
    }

    const jsonStr = new TextDecoder("utf-8").decode(decodedBytes);
    return JSON.parse(jsonStr) as GnulaPlayerPayload;
  } catch {
    return null;
  }
}

function extractScriptTokens($: cheerio.CheerioAPI): ScriptTokens {
  const tokens: ScriptTokens = {};

  $("script").each((_, el) => {
    const text = $(el).html() || "";

    const pidMatch = text.match(/_gnrdPid\s*=\s*(\d+)/);
    if (pidMatch && !tokens.pid) {
      tokens.pid = pidMatch[1];
    }

    const tokMatch = text.match(/_gnrdTok\s*=\s*["']([^"']+)["']/);
    if (tokMatch && !tokens.tok) {
      tokens.tok = tokMatch[1];
    }

    const vdResolveMatch = text.match(/VD_RESOLVE\s*=\s*['"]([^'"]+)['"]/);
    if (vdResolveMatch && !tokens.vdResolve) {
      tokens.vdResolve = vdResolveMatch[1];
    }

    const vdAuthMatch = text.match(/VD_AUTH\s*=\s*['"]([^'"]+)['"]/);
    if (vdAuthMatch && !tokens.vdAuth) {
      tokens.vdAuth = vdAuthMatch[1];
    }

    const sfResolveMatch = text.match(/SF_RESOLVE\s*=\s*['"]([^'"]+)['"]/);
    if (sfResolveMatch && !tokens.sfResolve) {
      tokens.sfResolve = sfResolveMatch[1];
    }

    const sfAuthMatch = text.match(/SF_AUTH\s*=\s*['"]([^'"]+)['"]/);
    if (sfAuthMatch && !tokens.sfAuth) {
      tokens.sfAuth = sfAuthMatch[1];
    }

    const ttResolveMatch = text.match(/\bRESOLVE\s*=\s*['"]([^'"]+)['"]/);
    if (ttResolveMatch && !tokens.ttResolve) {
      tokens.ttResolve = ttResolveMatch[1];
    }

    const ttAuthMatch = text.match(/\bAUTH\s*=\s*['"]([^'"]+)['"]/);
    if (ttAuthMatch && !tokens.ttAuth) {
      tokens.ttAuth = ttAuthMatch[1];
    }
  });

  return tokens;
}

function resolveDetailPath(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const clean = path.replace(/^\/+/, "");
  if (clean.startsWith("ver/")) {
    return clean;
  }
  // Movie path
  if (clean.startsWith("pelicula/")) {
    return `ver/${clean.replace(/^pelicula\//, "").replace(/\/+$/, "")}/`;
  }
  return clean.endsWith("/") ? clean : `${clean}/`;
}

function extractVidaraInfo(src: string): { code: string; host: string } | null {
  try {
    const url = new URL(src);
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "vidara.to" ||
      hostname === "vidaraa.cc" ||
      hostname.endsWith(".vidara.to") ||
      hostname.endsWith(".vidaraa.cc")
    ) {
      const parts = url.pathname.split("/").filter(Boolean);
      const code = parts[parts.length - 1]?.replace(/#.*$/, "");
      if (code) {
        return { code, host: hostname };
      }
    }
  } catch {
    // Ignore invalid url
  }
  return null;
}

function getServerPriority(src: string): number {
  const lower = src.toLowerCase();
  if (lower.includes("savefiles.com")) return 1;
  if (lower.includes("the.tube") || lower.includes("they.tube")) return 2;
  if (lower.includes("vidara.to") || lower.includes("vidaraa.cc")) return 3;
  return 10;
}

function extractSaveFilesCode(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.hostname.includes("savefiles")) {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    }
  } catch {
    // Ignore invalid url
  }
  return null;
}

function extractTheTubeCode(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.hostname.includes("tube")) {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    }
  } catch {
    // Ignore invalid url
  }
  return null;
}

function resolveRelativeUrl(uri: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  try {
    return new URL(uri, baseUrl).href;
  } catch {
    return uri;
  }
}

function buildProxyUrl(streamUrl: string, referer: string, directSegments = true): string {
  if (streamUrl.startsWith("/api/video/m3u8")) {
    return streamUrl;
  }
  const isM3u8 = streamUrl.includes(".m3u8");
  const manifestParam = isM3u8 ? "" : "&manifest=true";
  const directParam = directSegments ? "&directSegments=true" : "";
  return `/api/video/m3u8?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(referer)}${manifestParam}${directParam}`;
}

export class GetUrl implements StrategyGetUrl {
  private readonly fetchFn: typeof gnulaFetch;

  constructor(fetchFn: typeof gnulaFetch = gnulaFetch) {
    this.fetchFn = fetchFn;
  }

  async operation(path: string, options?: GetUrlOptions): Promise<Url> {
    const endpoint = resolveDetailPath(path);
    const detailContext = options?.detailContext as Record<string, unknown> | undefined;

    // 1. Fetch content page if complete tokens are not already provided in context
    let tokens: ScriptTokens = {};
    if (
      typeof detailContext?.pid === "string" &&
      typeof detailContext?.tok === "string" &&
      (typeof detailContext?.vdResolve === "string" ||
        typeof detailContext?.sfResolve === "string" ||
        typeof detailContext?.ttResolve === "string")
    ) {
      tokens.pid = detailContext.pid;
      tokens.tok = detailContext.tok;
      tokens.vdResolve = typeof detailContext.vdResolve === "string" ? detailContext.vdResolve : undefined;
      tokens.vdAuth = typeof detailContext.vdAuth === "string" ? detailContext.vdAuth : undefined;
      tokens.sfResolve = typeof detailContext.sfResolve === "string" ? detailContext.sfResolve : undefined;
      tokens.sfAuth = typeof detailContext.sfAuth === "string" ? detailContext.sfAuth : undefined;
      tokens.ttResolve = typeof detailContext.ttResolve === "string" ? detailContext.ttResolve : undefined;
      tokens.ttAuth = typeof detailContext.ttAuth === "string" ? detailContext.ttAuth : undefined;
    } else {
      const pageRes = await this.fetchFn(endpoint, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!pageRes.ok) {
        throw new GnulaError(
          `[Gnula] Failed to load content page ${endpoint}: HTTP ${pageRes.status}`,
          pageRes.status
        );
      }

      const html = await pageRes.text();
      const $ = cheerio.load(html);
      tokens = extractScriptTokens($);
    }

    if (!tokens.pid || !tokens.tok) {
      throw new GnulaError(`[Gnula] Failed to extract player tokens for ${path}`);
    }

    // 2. Fetch player endpoint
    const cleanBase = GNULA_BASE_URL.replace(/\/+$/, "");
    const referer = path.startsWith("http")
      ? path
      : `${cleanBase}/${endpoint.replace(/^\/+/, "")}`;

    const playerEndpoint = `/wp-json/gnrd/v1/player?id=${tokens.pid}&t=${encodeURIComponent(tokens.tok)}`;
    const playerRes = await this.fetchFn(playerEndpoint, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Gn-Scr": DEFAULT_X_GN_SCR,
        "X-Gn-Dev": DEFAULT_X_GN_DEV,
        Referer: referer,
      },
    });

    if (!playerRes.ok) {
      throw new GnulaError(
        `[Gnula] Player endpoint returned HTTP ${playerRes.status} for ${path}`,
        playerRes.status
      );
    }

    const playerJson = (await playerRes.json()) as { p?: string };
    const payload = gnrdUnpack(playerJson.p || "");

    const langs = payload?.langs || [];
    if (langs.length === 0) {
      throw new GnulaError(`[Gnula] No streaming servers found for ${path}`);
    }

    // 3. Select language (prefer requested language, then Latino, then first available)
    const preferredLang = (options?.params?.lang as string | undefined)?.toLowerCase();
    const primaryLang =
      langs.find((l) => preferredLang && l.label.toLowerCase().includes(preferredLang)) ||
      langs.find((l) => l.label.toLowerCase().includes("latino")) ||
      langs[0];

    const orderedLangs = [
      primaryLang,
      ...langs.filter((l) => l !== primaryLang),
    ];

    const resolvedStreams: string[] = [];

    // 4. Cascade resolution to direct M3U8 across available languages
    for (const lang of orderedLangs) {
      const servers = lang?.servers || [];
      const sortedServers = [...servers].sort(
        (a, b) => getServerPriority(a.src) - getServerPriority(b.src)
      );

      for (const server of sortedServers) {
        // 4.1 Vidara Resolver
        const vidara = extractVidaraInfo(server.src);
        if (vidara && tokens.vdResolve) {
          const vdAuth = tokens.vdAuth || "";
          const vdUrl = `${tokens.vdResolve}?pl=1&code=${encodeURIComponent(vidara.code)}&host=${encodeURIComponent(vidara.host)}${vdAuth.startsWith("&") ? vdAuth : `&${vdAuth}`}`;
          try {
            const res = await this.fetchFn(vdUrl, {
              headers: { Referer: referer },
            });
            if (res.ok) {
              const text = await res.text();
              let isAviso = text.includes("aviso.mp4");
              let jsonMaster: string | undefined;

              try {
                const json = JSON.parse(text) as { master?: string; error?: string };
                if (json.master?.includes("aviso.mp4") || json.error) {
                  isAviso = true;
                } else if (json.master) {
                  jsonMaster = json.master;
                }
              } catch {
                // Not JSON, check EXTM3U
              }

              if (!isAviso) {
                if (jsonMaster) {
                  resolvedStreams.push(jsonMaster);
                } else if (text.includes("#EXTM3U")) {
                  const directStream = text
                    .split("\n")
                    .map((l) => l.trim())
                    .find(
                      (l) =>
                        l.length > 0 &&
                        !l.startsWith("#") &&
                        (l.includes(".m3u8") ||
                          l.includes(".txt") ||
                          l.includes("master") ||
                          l.includes("index"))
                    );

                  if (directStream) {
                    const fullDirect = directStream.startsWith("http")
                      ? directStream
                      : resolveRelativeUrl(
                          directStream,
                          vdUrl.startsWith("http")
                            ? vdUrl
                            : `${cleanBase}${vdUrl.startsWith("/") ? "" : "/"}${vdUrl}`
                        );
                    resolvedStreams.push(fullDirect);
                  } else {
                    let streamSaved: string | null = null;
                    try {
                      streamSaved = await persistManifestContent(
                        path,
                        text,
                        vdUrl,
                        referer,
                        "gnula"
                      );
                    } catch {
                      // Fallback to direct URL if persistence fails
                    }

                    if (streamSaved) {
                      resolvedStreams.push(streamSaved);
                    } else {
                      const fullVdUrl = vdUrl.startsWith("http")
                        ? vdUrl
                        : `${cleanBase}${vdUrl.startsWith("/") ? "" : "/"}${vdUrl}`;
                      resolvedStreams.push(fullVdUrl);
                    }
                  }
                }
              }
            }
          } catch {
            // Continue to next server
          }
        }

        // 4.2 SaveFiles Resolver
        const sfCode = extractSaveFilesCode(server.src);
        if (sfCode && tokens.sfResolve) {
          const sfAuth = tokens.sfAuth || "";
          const sfUrl = `${tokens.sfResolve}?code=${encodeURIComponent(sfCode)}${sfAuth.startsWith("&") ? sfAuth : `&${sfAuth}`}`;
          try {
            const res = await this.fetchFn(sfUrl, {
              headers: { Referer: referer },
            });
            if (res.ok) {
              const text = await res.text();
              if (!text.includes("aviso.mp4")) {
                try {
                  const sfJson = JSON.parse(text) as { master?: string; error?: string };
                  if (sfJson.master && !sfJson.master.includes("aviso.mp4") && !sfJson.error) {
                    resolvedStreams.push(sfJson.master);
                  }
                } catch {}
              }
            }
          } catch {
            // Continue to next server
          }
        }

        // 4.3 The Tube Resolver
        const ttCode = extractTheTubeCode(server.src);
        if (ttCode && tokens.ttResolve) {
          const ttAuth = tokens.ttAuth || "";
          const ttUrl = `${tokens.ttResolve}${encodeURIComponent(ttCode)}${ttAuth.startsWith("&") ? ttAuth : `&${ttAuth}`}`;
          try {
            const res = await this.fetchFn(ttUrl, {
              headers: { Referer: referer },
            });
            if (res.ok) {
              const text = await res.text();
              if (!text.includes("aviso.mp4")) {
                try {
                  const ttJson = JSON.parse(text) as { master?: string; error?: string };
                  if (ttJson.master && !ttJson.master.includes("aviso.mp4") && !ttJson.error) {
                    resolvedStreams.push(ttJson.master);
                  }
                } catch {}
              }
            }
          } catch {
            // Continue to next server
          }
        }
      }

      if (resolvedStreams.length > 0) {
        break;
      }
    }

    if (resolvedStreams.length > 0) {
      const primaryM3u8 = resolvedStreams[0];
      const secondaryM3u8 = resolvedStreams[1];
      const proxyReferer = GNULA_BASE_URL;

      return {
        url: buildProxyUrl(primaryM3u8, proxyReferer, true),
        fallbackUrl: secondaryM3u8 ? buildProxyUrl(secondaryM3u8, proxyReferer, true) : undefined,
        directSegments: true,
        headers: {
          Referer: proxyReferer,
        },
      };
    }

    throw new GnulaError(`[Gnula] No playable stream found for ${path}`);
  }
}
