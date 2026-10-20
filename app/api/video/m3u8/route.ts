import got from "got";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
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

  try {
    const nodeStream = got.stream(url, {
      headers: {
        "user-agent": UA,
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
        { error: "Upstream error", status: upstream.statusCode },
        { status: 502 },
      );
    }

    const contentType = (upstream.headers["content-type"] ?? "").toLowerCase();
    const isManifest =
      contentType.includes("mpegurl") || url.includes(".m3u8");

    if (isManifest) {
      const chunks: Buffer[] = [];
      for await (const chunk of nodeStream) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf-8");

      return new NextResponse(rewriteManifest(body, url), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Stream segment binary — force video MIME since upstream disguises them
    const headers = new Headers();
    headers.set("Content-Type", "video/mp2t");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Headers", "Range");
    headers.set("Cache-Control", "no-store");
    headers.set(
      "Access-Control-Expose-Headers",
      "Content-Range, Content-Length, Accept-Ranges",
    );

    // Forward only the headers the player needs
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
