import test from "node:test";
import assert from "node:assert";
import { GetDetail, parseMegadedeDetail } from "../../../strategies/megadede/get-detail.operation.ts";

const SAMPLE_MOVIE_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Peleas a domicilio (2024)" />
  <meta property="og:image" content="https://image.tmdb.org/t/p/w500/backdrop_movie.jpg" />
</head>
<body>
  <div class="movie-info" id="item-context" data-type="pelicula" data-slug="peleas-a-domicilio-fx2PQs">
    <div class="poster"><img src="https://image.tmdb.org/t/p/w300/poster_movie.jpg" /></div>
    <h1 class="title">Peleas a domicilio</h1>
    <div class="desc"><p>Dos amigos crean una empresa de peleas clandestinas.</p></div>
    <div class="meta">
      <span class="year">2024</span>
      <span class="rating">7.5</span>
      <span class="duration">1h 45m</span>
      <div class="genres"><a href="/genero/accion">Acción</a><a href="/genero/comedia">Comedia</a></div>
    </div>
    <div class="player-section">
      <button class="server-btn active" onclick="changeServer('/vidurl/tt34724686/', this)">Embed69</button>
    </div>
  </div>
</body>
</html>
`;

const SAMPLE_SERIE_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="The Afterparty" />
  <meta property="og:image" content="https://image.tmdb.org/t/p/original/backdrop_serie.jpg" />
</head>
<body>
  <div class="movie-info" id="item-context" data-type="serie" data-slug="the-afterparty">
    <div class="poster"><img src="https://image.tmdb.org/t/p/w300/poster_serie.jpg" /></div>
    <h1 class="title">The Afterparty</h1>
    <div class="desc"><p>Una reunión de secundaria termina en asesinato.</p></div>
    <div class="meta">
      <span class="year">2022</span>
      <span class="rating">8.0</span>
      <span class="duration">35m</span>
      <div class="genres"><a href="/genero/misterio">Misterio</a><a href="/genero/comedia">Comedia</a></div>
    </div>
    <div class="season-container" data-season="1">
      <a href="/serie/the-afterparty#s1-e1" data-episode-link data-season="1" data-episode="1" class="episode-card">
        <div class="fz5">Ep 1</div>
        <p class="tvw">El día después</p>
      </a>
      <a href="/serie/the-afterparty#s1-e2" data-episode-link data-season="1" data-episode="2" class="episode-card">
        <div class="fz5">Ep 2</div>
        <p class="tvw">Brett</p>
      </a>
    </div>
    <div class="season-container" data-season="2">
      <a href="/serie/the-afterparty#s2-e1" data-episode-link data-season="2" data-episode="1" class="episode-card">
        <div class="fz5">Ep 1</div>
        <p class="tvw">Aniq 2</p>
      </a>
    </div>
  </div>
</body>
</html>
`;

test("parseMegadedeDetail correctly parses real Megadede markup with movie-meta and rating-badge", () => {
  const realDetailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta property="og:title" content="Ver Peleas a domicilio (2026) Online - Megadede" />
      <meta property="og:image" content="https://image.tmdb.org/t/p/w300/kq5RJr8i0V2Jt8tyGV82mn0BZDc.jpg" />
    </head>
    <body>
      <div class="movie-info" id="item-context" data-type="pelicula">
        <h1>Peleas a domicilio</h1>
        <div class="movie-meta">
          <a href="/year/2026">📅 Año: 2026</a>
          <span class="rating-badge">⭐ 5</span>
        </div>
        <div class="description">
          Naim es un hombre encantador en el día a día, aunque se transforma en una verdadera fiera cuando alguien lo provoca.
        </div>
        <div class="genres">
          <a href="/generos/accion">Acción</a>
          <a href="/generos/aventura">Aventura</a>
          <a href="/generos/comedia">Comedia</a>
        </div>
        <button class="server-btn active" onclick="changeServer('/vidurl/tt34724686/', this)">Embed</button>
      </div>
    </body>
    </html>
  `;

  const detail = parseMegadedeDetail(realDetailHtml, "/pelicula/peleas-a-domicilio-fx2PQs");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Peleas a domicilio");
  assert.strictEqual(detail.year, "2026");
  assert.strictEqual(detail.rating, "5");
  assert.strictEqual(
    detail.caption,
    "Naim es un hombre encantador en el día a día, aunque se transforma en una verdadera fiera cuando alguien lo provoca."
  );
  assert.deepStrictEqual(detail.tags, ["Acción", "Aventura", "Comedia"]);
  assert.strictEqual(detail.image, "https://image.tmdb.org/t/p/w300/kq5RJr8i0V2Jt8tyGV82mn0BZDc.jpg");
  assert.strictEqual(detail.movieUrl, "/vidurl/tt34724686/");
});

test("parseMegadedeDetail correctly parses movie details and vidurl", () => {
  const detail = parseMegadedeDetail(SAMPLE_MOVIE_DETAIL_HTML, "/pelicula/peleas-a-domicilio-fx2PQs");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Peleas a domicilio");
  assert.strictEqual(detail.year, "2024");
  assert.strictEqual(detail.rating, "7.5");
  assert.strictEqual(detail.duration, "1h 45m");
  assert.strictEqual(detail.caption, "Dos amigos crean una empresa de peleas clandestinas.");
  assert.strictEqual(detail.image, "https://image.tmdb.org/t/p/w300/poster_movie.jpg");
  assert.strictEqual(detail.backgroundImage, "https://image.tmdb.org/t/p/w500/backdrop_movie.jpg");
  assert.deepStrictEqual(detail.tags, ["Acción", "Comedia"]);
  assert.strictEqual(detail.type, "movie");
  assert.strictEqual(detail.provider, "megadede");
  assert.strictEqual(detail.movieUrl, "/vidurl/tt34724686/");
});

test("parseMegadedeDetail parses series even when link lacks leading slash (e.g. serie/dexter)", () => {
  const detail = parseMegadedeDetail(SAMPLE_SERIE_DETAIL_HTML, "serie/the-afterparty");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "The Afterparty");
  assert.strictEqual(detail.type, "serie");
  assert.strictEqual(detail.episodes?.length, 2);
  assert.strictEqual(detail.episodes[0].episodes[0].link, "/serie/the-afterparty#s1-e1");
  assert.strictEqual(detail.episodes[0].episodes[0].context?.slug, "the-afterparty");
});

test("parseMegadedeDetail correctly parses serie details with seasons and episodes", () => {
  const detail = parseMegadedeDetail(SAMPLE_SERIE_DETAIL_HTML, "/serie/the-afterparty");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "The Afterparty");
  assert.strictEqual(detail.type, "serie");
  assert.strictEqual(detail.provider, "megadede");
  assert.strictEqual(detail.episodes?.length, 2);

  const s1 = detail.episodes[0];
  assert.strictEqual(s1.season, "1");
  assert.strictEqual(s1.episodes.length, 2);
  assert.strictEqual(s1.episodes[0].numberEpisode, "1");
  assert.strictEqual(s1.episodes[0].title, "El día después");
  assert.strictEqual(s1.episodes[0].link, "/serie/the-afterparty#s1-e1");
  assert.deepStrictEqual(s1.episodes[0].context, {
    season: 1,
    episode: 1,
    slug: "the-afterparty",
    provider: "megadede",
  });

  const s2 = detail.episodes[1];
  assert.strictEqual(s2.season, "2");
  assert.strictEqual(s2.episodes.length, 1);
  assert.strictEqual(s2.episodes[0].numberEpisode, "1");
  assert.strictEqual(s2.episodes[0].title, "Aniq 2");
});

test("GetDetail operation returns undefined on 404", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response("Not found", { status: 404 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getDetail = new GetDetail();
  const res = await getDetail.operation("/pelicula/not-existing");
  assert.strictEqual(res, undefined);
});

test("parseMegadedeDetail caps tags to a maximum of 4", () => {
  const html = `
    <html>
      <head><meta property="og:title" content="Test Many Tags" /></head>
      <body>
        <div class="movie-info">
          <h1 class="title">Test Many Tags</h1>
          <div class="genres">
            <a href="/genero/1">Acción</a>
            <a href="/genero/2">Comedia</a>
            <a href="/genero/3">Aventura</a>
            <a href="/genero/4">Drama</a>
            <a href="/genero/5">Terror</a>
            <a href="/genero/6">Ciencia Ficción</a>
          </div>
        </div>
      </body>
    </html>
  `;
  const detail = parseMegadedeDetail(html, "/pelicula/test-many-tags");
  assert(detail !== undefined);
  assert.strictEqual(detail.tags?.length, 4);
  assert.deepStrictEqual(detail.tags, ["Acción", "Comedia", "Aventura", "Drama"]);
});

test("parseMegadedeDetail parses anime markup with data-type='anime' and /anime/<slug>#sX-eY episode cards into /serie/<slug>#sX-eY", () => {
  const animeDetailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta property="og:title" content="Ver Castlevania (2017) Online - Megadede" />
      <meta property="og:image" content="https://image.tmdb.org/t/p/original/cSDQLgkdTqAHfEs9Zg0xBAoKlIn.jpg" />
    </head>
    <body>
      <div class="movie-info" id="item-context" data-type="anime" data-slug="castlevania" data-season="1" data-episode="1">
        <div class="poster"><img src="https://image.tmdb.org/t/p/w300/cSDQLgkdTqAHfEs9Zg0xBAoKlIn.jpg" /></div>
        <h1>Castlevania</h1>
        <div class="movie-meta">
          <a href="/year/2017">📅 Año: 2017</a>
          <span class="rating-badge">⭐ 8.3</span>
        </div>
        <div class="description">Un cazador de vampiros regresa a la ciudad.</div>
        <div class="season-container" data-season="1">
          <a href="/anime/castlevania#s1-e1" data-episode-link data-season="1" data-episode="1" class="episode-card">
            <div class="fz5">Ep 1</div>
            <p class="tvw">Botella de bruja</p>
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  const detail = parseMegadedeDetail(animeDetailHtml, "serie/castlevania");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Castlevania");
  assert.strictEqual(detail.type, "serie");
  assert.strictEqual(detail.episodes?.length, 1);
  assert.strictEqual(detail.episodes[0].episodes[0].link, "/serie/castlevania#s1-e1");
  assert.deepStrictEqual(detail.episodes[0].episodes[0].context, {
    season: 1,
    episode: 1,
    slug: "castlevania",
    provider: "megadede",
    upstreamType: "anime",
  });
});

test("GetDetail falls back to /anime/<slug> when /serie/<slug> returns 404 on Megadede", async (t) => {
  const animeHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta property="og:title" content="Castlevania" />
      <meta property="og:image" content="https://image.tmdb.org/t/p/original/cSDQLgkdTqAHfEs9Zg0xBAoKlIn.jpg" />
    </head>
    <body>
      <div class="movie-info" id="item-context" data-type="anime" data-slug="castlevania">
        <h1>Castlevania</h1>
        <div class="season-container" data-season="1">
          <a href="/anime/castlevania#s1-e1" data-episode-link data-season="1" data-episode="1" class="episode-card">
            <div class="fz5">Ep 1</div>
            <p class="tvw">Episodio 1</p>
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  const requestedUrls: string[] = [];
  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    requestedUrls.push(url);
    if (url.includes("/serie/castlevania")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.includes("/anime/castlevania")) {
      return new Response(animeHtml, { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getDetail = new GetDetail();
  const detail = await getDetail.operation("serie/castlevania");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Castlevania");
  assert.strictEqual(detail.type, "serie");
  assert.strictEqual(detail.episodes?.[0].episodes[0].link, "/serie/castlevania#s1-e1");
  assert(requestedUrls.some((u) => u.includes("/anime/castlevania")));
});

