import * as cheerio from "cheerio";
import type { MediaItem, Movies, StrategyGetAllMovies } from "@/types/movie";
import { megadedeFetch } from "./client";

export function parseMegadedeCatalog(html: string, currentPage = 1): Movies {
  const $ = cheerio.load(html);
  const movies: MediaItem[] = [];

  $("article.mv, article.item, article.film, article.card").each((_, el) => {
    const $el = $(el);
    const linkEl = $el
      .find("a.lnk-blk, a[href*='/pelicula/'], a[href*='/serie/'], a[href*='/anime/']")
      .first();
    const rawLink = linkEl.attr("href") || "";

    // 1. Extract title accurately, discarding generic button labels like "Ver contenido"
    let title =
      $el.find("header h2, h2.entry-title, h2, .title").first().text().trim() ||
      linkEl.attr("aria-label")?.trim() ||
      "";

    if (!title || title.toLowerCase() === "ver contenido") {
      const imgTitle = $el.find("figure img, img").attr("title");
      if (imgTitle) {
        title = imgTitle.replace(/\s*-\s*Ver.*$/i, "").trim();
      } else {
        const imgAlt = $el.find("figure img, img").attr("alt");
        if (imgAlt) {
          title = imgAlt
            .replace(/^Ver\s+/i, "")
            .replace(/\s*\(\d{4}\).*$/i, "")
            .replace(/\s*online.*$/i, "")
            .trim();
        }
      }
    }

    if (!rawLink || !title || title.toLowerCase() === "ver contenido") return;

    // 2. Poster image
    let image =
      $el.find("figure img, img").attr("src") ||
      $el.find("figure img, img").attr("data-src") ||
      "";
    if (image.startsWith("//")) {
      image = `https:${image}`;
    }

    // 3. Year
    let year =
      $el.find("header span.op6, header .fz6, .year, .release-year, .date").first().text().trim();
    const yearMatch = (year || $el.text()).match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      year = yearMatch[0];
    }

    // 4. Rating
    const ratingText = $el.find(".rating-badge, .rating, .vote, .imdb").first().text().trim();
    const rating = ratingText.replace(/[^0-9.]/g, "").trim();

    const isAnime = rawLink.includes("/anime/");
    const isSerie = rawLink.includes("/serie/") || isAnime;
    const cleanSlug = rawLink
      .replace(/^https?:\/\/[^/]+/, "")
      .replace(/^\/?(?:pelicula|serie|anime)\//, "")
      .replace(/\/+$/, "");
    const link = isSerie ? `/serie/${cleanSlug}` : `/pelicula/${cleanSlug}`;

    movies.push({
      id: cleanSlug,
      link,
      title,
      image,
      year,
      rating,
      type: isSerie ? "serie" : "movie",
      provider: "megadede",
      ...(isAnime
        ? {
            context: {
              provider: "megadede",
              slug: cleanSlug,
              upstreamType: "anime",
            },
          }
        : {}),
    });
  });

  let maxPage = currentPage;
  $("a.page-numbers, .pagination a").each((_, el) => {
    const text = $(el).text().trim();
    const pageNum = parseInt(text, 10);
    if (!isNaN(pageNum) && pageNum > maxPage) {
      maxPage = pageNum;
    }
    const href = $(el).attr("href") || "";
    const match = href.match(/[?&]page=(\d+)/);
    if (match) {
      const p = parseInt(match[1], 10);
      if (!isNaN(p) && p > maxPage) maxPage = p;
    }
  });

  return {
    movies,
    lastPageNumber: maxPage,
    hasMore: maxPage > currentPage,
  };
}

export class GetAll implements StrategyGetAllMovies {
  async operation(
    search?: string,
    slug?: string,
    pageNumber = 1
  ): Promise<Movies | undefined> {
    let endpoint = "";

    if (search && search.trim() !== "") {
      endpoint = `/search?s=${encodeURIComponent(search.trim())}&page=${pageNumber}`;
    } else if (slug === "series") {
      endpoint = `/series?page=${pageNumber}`;
    } else if (slug && slug !== "" && slug !== "home" && slug !== "movies") {
      endpoint = `/${slug.replace(/^\/+/, "")}?page=${pageNumber}`;
    } else {
      endpoint = `/peliculas?page=${pageNumber}`;
    }

    try {
      const res = await megadedeFetch(endpoint);
      const html = await res.text();
      return parseMegadedeCatalog(html, pageNumber);
    } catch {
      if (search && search.trim() !== "") {
        try {
          const fallbackEndpoint = `/?s=${encodeURIComponent(search.trim())}&page=${pageNumber}`;
          const res = await megadedeFetch(fallbackEndpoint);
          const html = await res.text();
          return parseMegadedeCatalog(html, pageNumber);
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
  }
}
