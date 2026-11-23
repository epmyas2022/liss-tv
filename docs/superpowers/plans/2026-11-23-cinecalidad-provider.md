# Cinecalidad Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and register the `cinecalidad` provider driver (`https://www.cinecalidad.am`) in LissTV supporting movie and series catalogs, search, multi-season episode parsing, and Vimeos HD Dual-Audio HLS extraction with `directSegments: false`.

**Architecture:** An isolated provider module under `strategies/cinecalidad/` implementing the 3 Strategy contracts (`GetAll`, `GetDetail`, `GetUrl`). `GetAll` and `GetDetail` parse Cinecalidad HTML via Cheerio, filtering out `.naadb` promotional ad cards and normalizing UI routes to `/pelicula/{slug}` and `/serie/{slug}`. `GetUrl` extracts `vimeos.net` embeds, unpacks the Dean Edwards P.A.C.K.E.R. payload to resolve the `master.m3u8` stream, and wraps it in `/api/video/m3u8` with `Referer: https://vimeos.net/` and `directSegments: false`.

**Tech Stack:** TypeScript (strict), Node.js native test runner (`node:test`), Next.js App Router, Cheerio, Node native `fetch`.

**Spec:** `docs/superpowers/specs/2026-11-23-cinecalidad-provider-design.md`

## Global Constraints

- Adhere strictly to `AGENTS.md`: Strategy pattern contracts in `types/movie.ts`, zero `any` types, no UI coupling to provider internals, and all external network calls mocked in unit tests.
- `GetAll` must filter out promotional cards matching `.naadb` or `href` starting with `#` and map catalog links to `/pelicula/{slug}` and `/serie/{slug}` for Next.js App Router compatibility while storing `{ provider: "cinecalidad", slug, rawPath }` in `context`.
- `GetUrl` must return `directSegments: false` with `Referer: "https://vimeos.net/"` and must not permanently cache time-limited Vimeos manifests in MinIO.
- Zero TypeScript errors (`npx tsc --noEmit`) and all unit tests passing.

## Review Focus

1. Promotional ad cards (`article.item.movies.naadb` with `#aHR0cHM...` links): Must never appear in catalog or search results.
2. Lazy-loaded TMDB images (`src="data:image/png;base64,..."` with real URL in `data-src`): Must prioritize `data-src` over placeholder `data:` URIs.
3. Trailer player tab (`#player-option-trailer` pointing to YouTube): Must be ignored during embed extraction in `GetDetail` and `GetUrl`.
4. Deep-linked series episodes (`/serie/{slug}#s1-e2` or `options.season`/`options.episode` without `/ver-el-episodio/...` link): `GetUrl` must resolve the matching `/ver-el-episodio/...` URL from `detailContext.episodes` or by scraping `/ver-serie/{slug}/`.
5. Unpacked Vimeos script variations (`var links = {...}`, `sources: [{ file: "..." }]`, or direct `.m3u8` string): `extractVimeosM3u8` must handle all three formats and return `null` cleanly on HTTP errors or malformed scripts.

---

### Task 1: Cinecalidad Types and HTTP Client

**Files:**
- Create: `strategies/cinecalidad/types.ts`
- Create: `strategies/cinecalidad/client.ts`
- Test: `tests/strategies/cinecalidad/client.test.ts`

**Interfaces:**
- Consumes: Standard Node `fetch`
- Produces:
  - `CINECALIDAD_BASE_URL = "https://www.cinecalidad.am"`
  - `class CinecalidadError extends Error { status?: number }`
  - `cinecalidadFetch(endpointOrUrl: string, options?: RequestInit): Promise<Response>`
  - `CinecalidadEmbedOption { id: string; server: string; url: string }`

- [ ] **Step 1: Write the failing test in `tests/strategies/cinecalidad/client.test.ts`**

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import {
  cinecalidadFetch,
  CINECALIDAD_BASE_URL,
  CinecalidadError,
} from "../../../strategies/cinecalidad/client.ts";

test("cinecalidadFetch prepends base URL and attaches desktop headers", async (t) => {
  const originalFetch = global.fetch;
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return new Response("<html>OK</html>", { status: 200 });
  }) as typeof fetch;

  const res = await cinecalidadFetch("/ver-serie/");
  assert.strictEqual(capturedUrl, `${CINECALIDAD_BASE_URL}/ver-serie/`);
  assert.ok(capturedHeaders["User-Agent"]?.includes("Mozilla/5.0"));
  assert.strictEqual(res.status, 200);
});

test("cinecalidadFetch throws CinecalidadError on HTTP error status", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = (async () =>
    new Response("Not Found", { status: 404 })) as typeof fetch;

  await assert.rejects(
    async () => {
      await cinecalidadFetch("/ver-pelicula/inexistente/");
    },
    (err: unknown) => {
      assert.ok(err instanceof CinecalidadError);
      assert.strictEqual(err.status, 404);
      return true;
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/client.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `strategies/cinecalidad/types.ts` and `strategies/cinecalidad/client.ts`**

Define `CinecalidadEmbedOption` in `types.ts` and implement `CINECALIDAD_BASE_URL`, `CinecalidadError`, and `cinecalidadFetch` with 15s timeout and desktop Chrome headers in `client.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add strategies/cinecalidad/types.ts strategies/cinecalidad/client.ts tests/strategies/cinecalidad/client.test.ts
git commit -m "feat(cinecalidad): add types and HTTP client"
```

---

### Task 2: Vimeos P.A.C.K.E.R. Extractor

**Files:**
- Create: `strategies/cinecalidad/extractors/vimeos.extractor.ts`
- Test: `tests/strategies/cinecalidad/vimeos.extractor.test.ts`

**Interfaces:**
- Consumes: `BROWSER_UA` from `@/utils/browser`
- Produces:
  - `unpackVimeosPacker(packedCode: string): string | null`
  - `extractVimeosM3u8(embedUrl: string, fetchFn?: typeof fetch): Promise<string | null>`

- [ ] **Step 1: Write the failing test in `tests/strategies/cinecalidad/vimeos.extractor.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/vimeos.extractor.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `strategies/cinecalidad/extractors/vimeos.extractor.ts`**

Fetch `embedUrl` with `Referer: "https://www.cinecalidad.am/"` and `User-Agent: BROWSER_UA`, unpack `eval(function(p,a,c,k,e,d)...)`, and extract the `.m3u8` URL from `var links`, `sources: [{ file: "..." }]`, or direct regex.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/vimeos.extractor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add strategies/cinecalidad/extractors/vimeos.extractor.ts tests/strategies/cinecalidad/vimeos.extractor.test.ts
git commit -m "feat(cinecalidad): add Vimeos P.A.C.K.E.R. HLS extractor"
```

---

### Task 3: GetAll Strategy Operation

**Files:**
- Create: `strategies/cinecalidad/get-all.operation.ts`
- Test: `tests/strategies/cinecalidad/get-all.test.ts`

**Interfaces:**
- Consumes: `cinecalidadFetch` from `./client`, `upsert` from `@/services/movie.store`, `StrategyGetAllMovies`, `DriverQuery`, `Movies` from `@/types/movie`
- Produces:
  - `parseCinecalidadCatalog(html: string, currentPage?: number, filterType?: "movie" | "serie"): Movies`
  - `class GetAll implements StrategyGetAllMovies`

- [ ] **Step 1: Write the failing test in `tests/strategies/cinecalidad/get-all.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/get-all.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `strategies/cinecalidad/get-all.operation.ts`**

Parse `article.item:not(.naadb)`, skip `#` hrefs, prefer `data-src` over `data:` placeholder images, map `/ver-pelicula/{slug}/` -> `/pelicula/{slug}` and `/ver-serie/{slug}/` -> `/serie/{slug}`, persist each item via `upsert("cinecalidad", item.link, ...)`, and support both object `DriverQuery` and positional `(search, slug, pageNumber)` parameters.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/get-all.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add strategies/cinecalidad/get-all.operation.ts tests/strategies/cinecalidad/get-all.test.ts
git commit -m "feat(cinecalidad): implement GetAll catalog and search operation"
```

---

### Task 4: GetDetail Strategy Operation

**Files:**
- Create: `strategies/cinecalidad/get-detail.operation.ts`
- Test: `tests/strategies/cinecalidad/get-detail.test.ts`

**Interfaces:**
- Consumes: `cinecalidadFetch` from `./client`, `get` from `@/services/movie.store`, `StrategyGetDetailMovie`, `MovieDetail`, `Episode`, `SeasonGroup` from `@/types/movie`
- Produces:
  - `class GetDetail implements StrategyGetDetailMovie`

- [ ] **Step 1: Write the failing test in `tests/strategies/cinecalidad/get-detail.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/get-detail.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `strategies/cinecalidad/get-detail.operation.ts`**

Translate `/pelicula/{slug}` -> `/ver-pelicula/{slug}/` and `/serie/{slug}` -> `/ver-serie/{slug}/`, extract metadata, non-trailer `li.dooplay_player_option[data-option]` embeds, and season/episode lists from `div#jstab[data-tab] ul.episodios li`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/get-detail.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add strategies/cinecalidad/get-detail.operation.ts tests/strategies/cinecalidad/get-detail.test.ts
git commit -m "feat(cinecalidad): implement GetDetail movie and series parser"
```

---

### Task 5: GetUrl Strategy Operation

**Files:**
- Create: `strategies/cinecalidad/get-url.operation.ts`
- Test: `tests/strategies/cinecalidad/get-url.test.ts`

**Interfaces:**
- Consumes: `cinecalidadFetch`, `CinecalidadError` from `./client`, `extractVimeosM3u8` from `./extractors/vimeos.extractor`, `StrategyGetUrl`, `GetUrlOptions`, `Url` from `@/types/movie`
- Produces:
  - `class GetUrl implements StrategyGetUrl`

- [ ] **Step 1: Write the failing test in `tests/strategies/cinecalidad/get-url.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/get-url.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `strategies/cinecalidad/get-url.operation.ts`**

Resolve movie (`/pelicula/{slug}` -> `/ver-pelicula/{slug}/`) or episode path (`/ver-el-episodio/...` or `/serie/{slug}` with `season`/`episode` from options, hash `#sX-eY`, or `detailContext.episodes`), extract `vimeos.net` embeds via `extractVimeosM3u8`, and format `/api/video/m3u8?url=...&referer=https%3A%2F%2Fvimeos.net%2F` with `directSegments: false`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/cinecalidad/get-url.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add strategies/cinecalidad/get-url.operation.ts tests/strategies/cinecalidad/get-url.test.ts
git commit -m "feat(cinecalidad): implement GetUrl stream resolver"
```

---

### Task 6: Builder, DriverRegistry, Navigation Inference, and ProviderSelector Wiring

**Files:**
- Create: `builder/cinecalidad.build.ts`
- Modify: `builder/factory.ts`
- Modify: `drivers/registry.ts`
- Modify: `utils/navigation.ts`
- Modify: `components/ui/ProviderSelector.tsx`
- Test: `tests/drivers/cinecalidad-registry.test.ts`

**Interfaces:**
- Consumes: `GetAll`, `GetDetail`, `GetUrl` from `@/strategies/cinecalidad/*`
- Produces:
  - `CinecalidadMovieBuilder` (`id = "cinecalidad"`, `name = "Cinecalidad"`)
  - `MovieContextFactory.driver("cinecalidad")`
  - `DriverRegistry.getDriver("cinecalidad")`
  - `inferProviderFromLink` support for `cinecalidad` URLs (`/ver-pelicula/`, `/ver-serie/`, `/ver-el-episodio/`, `cinecalidad.`)

- [ ] **Step 1: Write the failing test in `tests/drivers/cinecalidad-registry.test.ts`**

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { MovieContextFactory } from "../../builder/factory.ts";
import { DriverRegistry } from "../../drivers/registry.ts";
import { inferProviderFromLink, getPlayerHref } from "../../utils/navigation.ts";

test("MovieContextFactory creates valid cinecalidad MovieContext", () => {
  const ctx = MovieContextFactory.driver("cinecalidad");
  assert.strictEqual(ctx.id, "cinecalidad");
  assert.strictEqual(ctx.name, "Cinecalidad");
});

test("DriverRegistry registers cinecalidad driver wrapped in cache decorator", () => {
  const driver = DriverRegistry.getDriver("cinecalidad");
  assert.strictEqual(driver.id, "cinecalidad");
  assert.strictEqual(driver.name, "Cinecalidad");
  const providers = DriverRegistry.getAvailableProviders();
  assert.ok(providers.some((p) => p.id === "cinecalidad"));
});

test("inferProviderFromLink and getPlayerHref recognize cinecalidad paths", () => {
  assert.strictEqual(
    inferProviderFromLink("/ver-pelicula/madden/"),
    "cinecalidad",
  );
  assert.strictEqual(
    inferProviderFromLink("/ver-el-episodio/tmdb-1620-s1-e1/"),
    "cinecalidad",
  );
  assert.strictEqual(
    getPlayerHref("/ver-pelicula/madden/"),
    "/pelicula/madden/player",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/drivers/cinecalidad-registry.test.ts`
Expected: FAIL with `"No builder found for provider: cinecalidad"`.

- [ ] **Step 3: Implement `builder/cinecalidad.build.ts` and register in `builder/factory.ts`, `drivers/registry.ts`, `utils/navigation.ts`, and `components/ui/ProviderSelector.tsx`**

Create `CinecalidadMovieBuilder`, add `"cinecalidad"` to `MovieContextFactory`, register `CachedDriverDecorator(cinecalidadContext)` in `DriverRegistry.initialize()`, add Cinecalidad URL matching to `inferProviderFromLink` and `getPlayerHref` in `utils/navigation.ts`, and include `{ id: "cinecalidad", name: "Cinecalidad" }` in `ProviderSelector.tsx` fallback list.

- [ ] **Step 4: Run test and full typecheck to verify everything passes**

Run: `node --import ./tests/register.mjs --test tests/drivers/cinecalidad-registry.test.ts && npx tsc --noEmit`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add builder/cinecalidad.build.ts builder/factory.ts drivers/registry.ts utils/navigation.ts components/ui/ProviderSelector.tsx tests/drivers/cinecalidad-registry.test.ts
git commit -m "feat(cinecalidad): register provider in factory, registry, and navigation"
```
