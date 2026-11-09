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
  if (search) return `gnula:search:${search.toLowerCase().trim()}`;
  if (!slug || slug === "") return "gnula:home";
  return `gnula:${slug}/page/${pageNumber ?? 1}`;
};

const buildTargetUrl = (search?: string, slug?: string, pageNumber?: number): string => {
  if (search) {
    return `${GNULA_BASE_URL}?s=${encodeURIComponent(search)}`;
  }

  if (!slug || slug === "") {
    return pageNumber && pageNumber > 1
      ? `${GNULA_BASE_URL}page/${pageNumber}/`
      : GNULA_BASE_URL;
  }

  return pageNumber && pageNumber > 1
    ? `${GNULA_BASE_URL}ver/${slug}/page/${pageNumber}/`
    : `${GNULA_BASE_URL}ver/${slug}/`;
};

const parseLastPageNumber = ($: cheerio.CheerioAPI): number => {
  let lastPage = 1;

  // WordPress pagination: a.page-numbers contains numeric page links
  $("a.page-numbers").each((_, el) => {
    const n = parseInt($(el).text().trim(), 10);
    if (!isNaN(n) && n > lastPage) lastPage = n;
  });

  return lastPage;
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

      console.log(html)
      const $ = cheerio.load(html);

      const movies: Movie[] = $("a.gnrd-card")
        .map((_, el) => {
          const href = $(el).attr("href") ?? "";

          // Extract the /ver/<slug>/ path, stripping the domain
          const pathMatch = href.match(/https?:\/\/[^/]+(\/ver\/[^/?#]+\/?)/);
          const link = pathMatch ? pathMatch[1] : href;

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

      const lastPageNumber = parseLastPageNumber($);

      const data: Movies = { movies, lastPageNumber };
      upsertAll<Movies>(key, data);

      return data;
    } catch (error) {
      console.error("[Gnula] Error fetching movies:", error);
    }
  }
}
