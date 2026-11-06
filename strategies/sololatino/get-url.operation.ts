/* eslint-disable @typescript-eslint/no-unused-vars */
import { get, remove /* upsert */, upsert } from "@/services/movie.store";
import { StrategyGetUrl, Url } from "@/types/movie";
import {
  getLinkMediafire,
  isUrlMediafire,
  extractMediafireFileUrl,
} from "@/utils/utils";
import {
  BASE_URL,
  getBrowserContext,
  blacklistedDomains,
  createStickySession,
  getBrowser,
} from "@/utils/browser";
import { fetchFlare, postFlare } from "@/utils/flaresolverr";
import {
  hasManifest,
  getManifestPublicUrl,
  saveManifestFromUpstream,
  normalizeMoviePath,
} from "@/services/minio.service";

const TIMEOUT_NAVIGATION_MS = 45_000;
const TIMEOUT_PLAY_BTN_MS = 35_000;
const TIMEOUT_CLICK_ACTION_MS = 3_000;
const TIMEOUT_CLICK_INTERVAL_MS = 2_500;
const TIMEOUT_M3U8_FALLBACK_MS = 20_000;
const TIMEOUT_TOTAL_CAPTURE_MS = 60_000;

export class GetUrl implements StrategyGetUrl {
  async operation(path: string): Promise<Url> {
    const cleanPath = normalizeMoviePath(path);

    // 0. Si ya existe el manifest en MinIO para esta película/serie, retornar su URL vía /api/video/m3u8
    try {
      const existsInMinio = await hasManifest(cleanPath);
      if (existsInMinio) {
        const appUrl = getManifestPublicUrl(cleanPath);
        try {
          upsert(path, { movieUrl: appUrl });
        } catch (_) {}
        return {
          url: appUrl,
          fallbackUrl: appUrl,
        };
      }
    } catch (err) {
      console.warn(`[MinIO] Check failed for ${cleanPath}:`, err);
    }

    const cached = get(path);

    if (cached?.movieUrl) {
      // Si la URL en caché contiene el path corrupto previo con "path=https" o "sololatino.net", purgarla
      if (
        cached.movieUrl.includes("path=https") ||
        cached.movieUrl.includes("sololatino.net")
      ) {
        remove(path);
      } else if (
        cached.movieUrl.includes(".m3u8") ||
        cached.movieUrl.startsWith("/api/video/m3u8")
      ) {
        // 1. Si ya existe en MinIO, SIEMPRE devolver la URL limpia del bucket (/api/video/m3u8?path=...)
        const inMinio = await hasManifest(cleanPath).catch(() => false);
        if (inMinio) {
          const appUrl = getManifestPublicUrl(cleanPath);
          try {
            upsert(path, { movieUrl: appUrl });
          } catch (_) {}
          return {
            url: appUrl,
            fallbackUrl: appUrl,
          };
        }

        // 2. Si la URL guardada en SQLite ya es limpia (/api/video/m3u8?path=...)
        if (
          cached.movieUrl.startsWith("/api/video/m3u8?path=") &&
          !cached.movieUrl.includes("&url=")
        ) {
          return {
            url: cached.movieUrl,
            fallbackUrl: cached.movieUrl,
          };
        }

        // 3. Si la URL en caché contiene tokens o rutas temporales de upstream (player.pelisserieshoy.com, p.php, .ts o url=)
        // y NO está en MinIO: ese token ya expiró y no sirve. Purgar caché para forzar re-scrape y guardado en MinIO
        if (
          cached.movieUrl.includes("player.pelisserieshoy.com") ||
          cached.movieUrl.includes("p.php") ||
          cached.movieUrl.includes(".ts") ||
          cached.movieUrl.includes("&url=") ||
          cached.movieUrl.includes("?url=")
        ) {
          remove(path);
        } else {
          let finalUrl = cached.movieUrl;
          if (
            finalUrl.includes("/movies/pelicula/") ||
            finalUrl.includes("/movies/serie/")
          ) {
            finalUrl = getManifestPublicUrl(cleanPath);
            try {
              upsert(path, { movieUrl: finalUrl });
            } catch (_) {}
          }
          return {
            url: finalUrl,
            fallbackUrl: finalUrl,
          };
        }
      }

      // 2. Si es o contiene un enlace a Mediafire, extraer la URL canónica permanente
      const mediafireFileUrl = extractMediafireFileUrl(cached.movieUrl);

      if (mediafireFileUrl) {
        // Resolver una URL de descarga fresca y vigente a partir del enlace canónico
        const freshDirectLink = await getLinkMediafire(mediafireFileUrl);
        if (freshDirectLink) {
          return {
            url: `/api/video?url=${encodeURIComponent(freshDirectLink)}`,
          };
        }
      }

      // 3. Si es una URL de proxy de video previa o streaming directo
      if (cached.movieUrl.startsWith("/api/")) {
        return {
          url: cached.movieUrl,
        };
      }

      // Si la URL en caché expiró o ya no es válida, eliminarla para re-raspar
      remove(path);
    }

    return new Promise(async (resolve, reject) => {
      let browserContext:
        | Awaited<ReturnType<typeof getBrowserContext>>["context"]
        | null = null;

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

        // 2. Resolver la URL del reproductor enviando el POST vía FlareSolverr (evita el 403 de Cloudflare Turnstile)
        const rawSolution = await postFlare(
          BASE_URL.SoloLatino + "api/player-url",
          JSON.stringify({ t: token }),
          {
            "Content-Type": "application/json",
            Accept: "application/json",
            Referer: targetUrl,
          },
        );

        const jsonMatch = rawSolution.match(/\{[\s\S]*"url"[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error(
            "Could not parse iframe URL from player API response",
          );
        }
        const apiData = JSON.parse(jsonMatch[0]) as { url?: string };
        if (!apiData?.url) throw new Error("Could not resolve iframe URL");

        const iframeUrl: string = apiData.url;

        // 3. Abrir Playwright en contexto aislado local con parches anti-bot
        const { context, page } = await getBrowser();
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
          callback: (
            responseUrl: string,
            headers: Record<string, string>,
          ) => boolean,
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
          timeout: TIMEOUT_NAVIGATION_MS,
        });

        console.info("[⏳] Waiting for #playBtn...");
        const frame = page.frameLocator("#pl");
        const play = frame.locator("#playBtn");
        await play.waitFor({ timeout: TIMEOUT_PLAY_BTN_MS });

        const opcion1 = frame
          .locator("button.tab, button")
          .filter({ hasText: "Opción 1" });

        const errorMessage = frame.locator("#srvErrorOverlay");

        console.info("[▶️] Found #playBtn, starting click loop...");

        const clickLoop = async () => {
          while (!dataUrls.url || !dataUrls.fallbackUrl) {
            try {
              if (
                (await opcion1.isVisible({
                  timeout: TIMEOUT_CLICK_ACTION_MS,
                })) &&
                (dataUrls.url || (await errorMessage.isVisible())) &&
                !dataUrls.fallbackUrl
              ) {
                await opcion1.click({
                  timeout: TIMEOUT_CLICK_ACTION_MS,
                  force: true,
                });
                await new Promise((resolve) =>
                  setTimeout(resolve, TIMEOUT_CLICK_INTERVAL_MS),
                );
                continue;
              }
              await play.click({
                timeout: TIMEOUT_CLICK_ACTION_MS,
                force: true,
              });
              await new Promise((resolve) =>
                setTimeout(resolve, TIMEOUT_CLICK_INTERVAL_MS),
              );
            } catch (_) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        };

        const getUrlMediafire = (
          responseUrl: string,
          headers: Record<string, string>,
        ) => {
          if (isUrlMediafire(responseUrl)) {
            dataUrls.url = `/api/video?url=${encodeURIComponent(responseUrl)}`;
            return true;
          }
          const location = headers["location"];
          if (location && isUrlMediafire(location)) {
            dataUrls.url = `/api/video?url=${encodeURIComponent(location)}`;
            return true;
          }
          return false;
        };

        let rawM3u8Url: string | null = null;
        const getUrlM3u8 = (responseUrl: string) => {
          if (!responseUrl.includes("index") || !responseUrl.includes(".m3u8"))
            return false;
         
          rawM3u8Url = responseUrl;
          dataUrls.fallbackUrl = `/api/video/m3u8?path=${encodeURIComponent(cleanPath)}`;
          return true;
        };

        await Promise.race([
          clickLoop(),
          Promise.all([
            videoPromise(getUrlMediafire),
            Promise.race([
              videoPromise(getUrlM3u8),
              new Promise((res) =>
                setTimeout(() => res(null), TIMEOUT_M3U8_FALLBACK_MS),
              ),
            ]),
          ]),
          new Promise((_, rej) =>
            setTimeout(
              () =>
                rej(
                  new Error(
                    `Timeout: no Mediafire URL captured in ${TIMEOUT_TOTAL_CAPTURE_MS / 1000}s`,
                  ),
                ),
              TIMEOUT_TOTAL_CAPTURE_MS,
            ),
          ),
        ]);

        if (rawM3u8Url && cleanPath) {
          try {
            console.info(`[MinIO] Uploading M3U8 to bucket for: ${cleanPath}...`);
            const minioAppUrl = await saveManifestFromUpstream(
              cleanPath,
              rawM3u8Url,
            );
            dataUrls.fallbackUrl = minioAppUrl;
            if (!dataUrls.url) {
              dataUrls.url = minioAppUrl;
            }
            console.info(`[MinIO] Successfully saved in bucket: ${cleanPath}`);
          } catch (err) {
            console.warn(`[MinIO] Save manifest error for ${cleanPath}:`, err);
            dataUrls.fallbackUrl = `/api/video/m3u8?path=${encodeURIComponent(cleanPath)}&url=${encodeURIComponent(rawM3u8Url)}`;
            if (!dataUrls.url) {
              dataUrls.url = dataUrls.fallbackUrl;
            }
          }
        }

        if (!dataUrls.url && !dataUrls.fallbackUrl)
          return reject(new Error("No video URL or fallback URL captured"));

        console.log("[✅] Video URL and fallback URL captured:", dataUrls);

        await context.storageState({ path: "state.json" });

        // Guardar exclusivamente el fallbackUrl (que contiene la URL del manifest m3u8 / MinIO)
        const m3u8ToSave = dataUrls.fallbackUrl || undefined;

        upsert(path, {
          movieUrl: m3u8ToSave,
        });

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
