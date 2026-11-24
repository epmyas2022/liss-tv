import test from "node:test";
import assert from "node:assert";
import { GetAll, parseMegadedeCatalog } from "../../../strategies/megadede/get-all.operation.ts";

const SAMPLE_CATALOG_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="content">
    <article class="mv v por">
      <figure class="im brd1">
        <img src="https://image.tmdb.org/t/p/w300/poster1.jpg" alt="Peleas a domicilio" />
      </figure>
      <div class="data">
        <h2 class="entry-title"><a href="/pelicula/peleas-a-domicilio-fx2PQs">Peleas a domicilio</a></h2>
        <span class="year">2024</span>
        <span class="rating">7.5</span>
      </div>
    </article>
    <article class="mv v por">
      <figure class="im brd1">
        <img src="https://image.tmdb.org/t/p/w300/poster2.jpg" alt="The Afterparty" />
      </figure>
      <div class="data">
        <h2 class="entry-title"><a href="/serie/the-afterparty">The Afterparty</a></h2>
        <span class="year">2022</span>
        <span class="rating">8.0</span>
      </div>
    </article>
  </div>
  <div class="pagination">
    <a href="/peliculas?page=2" class="page-numbers">2</a>
    <a href="/peliculas?page=5" class="page-numbers">5</a>
  </div>
</body>
</html>
`;

test("parseMegadedeCatalog ignores 'Ver contenido' links and extracts true title, year, rating from card header", () => {
  const realCardHtml = `
    <article class="mv v por">
      <figure class="im brd1">
        <img src="https://image.tmdb.org/t/p/w300/kq5RJr8i0V2Jt8tyGV82mn0BZDc.jpg" alt="Peleas a domicilio" />
        <a href="/pelicula/peleas-a-domicilio-fx2PQs" class="lnk-blk" aria-label="Peleas a domicilio">
          <span class="dn">Ver contenido</span>
        </a>
      </figure>
      <header class="hd pdy1">
        <h2 class="fz5 fw6 lh1 mab0">Peleas a domicilio</h2>
        <span class="op6 db fz6">2026</span>
        <span class="rating-badge">⭐ 5</span>
      </header>
    </article>
  `;

  const result = parseMegadedeCatalog(realCardHtml, 1);
  assert.strictEqual(result.movies.length, 1);
  const movie = result.movies[0];
  assert.strictEqual(movie.title, "Peleas a domicilio");
  assert.strictEqual(movie.year, "2026");
  assert.strictEqual(movie.rating, "5");
  assert.strictEqual(movie.link, "/pelicula/peleas-a-domicilio-fx2PQs");
  assert.strictEqual(movie.image, "https://image.tmdb.org/t/p/w300/kq5RJr8i0V2Jt8tyGV82mn0BZDc.jpg");
});

test("parseMegadedeCatalog parses movies, series and pagination flags", () => {
  const result = parseMegadedeCatalog(SAMPLE_CATALOG_HTML, 1);
  assert.strictEqual(result.movies.length, 2);

  const movie = result.movies[0];
  assert.strictEqual(movie.title, "Peleas a domicilio");
  assert.strictEqual(movie.link, "/pelicula/peleas-a-domicilio-fx2PQs");
  assert.strictEqual(movie.image, "https://image.tmdb.org/t/p/w300/poster1.jpg");
  assert.strictEqual(movie.year, "2024");
  assert.strictEqual(movie.rating, "7.5");
  assert.strictEqual(movie.type, "movie");
  assert.strictEqual(movie.provider, "megadede");

  const serie = result.movies[1];
  assert.strictEqual(serie.title, "The Afterparty");
  assert.strictEqual(serie.link, "/serie/the-afterparty");
  assert.strictEqual(serie.type, "serie");
  assert.strictEqual(serie.provider, "megadede");

  assert.strictEqual(result.lastPageNumber, 5);
  assert.strictEqual(result.hasMore, true);
});

test("GetAll operation queries search when search parameter is provided", async (t) => {
  const originalFetch = global.fetch;
  let requestedUrl = "";

  global.fetch = async (input: RequestInfo | URL) => {
    requestedUrl = input.toString();
    return new Response(SAMPLE_CATALOG_HTML, { status: 200 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getAll = new GetAll();
  const res = await getAll.operation("batman", undefined, 2);

  assert(requestedUrl.includes("/search?s=batman&page=2") || requestedUrl.includes("/?s=batman&page=2"));
  assert.strictEqual(res?.movies.length, 2);
});

test("GetAll operation queries series catalog when slug is series", async (t) => {
  const originalFetch = global.fetch;
  let requestedUrl = "";

  global.fetch = async (input: RequestInfo | URL) => {
    requestedUrl = input.toString();
    return new Response(SAMPLE_CATALOG_HTML, { status: 200 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getAll = new GetAll();
  const res = await getAll.operation(undefined, "series", 1);

  assert(requestedUrl.includes("/series?page=1"));
  assert.strictEqual(res?.movies.length, 2);
});

test("parseMegadedeCatalog maps /anime/<slug> cards to /serie/<slug> app route with serie type", () => {
  const animeCardHtml = `
    <article class="mv v por">
      <figure class="im brd1">
        <img src="https://image.tmdb.org/t/p/w300/cSDQLgkdTqAHfEs9Zg0xBAoKlIn.jpg" alt="Castlevania" />
        <a href="/anime/castlevania" class="lnk-blk" aria-label="Castlevania">
          <span class="dn">Ver contenido</span>
        </a>
      </figure>
      <header class="hd pdy1">
        <h2 class="fz5 fw6 lh1 mab0">Castlevania</h2>
        <span class="op6 db fz6">2017</span>
        <span class="rating-badge">⭐ 8.3</span>
      </header>
    </article>
  `;

  const result = parseMegadedeCatalog(animeCardHtml, 1);
  assert.strictEqual(result.movies.length, 1);
  const anime = result.movies[0];
  assert.strictEqual(anime.id, "castlevania");
  assert.strictEqual(anime.title, "Castlevania");
  assert.strictEqual(anime.link, "/serie/castlevania");
  assert.strictEqual(anime.type, "serie");
  assert.strictEqual(anime.provider, "megadede");
  assert.strictEqual(anime.context?.upstreamType, "anime");
});

