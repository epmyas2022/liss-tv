import { BROWSER_UA, createStickySession } from "@/utils/browser";
import { isProxyEnabled } from "@/utils/proxy";
import { rewriteManifest } from "@/utils/m3u8";
import {
  getManifest,
  saveManifest,
  getManifestAppUrl,
} from "@/services/minio.service";
import { getAny, upsert } from "@/services/movie.store";
import got from "got";
import { NextRequest, NextResponse } from "next/server";
import { Agent } from "undici";

// High-performance connection pool with aggressive keep-alive for video segments
const segmentAgent = new Agent({
  keepAliveTimeout: 30000,
  keepAliveMaxTimeout: 60000,
  connections: 150,
  pipelining: 1,
  connect: {
    rejectUnauthorized: false,
  },
});

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const pathParam = req.nextUrl.searchParams.get("path");

  // 1. Si viene pathParam, buscar primero si ya está almacenado en MinIO
  if (pathParam) {
    try {
      const storedManifest = await getManifest(pathParam);
      if (storedManifest) {
        try {
          const existing = getAny(pathParam);
          const provider = existing?.provider || "sololatino";
          upsert(provider, pathParam, { movieUrl: getManifestAppUrl(pathParam) });
        } catch {}

        return new NextResponse(storedManifest, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    } catch (err) {
      console.warn(`[MinIO] Failed to retrieve manifest for ${pathParam}:`, err);
    }
  }

  // 2. Si no hay manifest guardado y no se proporcionó URL, devolver error
  if (!url) {
    if (pathParam) {
      return NextResponse.json(
        { error: `Manifest not found in storage for '${pathParam}' and no 'url' provided` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Missing 'url' or 'path' parameter" },
      { status: 400 },
    );
  }

  const isManifestUrl =
    url.includes(".m3u8") ||
    url.includes(".txt") ||
    url.includes("master.") ||
    url.includes("index.") ||
    req.nextUrl.searchParams.get("manifest") === "true";
  const refererParam = req.nextUrl.searchParams.get("referer");
  const directSegmentsParam =
    req.nextUrl.searchParams.get("directSegments") === "true";

  // Determine upstream referer: honor explicit parameter or fallback to resource origin
  let effectiveReferer = refererParam || undefined;
  if (!effectiveReferer) {
    try {
      effectiveReferer = `${new URL(url).origin}/`;
    } catch {
      effectiveReferer = undefined;
    }
  }

  try {
    // ------------------------------------------------------------------
    // MANIFEST path — fetch via sticky proxy, rewrite, return as text.
    // The proxy is used HERE and nowhere else, so segment bandwidth
    // never touches the proxy.
    // ------------------------------------------------------------------
    if (isManifestUrl) {
      let body: string | null = null;

      // 1. First attempt with native fetch (modern Undici TLS fingerprint to bypass CDN TLS blocks like Fastream/Acek)
      try {
        const fetchHeaders: Record<string, string> = {
          "user-agent": BROWSER_UA,
          ...(effectiveReferer ? { referer: effectiveReferer } : {}),
        };
        const fetchRes = await fetch(url, {
          headers: fetchHeaders,
          signal: AbortSignal.timeout(5000),
        });
        if (fetchRes.ok) {
          body = await fetchRes.text();
        }
      } catch {
        // Fallback to got if native fetch threw a network error or timed out
      }

      // 2. Fallback to got with sticky proxy session if native fetch didn't succeed
      if (!body) {
        try {
          const { agent } = isProxyEnabled()
            ? createStickySession()
            : { agent: undefined };

          const manifestRes = await got(url, {
            headers: {
              "user-agent": BROWSER_UA,
              ...(effectiveReferer ? { referer: effectiveReferer } : {}),
            },
            throwHttpErrors: false,
            timeout: { request: 5000 },
            https: { rejectUnauthorized: false },
            ...(agent ? { agent: { https: agent, http: agent } } : {}),
          });

          if (manifestRes.statusCode >= 400) {
            return NextResponse.json(
              { error: "Upstream manifest error", status: manifestRes.statusCode },
              { status: 502 },
            );
          }

          body = manifestRes.body;
        } catch {
          return NextResponse.json(
            { error: "Upstream manifest timeout or connection error" },
            { status: 504 },
          );
        }
      }

      if (
        !body ||
        body.includes("aviso.mp4") ||
        (!body.includes("#EXTM3U") && !body.includes("#EXT-X-"))
      ) {
        return NextResponse.json(
          { error: "Upstream did not return a valid HLS manifest" },
          { status: 502 },
        );
      }

      const origin = process.env.APP_URL;
      const appOrigin = origin || (req.nextUrl.origin.includes("0.0.0.0") ? "" : req.nextUrl.origin);
      const rewrittenBody = rewriteManifest(body, url, {
        baseOrigin: appOrigin,
        directSegments: directSegmentsParam,
        referer: effectiveReferer,
      });

      // Si viene el pathParam, guardar la versión reescrita en MinIO en background y actualizar SQLite
      if (pathParam) {
        void saveManifest(pathParam, rewrittenBody)
          .then((savedAppUrl) => {
            try {
              const existing = getAny(pathParam);
              const provider = existing?.provider || "sololatino";
              upsert(provider, pathParam, { movieUrl: savedAppUrl });
            } catch {}
          })
          .catch((err) => {
            console.warn(`[MinIO] Background save failed for ${pathParam}:`, err);
          });
      }

      return new NextResponse(rewrittenBody, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    // ------------------------------------------------------------------
    // SEGMENT path — stream directly with native fetch, no proxy.
    // ------------------------------------------------------------------
    const segmentHeaders: Record<string, string> = {
      "user-agent": BROWSER_UA,
      ...(effectiveReferer ? { referer: effectiveReferer } : {}),
    };

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      segmentHeaders["range"] = rangeHeader;
    }

    const MAX_RETRIES = 2;
    let upstreamRes: Response | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (req.signal?.aborted) {
        return new NextResponse(null, { status: 499 });
      }

      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, attempt * 150));
      }

      // Timeout only applies to initial connection & receiving HTTP headers (15s)
      // so slow large segment downloads are not aborted midway.
      const controller = new AbortController();
      const connectTimeoutId = setTimeout(() => {
        controller.abort(new Error("Upstream connection timeout"));
      }, 15000);

      const onReqAbort = () => controller.abort();
      req.signal?.addEventListener("abort", onReqAbort);

      try {
        const res = await fetch(url, {
          headers: segmentHeaders,
          signal: controller.signal,
          dispatcher: segmentAgent,
        } as RequestInit & { dispatcher?: Agent });

        if (res.ok || res.status === 206) {
          upstreamRes = res;
          break;
        }

        // Retry on transient upstream server errors (5xx, 429, 408)
        if (res.status >= 500 || res.status === 429 || res.status === 408) {
          console.warn(
            `[m3u8 proxy] Transient upstream error ${res.status} on attempt ${attempt + 1} for ${url}`,
          );
          lastError = new Error(`Upstream returned ${res.status}`);
          continue;
        }

        // For non-transient errors (e.g. 404, 403), return directly without retry
        upstreamRes = res;
        break;
      } catch (err: unknown) {
        if (req.signal?.aborted) {
          return new NextResponse(null, { status: 499 });
        }
        lastError = err;
        console.warn(
          `[m3u8 proxy] Network error on attempt ${attempt + 1} for ${url}:`,
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        clearTimeout(connectTimeoutId);
        req.signal?.removeEventListener("abort", onReqAbort);
      }
    }

    if (!upstreamRes) {
      const message = lastError instanceof Error ? lastError.message : String(lastError);
      return NextResponse.json(
        { error: "Failed to fetch upstream segment after retries", details: message },
        { status: 502 },
      );
    }

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      console.warn(
        `[m3u8 proxy] Upstream segment returned ${upstreamRes.status} for ${url}`,
      );
      return new NextResponse(null, { status: upstreamRes.status });
    }

    // Force video MIME — some upstreams disguise segments
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstreamRes.headers.get("content-type") || "video/mp2t",
    );
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Headers", "Range");
    headers.set("Cache-Control", "public, max-age=86400, immutable");
    headers.set(
      "Access-Control-Expose-Headers",
      "Content-Range, Accept-Ranges",
    );

    // IMPORTANT: Do NOT set Content-Length on chunked ReadableStreams in HTTP/2.
    // If a client cancels/seeks or closes before every byte is transferred,
    // sending a Content-Length that doesn't match the transmitted DATA frames
    // triggers an RFC 7540 PROTOCOL_ERROR (net::ERR_HTTP2_PROTOCOL_ERROR).
    const contentRange = upstreamRes.headers.get("content-range");
    const acceptRanges = upstreamRes.headers.get("accept-ranges");
    if (contentRange) headers.set("Content-Range", contentRange);
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

    const status = upstreamRes.status === 206 && !contentRange ? 200 : upstreamRes.status;

    // Wrap body stream with on-demand pull backpressure so chunk transmission
    // matches HTTP/2 client read rate without premature socket closures.
    const upstreamBody = upstreamRes.body;
    let safeStream: ReadableStream | null = null;

    if (upstreamBody) {
      const reader = upstreamBody.getReader();
      safeStream = new ReadableStream({
        async pull(ctrl) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              try {
                ctrl.close();
              } catch {}
            } else {
              ctrl.enqueue(value);
            }
          } catch {
            try {
              ctrl.close();
            } catch {}
          }
        },
        cancel(reason) {
          reader.cancel(reason).catch(() => {});
        },
      });
    }

    return new NextResponse(safeStream, {
      status,
      headers,
    });
  } catch (err: unknown) {
    if (
      req.signal?.aborted ||
      (err instanceof Error &&
        (err.name === "AbortError" || err.name === "TimeoutError"))
    ) {
      return new NextResponse(null, { status: 499 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[m3u8 proxy] Error proxying:", message, url);
    return NextResponse.json(
      { error: "Failed to fetch upstream", details: message },
      { status: 502 },
    );
  }
}
