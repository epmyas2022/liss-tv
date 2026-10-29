import { get, upsert } from "@/services/movie.store";
import { Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { BASE_URL } from "@/utils/browser";
import { fetchFlare } from "@/utils/flaresolverr";
import * as cheerio from "cheerio";

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
      cached?.backgroundImage &&
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

    // Fetch page with FlareSolverr and parse via cheerio
    const targetUrl = `${BASE_URL.SoloLatino}${link}`;
    try {
      const response = await fetchFlare(targetUrl);
      const html = await response.text();
      const $ = cheerio.load(html);

      const wrapper = $(".detail-hero + div");
      const container = isSerie ? wrapper.find("> div").first() : wrapper.find("> div");

      const backgroundStyle =
        $(".detail-hero__bg, .detail-hero").attr("style") || "";
      const bgMatch = backgroundStyle.match(/url\(['"']?([^'"]+?)['"']?\)/);
      let backgroundImage = bgMatch?.[1]?.trim() ?? "";

      if (backgroundImage.startsWith("//")) {
        backgroundImage = `https:${backgroundImage}`;
      } else if (backgroundImage.startsWith("/") && !backgroundImage.startsWith("//")) {
        backgroundImage = `${BASE_URL.SoloLatino}${backgroundImage.replace(/^\//, "")}`;
      }

      if (backgroundImage.includes("image.tmdb.org")) {
        backgroundImage = backgroundImage.replace(/\/w\d+\//, "/original/");
      }

      const image = container.find("img").eq(0).attr("src") ?? "";
      const title = container.find("h1").text().trim() ?? "";

      const spans = container.find("span:not(.badge):not(.rating-badge)");
      const year = spans.eq(0).text() ?? "";
      const duration = spans.eq(1).text() ?? "";

      const rating = container.find(".rating-badge--tmdb").text().trim() ?? "";

      const tags = container
        .find('a:not([data-tab-panel="episodios"] a)')
        .map((_, el) => $(el).text().trim())
        .get();

      const caption = container.find("p").last().text().trim() ?? "";

      const seasonsData: Season[] = [];
      if (isSerie) {
        $("[data-season-panel]").each((_, seasonEl) => {
          const seasonNumber = $(seasonEl).attr("data-season-panel") || "Desconocida";
          const episodesData = $(seasonEl)
            .find("a.ep-item")
            .map((_, epEl) => {
              const imgEl = $(epEl).find("img.ep-thumb");
              // The title element has multiple classes; match by the ones that are stable
              const titleEl = $(epEl).find("p.text-sm.font-semibold");
              const numEl = $(epEl).find("p.ep-num");
              const captionEl = $(epEl).find("p.line-clamp-2");
              const fullLink = $(epEl).attr("href") || "";
              const match = fullLink.match(/https?:\/\/[^/]+\/(?:pelicula|serie)\/[^?#]+/);
              const cleanedLink = match ? match[0] : "";
              return {
                link: cleanedLink,
                title: titleEl.text().trim(),
                image: imgEl.attr("src") ?? "",
                numberEpisode: numEl.text().trim(),
                caption: captionEl.text().trim(),
              };
            })
            .get();
          seasonsData.push({ season: seasonNumber, episodes: episodesData });
        });
      }

      const detail = {
        backgroundImage,
        image,
        title,
        year,
        duration,
        rating,
        tags,
        caption,
        episodes: seasonsData,
      };

      upsert(link, detail);
      return detail;
    } catch (error) {
      console.error("Error occurred while fetching movie details:", error);
    }
  }
}
