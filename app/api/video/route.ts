// app/api/proxy/route.ts
import got from "got";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

export async function GET(req: NextRequest) {
  const videoUrl = req.nextUrl.searchParams.get("url");

  if (!videoUrl) {
    return NextResponse.json(
      { error: "Missing 'url' query parameter" },
      { status: 400 },
    );
  }

  const nodeStream = got.stream(videoUrl, {
    headers: {
      "referer": "https://www.mediafire.com/",
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ...(req.headers.get("range") ? { range: req.headers.get("range")! } : {}),
    },
    throwHttpErrors: false,
    followRedirect: false,
  });

  const response = await new Promise<{
    statusCode: number;
    headers: Record<string, string>;
  }>((resolve, reject) => {
    nodeStream.on("response", resolve);
    nodeStream.on("error", reject);
  });

  const webStream = Readable.toWeb(nodeStream);

  const headers = new Headers(response.headers as Record<string, string>);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Range");
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Range, Content-Length, Accept-Ranges",
  );

  return new NextResponse(webStream as ReadableStream, {
    status: response.statusCode,
    headers,
  });
}
