import test from "node:test";
import assert from "node:assert/strict";
import { GetDetail } from "../../../strategies/cinecalidad/get-detail.operation.ts";

test("GetDetail parses movie metadata and excludes trailer from embed options", async () => {
  const movieHtml = `
    <html>
      <head><title>Madden (2026) - Cinecalidad</title></head>
      <body>
        <div class="single_left">
          <h1>Madden</h1>
          <img data-src="https://image.tmdb.org/t/p/w342/madden.jpg" src="data:image/png;base64,xxx" class="wp-post-image" />
          <p>La historia de John Madden en la NFL.</p>
          <ul id="playeroptionsul">
            <li id="player-option-1" class="dooplay_player_option" data-option="https://vimeos.net/embed-h5hdebq7cuvi.html"><span>Vimeos</span></li>
            <li id="player-option-trailer" class="dooplay_player_option dooplay_player_option_trailer" data-option="https://www.youtube.com/embed/xzh7HzLXXpk"><span>Trailer</span></li>
          </ul>
        </div>
      </body>
    </html>
  `;

  let requestedPath = "";
  const mockFetch = (async (url: string) => {
    requestedPath = String(url);
    return new Response(movieHtml, { status: 200 });
  }) as typeof fetch;

  const getDetail = new GetDetail(mockFetch);
  const detail = await getDetail.operation("/pelicula/madden");

  assert.strictEqual(requestedPath, "/ver-pelicula/madden/");
  assert.strictEqual(detail.title, "Madden");
  assert.strictEqual(detail.image, "https://image.tmdb.org/t/p/w342/madden.jpg");
  assert.strictEqual(detail.type, "movie");
  assert.strictEqual(detail.provider, "cinecalidad");
  const embeds = detail.context?.embeds as Array<{ url: string }>;
  assert.strictEqual(embeds.length, 1);
  assert.strictEqual(embeds[0].url, "https://vimeos.net/embed-h5hdebq7cuvi.html");
});

test("GetDetail parses multi-season series and episode links from div#jstab containers", async () => {
  const serieHtml = `
    <html>
      <body>
        <h1>CSI: Miami</h1>
        <img data-src="https://image.tmdb.org/t/p/w342/csi.jpg" />
        <div id="jstab" data-tab="1" class="se-c">
          <ul class="episodios">
            <li class="mark-1">
              <div class="imagen"><img data-src="https://image.tmdb.org/t/p/w185/ep1.jpg" /></div>
              <div class="numerando">S1-E1</div>
              <div class="episodiotitle"><a href="https://www.cinecalidad.am/ver-el-episodio/tmdb-1620-s1-e1/">Paracaídas de oro</a></div>
            </li>
          </ul>
        </div>
        <div id="jstab" data-tab="2" class="se-c">
          <ul class="episodios">
            <li class="mark-1">
              <div class="numerando">S2-E1</div>
              <div class="episodiotitle"><a href="https://www.cinecalidad.am/ver-el-episodio/tmdb-1620-s2-e1/">Hermanos de sangre</a></div>
            </li>
          </ul>
        </div>
      </body>
    </html>
  `;

  let requestedPath = "";
  const mockFetch = (async (url: string) => {
    requestedPath = String(url);
    return new Response(serieHtml, { status: 200 });
  }) as typeof fetch;

  const getDetail = new GetDetail(mockFetch);
  const detail = await getDetail.operation("/serie/csi-miami");

  assert.strictEqual(requestedPath, "/ver-serie/csi-miami/");
  assert.strictEqual(detail.type, "serie");
  assert.strictEqual(detail.episodes?.length, 2);
  assert.strictEqual(detail.episodes?.[0].season, 1);
  assert.strictEqual(detail.episodes?.[0].episodes[0].numberEpisode, "1");
  assert.strictEqual(detail.episodes?.[0].episodes[0].title, "Paracaídas de oro");
  assert.strictEqual(detail.episodes?.[0].episodes[0].link, "/ver-el-episodio/tmdb-1620-s1-e1/");
  assert.strictEqual(detail.episodes?.[1].season, 2);
  assert.strictEqual(detail.episodes?.[1].episodes[0].link, "/ver-el-episodio/tmdb-1620-s2-e1/");
});
