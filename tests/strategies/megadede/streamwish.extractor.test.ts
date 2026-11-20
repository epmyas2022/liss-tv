import { test } from "node:test";
import assert from "node:assert/strict";
import { extractStreamwishM3u8 } from "../../../strategies/megadede/extractors/streamwish.extractor.ts";

test("extractStreamwishM3u8 extracts master.m3u8 from packed JavaScript", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <script>
      eval(function(p,a,c,k,e,d){return p}('var links={"hls":"https://cdn.streamwish.com/hls/master.m3u8"};',1,1,''.split('|')))
    </script>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://strwish.com/e/test1234");
  assert.strictEqual(m3u8, "https://cdn.streamwish.com/hls/master.m3u8");
});

test("extractStreamwishM3u8 extracts master.m3u8 from packed JavaScript with r parameter", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <script>
      eval(function(p,a,c,k,e,r){return p}('var links={"hls":"https://cdn.streamwish.com/hls/master.m3u8"};',1,1,''.split('|')))
    </script>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://swishsrv.com/e/testrparam");
  assert.strictEqual(m3u8, "https://cdn.streamwish.com/hls/master.m3u8");
});

test("extractStreamwishM3u8 extracts stream from unpacked sources array in raw HTML", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <html>
      <body>
        <script>
          jwplayer("vplayer").setup({
            sources: [
              { file: "https://cdn.streamwish.com/hls2/master.m3u8", label: "HD" }
            ]
          });
        </script>
      </body>
    </html>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://strwish.com/e/unpacked123");
  assert.strictEqual(m3u8, "https://cdn.streamwish.com/hls2/master.m3u8");
});

test("extractStreamwishM3u8 resolves relative master.txt in unpacked sources array", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <html>
      <body>
        <script>
          var links = { hls: "/hls3/01/video/master.txt" };
        </script>
      </body>
    </html>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://strwish.com/e/relative123");
  assert.strictEqual(m3u8, "https://strwish.com/hls3/01/video/master.txt");
});

test("extractStreamwishM3u8 falls back to alternate mirror domain when primary mirror fails", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("hglink.to")) {
      return new Response("Cloudflare 522", { status: 522 });
    }
    if (url.includes("hanerix.com")) {
      return new Response('var links = { hls: "https://cdn.streamwish.com/mirror/master.m3u8" };', { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://hglink.to/e/mirror123");
  assert.strictEqual(m3u8, "https://cdn.streamwish.com/mirror/master.m3u8");
});

test("extractStreamwishM3u8 detects dummy loader page and recovers via active mirror", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("hglink.to")) {
      return new Response('<div class="loading-container"><div class="loading-text">Page is loading, please wait...</div></div>', { status: 200 });
    }
    if (url.includes("hanerix.com")) {
      return new Response('var links = { hls: "https://hanerix.com/stream/xyz/master.m3u8" };', { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://hglink.to/e/7ze31pltitj5");
  assert.strictEqual(m3u8, "https://hanerix.com/stream/xyz/master.m3u8");
});

test("extractStreamwishM3u8 resolves stream from nested iframe in embed page", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("wrapper.com")) {
      return new Response('<iframe src="https://streamwish.to/e/nested456"></iframe>', { status: 200 });
    }
    if (url.includes("streamwish.to")) {
      return new Response('var links = { hls: "https://cdn.streamwish.com/nested/master.m3u8" };', { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://streamwish.to/e/wrapper.com");
  assert.strictEqual(m3u8, "https://cdn.streamwish.com/nested/master.m3u8");
});

test("extractStreamwishM3u8 extracts stream directly from hanerix.com", async (t) => {
  const originalFetch = global.fetch;
  const mockHtml = `
    <html>
      <body>
        <script>
          jwplayer("vplayer").setup({
            file: "https://cdn.hanerix.com/hls/master.m3u8"
          });
        </script>
      </body>
    </html>
  `;

  global.fetch = async () => new Response(mockHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://hanerix.com/e/test999");
  assert.strictEqual(m3u8, "https://cdn.hanerix.com/hls/master.m3u8");
});

test("extractStreamwishM3u8 skips anti-embed warning page and recovers stream with origin referer", async (t) => {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const referer = (init?.headers as Record<string, string>)?.["Referer"];
    if (referer === "https://megadede.mobi/") {
      return new Response("To protect your security, hanerix.com will not allow Zen to display the page if another site has embedded it.", { status: 200 });
    }
    return new Response('jwplayer("vplayer").setup({ file: "https://cdn.hanerix.com/direct/master.m3u8" });', { status: 200 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://hanerix.com/e/bypass123");
  assert.strictEqual(m3u8, "https://cdn.hanerix.com/direct/master.m3u8");
});

