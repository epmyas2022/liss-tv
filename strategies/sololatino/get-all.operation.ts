import { getAllData, upsertAll } from "@/services/movie.store";
import { fetchFlare } from "@/utils/flaresolverr";
import * as cheerio from "cheerio";
import { Movies, StrategyGetAllMovies } from "@/types/movie";
import { BASE_URL, getBrowser, closeAnonymizedProxy } from "@/utils/browser";

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

    // Build target URL
    const targetUrl = `${BASE_URL.SoloLatino}${slug ?? ""}${search ? `buscar?q=${search}` : ""}${pageNumber && !search ? `?page=${pageNumber}` : ""}`;

    let browserInstance: Awaited<ReturnType<typeof getBrowser>> | null = null;
    try {
      let html: string;

      if (search) {
        browserInstance = await getBrowser();
        await browserInstance.page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });

        console.log(`Navigated to ${targetUrl} with search term "${search}"`);

      

        html = await browserInstance.page.content();

        console.log(html)
      } else {
        const response = await fetchFlare(targetUrl);
        html = await response.text();
      }

      const $ = cheerio.load(html);

      let lastPageNumber = 1;
      if (slug === "peliculas" || slug === "series") {
        const pages = $(".page-item");
        if (pages.length >= 2) {
          const lastPageText = pages.eq(pages.length - 2).text();
          lastPageNumber = parseInt(lastPageText) || 1;
        }
      }

      const movies = $(".card")
        .map((_, el) => {
          const linkRaw = $(el).find("a").attr("href") || "";
          const match = linkRaw.match(/https?:\/\/[^/]+(\/(pelicula|serie)\/[^/?#]+)/);
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

      if (!search) upsertAll<Movies>(key, data);

      return data;
    } catch (error) {
      console.error("Error occurred while fetching movies:", error);
    } finally {
      if (browserInstance) {
        await browserInstance.browser.close().catch(() => {});
        if (browserInstance.anonymizedProxy) {
          await closeAnonymizedProxy(browserInstance.anonymizedProxy).catch(() => {});
        }
      }
    }
  }
}
