import * as cheerio from "cheerio";
import type {
  DriverQuery,
  MediaItem,
  Movies,
  StrategyGetAllMovies,
} from "@/types/movie";
import { upsert } from "@/services/movie.store";
import { cinecalidadFetch } from "./client";

function extractCleanImage($img: ReturnType<cheerio.CheerioAPI>): string {
  const candidates = [
    $img.attr("data-src"),
    $img.attr("data-lazy-src"),
    $img.attr("src"),
  ];
  for (const candidate of candidates) {
    if (candidate && !candidate.startsWith("data:")) {
      return candidate.startsWith("//") ? `https:${candidate}` : candidate;
    }
  }
  return "";
}

export function parseCinecalidadCatalog(
  html: string,
  currentPage = 1,
  filterType?: "movie" | "serie",
): Movies {
  const $ = cheerio.load(html);
  const movies: MediaItem[] = [];

  $("article.item").each((_, el) => {
    const $el = $(el);
    if ($el.hasClass("naadb")) return;

    const linkEl = $el
      .find("a[href*='/ver-pelicula/'], a[href*='/ver-serie/']")
      .first();
    const rawHref =
      linkEl.attr("href") || $el.find("a[href]").first().attr("href") || "";

    if (!rawHref || rawHref.startsWith("#")) return;

    let rawPath = rawHref;
    try {
      if (rawHref.startsWith("http")) {
        rawPath = new URL(rawHref).pathname;
      }
    } catch {}

    if (
      !rawPath.includes("/ver-pelicula/") &&
      !rawPath.includes("/ver-serie/")
    ) {
      return;
    }

    const isSerie =
      rawPath.includes("/ver-serie/") ||
      $el.find(".selt").text().toLowerCase().includes("serie");
    const mediaType: "movie" | "serie" = isSerie ? "serie" : "movie";

    if (filterType && mediaType !== filterType) {
      return;
    }

    const cleanSlug = rawPath
      .replace(/^\/?(?:ver-pelicula|ver-serie)\//, "")
      .replace(/\/+$/, "");
    if (!cleanSlug) return;

    const appLink = `/${isSerie ? "serie" : "pelicula"}/${cleanSlug}`;

    let rawTitle =
      $el.find(".in_title, .entry-title, h2").first().text().trim() ||
      $el.find("img").first().attr("alt")?.trim() ||
      "";

    let year = "";
    $el.find(".home_post_content p, p").each((_, pEl) => {
      const text = $(pEl).text().trim();
      if (/^\d{4}$/.test(text)) {
        year = text;
      }
    });

    const yearMatch = rawTitle.match(/\((\d{4})\)/);
    if (yearMatch) {
      if (!year) year = yearMatch[1];
      rawTitle = rawTitle.replace(/\s*\(\d{4}\)/, "").trim();
    }

    if (!rawTitle) return;

    const image = extractCleanImage($el.find("img").first());
    const rating = $el.find(".vote, .rating, .imd").first().text().trim();

    movies.push({
      id: cleanSlug,
      title: rawTitle,
      link: appLink,
      image,
      year,
      rating,
      type: mediaType,
      provider: "cinecalidad",
      context: {
        provider: "cinecalidad",
        slug: cleanSlug,
        rawPath,
      },
    });
  });

  let totalPages = currentPage;
  $(".pagination a, .wp-pagenavi a, a.page-numbers").each((_, pageEl) => {
    const text = $(pageEl).text().trim();
    const num = parseInt(text, 10);
    if (!isNaN(num) && num > totalPages) {
      totalPages = num;
    }
    const href = $(pageEl).attr("href") || "";
    const hrefMatch = href.match(/\/page\/(\d+)/);
    if (hrefMatch) {
      const hrefPage = parseInt(hrefMatch[1], 10);
      if (!isNaN(hrefPage) && hrefPage > totalPages) {
        totalPages = hrefPage;
      }
    }
  });

  const hasNext =
    $(".pagination .next, a.next.page-numbers").length > 0 ||
    totalPages > currentPage;

  return {
    movies,
    lastPageNumber: totalPages,
    hasMore: hasNext,
  };
}

export class GetAll implements StrategyGetAllMovies {
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = cinecalidadFetch as typeof fetch) {
    this.fetchFn = fetchFn;
  }

  async operation(
    searchOrQuery?:
      | string
      | (DriverQuery & { filter?: string; page?: number }),
    slug?: string,
    pageNumber: number = 1,
  ): Promise<Movies> {
    let search = "";
    let filter = "";
    let page = pageNumber;

    if (typeof searchOrQuery === "object" && searchOrQuery !== null) {
      search = searchOrQuery.search || "";
      filter = searchOrQuery.filter || searchOrQuery.slug || "";
      page = searchOrQuery.page ?? searchOrQuery.pageNumber ?? 1;
    } else {
      search = searchOrQuery || "";
      filter = slug || "";
    }

    const cleanSearch = search.trim();
    const cleanFilter = filter.toLowerCase().trim();
    let targetPath = "/";
    let expectedType: "movie" | "serie" | undefined;

    if (cleanSearch) {
      targetPath =
        page > 1
          ? `/page/${page}/?s=${encodeURIComponent(cleanSearch)}`
          : `/?s=${encodeURIComponent(cleanSearch)}`;
    } else if (
      cleanFilter === "series" ||
      cleanFilter === "serie" ||
      cleanFilter.includes("serie")
    ) {
      expectedType = "serie";
      targetPath = page > 1 ? `/ver-serie/page/${page}/` : "/ver-serie/";
    } else {
      if (
        cleanFilter === "movies" ||
        cleanFilter === "movie" ||
        cleanFilter === "peliculas"
      ) {
        expectedType = "movie";
      }
      targetPath = page > 1 ? `/page/${page}/` : "/";
    }

    const res = await this.fetchFn(targetPath);
    const html = await res.text();
    const parsed = parseCinecalidadCatalog(html, page, expectedType);

    for (const item of parsed.movies) {
      try {
        upsert("cinecalidad", item.link, {
          title: item.title,
          image: item.image,
          year: item.year,
          rating: item.rating,
          type: item.type,
          provider: "cinecalidad",
          context: item.context,
        });
      } catch {}
    }

    return parsed;
  }
}
