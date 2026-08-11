// app/api/proxy/route.ts

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new Response("Falta el parámetro url", { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://callistanise.com/",
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      return new Response("Error en el servidor de origen", {
        status: response.status,
      });
    }

    if (targetUrl.includes(".m3u8")) {
      const m3u8Text = await response.text();

      const lines = m3u8Text.split("\n");
      const rewrittenLines = lines.map((line) => {
        if (line.startsWith("http")) {
          return `/api/video?url=${encodeURIComponent(line.trim())}`;
        }
        return line;
      });

      return new Response(rewrittenLines.join("\n"), {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // 3. Si es un fragmento de video (.image o .ts), pasamos los datos binarios tal cual
    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": "video/MP2T", // Forzamos el tipo mime de fragmentos de video
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600", // Opcional: cacheamos para no saturar tu servidor
      },
    });
  } catch (error) {
    console.error("Error en proxy:", error);
    return new Response("Error interno del servidor", { status: 500 });
  }
}
