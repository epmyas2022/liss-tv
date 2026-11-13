/* eslint-disable @typescript-eslint/no-unused-vars */
import { get, remove } from "@/services/movie.store";
import nodeFetch from "node-fetch";
import { StrategyGetUrl, Url } from "@/types/movie";
import {
  getLinkMediafire,
  isUrlMediafire,
  extractMediafireFileUrl,
} from "@/utils/utils";
import {
  BASE_URL,
  BROWSER_UA,
  blacklistedDomains,
  createStickySession,
  getSharedBrowserContext,
} from "@/utils/browser";
import { fetchFlare, loadCache } from "@/utils/flaresolverr";
import { normalizeMoviePath } from "@/services/minio.service";
import {
  resolveCachedStream,
  persistUpstreamManifest,
  persistStreamUrl,
} from "@/services/stream-cache.service";
import { isManifestReusable } from "@/utils/m3u8-validator";

const TIMEOUT_NAVIGATION_MS = 25_000;
const TIMEOUT_PLAY_BTN_MS = 15_000;
const TIMEOUT_TOTAL_CAPTURE_MS = 25_000;
const TIMEOUT_GRACE_PERIOD_MS = 1_500;

export class GetUrl implements StrategyGetUrl {
  async operation(path: string): Promise<Url> {
    const tStart = performance.now();
    const cleanPath = normalizeMoviePath(path);

    // 1. Verificar si el stream ya existe en el bucket de MinIO o en caché válida
    const cachedStream = await resolveCachedStream(path);
    if (cachedStream) {
      return cachedStream;
    }

    // 2. Si SoloLatino tiene un enlace Mediafire canónico en SQLite, resolver enlace fresco
    const cached = get(path);
    if (cached?.movieUrl) {
      const mediafireFileUrl = extractMediafireFileUrl(cached.movieUrl);
      if (mediafireFileUrl) {
        const freshDirectLink = await getLinkMediafire(mediafireFileUrl);
        if (freshDirectLink) {
          return {
            url: `/api/video?url=${encodeURIComponent(freshDirectLink)}`,
          };
        }
      }
      remove(path);
    }

    return new Promise(async (resolve, reject) => {
      let browserContext:
        | Awaited<ReturnType<typeof getSharedBrowserContext>>["context"]
        | null = null;

      try {
        const targetUrl = new URL(path, BASE_URL.SoloLatino).href;

        // Crear sesión sticky de proxy para que ambos fetch y Playwright compartan la misma IP/sesión
        let stickySession: ReturnType<typeof createStickySession> | null = null;
        try {
          stickySession = createStickySession();
        } catch {
          // Si no hay configuración de proxy, continúa directo
        }

        // 1. Obtener la página del episodio usando la cookie/bypass limpio de FlareSolverr a través del proxy
        const htmlResponse = await fetchFlare(targetUrl, {
          ...(stickySession
            ? {
                agent: stickySession.agent,
                proxyUrl: stickySession.url,
                proxyUsername: stickySession.username,
              }
            : {}),
        });
        if (!htmlResponse.ok) {
          throw new Error("Failed to fetch page HTML: " + htmlResponse.status);
        }
        const htmlText = await htmlResponse.text();

        const tokenMatch = htmlText.match(/data-player-token="([^"]+)"/);
        if (!tokenMatch) throw new Error("Player token not found in HTML");
        const token = tokenMatch[1];

        // 2. Resolver la URL del reproductor enviando el POST con headers, cookies y a través del proxy
        let cacheKey = "direct";
        if (stickySession) {
          try {
            const parsed = new URL(stickySession.url);
            cacheKey = `proxy:${parsed.hostname || parsed.host}`;
          } catch {
            cacheKey = `proxy:${process.env.PROXY_HOST || "default"}`;
          }
        }

        const cache = (await loadCache(cacheKey)) || (await loadCache("direct"));
        const cookieHeader = cache?.cookies
          ?.map((c) => `${c.name}=${c.value}`)
          .join("; ");
        const userAgent = cache?.userAgent || BROWSER_UA;

        const playerUrlEndpoint = new URL(
          "/api/player-url",
          BASE_URL.SoloLatino,
        ).href;

        const postHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
          Referer: targetUrl,
          Origin: new URL(targetUrl).origin,
          "User-Agent": userAgent,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        };

        const postBody = JSON.stringify({ t: token });

        const apiResponse = stickySession?.agent
          ? ((await nodeFetch(playerUrlEndpoint, {
              method: "POST",
              headers: postHeaders,
              body: postBody,
              agent: stickySession.agent,
            } as never)) as unknown as Response)
          : await fetch(playerUrlEndpoint, {
              method: "POST",
              headers: postHeaders,
              body: postBody,
            });

        const rawSolution = await apiResponse.text();
        console.log(`[SoloLatino] Player API status: ${apiResponse.status}`);

        const jsonMatch = rawSolution.match(/\{[\s\S]*"url"[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error(
            "Could not parse iframe URL from player API response",
          );
        }
        const apiData = JSON.parse(jsonMatch[0]) as { url?: string };
        if (!apiData?.url) throw new Error("Could not resolve iframe URL");

        const iframeUrl: string = apiData.url;
        const tPreflight = performance.now();

        // 3. Abrir Playwright en contexto aislado local desde el Singleton con parches anti-bot
        const { context, page } = await getSharedBrowserContext({
          proxyUrl: stickySession?.url,
        });
        browserContext = context;
        const tContext = performance.now();

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

        let rawM3u8Url: string | null = null;
        let isCaptureDone = false;
        let graceTimer: NodeJS.Timeout | null = null;
        let resolveCapturePromise: () => void;

        const captureCompletePromise = new Promise<void>((res) => {
          resolveCapturePromise = res;
        });

        const finishCapture = () => {
          if (isCaptureDone) return;
          isCaptureDone = true;
          if (graceTimer) {
            clearTimeout(graceTimer);
            graceTimer = null;
          }
          resolveCapturePromise();
        };

        const startGraceWindow = () => {
          if (graceTimer || isCaptureDone) return;
          console.info(
            `[SoloLatino] First stream URL captured. Starting ${TIMEOUT_GRACE_PERIOD_MS}ms grace window for secondary stream...`,
          );
          graceTimer = setTimeout(() => {
            console.info("[SoloLatino] Grace period elapsed. Finalizing capture.");
            finishCapture();
          }, TIMEOUT_GRACE_PERIOD_MS);
        };

        // Escucha reactiva de respuestas de red en todo el contexto
        context.on("response", (response) => {
          if (isCaptureDone) return;
          const responseUrl = response.url();
          const headers = response.headers();

          // 1. Detectar Mediafire
          if (!dataUrls.url) {
            if (isUrlMediafire(responseUrl)) {
              dataUrls.url = `/api/video?url=${encodeURIComponent(responseUrl)}`;
              console.info(`[SoloLatino] Captured Mediafire URL: ${responseUrl}`);
            } else {
              const location = headers["location"];
              if (location && isUrlMediafire(location)) {
                dataUrls.url = `/api/video?url=${encodeURIComponent(location)}`;
                console.info(`[SoloLatino] Captured Mediafire redirect: ${location}`);
              }
            }

            if (dataUrls.url) {
              if (rawM3u8Url) {
                finishCapture();
              } else {
                startGraceWindow();
              }
            }
          }

          // 2. Detectar M3U8
          if (!rawM3u8Url) {
            if (responseUrl.includes("index") && responseUrl.includes(".m3u8")) {
              rawM3u8Url = responseUrl;
              console.info(`[SoloLatino] Captured raw M3U8 URL: ${responseUrl}`);
              if (dataUrls.url) {
                finishCapture();
              } else {
                startGraceWindow();
              }
            }
          }
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
        const tPlayReady = performance.now();

        const opcion1 = frame
          .locator("button.tab, button")
          .filter({ hasText: "Opción 1" });
        const errorMessage = frame.locator("#srvErrorOverlay");

        console.info("[▶️] Found #playBtn, starting fast click trigger...");

        // Bucle reactivo de clics rápidos con neutralización de overlays
        const fastClickLoop = async () => {
          let attempts = 0;
          while (!isCaptureDone && attempts < 15) {
            attempts++;
            try {
              // 1. Si hay error en el player o se necesita fallback y Opción 1 está visible, clickear Opción 1
              if (await opcion1.isVisible({ timeout: 200 }).catch(() => false)) {
                if (
                  dataUrls.url ||
                  (await errorMessage.isVisible({ timeout: 150 }).catch(() => false))
                ) {
                  if (!rawM3u8Url) {
                    await opcion1.click({ timeout: 800, force: true }).catch(() => {});
                    await new Promise((r) => setTimeout(r, 400));
                    continue;
                  }
                }
              }

              // 2. Neutralizar overlays transparentes de publicidad que roban el click en el iframe
              await frame
                .locator(
                  "div[style*='position: fixed'], div[style*='position: absolute'][style*='z-index: 2'], a[target='_blank']",
                )
                .evaluateAll((elements) => {
                  elements.forEach((el) => {
                    if (
                      el.id !== "playBtn" &&
                      !el.contains(document.getElementById("playBtn"))
                    ) {
                      el.remove();
                    }
                  });
                })
                .catch(() => {});

              // 3. Click forzado directo en el botón de reproducción
              await play.click({ timeout: 800, force: true }).catch(() => {});
            } catch (_) {}

            if (isCaptureDone) break;
            await new Promise((r) => setTimeout(r, 500));
          }
        };

        // Correr el click loop en paralelo con la captura reactiva y timeout global
        await Promise.race([
          fastClickLoop(),
          captureCompletePromise,
          new Promise((_, rej) =>
            setTimeout(
              () =>
                rej(
                  new Error(
                    `Timeout: no video stream captured in ${TIMEOUT_TOTAL_CAPTURE_MS / 1000}s`,
                  ),
                ),
              TIMEOUT_TOTAL_CAPTURE_MS,
            ),
          ),
        ]);

        const tCapture = performance.now();

        // Procesar M3U8 capturado respetando la regla de cacheo reutilizable
        if (rawM3u8Url && cleanPath) {
          const streamUrl = await persistUpstreamManifest(cleanPath, rawM3u8Url, {
            agent: stickySession?.agent,
            referer: iframeUrl,
          });

          if (streamUrl) {
            dataUrls.fallbackUrl = streamUrl;
            if (!dataUrls.url) {
              dataUrls.url = streamUrl;
            }
          } else {
            console.warn(
              `[SoloLatino] Manifest was not saved to StreamCache because it contains player.pelisserieshoy.com URLs.`,
            );
            if (!dataUrls.url) {
              dataUrls.url = rawM3u8Url;
            }
          }
        }

        if (!dataUrls.url && !dataUrls.fallbackUrl) {
          return reject(new Error("No video URL or fallback URL captured"));
        }

        const tTotal = performance.now();
        console.info(
          `[SoloLatino][⏱️ Telemetry for ${cleanPath}]:\n` +
            `  Pre-flight (HTML + Player API): ${(tPreflight - tStart).toFixed(0)}ms\n` +
            `  Browser Context setup: ${(tContext - tPreflight).toFixed(0)}ms\n` +
            `  Wait for #playBtn: ${(tPlayReady - tContext).toFixed(0)}ms\n` +
            `  Stream Capture & Grace: ${(tCapture - tPlayReady).toFixed(0)}ms\n` +
            `  TOTAL TIME: ${(tTotal - tStart).toFixed(0)}ms`,
        );

        console.log("[✅] Video URL and fallback URL resolved:", dataUrls);

        await context.storageState({ path: "state.json" }).catch(() => {});

        if (dataUrls.fallbackUrl) {
          persistStreamUrl(path, dataUrls.fallbackUrl);
        }

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
