import { chromium } from "playwright";
import { upsert, get, getAll as getAllStored } from "./movie.store";

export const BASE_PATH = "https://sololatino.net/";

export async function getBrowser() {
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: "socks5://127.0.0.1:9050" },
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-blin k-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    viewport: {
      width: 1280,
      height: 720,
    },
    userAgent:
      "Mozilla/5.0 (Windows NT 6.1; rv:40.0) Gecko/20100101 Firefox/40.0",
  });

  const page = await context.newPage();

  return { browser, context, page };
}

export async function getUrl(path: string) {
  // ponytail: cache-first — skip scrape if URL already stored
  const cached = get(path);
  if (cached?.movieUrl) return cached.movieUrl;

  let resolved = false;

  return new Promise(async (resolve) => {
    const { browser, context, page } = await getBrowser();

    const allowVideos = [".bin"];

    const videoPromise = new Promise<string>((resolveVideo) => {
      page.on("response", async (response) => {
        const isAllowVideo = allowVideos.some((ext) =>
          response.url().includes(ext),
        );

        if (!isAllowVideo) return;

        const url = response.url();

        console.log("URL de video encontrada:", url);

        resolved = true;
        resolveVideo(url);
        upsert(path, { movieUrl: url });
      });
    });

    await page.goto(BASE_PATH + path, {
      waitUntil: "commit",
    });

    const frame = page.frameLocator('iframe[src*="player.pelisserieshoy.com"]');

    context.on("page", async (newPage) => {
      await newPage.close().catch(() => {});
    });

    try {
      const play = await frame.locator("#playBtn");

      while (!resolved) {
        play?.click({ force: true });

        await Promise.race([videoPromise, page.waitForTimeout(1000)]);
      }

      resolve(await videoPromise);
    } catch (error) {
      console.error("Error occurred while fetching video URL:", error);
    } finally {
      await browser.close();
    }
  });
}

export async function getAll(search?: string, slug: string = "") {
  // ponytail: return store if no search/slug filter — avoids full scrape on home
  if (!search && !slug) {
    const stored = getAllStored();
    if (stored.length > 0) return stored;
  }

  const { browser, page } = await getBrowser();
  try {
    await page.goto(
      `${BASE_PATH}${slug}${search ? `buscar?q=${search}` : ""}`,

      {
        waitUntil: "domcontentloaded",
      },
    );

    await page.locator(".card").first().waitFor();

    const movies = await page.evaluate(() => {
      const movieElements = document.querySelectorAll(".card");

      return Array.from(movieElements).map((movie) => {
        const link = movie.querySelector("a")?.getAttribute("href") || "";
        const image = movie.querySelector("img")?.getAttribute("src") || "";
        const rating = movie.querySelector(".card__rating")?.textContent || "";
        const title = movie.querySelector(".card__title")?.textContent || "";
        const year = movie.querySelector(".card__year")?.textContent || "";

        const match = link.match(
          /https?:\/\/[^/]+(\/(pelicula|serie)\/[^/?#]+)/,
        );

        return { link: match ? match[1] : "", image, rating, title, year };
      });
    });

    await browser.close();

    // ponytail: persist each card; skip empty links
    movies.filter((m) => m.link).forEach((m) => upsert(m.link, m));

    return movies;
  } catch (error) {
    console.error("Error occurred while fetching movies:", error);
    await browser.close();
  }
}

export async function getMovieDetails(link: string) {
  // ponytail: cache-first — series need episodes too, movies just need title+image
  const cached = get(link);
  const isSerie = link.includes("serie");
  if (cached?.title && cached?.image && (!isSerie || cached?.episodes?.length)) {
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

  const { browser, page } = await getBrowser();
  try {
    await page.goto(BASE_PATH + link, {
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

    const rating = await container.locator(".rating-badge--tmdb").textContent();

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
        // 2. Extraemos el número de la temporada del atributo 'data-season-panel'
        const seasonNumber =
          (await seasonLocator.getAttribute("data-season-panel")) ||
          "Desconocida";

        const episodesData = [];

        // 3. Buscamos los episodios ÚNICAMENTE dentro de este panel de temporada
        const episodeLocators = await seasonLocator.locator(".ep-item").all();

        for (const episode of episodeLocators) {
          const link = (await episode.getAttribute("href")) || "";
          const image =
            (await episode.locator("img.ep-thumb").getAttribute("src")) || "";

          const title =
            (await episode.locator(".text-sm.font-semibold").textContent()) ||
            "";
          const numberEpisode =
            (await episode.locator(".ep-num").textContent()) || "";
          const caption =
            (await episode.locator(".line-clamp-2").textContent()) || "";


          const match = link.match(
            /https?:\/\/[^/]+\/((?:pelicula|serie)\/[^?#]+)/,
          );
          episodesData.push({
            link: match ? match[1] : "",
            title: title.trim(),
            image,
            numberEpisode: numberEpisode.trim(),
            caption: caption.trim(),
          });
        }

        // 4. Guardamos la temporada junto con su lista de episodios
        seasonsData.push({
          season: seasonNumber,
          episodes: episodesData,
        });
      }
    }

    await browser.close();

    const detail = {
      backgroundImage:
        backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/)?.[1] ?? "",
      image: image ?? "",
      title: title?.trim() ?? "",
      year: year ?? "",
      duration: duration ?? "",
      rating: rating ?? "",
      tags: tags ?? [],
      caption: caption ?? "",
      episodes: seasonsData,
    };

    upsert(link, detail);

    return detail;
  } catch (error) {
    console.error("Error occurred while fetching movie details:", error);
    await browser.close();
  }
}
