import * as cheerio from "cheerio";
import type {
  Episode,
  MediaDetail,
  Season,
  StrategyGetMovieDetails,
} from "@/types/movie";
import { get } from "@/services/movie.store";
import { cinecalidadFetch } from "./client";
import type { CinecalidadEmbedOption } from "./types";

function resolveUpstreamDetailPath(link: string): {
  upstreamPath: string;
  appLink: string;
  slug: string;
  isSerieHint: boolean;
} {
  let clean = link.trim();
  try {
    if (clean.startsWith("http")) {
      clean = new URL(clean).pathname;
    }
  } catch {}

  clean = clean.replace(/[?#].*$/, "");
  if (!clean.startsWith("/")) clean = `/${clean}`;

  const isSerieHint =
    clean.startsWith("/serie/") || clean.startsWith("/ver-serie/");
  const slug = clean
    .replace(/^\/?(?:pelicula|serie|ver-pelicula|ver-serie)\//, "")
    .replace(/\/+$/, "");

  const upstreamPath = isSerieHint
    ? `/ver-serie/${slug}/`
    : `/ver-pelicula/${slug}/`;
  const appLink = `/${isSerieHint ? "serie" : "pelicula"}/${slug}`;

  return { upstreamPath, appLink, slug, isSerieHint };
}

function extractImageUrl($img: ReturnType<cheerio.CheerioAPI>): string {
  const candidates = [
    $img.attr("data-src"),
    $img.attr("data-lazy-src"),
    $img.attr("src"),
  ];
  for (const candidate of candidates) {
    if (candidate && !candidate.startsWith("data:") && !candidate.includes("logo.svg")) {
      return candidate.startsWith("//") ? `https:${candidate}` : candidate;
    }
  }
  return "";
}

function extractEmbedOptions($: cheerio.CheerioAPI): CinecalidadEmbedOption[] {
  const embeds: CinecalidadEmbedOption[] = [];

  $("li.dooplay_player_option, #playeroptionsul li[data-option]").each(
    (idx, el) => {
      const $el = $(el);
      const id = $el.attr("id") || `player-option-${idx + 1}`;
      if (
        id === "player-option-trailer" ||
        $el.hasClass("dooplay_player_option_trailer")
      ) {
        return;
      }

      const rawUrl = ($el.attr("data-option") || "").trim();
      if (!rawUrl || rawUrl.includes("youtube.com") || rawUrl.includes("youtu.be")) {
        return;
      }

      const server =
        $el.find("span.title, span").first().text().trim() ||
        $el.text().replace(/Recomendado/i, "").trim() ||
        "Latino";

      embeds.push({ id, server, url: rawUrl });
    },
  );

  return embeds;
}

function parseSeasonsAndEpisodes(
  $: cheerio.CheerioAPI,
  defaultImage: string,
  seriesSlug: string,
): Season[] {
  const seasonMap = new Map<number, Episode[]>();

  $("div#jstab[data-tab], div.se-c[data-tab]").each((_, containerEl) => {
    const $container = $(containerEl);
    const tabStr = $container.attr("data-tab") || "1";
    const tabSeason = parseInt(tabStr, 10) || 1;

    $container.find("ul.episodios li").each((epIdx, liEl) => {
      const $li = $(liEl);
      const $a = $li
        .find(".episodiotitle a, a[href*='/ver-el-episodio/']")
        .first();
      const rawHref = $a.attr("href") || "";
      if (!rawHref) return;

      let epPath = rawHref;
      try {
        if (rawHref.startsWith("http")) {
          epPath = new URL(rawHref).pathname;
        }
      } catch {}
      if (!epPath.startsWith("/")) epPath = `/${epPath}`;

      const numerando = $li.find(".numerando").text().trim();
      const numMatch =
        numerando.match(/S(\d+)-E(\d+)/i) ||
        epPath.match(/-s(\d+)-e(\d+)\/?$/i);

      const seasonNumber = numMatch ? parseInt(numMatch[1], 10) : tabSeason;
      const episodeNumber = numMatch ? numMatch[2] : String(epIdx + 1);
      const epTitle = $a.text().trim() || `Episodio ${episodeNumber}`;
      const epImg =
        extractImageUrl($li.find("img").first()) || defaultImage;

      const list = seasonMap.get(seasonNumber) || [];
      if (!list.some((existing) => existing.numberEpisode === episodeNumber)) {
        list.push({
          numberEpisode: episodeNumber,
          title: epTitle,
          link: epPath,
          image: epImg,
          caption: "",
          context: {
            provider: "cinecalidad",
            slug: seriesSlug,
            season: seasonNumber,
            episode: parseInt(episodeNumber, 10),
          },
        });
        seasonMap.set(seasonNumber, list);
      }
    });
  });

  return Array.from(seasonMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, episodes]) => ({
      season: String(season),
      episodes,
    }));
}

export class GetDetail implements StrategyGetMovieDetails {
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = cinecalidadFetch as typeof fetch) {
    this.fetchFn = fetchFn;
  }

  async operation(link: string): Promise<MediaDetail> {
    const { upstreamPath, appLink, slug, isSerieHint } =
      resolveUpstreamDetailPath(link);
    const cached = get("cinecalidad", appLink) || get("cinecalidad", link);

    const res = await this.fetchFn(upstreamPath);
    const html = await res.text();
    const $ = cheerio.load(html);

    const nonBrandH1 = $("h1:not(.h1titlecc)")
      .filter((_, el) => $(el).text().trim().toLowerCase() !== "cinecalidad")
      .first()
      .text()
      .trim();

    const ogTitle = $("meta[property='og:title']")
      .attr("content")
      ?.replace(/^Ver\s+(?:Serie\s+|Pel[ií]cula\s+)?/i, "")
      .replace(/\s+Online\s+Gratis.*$/i, "")
      .replace(/\s*-\s*Cinecalidad.*$/i, "")
      .trim();

    const cachedTitle =
      cached?.title && cached.title.trim().toLowerCase() !== "cinecalidad"
        ? cached.title
        : undefined;

    let title =
      $(".single_left h1").first().text().trim() ||
      nonBrandH1 ||
      ogTitle ||
      cachedTitle ||
      slug;

    const yearMatch =
      title.match(/\((\d{4})\)/) ||
      $("title")
        .text()
        .match(/\((\d{4})\)/);
    const year = yearMatch?.[1] || cached?.year;
    title = title.replace(/\s*\(\d{4}\)/, "").trim();

    let poster = "";
    $(".single_left img, img.wp-post-image, .poster img").each((_, imgEl) => {
      if (!poster) {
        poster = extractImageUrl($(imgEl));
      }
    });
    if (!poster) {
      poster =
        $("meta[property='og:image']").attr("content") ||
        cached?.image ||
        "";
    }

    let synopsis = "";
    $(".single_left p, .wp-content p").each((_, pEl) => {
      const text = $(pEl).text().trim();
      if (!synopsis && text.length > 25 && !text.includes("Título original")) {
        synopsis = text;
      }
    });

    const tags: string[] = [];
    $(".single_left a[href*='/genero-de-la-pelicula/'], .sgeneros a").each(
      (_, gEl) => {
        const g = $(gEl).text().trim();
        if (g && !tags.includes(g)) tags.push(g);
      },
    );

    const embeds = extractEmbedOptions($);
    const episodes = parseSeasonsAndEpisodes($, poster, slug);
    const isSerie = isSerieHint || episodes.length > 0;

    return {
      link: appLink,
      title,
      image: poster,
      backgroundImage: poster,
      year,
      rating: cached?.rating,
      tags: tags.length > 0 ? tags : undefined,
      caption: synopsis || undefined,
      type: isSerie ? "serie" : "movie",
      provider: "cinecalidad",
      episodes: isSerie ? episodes : [],
      context: {
        provider: "cinecalidad",
        slug,
        upstreamPath,
        isSerie,
        embeds,
        ...(isSerie ? { episodes } : {}),
      },
    };
  }
}
