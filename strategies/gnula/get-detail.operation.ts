import * as cheerio from "cheerio";
import { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { get, upsert } from "@/services/movie.store";
import { gnulaFetch } from "./client";

const CACHE_TTL_DAYS = 7;

function isCacheExpired(dateString: string, maxAgeDays: number): boolean {
  const ageInDays = (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24);
  return ageInDays > maxAgeDays;
}

function resolveDetailPath(link: string): string {
  if (link.startsWith("http://") || link.startsWith("https://")) {
    return link;
  }
  const clean = link.replace(/^\/+/, "");
  if (clean.startsWith("ver/")) {
    return clean;
  }
  const slugMatch = clean.match(/(?:pelicula|serie)\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : clean.replace(/\/+$/, "");
  return `ver/${slug}/`;
}

function extractGnulaContext($: cheerio.CheerioAPI): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  // Extract post or media ID from element data attributes
  const dataId = $("[data-id]").first().attr("data-id");
  if (dataId) {
    context.id = dataId;
  }

  // Extract streaming resolve tokens from embedded inline scripts
  $("script").each((_, el) => {
    const text = $(el).html() || "";
    if (text.includes("the-tube-resolve") || text.includes("vidara-resolve") || text.includes("AUTH=")) {
      const authMatch = text.match(/[&?]t=([a-f0-9]+)/i);
      if (authMatch && !context.t) {
        context.t = authMatch[1];
      }
      const resolveMatch = text.match(/RESOLVE\s*=\s*['"]([^'"]+)['"]/);
      if (resolveMatch && !context.resolveEndpoint) {
        context.resolveEndpoint = resolveMatch[1];
      }
    }
  });

  return context;
}

function extractTitle($: cheerio.CheerioAPI): string {
  const titleFromSr = $("h1.gnrd-fi-title .gnrd-sr").text().trim();
  if (titleFromSr) return titleFromSr;

  const altFromImg = $("h1.gnrd-fi-title img").attr("alt")?.trim();
  if (altFromImg) return altFromImg;

  return $("h1.gnrd-fi-title").text().trim();
}

function extractBackdrop($: cheerio.CheerioAPI): string {
  const bgStyle = $(".gnrd-fi-bg").attr("style") || "";
  const bgMatch = bgStyle.match(/url\(['"]?([^'"]+?)['"]?\)/);
  let backgroundImage = bgMatch?.[1]?.trim() ?? "";

  // Prefer original resolution for TMDB images
  if (backgroundImage.includes("image.tmdb.org")) {
    backgroundImage = backgroundImage.replace(/\/w\d+\//, "/original/");
  }
  return backgroundImage;
}

function extractPoster($: cheerio.CheerioAPI, fallbackBackdrop: string): string {
  return (
    $('meta[itemprop="image"]').attr("content") ||
    $('meta[property="og:image"]').attr("content") ||
    $("img.gnrd-fi-logo").attr("src") ||
    fallbackBackdrop ||
    ""
  );
}

function extractYear($: cheerio.CheerioAPI): string {
  let year = "";
  $(".gnrd-fi-meta span, .gnrd-eyebrow").each((_, el) => {
    const text = $(el).text().trim();
    const match = text.match(/\b(19\d\d|20\d\d)\b/);
    if (match && !year) {
      year = match[0];
    }
  });
  return year;
}

function extractDuration($: cheerio.CheerioAPI): string {
  let duration = "";
  $(".gnrd-fi-meta span").each((_, el) => {
    const text = $(el).text().trim();
    if (/\b\d+\s*(?:hr|min|m|h)\b/i.test(text)) {
      duration = text;
    }
  });
  return duration;
}

function extractSeasons(
  $: cheerio.CheerioAPI,
  fallbackImage: string,
  baseContext: Record<string, unknown>,
): Season[] {
  const seasonsMap = new Map<string, Episode[]>();

  $("a.gnrd-epc").each((_, el) => {
    const href = $(el).attr("href") || "";
    const seasonAttr = $(el).attr("data-s");
    const epAttr = $(el).attr("data-e");

    const epCode = $(el).find(".gnrd-epc-n").text().trim();
    const codeMatch = epCode.match(/^(\d+)x(\d+)$/i);

    const seasonNum = seasonAttr || (codeMatch ? codeMatch[1] : "1");
    const epNum = epAttr || (codeMatch ? codeMatch[2] : "1");

    const thumbStyle = $(el).find(".gnrd-epc-thumb").attr("style") || "";
    const thumbMatch = thumbStyle.match(/url\(['"]?([^'"]+?)['"]?\)/);
    const epThumb =
      thumbMatch?.[1]?.trim() || $(el).find("img").attr("src") || fallbackImage;

    const epTitle =
      $(el).find(".gnrd-epc-title").text().trim() || `Episodio ${epNum}`;
    const epDate = $(el).find(".gnrd-epc-date").text().trim();
    const epDur = $(el).find(".gnrd-epc-dur").text().trim();
    const epCaption = [epDate, epDur].filter(Boolean).join(" · ");

    const pathMatch = href.match(/https?:\/\/[^/]+(\/[^?#]+)/);
    const cleanedLink = pathMatch ? pathMatch[1] : href;

    const episode: Episode = {
      link: cleanedLink,
      title: epTitle,
      image: epThumb,
      numberEpisode: epNum,
      caption: epCaption,
      context: {
        ...baseContext,
        season: seasonNum,
        episode: epNum,
      },
    };

    if (!seasonsMap.has(seasonNum)) {
      seasonsMap.set(seasonNum, []);
    }
    seasonsMap.get(seasonNum)!.push(episode);
  });

  return Array.from(seasonsMap.entries()).map(([season, episodes]) => ({
    season,
    episodes: episodes.sort(
      (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10),
    ),
  }));
}

export class GetDetail implements StrategyGetMovieDetails {
  async operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    const cached = get(link);
    const isSerie = link.includes("serie");

    if (
      cached?.title &&
      cached?.image &&
      cached?.backgroundImage &&
      !isCacheExpired(cached.updatedAt, CACHE_TTL_DAYS) &&
      (!isSerie || cached?.episodes?.length)
    ) {
      return {
        backgroundImage: cached.backgroundImage ?? "",
        image: cached.image,
        title: cached.title,
        year: cached.year ?? "",
        duration: cached.duration ?? "",
        rating: cached.rating ?? "",
        tags: cached.tags ?? [],
        caption: cached.caption ?? "",
        episodes: cached.episodes ?? [],
        context: cached.context,
      };
    }

    try {
      const endpoint = resolveDetailPath(link);
      const response = await gnulaFetch(endpoint, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      const html = await response.text();
      const $ = cheerio.load(html);

      const gnulaContext = extractGnulaContext($);
      const title = extractTitle($);
      const backgroundImage = extractBackdrop($);
      const image = extractPoster($, backgroundImage);

      const ratingRaw = $(".gnrd-rating, .gnrd-cm-rating").first().text().trim();
      const rating = ratingRaw.replace(/^★\s*/, "");

      const year = extractYear($);
      const duration = extractDuration($);

      const tags = $(".gnrd-fi-genres a, .gnrd-fi-genres span")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean);

      const caption = $("p.gnrd-fi-syn, #gnrd-syn, p[itemprop='description']")
        .first()
        .text()
        .trim();

      const seasons = extractSeasons($, image, gnulaContext);

      const movieData: Omit<StoredMovie, "link" | "updatedAt"> = {
        title,
        image,
        backgroundImage,
        rating,
        year,
        duration,
        tags,
        caption,
        episodes: seasons.length > 0 ? seasons : undefined,
        context: Object.keys(gnulaContext).length > 0 ? gnulaContext : undefined,
      };

      upsert(link, movieData);
      return movieData;
    } catch (error) {
      console.error("[Gnula] GetDetail operation failed:", error);
      return undefined;
    }
  }
}
