import { getAllData, upsertAll } from "@/services/movie.store";
import { fetchFlare } from "@/utils/flaresolverr";
import * as cheerio from "cheerio";
import { Movie, Movies, StrategyGetAllMovies } from "@/types/movie";
import { BASE_URL, createStickySession } from "@/utils/browser";

interface SoloLatinoSuggestItem {
  type?: string;
  title?: string;
  year?: number | string;
  poster?: string;
  url?: string;
}

export class GetAll implements StrategyGetAllMovies {
  async operation(
    search?: string,
    slug?: string,
    pageNumber?: number,
  ): Promise<Movies | undefined> {
    const key = !slug || slug == "" ? "home" : `${slug}/page/${pageNumber}`;

    const cached = !search ? getAllData<Movies>(key) : null;

    const isPastHours = (dateString: string, hours: number): boolean =>
      (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60) > hours;

    if (cached && !isPastHours(cached.updatedAt, 8)) {
      return cached.data;
    }

    // Build target URL: use official suggest API for search to avoid server-side 403 on common query terms
    const targetUrl = search
      ? `${BASE_URL.SoloLatino}api/search/suggest?q=${encodeURIComponent(search)}`
      : `${BASE_URL.SoloLatino}${slug ?? ""}${pageNumber && pageNumber > 1 ? `?page=${pageNumber}` : ""}`;

    const { agent } = createStickySession();

    try {
      const response = await fetchFlare(targetUrl, { agent });
      const rawText = await response.text();

      if (search) {
        let jsonPayload = rawText.trim();
        if (jsonPayload.startsWith("<")) {
          const $ = cheerio.load(rawText);
          const preText = $("pre").text().trim();
          if (preText) {
            jsonPayload = preText;
          }
        }

        let items: SoloLatinoSuggestItem[] = [];
        try {
          items = JSON.parse(jsonPayload);
        } catch (parseError) {
          console.warn(
            "[SoloLatino] Failed to parse search suggest JSON:",
            parseError,
          );
        }

        const movies: Movie[] = Array.isArray(items)
          ? items
              .filter(
                (item) =>
                  item.type !== "person" &&
                  item.url &&
                  item.title &&
                  item.poster,
              )
              .map((item) => {
                const linkRaw = item.url || "";
                const match = linkRaw.match(
                  /(?:\/\/[^/]+)?(\/(pelicula|serie)\/[^/?#]+)/,
                );
                const link = match ? match[1] : linkRaw;

                return {
                  link,
                  image: item.poster || "",
                  rating: "",
                  title: item.title || "",
                  year: item.year ? String(item.year) : "",
                };
              })
          : [];

        return { movies, lastPageNumber: 1 };
      }

      const $ = cheerio.load(rawText);

      let lastPageNumber = 1;
      if (slug === "peliculas" || slug === "series") {
        const pages = $(".page-item");
        if (pages.length >= 2) {
          const lastPageText = pages.eq(pages.length - 2).text();
          lastPageNumber = parseInt(lastPageText) || 1;
        }
      }

      const movies: Movie[] = $(".card")
        .map((_, el) => {
          const linkRaw = $(el).find("a").attr("href") || "";
          const match = linkRaw.match(
            /https?:\/\/[^/]+(\/(pelicula|serie)\/[^/?#]+)/,
          );
          const link = match ? match[1] : "";
          const image = $(el).find("img").attr("src") || "";
          const rating =
            $(el).find(".card__rating").first().text().trim() || "";
          const rawTitle =
            $(el).find(".card__title").first().text().trim() || "";
          const rawYear = $(el).find(".card__year").first().text().trim() || "";
          const yearMatch = rawYear.match(/\b(19\d\d|20\d\d)\b/);
          const year = yearMatch ? yearMatch[0] : rawYear.slice(0, 4);

          return { link, image, rating, title: rawTitle, year };
        })
        .get();

      const data = { movies, lastPageNumber };

      upsertAll<Movies>(key, data);

      return data;
    } catch (error) {
      console.error("Error occurred while fetching movies:", error);
    }
  }
}
