import { get, upsert } from "@/services/movie.store";
import { StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { BASE_URL, closeAnonymizedProxy, getBrowser } from "@/utils/browser";

export class GetDetail implements StrategyGetMovieDetails {
  async operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    const cached = get(link);
    const isSerie = link.includes("serie");

    const isPastDays = (dateString: string, days: number): boolean => {
      const date = new Date(dateString);

      return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24) > days;
    };

    if (
      cached?.title &&
      cached?.image &&
      !isPastDays(cached.updatedAt, 7) &&
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
      };
    }

    const { browser, context, page, anonymizedProxy } = await getBrowser();
    try {
      await page.goto(BASE_URL.SoloLatino + link, {
        waitUntil: "domcontentloaded",
      });

      const wrapper = page.locator(".detail-hero + div");

      const container = isSerie
        ? wrapper.locator("> div").first()
        : wrapper.locator("> div");

      const backgroundImage = await page
        .locator(".detail-hero__bg")
        .getAttribute("style");

      const image = await container.locator("img").nth(0).getAttribute("src");
      const title = await container.locator("h1").textContent();

      const spans = container.locator("span:not(.badge):not(.rating-badge)");

      const year = await spans.nth(0).textContent();

      const duration = await spans.nth(1).textContent();

      const rating = await container
        .locator(".rating-badge--tmdb")
        .textContent();

      const tags = (
        await container
          .locator('a:not([data-tab-panel="episodios"] a)')
          .allTextContents()
      ).map((tag) => tag.trim());

      const caption = await container.locator("p").nth(-1).textContent();

      const seasonsData = [];
      if (isSerie) {
        const seasonLocators = await page.locator("[data-season-panel]").all();

        for (const seasonLocator of seasonLocators) {
          const seasonNumber =
            (await seasonLocator.getAttribute("data-season-panel")) ||
            "Desconocida";

          // 3. Buscamos los episodios ÚNICAMENTE dentro de este panel de temporada
          const episodesData = await seasonLocator
            .locator(".ep-item")
            .evaluateAll((elements) => {
              return elements.map((episode) => {
                // Buscar los elementos de forma segura dentro del DOM
                const imgEl = episode.querySelector("img.ep-thumb");
                const titleEl = episode.querySelector(".text-sm.font-semibold");
                const numEl = episode.querySelector(".ep-num");
                const captionEl = episode.querySelector(".line-clamp-2");

                const fullLink = episode.getAttribute("href") || "";

                // Aplicar la expresión regular directamente en el navegador
                const match = fullLink.match(
                  /https?:\/\/[^/]+\/((?:pelicula|serie)\/[^?#]+)/,
                );
                const cleanedLink = match ? match[1] : "";

                return {
                  link: cleanedLink,
                  title: titleEl ? titleEl.textContent.trim() : "",
                  image: imgEl ? imgEl.getAttribute("src") || "" : "",
                  numberEpisode: numEl ? numEl.textContent.trim() : "",
                  caption: captionEl ? captionEl.textContent.trim() : "",
                };
              });
            });

          // 4. Guardamos la temporada junto con su lista de episodios
          seasonsData.push({
            season: seasonNumber,
            episodes: episodesData,
          });
        }
      }

      const detail = {
        backgroundImage:
          backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/)?.[1] ?? "",
        image: image ?? "",
        title: title?.trim() ?? "",
        year: year ?? "",
        duration: duration ?? "",
        rating: rating?.replace(/TMDB\s+([0-9.]+)/, "TMDB $1") ?? "",
        tags: tags ?? [],
        caption: caption ?? "",
        episodes: seasonsData,
      };

      upsert(link, detail);

      return detail;
    } catch (error) {
      console.error("Error occurred while fetching movie details:", error);
    } finally {
      await context.close().catch(() => {});
      await browser?.close().catch(() => {});
      await closeAnonymizedProxy(anonymizedProxy).catch(() => {});
    }
  }
}
