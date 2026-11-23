import test from "node:test";
import assert from "node:assert/strict";
import { GetAll } from "../../../strategies/cinecalidad/get-all.operation.ts";

test("GetAll filters out .naadb ad cards, resolves data-src images, and maps movie/serie links", async () => {
  const mockHtml = `
    <article class="item movies naadb">
      <div class="poster custom">
        <img src="https://adsanalytics.org/images/promo.jpg" alt="promo" />
        <h3><a href="#aHR0cHM6Ly9hZHNhbmFseXRpY3Mub3Jn"><div class="in_title">Netflix Premium</div></a></h3>
      </div>
    </article>
    <article class="item movies">
      <div class="poster custom">
        <img src="data:image/png;base64,iVBOR" data-src="https://image.tmdb.org/t/p/w342/madden.jpg" alt="Madden" />
        <h3>
          <a href="https://www.cinecalidad.am/ver-pelicula/madden/">
            <div class="home_post_content">
              <div class="in_title">Madden</div>
              <p></p><p>2026</p>
            </div>
          </a>
        </h3>
      </div>
    </article>
    <article class="item movies">
      <div class="poster custom">
        <div class="selt">Series</div>
        <img src="https://image.tmdb.org/t/p/w342/csi.jpg" alt="CSI: Miami" />
        <h3>
          <a href="https://www.cinecalidad.am/ver-serie/csi-miami/">
            <div class="home_post_content">
              <div class="in_title">CSI: Miami</div>
              <p></p><p>2002</p>
            </div>
          </a>
        </h3>
      </div>
    </article>
    <div class="pagination"><span class="current">1</span><a class="page-numbers" href="https://www.cinecalidad.am/page/5/">5</a></div>
  `;

  const mockFetch = (async () =>
    new Response(mockHtml, { status: 200 })) as typeof fetch;
  const getAll = new GetAll(mockFetch);
  const result = await getAll.operation({ page: 1 });

  assert.strictEqual(result.movies.length, 2);
  assert.strictEqual(result.movies[0].title, "Madden");
  assert.strictEqual(result.movies[0].link, "/pelicula/madden");
  assert.strictEqual(result.movies[0].image, "https://image.tmdb.org/t/p/w342/madden.jpg");
  assert.strictEqual(result.movies[0].year, "2026");
  assert.strictEqual(result.movies[0].type, "movie");
  assert.strictEqual(result.movies[0].provider, "cinecalidad");

  assert.strictEqual(result.movies[1].title, "CSI: Miami");
  assert.strictEqual(result.movies[1].link, "/serie/csi-miami");
  assert.strictEqual(result.movies[1].type, "serie");
  assert.strictEqual(result.hasMore, true);
  assert.strictEqual(result.lastPageNumber, 5);
});

test("GetAll builds correct URLs for pagination, series filter, and search", async () => {
  const requestedUrls: string[] = [];
  const mockFetch = (async (url: string) => {
    requestedUrls.push(String(url));
    return new Response("<html></html>", { status: 200 });
  }) as typeof fetch;

  const getAll = new GetAll(mockFetch);
  await getAll.operation({ page: 2, filter: "movies" });
  await getAll.operation({ page: 3, filter: "series" });
  await getAll.operation({ page: 1, search: "batman ninja" });

  assert.strictEqual(requestedUrls[0], "/page/2/");
  assert.strictEqual(requestedUrls[1], "/ver-serie/page/3/");
  assert.strictEqual(requestedUrls[2], "/?s=batman%20ninja");
});
