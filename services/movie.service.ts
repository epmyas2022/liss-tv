import { Browser, chromium } from "playwright";
import { upsert, get } from "./movie.store";
import { getLinkMediafire } from "@/utils/utils";

export const BASE_PATH = "https://sololatino.net/";

let browserInstance: Promise<Browser> | null = null;

export async function getBrowser() {
  if (!browserInstance)
    browserInstance = chromium.launch({
      headless: true,
      proxy: { server: "socks5://127.0.0.1:9050" },
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--disable-blin k-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

  const browser = await browserInstance;

  const context = await browser.newContext({
    viewport: {
      width: 1280,
      height: 720,
    },
    userAgent:
      "Mozilla/5.0 (Windows NT 6.1; rv:40.0) Gecko/20100101 Firefox/40.0",
  });

  setTimeout(async () => {
    await context.close();
  }, 20000); // Cierra el contexto después de 20 segundos

  const page = await context.newPage();

  return { browser, context, page };
}



export async function getUrl(path: string) {
  // ponytail: cache-first — skip scrape if URL already stored

  const cached = get(path);

  const linkCached = cached?.movieUrl
    ? await getLinkMediafire(cached.movieUrl)
    : null;

  if (linkCached) return linkCached;

  let resolved = false;

  return new Promise(async (resolve) => {
    const { context, page } = await getBrowser();

    const videoPromise = new Promise<string>((resolveVideo) => {
      const handler = (response: { url: () => string }) => {
        if (response.url().includes(".bin")) {
          resolved = true;
          page.off("response", handler); // Limpiamos el listener en cuanto lo encontramos
          resolveVideo(response.url());
        }
      };
      page.on("response", handler);
    });

    await page.goto(BASE_PATH + path, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const frame = page.frameLocator('iframe[src*="player.pelisserieshoy.com"]');

    context.on("page", async (newPage) => {
      await newPage.close().catch(() => {});
    });

    try {
      const play = await frame.locator("#playBtn");

      await play.waitFor({ timeout: 10000 });

      const clickLoop = async () => {
        while (!resolved) {
          play?.click({ force: true });

          await page.waitForTimeout(500);
        }
      };

      Promise.race([clickLoop(), videoPromise]);

      const url = await videoPromise;

      const extractNameUrl = (url: string) => {
        const match = url.match(/[^/]+(?=\/[^/]+$)/);
        return match ? `https://www.mediafire.com/file/${match[0]}` : "";
      };

      upsert(path, { movieUrl: extractNameUrl(url) });

      resolve(url);
    } catch (error) {
      console.error("Error occurred while fetching video URL:", error);
    }
  });
}

export async function getAll(search?: string, slug: string = "") {
  const { context, page } = await getBrowser();

  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if ([, "font", "media"].includes(type)) {
      return route.abort();
    }
    route.continue();
  });
  try {
    await page.goto(
      `${BASE_PATH}${slug}${search ? `buscar?q=${search}` : ""}`,

      {
        waitUntil: "domcontentloaded",
        timeout: 10000,
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

    await context.close();

    return movies;
  } catch (error) {
    console.error("Error occurred while fetching movies:", error);
    await context.close();
  }
}

export async function getMovieDetails(link: string) {
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

  const { context, page } = await getBrowser();
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

    await context.close();

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
    await context.close();
  }
}
