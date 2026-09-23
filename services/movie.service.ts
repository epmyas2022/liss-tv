import { Browser, chromium } from "playwright";
import { upsert, get, upsertAll, getAllData, remove } from "./movie.store";
import { getLinkMediafire, isUrlMediafire } from "@/utils/utils";
import { Movies } from "@/types/movie";

export const BASE_PATH = "https://sololatino.net/";

const BROWSER_ARGS = [
  "--autoplay-policy=no-user-gesture-required",
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-extensions",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Browser with Tor — used for SoloLatino scraping
let torBrowserInstance: Promise<Browser> | null = null;

// Browser without proxy — used for the player (pelisserieshoy blocks Tor IPs via Cloudflare)
let directBrowserInstance: Promise<Browser> | null = null;

async function getBrowserContext(useTor: boolean) {
  if (useTor) {
    if (!torBrowserInstance)
      torBrowserInstance = chromium.launch({
        headless: true,
        proxy: { server: "socks5://127.0.0.1:9050" },
        args: BROWSER_ARGS,
      });
  } else {
    if (!directBrowserInstance)
      directBrowserInstance = chromium.launch({
        headless: true,
        args: BROWSER_ARGS,
      });
  }

  const browser = await (useTor ? torBrowserInstance! : directBrowserInstance!);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: BROWSER_UA,
  });

  setTimeout(async () => {
    await context.close().catch(() => {});
  }, 60000); // Failsafe: close orphaned context after 60 seconds

  const page = await context.newPage();
  return { browser, context, page };
}

/** @deprecated Use getBrowserContext(true/false) directly */
export async function getBrowser() {
  return getBrowserContext(true);
}

export async function getUrl(path: string) {
  // ponytail: cache-first — skip scrape if URL already stored

  const cached = get(path);

  const linkCached = cached?.movieUrl
    ? await getLinkMediafire(cached.movieUrl)
    : null;

  if (linkCached) return linkCached;

  if (cached?.movieUrl && !linkCached) remove(path);


  const blacklistedDomains = [
    "google-analytics.com",
    "googletagmanager.com",
    "cloudflareinsights.com",
    "://cloudflareinsights.com",
    "doubleclick.net",
    "adbrn.com",
    "jads.co",
    "popads.net",
    "onclickads.net",
    "://impactradius-go.com",
  ];

  return new Promise(async (resolve, reject) => {
    let browserContext = null;

    try {
      // 1. Fast fetch of HTML to extract the player token (no Chromium needed)
      const htmlResponse = await fetch(BASE_PATH + path, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!htmlResponse.ok) throw new Error("Failed to fetch page HTML");
      const htmlText = await htmlResponse.text();

      const tokenMatch = htmlText.match(/data-player-token="([^"]+)"/);
      if (!tokenMatch) throw new Error("Player token not found in HTML");
      const token = tokenMatch[1];

      // 2. Resolve the iframe URL via the API (also no Chromium)
      const apiResponse = await fetch(BASE_PATH + "api/player-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify({ t: token }),
      });
      const apiData = await apiResponse.json();
      if (!apiData?.url) throw new Error("Could not resolve iframe URL");

      const iframeUrl: string = apiData.url;

      // 3. Open direct browser (no Tor) on the player iframe.
      // pelisserieshoy.com blocks Tor exit IPs via Cloudflare — must use direct connection.
      // We fake a sololatino.net page that embeds the iframe so origin checks pass.
      const { context, page } = await getBrowserContext(false);
      browserContext = context;

      // Block notification permission prompts — they show as an ad popup that intercepts clicks.
      // The player checks isTrusted on click events, so the real Playwright click must go through.
      await context.grantPermissions([]);
      await context.addInitScript(() => {
        try {
          Object.defineProperty(window, "Notification", {
            get: () => ({
              permission: "denied",
              requestPermission: () => Promise.resolve("denied"),
            }),
          });
        } catch (_) {}
      });

      // Register **/* FIRST — Playwright matches routes LIFO (last-in, first-out).
      // The specific __player_proxy__ route must be registered AFTER so it takes priority.
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        const url = route.request().url();

        if (
          blacklistedDomains.some((domain) => url.includes(domain)) ||
          ["font", "image", "manifest", "object"].includes(type)
        ) {
          return route.abort();
        }
        route.continue();
      });

      // This is registered LAST, so it runs FIRST (LIFO), intercepting the fake page request.
      await page.route("https://sololatino.net/__player_proxy__", (route) => {
        route.fulfill({
          contentType: "text/html",
          body: `<!DOCTYPE html><html><body style="margin:0">
            <iframe id="pl" src="${iframeUrl}" style="width:100%;height:100%;border:none" allow="autoplay; fullscreen"></iframe>
          </body></html>`,
        });
      });

      const videoPromise = new Promise<string>((resolveVideo) => {
        const handler = (response: { url: () => string }) => {
          if (isUrlMediafire(response.url())) {
            page.off("response", handler);
            resolveVideo(response.url());
          }
        };
        page.on("response", handler);
      });

      // Navigate to the fake page — the iframe loads with sololatino.net as parent origin
      await page.goto("https://sololatino.net/__player_proxy__", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      context.on("page", async (newPage) => {
        await newPage.close().catch(() => {});
      });

      const frame = page.frameLocator("#pl");
      const play = frame.locator("#playBtn");
      await play.waitFor({ timeout: 15000 });

      // Real Playwright click fires a trusted event (isTrusted=true).
      // The player uses this to auto-select the first available server.
      play.click().catch(() => {});

      const url = await videoPromise;

      const extractNameUrl = (url: string) => {
        const match = url.match(/[^/]+(?=\/[^/]+$)/);
        return match ? `https://www.mediafire.com/file/${match[0]}` : "";
      };

      upsert(path, { movieUrl: extractNameUrl(url) });

      resolve(url);
    } catch (error) {
      console.error("Error occurred while fetching video URL:", error);
      reject(error);
    } finally {
      if (browserContext) {
        await browserContext.close().catch(() => {});
      }
    }
  });
}

export async function getAll(
  search?: string,
  slug: string = "",
  pageNumber?: number,
) {
  const key = slug == "" ? "home" : `${slug}/page/${pageNumber}`;

  const cached = !search ? getAllData<Movies>(key) : null;

  const isPastHours = (dateString: string, hours: number): boolean => {
    const date = new Date(dateString);

    return (Date.now() - date.getTime()) / (1000 * 60 * 60) > hours;
  };

  if (cached && !isPastHours(cached.updatedAt, 2)) {
    return cached.data;
  }

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
      `${BASE_PATH}${slug}${search ? `buscar?q=${search}` : ""}${pageNumber && !search ? `?page=${pageNumber}` : ""}`,
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
        const rating = movie.querySelector(".card__rating")?.textContent || "";
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

    await context.close();

    const data = { movies, lastPageNumber };

    if (!search) upsertAll<Movies>(key, data);

    return data;
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
      rating: rating?.replace(/TMDB\s+([0-9.]+)/, "TMDB $1") ?? "",
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
