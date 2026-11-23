import * as cheerio from "cheerio";
import type { GetUrlOptions, StrategyGetUrl, Url } from "@/types/movie";
import { cinecalidadFetch, CinecalidadError } from "./client";
import { extractVimeosM3u8 } from "./extractors/vimeos.extractor";

const VIMEOS_REFERER = "https://vimeos.net/";

function normalizePath(rawUrl: string): string {
  let clean = rawUrl.trim();
  try {
    if (clean.startsWith("http")) {
      clean = new URL(clean).pathname;
    }
  } catch {}
  if (!clean.startsWith("/")) clean = `/${clean}`;
  return clean;
}

export class GetUrl implements StrategyGetUrl {
  private readonly fetchFn: typeof fetch;
  private readonly extractFn: typeof extractVimeosM3u8;

  constructor(
    fetchFn: typeof fetch = cinecalidadFetch as typeof fetch,
    extractFn: typeof extractVimeosM3u8 = extractVimeosM3u8,
  ) {
    this.fetchFn = fetchFn;
    this.extractFn = extractFn;
  }

  async operation(path: string, options?: GetUrlOptions): Promise<Url> {
    const targetPath = await this.resolveContentPath(path, options);

    const res = await this.fetchFn(targetPath);
    const html = await res.text();
    const $ = cheerio.load(html);

    const candidateUrls: string[] = [];

    $("li.dooplay_player_option, #playeroptionsul li[data-option]").each(
      (_, el) => {
        const $el = $(el);
        const id = $el.attr("id") || "";
        if (
          id === "player-option-trailer" ||
          $el.hasClass("dooplay_player_option_trailer")
        ) {
          return;
        }
        const optUrl = ($el.attr("data-option") || "").trim();
        if (
          optUrl &&
          !optUrl.includes("youtube.com") &&
          !optUrl.includes("youtu.be")
        ) {
          candidateUrls.push(optUrl);
        }
      },
    );

    const prioritized = [...candidateUrls].sort((a, b) => {
      const aVimeos = a.toLowerCase().includes("vimeos") ? 0 : 1;
      const bVimeos = b.toLowerCase().includes("vimeos") ? 0 : 1;
      return aVimeos - bVimeos;
    });

    const resolvedStreams: string[] = [];

    for (const embedUrl of prioritized) {
      if (embedUrl.toLowerCase().includes("vimeos")) {
        const m3u8 = await this.extractFn(embedUrl);
        if (m3u8) {
          resolvedStreams.push(m3u8);
        }
      }
    }

    if (resolvedStreams.length === 0) {
      throw new CinecalidadError(
        `[Cinecalidad] Could not extract any playable HLS stream for ${path}`,
      );
    }

    const formatProxyUrl = (rawM3u8: string): string =>
      `/api/video/m3u8?url=${encodeURIComponent(rawM3u8)}&referer=${encodeURIComponent(
        VIMEOS_REFERER,
      )}`;

    return {
      url: formatProxyUrl(resolvedStreams[0]),
      fallbackUrl: resolvedStreams[1]
        ? formatProxyUrl(resolvedStreams[1])
        : undefined,
      directSegments: false,
      headers: {
        Referer: VIMEOS_REFERER,
      },
    };
  }

  private async resolveContentPath(
    path: string,
    options?: GetUrlOptions,
  ): Promise<string> {
    const hashMatch = path.match(/#s(\d+)-e(\d+)/i);
    const cleanPath = normalizePath(path.replace(/#.*$/, ""));

    if (cleanPath.startsWith("/ver-el-episodio/")) {
      return cleanPath.endsWith("/") ? cleanPath : `${cleanPath}/`;
    }

    if (
      cleanPath.startsWith("/ver-pelicula/") ||
      (cleanPath.startsWith("/pelicula/") && !hashMatch)
    ) {
      const slug = cleanPath
        .replace(/^\/?(?:ver-pelicula|pelicula)\//, "")
        .replace(/\/+$/, "");
      return `/ver-pelicula/${slug}/`;
    }

    const season =
      options?.season ??
      options?.detailContext?.season ??
      options?.params?.season ??
      hashMatch?.[1];
    const episode =
      options?.episode ??
      options?.detailContext?.episode ??
      options?.params?.episode ??
      hashMatch?.[2];

    const seriesSlug = cleanPath
      .replace(/^\/?(?:ver-serie|serie)\//, "")
      .replace(/\/+$/, "");

    if (season !== undefined && episode !== undefined) {
      const detailContext = options?.detailContext as
        | {
            episodes?: Array<{
              season: number;
              episodes: Array<{ numberEpisode: string; link: string }>;
            }>;
          }
        | undefined;

      const seasonGroup = detailContext?.episodes?.find(
        (s) => Number(s.season) === Number(season),
      );
      const foundEp = seasonGroup?.episodes?.find(
        (e) => String(e.numberEpisode) === String(episode),
      );
      if (foundEp?.link) {
        return normalizePath(foundEp.link);
      }

      const serieRes = await this.fetchFn(`/ver-serie/${seriesSlug}/`);
      const serieHtml = await serieRes.text();
      const $ = cheerio.load(serieHtml);

      let matchedEpHref = "";
      const expectedSuffix = new RegExp(
        `-s0*${Number(season)}-e0*${Number(episode)}\\/?$`,
        "i",
      );

      $("a[href*='/ver-el-episodio/']").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (expectedSuffix.test(href)) {
          matchedEpHref = href;
          return false;
        }
      });

      if (matchedEpHref) {
        return normalizePath(matchedEpHref);
      }
    }

    if (
      cleanPath.startsWith("/serie/") ||
      cleanPath.startsWith("/ver-serie/")
    ) {
      return `/ver-serie/${seriesSlug}/`;
    }

    return cleanPath;
  }
}
