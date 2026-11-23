import test from "node:test";
import assert from "node:assert/strict";
import {
  extractVimeosM3u8,
  unpackVimeosPacker,
} from "../../../strategies/cinecalidad/extractors/vimeos.extractor.ts";

test("unpackVimeosPacker unpacks Dean Edwards packed JavaScript", () => {
  const packed =
    "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c]);return p}('0 1=\"2://3.4.5/6/7.8\";',9,9,'var|file|https|s1|vimeos|net|hls2|master|m3u8'.split('|')))";
  const unpacked = unpackVimeosPacker(packed);
  assert.strictEqual(unpacked, 'var file="https://s1.vimeos.net/hls2/master.m3u8";');
});

test("extractVimeosM3u8 extracts master.m3u8 from packed Vimeos embed HTML", async () => {
  const mockHtml = `
    <html>
      <script>
        eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c]);return p}('jwplayer("vplayer").setup({sources:[{file:"https://s1.vimeos.net/hls2/03/00015/h5hdebq7cuvi_,n,h,.urlset/master.m3u8?t=tok123&e=43200"}]});',0,0,''.split('|')))
      </script>
    </html>
  `;
  const mockFetch = (async () =>
    new Response(mockHtml, { status: 200 })) as typeof fetch;

  const m3u8 = await extractVimeosM3u8(
    "https://vimeos.net/embed-h5hdebq7cuvi.html",
    mockFetch,
  );
  assert.strictEqual(
    m3u8,
    "https://s1.vimeos.net/hls2/03/00015/h5hdebq7cuvi_,n,h,.urlset/master.m3u8?t=tok123&e=43200",
  );
});

test("extractVimeosM3u8 returns null on HTTP error or missing stream", async () => {
  const mockFetch = (async () =>
    new Response("Forbidden", { status: 403 })) as typeof fetch;
  const m3u8 = await extractVimeosM3u8(
    "https://vimeos.net/embed-dead.html",
    mockFetch,
  );
  assert.strictEqual(m3u8, null);
});
