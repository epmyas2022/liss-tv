import { getAllData, upsertAll } from "@/services/movie.store";
import { Movies, StrategyGetAllMovies } from "../../types/movie";
import { closeAnonymizedProxy, getBrowser, BASE_URL } from "@/utils/browser";

export class GetAll implements StrategyGetAllMovies {
  async operation(
    search?: string,
    slug?: string,
    pageNumber?: number,
  ): Promise<Movies | undefined> {
    const key = !slug || slug == "" ? "home" : `${slug}/page/${pageNumber}`;

    const cached = !search ? getAllData<Movies>(key) : null;

    const isPastHours = (dateString: string, hours: number): boolean => {
      const date = new Date(dateString);

      return (Date.now() - date.getTime()) / (1000 * 60 * 60) > hours;
    };

    if (cached && !isPastHours(cached.updatedAt, 8)) {
      return cached.data;
    }

    const { browser, context, page, anonymizedProxy } = await getBrowser();

    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if ([, "font", "media"].includes(type)) {
        return route.abort();
      }
      route.continue();
    });
    try {
      await page.goto(
        `${BASE_URL.SoloLatino}${slug ?? ""}${search ? `buscar?q=${search}` : ""}${pageNumber && !search ? `?page=${pageNumber}` : ""}`,
        {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        },
      );

      await page.locator(".card").first().waitFor();

      let lastPageNumber = 1;

      if (slug === "peliculas" || slug === "series") {
        const pages = await page.locator(".page-item").all();

        const lastPage = pages[pages.length - 2];

        lastPageNumber = await parseInt((await lastPage.textContent()) || "1");
      }

      const movies = await page.evaluate(() => {
        const movieElements = document.querySelectorAll(".card");

        return Array.from(movieElements).map((movie) => {
          const link = movie.querySelector("a")?.getAttribute("href") || "";
          const image = movie.querySelector("img")?.getAttribute("src") || "";
          const rating =
            movie.querySelector(".card__rating")?.textContent || "";
          const title = movie.querySelector(".card__title")?.textContent || "";
          const year = movie.querySelector(".card__year")?.textContent || "";

          const match = link.match(
            /https?:\/\/[^/]+(\/(pelicula|serie)\/[^/?#]+)/,
          );

          return {
            link: match ? match[1] : "",
            image,
            rating,
            title,
            year,
          };
        });
      });

      const data = { movies, lastPageNumber };

      if (!search) upsertAll<Movies>(key, data);

      return data;
    } catch (error) {
      console.error("Error occurred while fetching movies:", error);
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      await closeAnonymizedProxy(anonymizedProxy).catch(() => {});
    }
  }
}
