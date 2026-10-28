import { BROWSER_UA, createStickySession } from "@/utils/browser";
import got from "got";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

const PROXY_PATH = "/api/video/m3u8";



function resolveUrl(uri: string, manifestUrl: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  const base = new URL(manifestUrl);
  base.pathname = base.pathname.replace(/\/[^/]*$/, "/");
  return new URL(uri, base).href;
}

function rewriteManifest(body: string, manifestUrl: string): string {
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("#") && trimmed.includes("URI=")) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri: string) => {
          const absolute = resolveUrl(uri, manifestUrl);
          return `URI="${PROXY_PATH}?url=${encodeURIComponent(absolute)}"`;
        });
      }

      if (trimmed !== "" && !trimmed.startsWith("#")) {
        const absolute = resolveUrl(trimmed, manifestUrl);
        return `${PROXY_PATH}?url=${encodeURIComponent(absolute)}`;
      }

      return line;
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing 'url' parameter" },
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
      const {agent} = createStickySession();

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

      return new NextResponse(rewriteManifest(body, url), {
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
