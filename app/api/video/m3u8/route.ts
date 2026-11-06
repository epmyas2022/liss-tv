import { BROWSER_UA, createStickySession } from "@/utils/browser";
import { isProxyEnabled } from "@/utils/proxy";
import { rewriteManifest } from "@/utils/m3u8";
import {
  getManifest,
  saveManifest,
  getManifestAppUrl,
} from "@/services/minio.service";
import { upsert } from "@/services/movie.store";
import got from "got";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const pathParam = req.nextUrl.searchParams.get("path");

  // 1. Si viene pathParam, buscar primero si ya está almacenado en MinIO
  if (pathParam) {
    try {
      const storedManifest = await getManifest(pathParam);
      if (storedManifest) {
        try {
          upsert(pathParam, { movieUrl: getManifestAppUrl(pathParam) });
        } catch (_) {}

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

  const isManifestUrl = url.includes(".m3u8");

  try {
    // ------------------------------------------------------------------
    // MANIFEST path — fetch via sticky proxy, rewrite, return as text.
    // The proxy is used HERE and nowhere else, so segment bandwidth
    // never touches the proxy.
    // ------------------------------------------------------------------
    if (isManifestUrl) {
      const { agent } = isProxyEnabled()
        ? createStickySession()
        : { agent: undefined };

      const manifestRes = await got(url, {
        headers: { "user-agent": BROWSER_UA },
        throwHttpErrors: false,
        ...(agent ? { agent: { https: agent, http: agent } } : {}),
      });

      if (manifestRes.statusCode >= 400) {
        return NextResponse.json(
          { error: "Upstream manifest error", status: manifestRes.statusCode },
          { status: 502 },
        );
      }

      const body = manifestRes.body;
      const origin = process.env.APP_URL;
      const appOrigin = origin || (req.nextUrl.origin.includes("0.0.0.0") ? "" : req.nextUrl.origin);
      const rewrittenBody = rewriteManifest(body, url, appOrigin);

      // Si viene el pathParam, guardar la versión reescrita en MinIO en background y actualizar SQLite
      if (pathParam) {
        void saveManifest(pathParam, rewrittenBody)
          .then((savedAppUrl) => {
            try {
              upsert(pathParam, { movieUrl: savedAppUrl });
            } catch (_) {}
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
    // SEGMENT path — stream directly, no proxy.
    // ------------------------------------------------------------------
    const nodeStream = got.stream(url, {
      headers: {
        "user-agent": BROWSER_UA,
        ...(req.headers.get("range")
          ? { range: req.headers.get("range")! }
          : {}),
      },
      throwHttpErrors: false,
    });

    const upstream = await new Promise<{
      statusCode: number;
      headers: Record<string, string>;
    }>((resolve, reject) => {
      nodeStream.on("response", resolve);
      nodeStream.on("error", reject);
    });

    if (upstream.statusCode >= 400) {
      nodeStream.destroy();
      return NextResponse.json(
        { error: "Upstream segment error", status: upstream.statusCode },
        { status: 502 },
      );
    }

    // Force video MIME — some upstreams disguise segments
    const headers = new Headers();
    headers.set("Content-Type", "video/mp2t");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Headers", "Range");
    headers.set("Cache-Control", "no-store");
    headers.set(
      "Access-Control-Expose-Headers",
      "Content-Range, Content-Length, Accept-Ranges",
    );

    const contentLength = upstream.headers["content-length"];
    const contentRange = upstream.headers["content-range"];
    const acceptRanges = upstream.headers["accept-ranges"];
    if (contentLength) headers.set("Content-Length", contentLength);
    if (contentRange) headers.set("Content-Range", contentRange);
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

    const webStream = Readable.toWeb(nodeStream);

    return new NextResponse(webStream as ReadableStream, {
      status: upstream.statusCode,
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch upstream" },
      { status: 502 },
    );
  }
}
