import { getAllData, upsertAll } from "@/services/movie.store";
import * as cheerio from "cheerio";
import { Movie, Movies, StrategyGetAllMovies } from "@/types/movie";
import nodeFetch from "node-fetch";
import https from "https";

const GNULA_BASE_URL = "https://ww3.gnulahd.nu/";

// Gnula uses a certificate chain that Node.js cannot verify out of the box.
// This agent skips verification only for requests to this provider's origin.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const isPastHours = (dateString: string, hours: number): boolean =>
  (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60) > hours;

const buildCacheKey = (search?: string, slug?: string, pageNumber?: number): string => {
  const page = pageNumber ?? 1;
  if (search) return `gnula:search:${search.toLowerCase().trim()}:page:${page}`;
  if (!slug || slug === "") return `gnula:home:page:${page}`;
  return `gnula:${slug}:page:${page}`;
};

const buildTargetUrl = (search?: string, slug?: string, pageNumber?: number): string => {
  if (search) {
    const query = encodeURIComponent(search);
    return pageNumber && pageNumber > 1
      ? `${GNULA_BASE_URL}?s=${query}&page=${pageNumber}`
      : `${GNULA_BASE_URL}?s=${query}`;
  }

  const cleanSlug = slug ? slug.replace(/^\/+|\/+$/g, "") : "";
  const basePath = cleanSlug ? `${GNULA_BASE_URL}ver/${cleanSlug}/` : GNULA_BASE_URL;

  return pageNumber && pageNumber > 1
    ? `${basePath}?page=${pageNumber}`
    : basePath;
};

const parsePagination = (
  $: cheerio.CheerioAPI,
  currentPage: number = 1,
): { hasMore: boolean; lastPageNumber: number } => {
  const loadMoreBtn = $("a.gnrd-loadmore, a[rel='next']");
  const hasMore = loadMoreBtn.length > 0;

  let maxFoundPage = 1;
  $("a.page-numbers").each((_, el) => {
    const n = parseInt($(el).text().trim(), 10);
    if (!isNaN(n) && n > maxFoundPage) maxFoundPage = n;
  });

  if (maxFoundPage > 1) {
    return {
      hasMore: currentPage < maxFoundPage,
      lastPageNumber: maxFoundPage,
    };
  }

  return {
    hasMore,
    lastPageNumber: hasMore ? currentPage + 1 : currentPage,
  };
};

export class GetAll implements StrategyGetAllMovies {
  async operation(
    search?: string,
    slug?: string,
    pageNumber?: number,
  ): Promise<Movies | undefined> {
    const key = buildCacheKey(search, slug, pageNumber);
    const cached = getAllData<Movies>(key);
    const maxAgeHours = search ? 1 : 8;

    if (cached && !isPastHours(cached.updatedAt, maxAgeHours)) {
      return cached.data;
    }

    const targetUrl = buildTargetUrl(search, slug, pageNumber);

    try {
      const response = await nodeFetch(targetUrl, {
        agent: httpsAgent,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: GNULA_BASE_URL,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-419,es;q=0.9",
        },
      });

      const html = await response.text();
      const $ = cheerio.load(html);

      const movies: Movie[] = $("a.gnrd-card")
        .map((_, el) => {
          const href = $(el).attr("href") ?? "";

          // Extract the item slug
          const slugMatch = href.match(/https?:\/\/[^/]+(?:\/ver)?\/([^/?#]+)/);
          const itemSlug = slugMatch ? slugMatch[1] : href.replace(/^.*\/|\/$/g, "");

          // Map Gnula's cards to common domain routes: /serie/<slug> or /pelicula/<slug>
          const typeBadge = $(el).find(".gnrd-type-badge").text().trim().toLowerCase();
          const isSerie =
            slug === "series" ||
            typeBadge.includes("serie") ||
            typeBadge.includes("anime") ||
            typeBadge.includes("dorama");

          const typePrefix = isSerie ? "serie" : "pelicula";
          const link = `/${typePrefix}/${itemSlug}`;

          const image = $(el).find(".gnrd-card-art img").attr("src") ?? "";
          const title = $(el).find("span.gnrd-card-title").text().trim();

          const ratingRaw = $(el).find(".gnrd-cm-rating").text().trim();
          const rating = ratingRaw.replace(/^★\s*/, "");

          // Year lives in the first plain span inside .gnrd-card-metaline (not the rating span)
          const yearRaw = $(el)
            .find(".gnrd-card-metaline span:not(.gnrd-cm-rating)")
            .first()
            .text()
            .trim();
          const yearMatch = yearRaw.match(/\b(19\d\d|20\d\d)\b/);
          const year = yearMatch ? yearMatch[0] : yearRaw.slice(0, 4);

          return { link, image, rating, title, year };
        })
        .get()
        .filter((m) => Boolean(m.link) && Boolean(m.title));

      const { hasMore, lastPageNumber } = parsePagination($, pageNumber ?? 1);

      const data: Movies = { movies, lastPageNumber, hasMore };
      upsertAll<Movies>(key, data);

      return data;
    } catch (error) {
      console.error("[Gnula] Error fetching movies:", error);
    }
  }
}
