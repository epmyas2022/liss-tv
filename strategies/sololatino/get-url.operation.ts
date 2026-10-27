import { get, remove, upsert } from "@/services/movie.store";
import { StrategyGetUrl, Url } from "../../types/movie";
import { getLinkMediafire, isUrlMediafire } from "@/utils/utils";
import {
  anonymizeProxy,
  createStickySession,
  BASE_URL,
  BROWSER_UA,
  getBrowserContext,
  blacklistedDomains,
  closeAnonymizedProxy,
} from "@/utils/browser";
import nodeFetch from "node-fetch";

export class GetUrl implements StrategyGetUrl {
  async operation(path: string): Promise<Url> {
    const cached = get(path);

    const linkCached = cached?.movieUrl
      ? await getLinkMediafire(cached.movieUrl)
      : null;

    if (linkCached)
      return {
        url: linkCached,
      };

    if (cached?.movieUrl && !linkCached) remove(path);

    return new Promise(async (resolve, reject) => {
      let browserContext = null;
      let anonymizedProxy: string | null = null;

      try {
        // One sticky session = one IP for all requests in this flow
        const { url: stickyUrl, agent: stickyAgent } = createStickySession();
        anonymizedProxy = await anonymizeProxy(stickyUrl);

        const targetUrl = new URL(path, BASE_URL.SoloLatino).href;
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
        const apiResponse = await nodeFetch(
          BASE_URL.SoloLatino + "api/player-url",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
              "User-Agent": BROWSER_UA,
            },
            body: JSON.stringify({ t: token }),
            agent: stickyAgent,
          },
        );

        const apiData = (await apiResponse.json()) as { url?: string };
        if (!apiData?.url) throw new Error("Could not resolve iframe URL");

        const iframeUrl: string = apiData.url;

        const { context, page } = await getBrowserContext(anonymizedProxy);

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

        const dataUrls: Url = {
          url: null,
          fallbackUrl: null,
        };

        // context.on captures responses from ALL frames (including cross-origin iframes)
        const videoPromise = (callback: (responseUrl: string) => boolean) =>
          new Promise<string>((resolveVideo) => {
            const handler = (response: { url: () => string }) => {
              const responseUrl = response.url();

              if (!callback(responseUrl)) return;

              context.off("response", handler);

              resolveVideo(responseUrl);
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
        const opcion1 = frame
          .locator("button.tab")
          .filter({ hasText: "Opción 1" });
      
        console.info("[▶️] Found #playBtn, starting click loop...");

        const clickLoop = async () => {
          while (!dataUrls.url || !dataUrls.fallbackUrl) {
            try {
              if (
                (await opcion1.isVisible({ timeout: 1000 })) &&
                dataUrls.url &&
                !dataUrls.fallbackUrl
              ) {
                await opcion1.click({ timeout: 1000, force: true });
                await opcion1.waitFor({ timeout: 1000 });
                continue;
              }
              await play.click({ timeout: 1000 });
              await play.waitFor({ timeout: 1000 });
            } catch (error) {}
          }
        };

        const getUrlMediafire = (responseUrl: string) => {
          if (!isUrlMediafire(responseUrl)) return false;
          dataUrls.url = responseUrl;
          return true;
        };

        const getUrlM3u8 = (responseUrl: string) => {
          if (!responseUrl.includes("index") || !responseUrl.includes(".m3u8"))
            return false;
          dataUrls.fallbackUrl = `/api/video/m3u8?url=${encodeURIComponent(responseUrl)}`;
          return true;
        };

        await Promise.race([
          clickLoop(),
          Promise.all([
            videoPromise(getUrlMediafire),
            Promise.race([
              videoPromise(getUrlM3u8),
              new Promise((res, _) => setTimeout(() => res(null), 10000)),
            ]),
          ]),
          new Promise((_, rej) =>
            setTimeout(
              () => rej(new Error("Timeout: no Mediafire URL captured in 30s")),
              30000,
            ),
          ),
        ]);

        if (!dataUrls.url)
          throw new Error("Failed to retrieve video URL or fallback URL");

        const extractNameUrl = (url: string) => {
          const match = url.match(/[^/]+(?=\/[^/]+$)/);
          return match ? `https://www.mediafire.com/file/${match[0]}` : "";
        };

        //upsert(path, { movieUrl: extractNameUrl(dataUrls.url) });

        console.log("[✅] Video URL and fallback URL captured:", dataUrls);

        resolve(dataUrls);
      } catch (error) {
        console.error("Error occurred while fetching video URL:", error);
        reject(error);
      } finally {
        if (browserContext) {
          await browserContext.close().catch(() => {});
        }
        if (anonymizedProxy) {
          await closeAnonymizedProxy(anonymizedProxy).catch(() => {});
        }
      }
    });
  }
}
