import test from "node:test";
import assert from "node:assert";
import {
  GetUrl,
  gnrdUnpack,
} from "../../../strategies/gnula/get-url.operation.ts";
import { Response, type RequestInit } from "node-fetch";

type GnulaMockFetch = (endpointOrUrl: string, options?: RequestInit) => Promise<Response>;

function expectedProxyUrl(streamUrl: string): string {
  const isM3u8 = streamUrl.includes(".m3u8");
  const manifestParam = isM3u8 ? "" : "&manifest=true";
  return `/api/video/m3u8?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent("https://ww3.gnulahd.nu/")}${manifestParam}&directSegments=true`;
}

test("gnrdUnpack decodes base64 XOR payload with key [103, 78, 55, 100]", () => {
  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [
          { title: "Servidor 1", src: "https://vidaraa.cc/e/TonyrXmWc1Ie0" },
          { title: "Servidor 2", src: "https://savefiles.com/e/xneh0s576go9" },
        ],
      },
    ],
  };

  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const base64 = Buffer.from(encoded).toString("base64");

  const unpacked = gnrdUnpack(base64);
  assert.ok(unpacked);
  assert.strictEqual(unpacked.langs?.[0]?.servers?.[0]?.src, "https://vidaraa.cc/e/TonyrXmWc1Ie0");
  assert.strictEqual(unpacked.langs?.[0]?.servers?.[1]?.src, "https://savefiles.com/e/xneh0s576go9");
});

test("gnrdUnpack returns null on invalid or corrupted base64", () => {
  assert.strictEqual(gnrdUnpack("not_valid_base64_json!@#$"), null);
  assert.strictEqual(gnrdUnpack(""), null);
});

test("GetUrl resolves Vidara server into direct M3U8 stream", async () => {
  const pageHtml = `
    <html>
      <head>
        <script>
          var _gnrdPid = 509498;
          var _gnrdTok = "9214fc6adf84c03b34ced7a62a794072";
        </script>
        <script>
          var RESOLVE='/panel/the-tube-resolve.php?code=', AUTH='&t=auth123';
          var VD_RESOLVE='/panel/vidara-resolve.php', VD_AUTH='&t=vdauth456';
          var SF_RESOLVE='/panel/savefiles-resolve.php', SF_AUTH='&t=sfauth789';
        </script>
      </head>
      <body></body>
    </html>
  `;

  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [
          { title: "Servidor 1", src: "https://vidaraa.cc/e/TonyrXmWc1Ie0" },
        ],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  let playerRequested = false;
  let vidaraResolved = false;

  const mockFetch: GnulaMockFetch = async (url: string, init?: RequestInit) => {
    if (url.includes("street-fighter")) {
      return new Response(pageHtml, { status: 200 });
    }

    if (url.includes("/wp-json/gnrd/v1/player")) {
      playerRequested = true;
      const headers = init?.headers as Record<string, string> | undefined;
      assert.strictEqual(headers?.["X-Gn-Scr"] !== undefined, true);
      assert.strictEqual(headers?.["X-Gn-Dev"] !== undefined, true);
      return new Response(JSON.stringify({ p: packedBase64 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/panel/vidara-resolve.php")) {
      vidaraResolved = true;
      assert.strictEqual(url.includes("code=TonyrXmWc1Ie0"), true);
      assert.strictEqual(url.includes("host=vidaraa.cc"), true);
      assert.strictEqual(url.includes("t=vdauth456"), true);
      return new Response("#EXTM3U\n#EXTINF:5,\nhttps://cdn.example.com/seg1.woff2", {
        status: 200,
        headers: { "Content-Type": "application/vnd.apple.mpegurl" },
      });
    }

    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  const result = await getUrl.operation("/ver/street-fighter/");

  assert.strictEqual(playerRequested, true);
  assert.strictEqual(vidaraResolved, true);
  assert.strictEqual(
    result.url,
    expectedProxyUrl("https://ww3.gnulahd.nu/panel/vidara-resolve.php?pl=1&code=TonyrXmWc1Ie0&host=vidaraa.cc&t=vdauth456")
  );
  assert.strictEqual(result.headers?.Referer, "https://ww3.gnulahd.nu/");
  assert.strictEqual(result.fallbackUrl, undefined);
});

test("GetUrl resolves SaveFiles server to master.m3u8", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 182607;
        var _gnrdTok = "tok_episode";
      </script>
      <script>
        var SF_RESOLVE='/panel/savefiles-resolve.php', SF_AUTH='&t=sf_tok_999';
      </script>
    </html>
  `;

  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [
          { title: "Servidor 2", src: "https://savefiles.com/e/xneh0s576go9" },
        ],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("the-last-of-us-2x07")) {
      return new Response(pageHtml, { status: 200 });
    }

    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response(JSON.stringify({ p: packedBase64 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/panel/savefiles-resolve.php")) {
      return new Response(
        JSON.stringify({ master: "https://s1.savefiles.com/hls2/master.m3u8?token=xyz" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  const result = await getUrl.operation("/the-last-of-us-2x07/");

  assert.strictEqual(
    result.url,
    expectedProxyUrl("https://s1.savefiles.com/hls2/master.m3u8?token=xyz")
  );
  assert.strictEqual(result.headers?.Referer, "https://ww3.gnulahd.nu/");
  assert.strictEqual(result.fallbackUrl, undefined);
});

test("GetUrl throws GnulaError when stream resolution fails across all servers", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 100;
        var _gnrdTok = "tok_fallback";
      </script>
      <script>
        var VD_RESOLVE='/panel/vidara-resolve.php', VD_AUTH='&t=fail_auth';
      </script>
    </html>
  `;

  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [
          { title: "Servidor 1", src: "https://vidaraa.cc/e/failedCode" },
        ],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("fallback-test")) {
      return new Response(pageHtml, { status: 200 });
    }

    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response(JSON.stringify({ p: packedBase64 }), {
        status: 200,
      });
    }

    if (url.includes("/panel/vidara-resolve.php")) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  await assert.rejects(
    () => getUrl.operation("/ver/fallback-test/"),
    /No playable stream found/
  );
});

test("GetUrl throws Error when no servers are available", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 200;
        var _gnrdTok = "tok_empty";
      </script>
    </html>
  `;

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("empty-servers")) {
      return new Response(pageHtml, { status: 200 });
    }
    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response(JSON.stringify({ p: "" }), { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  await assert.rejects(
    () => getUrl.operation("/ver/empty-servers/"),
    /No streaming servers found/
  );
});

test("GetUrl resolves The Tube server to master stream", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 300;
        var _gnrdTok = "tok_tube";
        var RESOLVE='/panel/the-tube-resolve.php?code=', AUTH='&t=tt_auth_123';
      </script>
    </html>
  `;

  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [
          { title: "Servidor TheTube", src: "https://they.tube/e/tubeCode123" },
        ],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("the-tube-test")) {
      return new Response(pageHtml, { status: 200 });
    }
    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response(JSON.stringify({ p: packedBase64 }), { status: 200 });
    }
    if (url.includes("/panel/the-tube-resolve.php")) {
      return new Response(JSON.stringify({ master: "https://cdn.they.tube/master.m3u8" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  const result = await getUrl.operation("/ver/the-tube-test/");
  assert.strictEqual(result.url, expectedProxyUrl("https://cdn.they.tube/master.m3u8"));
  assert.strictEqual(result.headers?.Referer, "https://ww3.gnulahd.nu/");
  assert.strictEqual(result.fallbackUrl, undefined);
});

test("GetUrl selects requested language via options.params.lang", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 400;
        var _gnrdTok = "tok_lang";
        var SF_RESOLVE='/panel/savefiles-resolve.php', SF_AUTH='&t=sf_lang';
      </script>
    </html>
  `;

  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [{ title: "Latino Server", src: "https://savefiles.com/e/latinoCode" }],
      },
      {
        label: "Subtitulado",
        servers: [{ title: "Sub Server", src: "https://savefiles.com/e/subCode" }],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("lang-test")) {
      return new Response(pageHtml, { status: 200 });
    }
    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response(JSON.stringify({ p: packedBase64 }), { status: 200 });
    }
    if (url.includes("/panel/savefiles-resolve.php?code=subCode")) {
      return new Response(JSON.stringify({ master: "https://s1.savefiles.com/sub.m3u8" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/panel/savefiles-resolve.php?code=latinoCode")) {
      return new Response(JSON.stringify({ master: "https://s1.savefiles.com/latino.m3u8" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  const result = await getUrl.operation("/ver/lang-test/", {
    params: { lang: "subtitulado" },
  });
  assert.strictEqual(result.url, expectedProxyUrl("https://s1.savefiles.com/sub.m3u8"));
  assert.strictEqual(result.headers?.Referer, "https://ww3.gnulahd.nu/");
});

test("GetUrl skips page fetch when full tokens are provided in detailContext", async () => {
  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [{ title: "SaveFiles Direct", src: "https://savefiles.com/e/contextCode" }],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  let pageFetched = false;

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("context-test")) {
      pageFetched = true;
      return new Response("<html></html>", { status: 200 });
    }
    if (url.includes("/wp-json/gnrd/v1/player?id=999&t=tok999")) {
      return new Response(JSON.stringify({ p: packedBase64 }), { status: 200 });
    }
    if (url.includes("/panel/savefiles-resolve.php?code=contextCode")) {
      return new Response(JSON.stringify({ master: "https://s1.savefiles.com/context.m3u8" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  const result = await getUrl.operation("/ver/context-test/", {
    detailContext: {
      pid: "999",
      tok: "tok999",
      sfResolve: "/panel/savefiles-resolve.php",
    },
  });

  assert.strictEqual(pageFetched, false);
  assert.strictEqual(result.url, expectedProxyUrl("https://s1.savefiles.com/context.m3u8"));
  assert.strictEqual(result.headers?.Referer, "https://ww3.gnulahd.nu/");
});

test("GetUrl throws GnulaError when player endpoint fails with HTTP error", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 500;
        var _gnrdTok = "tok_http_err";
      </script>
    </html>
  `;

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("error-test")) {
      return new Response(pageHtml, { status: 200 });
    }
    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  await assert.rejects(
    () => getUrl.operation("/ver/error-test/"),
    /Player endpoint returned HTTP 403/
  );
});

test("GetUrl prioritizes SaveFiles over unresolvable servers like bysevepoin.com", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 600;
        var _gnrdTok = "tok_priority";
        var SF_RESOLVE='/panel/savefiles-resolve.php', SF_AUTH='&t=sf_tok';
      </script>
    </html>
  `;

  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [
          { title: "Servidor Bysevepoin", src: "https://bysevepoin.com/e/x40h60zh998r" },
          { title: "Servidor Savefiles", src: "https://savefiles.com/e/sfPrioritizedCode" },
        ],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("priority-test")) {
      return new Response(pageHtml, { status: 200 });
    }
    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response(JSON.stringify({ p: packedBase64 }), { status: 200 });
    }
    if (url.includes("/panel/savefiles-resolve.php?code=sfPrioritizedCode")) {
      return new Response(JSON.stringify({ master: "https://s1.savefiles.com/prioritized.m3u8" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  const result = await getUrl.operation("/ver/priority-test/");
  assert.strictEqual(result.url, expectedProxyUrl("https://s1.savefiles.com/prioritized.m3u8"));
  assert.strictEqual(result.headers?.Referer, "https://ww3.gnulahd.nu/");
});

test("GetUrl skips Vidara returning aviso.mp4 dummy video and resolves subsequent SaveFiles server", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 700;
        var _gnrdTok = "tok_aviso";
        var VD_RESOLVE='/panel/vidara-resolve.php', VD_AUTH='&t=vd_tok';
        var SF_RESOLVE='/panel/savefiles-resolve.php', SF_AUTH='&t=sf_tok';
      </script>
    </html>
  `;

  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [
          { title: "Servidor Vidara", src: "https://vidaraa.cc/e/vdAvisoCode" },
          { title: "Servidor Savefiles", src: "https://savefiles.com/e/sfAfterAviso" },
        ],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("aviso-test")) {
      return new Response(pageHtml, { status: 200 });
    }
    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response(JSON.stringify({ p: packedBase64 }), { status: 200 });
    }
    if (url.includes("/panel/vidara-resolve.php")) {
      // Returns Gnula dummy warning video
      return new Response(JSON.stringify({ master: "https://ww3.gnulahd.nu/wp-content/uploads/epix/aviso.mp4" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/panel/savefiles-resolve.php?code=sfAfterAviso")) {
      return new Response(JSON.stringify({ master: "https://s1.savefiles.com/valid-after-aviso.m3u8" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  const result = await getUrl.operation("/ver/aviso-test/");
  assert.strictEqual(result.url, expectedProxyUrl("https://s1.savefiles.com/valid-after-aviso.m3u8"));
  assert.strictEqual(result.headers?.Referer, "https://ww3.gnulahd.nu/");
});

test("GetUrl populates fallbackUrl when multiple valid streams resolve", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 800;
        var _gnrdTok = "tok_multi";
        var SF_RESOLVE='/panel/savefiles-resolve.php', SF_AUTH='&t=sf_tok';
        var RESOLVE='/panel/the-tube-resolve.php?code=', AUTH='&t=tt_tok';
      </script>
    </html>
  `;

  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [
          { title: "Servidor Savefiles", src: "https://savefiles.com/e/sf1" },
          { title: "Servidor TheTube", src: "https://they.tube/e/tt2" },
        ],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("multi-test")) {
      return new Response(pageHtml, { status: 200 });
    }
    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response(JSON.stringify({ p: packedBase64 }), { status: 200 });
    }
    if (url.includes("/panel/savefiles-resolve.php?code=sf1")) {
      return new Response(JSON.stringify({ master: "https://s1.savefiles.com/stream1.m3u8" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/panel/the-tube-resolve.php")) {
      return new Response(JSON.stringify({ master: "https://cdn.they.tube/stream2.m3u8" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  const result = await getUrl.operation("/ver/multi-test/");
  assert.strictEqual(result.url, expectedProxyUrl("https://s1.savefiles.com/stream1.m3u8"));
  assert.strictEqual(result.fallbackUrl, expectedProxyUrl("https://cdn.they.tube/stream2.m3u8"));
  assert.strictEqual(result.headers?.Referer, "https://ww3.gnulahd.nu/");
});

test("GetUrl falls back to alternative language when Latino language only has dead aviso.mp4 servers", async () => {
  const pageHtml = `
    <html>
      <script>
        var _gnrdPid = 900;
        var _gnrdTok = "tok_lang_fallback";
        var VD_RESOLVE='/panel/vidara-resolve.php', VD_AUTH='&t=vd_latino_dead';
        var SF_RESOLVE='/panel/savefiles-resolve.php', SF_AUTH='&t=sf_sub_alive';
      </script>
    </html>
  `;

  const payload = {
    langs: [
      {
        label: "Latino",
        servers: [
          { title: "Servidor Vidara Latino", src: "https://vidaraa.cc/e/vdLatinoDead" },
        ],
      },
      {
        label: "Subtitulado",
        servers: [
          { title: "Servidor SaveFiles Sub", src: "https://savefiles.com/e/sfSubAlive" },
        ],
      },
    ],
  };
  const jsonStr = JSON.stringify(payload);
  const key = [103, 78, 55, 100];
  const encoded = Buffer.from(jsonStr, "utf-8").map((byte, i) => byte ^ key[i & 3]);
  const packedBase64 = Buffer.from(encoded).toString("base64");

  const mockFetch: GnulaMockFetch = async (url: string) => {
    if (url.includes("lang-fallback-test")) {
      return new Response(pageHtml, { status: 200 });
    }
    if (url.includes("/wp-json/gnrd/v1/player")) {
      return new Response(JSON.stringify({ p: packedBase64 }), { status: 200 });
    }
    if (url.includes("/panel/vidara-resolve.php")) {
      return new Response(
        JSON.stringify({ master: "https://ww3.gnulahd.nu/wp-content/uploads/epix/aviso.mp4" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/panel/savefiles-resolve.php?code=sfSubAlive")) {
      return new Response(
        JSON.stringify({ master: "https://s1.savefiles.com/sub-alive.m3u8" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("Not found", { status: 404 });
  };

  const getUrl = new GetUrl(mockFetch);
  const result = await getUrl.operation("/ver/lang-fallback-test/");
  assert.strictEqual(result.url, expectedProxyUrl("https://s1.savefiles.com/sub-alive.m3u8"));
  assert.strictEqual(result.headers?.Referer, "https://ww3.gnulahd.nu/");
});
