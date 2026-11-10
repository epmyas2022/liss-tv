import * as cheerio from "cheerio";
import { Movie, Movies, StrategyGetAllMovies } from "@/types/movie";
import { getAllData, upsertAll } from "@/services/movie.store";
import { gnulaFetch } from "./client";

const CACHE_TTL_SEARCH_HOURS = 1;
const CACHE_TTL_CATALOG_HOURS = 8;

interface GnulaSearchItem {
  title: string;
  url: string;
  img?: string;
  type?: string;
  year?: string;
}

interface GnulaSearchResponse {
  results?: GnulaSearchItem[];
}

function isCacheExpired(dateString: string, maxAgeHours: number): boolean {
  const ageInHours = (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60);
  return ageInHours > maxAgeHours;
}

function buildCacheKey(search?: string, slug?: string, pageNumber = 1): string {
  if (search) return `gnula:search:${search.toLowerCase().trim()}:page:${pageNumber}`;
  if (!slug) return `gnula:home:page:${pageNumber}`;
  return `gnula:${slug}:page:${pageNumber}`;
}

function extractSlug(urlOrHref: string): string {
  const match = urlOrHref.match(/https?:\/\/[^/]+(?:\/ver)?\/([^/?#]+)/);
  return match ? match[1] : urlOrHref.replace(/^.*\/|\/$/g, "");
}

function parsePagination(
  $: cheerio.CheerioAPI,
  currentPage = 1,
): { hasMore: boolean; lastPageNumber: number } {
  const hasMoreButton = $("a.gnrd-loadmore, a[rel='next']").length > 0;

  let maxPage = 1;
  $("a.page-numbers").each((_, el) => {
    const page = parseInt($(el).text().trim(), 10);
    if (!isNaN(page) && page > maxPage) maxPage = page;
  });

  if (maxPage > 1) {
    return {
      hasMore: currentPage < maxPage,
      lastPageNumber: maxPage,
    };
  }

  return {
    hasMore: hasMoreButton,
    lastPageNumber: hasMoreButton ? currentPage + 1 : currentPage,
  };
}

function mapSearchItemToMovie(item: GnulaSearchItem): Movie | null {
  if (!item.url || !item.title) return null;

  const itemSlug = extractSlug(item.url);
  const typeLower = (item.type || "").toLowerCase();
  const isSerie =
    typeLower.includes("serie") ||
    typeLower.includes("anime") ||
    typeLower.includes("dorama");

  return {
    link: `/${isSerie ? "serie" : "pelicula"}/${itemSlug}`,
    image: item.img || "",
    rating: "",
    title: item.title,
    year: item.year || "",
  };
}

function mapHtmlCardToMovie(
  card: ReturnType<cheerio.CheerioAPI>,
  parentSlug?: string,
): Movie | null {
  const href = card.attr("href") ?? "";
  const title = card.find("span.gnrd-card-title").text().trim();
  if (!href || !title) return null;

  const itemSlug = extractSlug(href);
  const typeBadge = card.find(".gnrd-type-badge").text().trim().toLowerCase();
  const isSerie =
    parentSlug === "series" ||
    typeBadge.includes("serie") ||
    typeBadge.includes("anime") ||
    typeBadge.includes("dorama");

  const image = card.find(".gnrd-card-art img").attr("src") ?? "";
  const ratingRaw = card.find(".gnrd-cm-rating").text().trim();
  const rating = ratingRaw.replace(/^★\s*/, "");

  const yearRaw = card
    .find(".gnrd-card-metaline span:not(.gnrd-cm-rating)")
    .first()
    .text()
    .trim();
  const yearMatch = yearRaw.match(/\b(19\d\d|20\d\d)\b/);
  const year = yearMatch ? yearMatch[0] : yearRaw.slice(0, 4);

  return {
    link: `/${isSerie ? "serie" : "pelicula"}/${itemSlug}`,
    image,
    rating,
    title,
    year,
  };
}

export class GetAll implements StrategyGetAllMovies {
  async operation(
    search?: string,
    slug?: string,
    pageNumber = 1,
  ): Promise<Movies | undefined> {
    const key = buildCacheKey(search, slug, pageNumber);
    const cached = getAllData<Movies>(key);
    const ttlHours = search ? CACHE_TTL_SEARCH_HOURS : CACHE_TTL_CATALOG_HOURS;

    if (cached && !isCacheExpired(cached.updatedAt, ttlHours)) {
      return cached.data;
    }

    try {
      if (search) {
        return await this.fetchBySearch(search, key);
      }
      return await this.fetchCatalog(slug, pageNumber, key);
    } catch (error) {
      console.error("[Gnula] GetAll operation failed:", error);
      return undefined;
    }
  }

  private async fetchBySearch(search: string, cacheKey: string): Promise<Movies> {
    const endpoint = `wp-json/gnrd/v1/search?q=${encodeURIComponent(search)}`;
    const response = await gnulaFetch(endpoint, {
      headers: { Accept: "application/json, text/plain, */*" },
    });

    const json = (await response.json()) as GnulaSearchResponse;
    const items = json?.results || [];

    const movies: Movie[] = items
      .map(mapSearchItemToMovie)
      .filter((m): m is Movie => m !== null);

    const result: Movies = { movies, lastPageNumber: 1, hasMore: false };
    upsertAll<Movies>(cacheKey, result);
    return result;
  }

  private async fetchCatalog(
    slug: string | undefined,
    pageNumber: number,
    cacheKey: string,
  ): Promise<Movies> {
    const cleanSlug = slug ? slug.replace(/^\/+|\/+$/g, "") : "";
    const basePath = cleanSlug ? `ver/${cleanSlug}/` : "";
    const endpoint = pageNumber > 1 ? `${basePath}?page=${pageNumber}` : basePath;

    const response = await gnulaFetch(endpoint, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    const movies: Movie[] = $("a.gnrd-card")
      .map((_, el) => mapHtmlCardToMovie($(el), slug))
      .get()
      .filter((m): m is Movie => m !== null);

    const { hasMore, lastPageNumber } = parsePagination($, pageNumber);

    const result: Movies = { movies, lastPageNumber, hasMore };
    upsertAll<Movies>(cacheKey, result);
    return result;
  }
}
