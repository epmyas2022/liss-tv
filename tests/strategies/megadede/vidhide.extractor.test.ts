import test from "node:test";
import assert from "node:assert";
import {
  extractVidhideM3u8,
  unpackDeanEdwards,
} from "../../../strategies/megadede/extractors/vidhide.extractor.ts";

const SAMPLE_PACKED_CODE = `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2://3.4.5/6/7.8";',9,9,'var|streamUrl|https|cdn|video|com|hls|master|m3u8'.split('|')))`;

test("unpackDeanEdwards correctly decodes packed JavaScript", () => {
  const unpacked = unpackDeanEdwards(SAMPLE_PACKED_CODE);
  assert(unpacked !== null);
  assert(unpacked.includes('var streamUrl="https://cdn.video.com/hls/master.m3u8";'));
});

test("unpackDeanEdwards correctly decodes packed JavaScript with r parameter", () => {
  const codeWithR = `eval(function(p,a,c,k,e,r){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2://3.4.5/6/7.8";',9,9,'var|streamUrl|https|cdn|video|com|hls|master|m3u8'.split('|')))`;
  const unpacked = unpackDeanEdwards(codeWithR);
  assert(unpacked !== null);
  assert(unpacked.includes('var streamUrl="https://cdn.video.com/hls/master.m3u8";'));
});

test("extractVidhideM3u8 extracts master.m3u8 from embedded page", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <!DOCTYPE html>
    <html>
    <body>
      <script type="text/javascript">
        ${SAMPLE_PACKED_CODE}
      </script>
    </body>
    </html>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVidhideM3u8("https://morencius.com/embed/test1234");
  assert.strictEqual(m3u8, "https://cdn.video.com/hls/master.m3u8");
});

test("extractVidhideM3u8 prioritizes hls4 over hls2 and resolves relative URL", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <script>
      eval(function(p,a,c,k,e,d){return p}('var links={"hls2":"https://dead.acek-cdn.com/master.m3u8","hls4":"/stream/abcdef/master.m3u8"};jwplayer("vplayer").setup({sources:[{file:links.hls4||links.hls2}]});',1,1,''.split('|')))
    </script>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVidhideM3u8("https://morencius.com/embed/s2mzberiscgi");
  assert.strictEqual(m3u8, "https://morencius.com/stream/abcdef/master.m3u8");
});

test("extractVidhideM3u8 skips dead radiantgroveproduction.cfd domain and selects alternative clean mirror", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <script>
      var links = {
        hls: "https://pfabiwmfmeza.radiantgroveproduction.cfd/hls3/master.txt",
        hls4: "https://clean-mirror.example.com/hls/master.m3u8"
      };
    </script>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVidhideM3u8("https://morencius.com/embed/testdead");
  assert.strictEqual(m3u8, "https://clean-mirror.example.com/hls/master.m3u8");
});

test("extractVidhideM3u8 returns null when all mirrors or embed URL resolve to dead radiantgroveproduction CDN", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <script>
      var links = {
        hls3: "/E1O6osy9qHm1/hls3/01/04546/6be8e3ippcux_,l,n,h,.urlset/master.txt"
      };
    </script>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVidhideM3u8("https://pfabiwmfmeza.radiantgroveproduction.cfd/embed/testdead");
  assert.strictEqual(m3u8, null);
});

test("extractVidhideM3u8 skips dramiyos-cdn.com domain as dead CDN", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <script>
      var links = {
        hls2: "https://pfabiwmfmeza.dramiyos-cdn.com/hls2/master.m3u8",
        hls: "https://clean-mirror.example.com/hls/master.m3u8"
      };
    </script>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVidhideM3u8("https://morencius.com/embed/testdramiyos");
  assert.strictEqual(m3u8, "https://clean-mirror.example.com/hls/master.m3u8");
});

