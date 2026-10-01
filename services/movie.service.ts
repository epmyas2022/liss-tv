import { Browser } from "playwright";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { upsert, get, upsertAll, getAllData, remove } from "./movie.store";
import { getLinkMediafire, isUrlMediafire } from "@/utils/utils";
import { Movies } from "@/types/movie";
import fs from "fs/promises";
import nodeFetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as proxyChain from "proxy-chain";

const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_USERNAME = process.env.PROXY_USERNAME;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;

if(!PROXY_HOST || !PROXY_USERNAME || !PROXY_PASSWORD) {
  throw new Error("Proxy environment variables are not set");
}

export const BASE_PATH = "https://sololatino.net/";

const BROWSER_ARGS = [
  "--autoplay-policy=no-user-gesture-required",
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-extensions",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

chromium.use(stealth());

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";


function createStickySession() {
  const sessid = Math.random().toString(36).substring(2, 12);
  const username = `${PROXY_USERNAME}-sessid-${sessid}`;
  const url = `http://${username}:${PROXY_PASSWORD}@${PROXY_HOST}`;
  const agent = new HttpsProxyAgent(url);
  return { url, agent };
}

let directBrowserInstance: Promise<Browser> | null = null;

async function getBrowserContext(anonymizedProxy?: string) {
  const browser = await chromium.launch({
    headless: true,
    args: BROWSER_ARGS,
    ...(anonymizedProxy && { proxy: { server: anonymizedProxy } }),
  });

  const isExistFileState = await fs
    .access("state.json")
    .then(() => true)
    .catch(() => false);

  if (isExistFileState) {
    console.info("[📁] state.json file exists. Using it for storage state.");
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: BROWSER_UA,
    ...(isExistFileState && { storageState: "state.json" }),
  });

  const page = await context.newPage();
  return { browser, context, page };
}

/** @deprecated Use getBrowserContext() directly */
export async function getBrowser() {
  if (!directBrowserInstance)
    directBrowserInstance = chromium.launch({
      headless: true,
      args: BROWSER_ARGS,
    });

  const browser = await directBrowserInstance;

  const isExistFileState = await fs
    .access("state.json")
    .then(() => true)
    .catch(() => false);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: BROWSER_UA,
    ...(isExistFileState && { storageState: "state.json" }),
  });

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
    let anonymizedProxy: string | null = null;

    try {
      // One sticky session = one IP for all requests in this flow
      const { url: stickyUrl, agent: stickyAgent } = createStickySession();
      anonymizedProxy = await proxyChain.anonymizeProxy(stickyUrl);

      const targetUrl = new URL(path, BASE_PATH).href;
      const htmlResponse = await nodeFetch(targetUrl, {
        headers: { "User-Agent": BROWSER_UA },
        agent: stickyAgent,
      });
      if (!htmlResponse.ok)
        throw new Error("Failed to fetch page HTML: " + htmlResponse.status);
      const htmlText = await htmlResponse.text();

      const tokenMatch = htmlText.match(/data-player-token="([^"]+)"/);
      if (!tokenMatch) throw new Error("Player token not found in HTML");
      const token = tokenMatch[1];

      // Resolve the iframe URL via the API — same sticky IP
      const apiResponse = await nodeFetch(BASE_PATH + "api/player-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": BROWSER_UA,
        },
        body: JSON.stringify({ t: token }),
        agent: stickyAgent,
      });

      const apiData = (await apiResponse.json()) as { url?: string };
      if (!apiData?.url) throw new Error("Could not resolve iframe URL");

      const iframeUrl: string = apiData.url;

      const { context, page } = await getBrowserContext();

      browserContext = context;

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

      await page.route("https://sololatino.net/__player_proxy__", (route) => {
        route.fulfill({
          contentType: "text/html",
          body: `<!DOCTYPE html><html><body style="margin:0">
            <iframe id="pl" src="${iframeUrl}" style="width:100%;height:100%;border:none" allow="autoplay; fullscreen"></iframe>
          </body></html>`,
        });
      });

      let url: string | null = null;

      // context.on captures responses from ALL frames (including cross-origin iframes)
      const videoPromise = new Promise<string>((resolveVideo) => {
        const handler = (response: { url: () => string }) => {
          const responseUrl = response.url();
          if (isUrlMediafire(responseUrl)) {
            context.off("response", handler);
            url = responseUrl;
            resolveVideo(responseUrl);
          }
        };
        context.on("response", handler);
      });

      context.on("page", async (newPage) => {
        await newPage.close().catch(() => {});
      });

      // Navigate to the fake page — the iframe loads with sololatino.net as parent origin
      console.info("[🌐] Navigating to proxy page. iframeUrl:", iframeUrl);
      await page.goto("https://sololatino.net/__player_proxy__", {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      console.info("[⏳] Waiting for #playBtn...");
      const frame = page.frameLocator("#pl");
      const play = frame.locator("#playBtn");
      await play.waitFor({ timeout: 20000 });
      console.info("[▶️] Found #playBtn, starting click loop...");

      const clickLoop = async () => {
        while (!url) {
          try {
            await play.click({ timeout: 1000 });
            await play.waitFor({ timeout: 1000 });
          } catch (error) {}
        }
      };

      await Promise.race([
        clickLoop(),
        videoPromise,
        new Promise((_, rej) =>
          setTimeout(
            () => rej(new Error("Timeout: no Mediafire URL captured in 30s")),
            30000,
          ),
        ),
      ]);

      if (!url) throw new Error("Failed to retrieve video URL");

      const extractNameUrl = (url: string) => {
        const match = url.match(/[^/]+(?=\/[^/]+$)/);
        return match ? `https://www.mediafire.com/file/${match[0]}` : "";
      };

      upsert(path, { movieUrl: extractNameUrl(url) });

      resolve(url);

      await context.storageState({ path: "state.json" });
    } catch (error) {
      console.error("Error occurred while fetching video URL:", error);
      reject(error);
    } finally {
      if (browserContext) {
        await browserContext.close().catch(() => {});
      }
      if (anonymizedProxy) {
        await proxyChain
          .closeAnonymizedProxy(anonymizedProxy, true)
          .catch(() => {});
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

  if (cached && !isPastHours(cached.updatedAt, 8)) {
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
