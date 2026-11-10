import { get, upsert } from "@/services/movie.store";
import { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import * as cheerio from "cheerio";
import nodeFetch from "node-fetch";
import https from "https";

const GNULA_BASE_URL = "https://ww3.gnulahd.nu/";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const isPastDays = (dateString: string, days: number): boolean => {
  const date = new Date(dateString);
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24) > days;
};

const buildDetailUrl = (link: string): string => {
  if (link.startsWith("http://") || link.startsWith("https://")) {
    return link;
  }
  const clean = link.replace(/^\/+/, "");
  if (clean.startsWith("ver/")) {
    return `${GNULA_BASE_URL}${clean}`;
  }
  const slugMatch = clean.match(/(?:pelicula|serie)\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : clean.replace(/\/+$/, "");
  return `${GNULA_BASE_URL}ver/${slug}/`;
};

export class GetDetail implements StrategyGetMovieDetails {
  async operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    const cached = get(link);
    const isSerie = link.includes("serie");

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

    const targetUrl = buildDetailUrl(link);

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

      // Title
      let title = $("h1.gnrd-fi-title .gnrd-sr").text().trim();
      if (!title) {
        title = $("h1.gnrd-fi-title img").attr("alt")?.trim() ?? "";
      }
      if (!title) {
        title = $("h1.gnrd-fi-title").text().trim();
      }

      // Backdrop
      const bgStyle = $(".gnrd-fi-bg").attr("style") || "";
      const bgMatch = bgStyle.match(/url\(['"]?([^'"]+?)['"]?\)/);
      let backgroundImage = bgMatch?.[1]?.trim() ?? "";
      if (backgroundImage.includes("image.tmdb.org")) {
        backgroundImage = backgroundImage.replace(/\/w\d+\//, "/original/");
      }

      // Poster / Cover
      const image =
        $('meta[itemprop="image"]').attr("content") ||
        $('meta[property="og:image"]').attr("content") ||
        $("img.gnrd-fi-logo").attr("src") ||
        backgroundImage ||
        "";

      // Rating
      const ratingRaw = $(".gnrd-rating, .gnrd-cm-rating").first().text().trim();
      const rating = ratingRaw.replace(/^★\s*/, "");

      // Year
      let year = "";
      $(".gnrd-fi-meta span, .gnrd-eyebrow").each((_, el) => {
        const text = $(el).text().trim();
        const m = text.match(/\b(19\d\d|20\d\d)\b/);
        if (m && !year) year = m[0];
      });

      // Duration
      let duration = "";
      $(".gnrd-fi-meta span").each((_, el) => {
        const text = $(el).text().trim();
        if (/\b\d+\s*(?:hr|min|m|h)\b/i.test(text)) {
          duration = text;
        }
      });

      // Tags / Genres
      const tags = $(".gnrd-fi-genres a, .gnrd-fi-genres span")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean);

      // Synopsis / Caption
      const caption = $("p.gnrd-fi-syn, #gnrd-syn, p[itemprop='description']")
        .first()
        .text()
        .trim();

      // Seasons & Episodes
      const seasonsMap = new Map<string, Episode[]>();

      $("a.gnrd-epc").each((_, el) => {
        const href = $(el).attr("href") || "";
        const seasonAttr = $(el).attr("data-s");
        const epAttr = $(el).attr("data-e");

        const epCode = $(el).find(".gnrd-epc-n").text().trim();
        const codeMatch = epCode.match(/^(\d+)x(\d+)$/i);

        const seasonNum = seasonAttr || (codeMatch ? codeMatch[1] : "1");
        const epNum = epAttr || (codeMatch ? codeMatch[2] : "1");

        const thumbStyle = $(el).find(".gnrd-epc-thumb").attr("style") || "";
        const thumbMatch = thumbStyle.match(/url\(['"]?([^'"]+?)['"]?\)/);
        const epThumb =
          thumbMatch?.[1]?.trim() || $(el).find("img").attr("src") || image;

        const epTitle =
          $(el).find(".gnrd-epc-title").text().trim() || `Episodio ${epNum}`;
        const epDate = $(el).find(".gnrd-epc-date").text().trim();
        const epDur = $(el).find(".gnrd-epc-dur").text().trim();
        const epCaption = [epDate, epDur].filter(Boolean).join(" · ");

        const pathMatch = href.match(/https?:\/\/[^/]+(\/[^?#]+)/);
        const cleanedLink = pathMatch ? pathMatch[1] : href;

        const episode: Episode = {
          link: cleanedLink,
          title: epTitle,
          image: epThumb,
          numberEpisode: epNum,
          caption: epCaption,
        };

        if (!seasonsMap.has(seasonNum)) {
          seasonsMap.set(seasonNum, []);
        }
        seasonsMap.get(seasonNum)!.push(episode);
      });

      const seasonsData: Season[] = Array.from(seasonsMap.entries()).map(
        ([season, episodes]) => ({
          season,
          episodes: episodes.sort(
            (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10),
          ),
        }),
      );

      const movieData: Omit<StoredMovie, "link" | "updatedAt"> = {
        title,
        image,
        backgroundImage,
        rating,
        year,
        duration,
        tags,
        caption,
        episodes: seasonsData.length > 0 ? seasonsData : undefined,
      };

      upsert(link, movieData);
      return movieData;
    } catch (error) {
      console.error("[Gnula] Error fetching movie details:", error);
    }
  }
}
