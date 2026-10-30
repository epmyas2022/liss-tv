/* eslint-disable @typescript-eslint/no-unused-vars */
import { get, remove /* upsert */ } from "@/services/movie.store";
import { StrategyGetUrl, Url } from "@/types/movie";
import { getLinkMediafire, isUrlMediafire } from "@/utils/utils";
import {
  BASE_URL,
  getBrowserContext,
  blacklistedDomains,
} from "@/utils/browser";
import { fetchFlare, postFlare } from "@/utils/flaresolverr";

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
      let browserContext: Awaited<ReturnType<typeof getBrowserContext>>["context"] | null = null;

      try {
        const targetUrl = new URL(path, BASE_URL.SoloLatino).href;

        // 1. Obtener la página del episodio usando la cookie/bypass limpio de FlareSolverr
        const htmlResponse = await fetchFlare(targetUrl);
        if (!htmlResponse.ok) {
          throw new Error("Failed to fetch page HTML: " + htmlResponse.status);
        }
        const htmlText = await htmlResponse.text();

        const tokenMatch = htmlText.match(/data-player-token="([^"]+)"/);
        if (!tokenMatch) throw new Error("Player token not found in HTML");
        const token = tokenMatch[1];

        console.log("[🔑] Player token extracted:", token.slice(0, 20) + "...");

        // 2. Resolver la URL del reproductor enviando el POST vía FlareSolverr (evita el 403 de Cloudflare Turnstile)
        const rawSolution = await postFlare(
          BASE_URL.SoloLatino + "api/player-url",
          `t=${encodeURIComponent(token)}`,
        );

        const jsonMatch = rawSolution.match(/\{[\s\S]*"url"[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("Could not parse iframe URL from player API response");
        }
        const apiData = JSON.parse(jsonMatch[0]) as { url?: string };
        if (!apiData?.url) throw new Error("Could not resolve iframe URL");

        const iframeUrl: string = apiData.url;

        // 3. Abrir Playwright en contexto aislado local con parches anti-bot
        const { context, page } = await getBrowserContext();
        browserContext = context;

        await context.grantPermissions([]);
        await context.addInitScript(() => {
          try {
            // Eliminar navigator.webdriver para que player.pelisserieshoy.com no redirija a Google
            Object.defineProperty(navigator, "webdriver", {
              get: () => undefined,
            });
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

        // Contenedor virtual para proveer el origen padre sololatino.net al iframe
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

        // Escucha de respuestas en toda la jerarquía de frames
        const videoPromise = (
          callback: (responseUrl: string, headers: Record<string, string>) => boolean,
        ) =>
          new Promise<string>((resolveVideo) => {
            const handler = (response: {
              url: () => string;
              headers: () => Record<string, string>;
            }) => {
              const responseUrl = response.url();
              const headers = response.headers();

              if (!callback(responseUrl, headers)) return;

              context.off("response", handler);
              resolveVideo(responseUrl);
            };

            context.on("response", handler);
          });

        context.on("page", async (newPage) => {
          await newPage.close().catch(() => {});
        });

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
          .locator("button.tab, button")
          .filter({ hasText: "Opción 1" });

        console.info("[▶️] Found #playBtn, starting click loop...");

        const clickLoop = async () => {
          while (!dataUrls.url) {
            try {
              if (
                (await opcion1.isVisible({ timeout: 1000 })) &&
                !dataUrls.url
              ) {
                await opcion1.click({ timeout: 1000, force: true });
                await opcion1.waitFor({ timeout: 1000 });
                continue;
              }
              await play.click({ timeout: 1000, force: true });
              await play.waitFor({ timeout: 1000 });
            } catch (_) {}
          }
        };

        const getUrlMediafire = (
          responseUrl: string,
          headers: Record<string, string>,
        ) => {
          if (isUrlMediafire(responseUrl)) {
            dataUrls.url = responseUrl;
            return true;
          }
          const location = headers["location"];
          if (location && isUrlMediafire(location)) {
            dataUrls.url = location;
            return true;
          }
          return false;
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
              new Promise((res) => setTimeout(() => res(null), 10000)),
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

        console.log("[✅] Video URL and fallback URL captured:", dataUrls);

        await context.storageState({ path: "state.json" });

        resolve(dataUrls);
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
}
