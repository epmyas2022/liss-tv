import test from "node:test";
import assert from "node:assert/strict";
import { GetUrl } from "../../../strategies/cinecalidad/get-url.operation.ts";
import { CinecalidadError } from "../../../strategies/cinecalidad/client.ts";

test("GetUrl resolves movie Vimeos embed into proxied HLS URL with directSegments false", async () => {
  const movieHtml = `
    <ul id="playeroptionsul">
      <li id="player-option-1" class="dooplay_player_option" data-option="https://vimeos.net/embed-h5hdebq7cuvi.html">Vimeos</li>
      <li id="player-option-trailer" class="dooplay_player_option_trailer" data-option="https://www.youtube.com/embed/xyz">Trailer</li>
    </ul>
  `;

  const mockFetch = (async () =>
    new Response(movieHtml, { status: 200 })) as typeof fetch;
  const mockExtractor = async (embedUrl: string) => {
    if (embedUrl.includes("h5hdebq7cuvi")) {
      return "https://s1.vimeos.net/hls2/03/00015/h5hdebq7cuvi_,n,h,.urlset/master.m3u8?t=tok123";
    }
    return null;
  };

  const getUrl = new GetUrl(mockFetch, mockExtractor);
  const result = await getUrl.operation("/pelicula/madden");

  assert.strictEqual(
    result.url,
    "/api/video/m3u8?url=https%3A%2F%2Fs1.vimeos.net%2Fhls2%2F03%2F00015%2Fh5hdebq7cuvi_%2Cn%2Ch%2C.urlset%2Fmaster.m3u8%3Ft%3Dtok123&referer=https%3A%2F%2Fvimeos.net%2F",
  );
  assert.strictEqual(result.directSegments, false);
  assert.strictEqual(result.headers?.Referer, "https://vimeos.net/");
});

test("GetUrl resolves series episode from season and episode options", async () => {
  const serieHtml = `
    <div id="jstab" data-tab="1">
      <ul class="episodios">
        <li><a href="https://www.cinecalidad.am/ver-el-episodio/tmdb-1620-s1-e2/">Ep 2</a></li>
      </ul>
    </div>
  `;
  const epHtml = `
    <ul id="playeroptionsul">
      <li id="player-option-1" class="dooplay_player_option" data-option="https://vimeos.net/embed-ep2code.html">Vimeos</li>
    </ul>
  `;

  const mockFetch = (async (url: string) => {
    if (String(url).includes("/ver-el-episodio/")) {
      return new Response(epHtml, { status: 200 });
    }
    return new Response(serieHtml, { status: 200 });
  }) as typeof fetch;

  const mockExtractor = async (embedUrl: string) =>
    embedUrl.includes("ep2code")
      ? "https://s1.vimeos.net/hls2/ep2/master.m3u8?t=tokEp2"
      : null;

  const getUrl = new GetUrl(mockFetch, mockExtractor);
  const result = await getUrl.operation("/serie/csi-miami#s1-e2");

  assert.ok(result.url.includes("tokEp2"));
  assert.strictEqual(result.directSegments, false);
});

test("GetUrl throws CinecalidadError when no playable stream can be extracted", async () => {
  const mockFetch = (async () =>
    new Response("<html></html>", { status: 200 })) as typeof fetch;
  const getUrl = new GetUrl(mockFetch, async () => null);

  await assert.rejects(
    async () => {
      await getUrl.operation("/pelicula/sin-stream");
    },
    (err: unknown) => err instanceof CinecalidadError,
  );
});
