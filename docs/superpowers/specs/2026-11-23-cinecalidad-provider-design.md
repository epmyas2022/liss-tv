# Cinecalidad Provider Integration Design

**Date:** 2026-11-23  
**Status:** Proposed  
**Provider ID:** `cinecalidad`  
**Base URL:** `https://www.cinecalidad.am`

---

## 1. Intent & The Why

Integrate **Cinecalidad (`https://www.cinecalidad.am`)** as a first-class, isolated streaming provider in LissTV. Our live reconnaissance confirmed that `pelisxd.com` gates all video playback behind interactive image-tile CAPTCHAs (`byseqekaho.com`) and Cloudflare Managed Challenges (`playmogo.com`), making server-side HLS extraction impossible. In contrast, Cinecalidad serves both **Movies** (`/ver-pelicula/...`) and **Series** (`/ver-serie/...` / `/ver-el-episodio/...`) in **Español Latino** with `200 OK` responses, and its primary video hoster (`vimeos.net`) unpacks via Dean Edwards P.A.C.K.E.R. into multi-quality HLS (`master.m3u8`) featuring **HD (`_h` ~2.55 Mbps)** and **native Dual Audio (`#EXT-X-MEDIA:TYPE=AUDIO` Español Latino + English)**.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
1. Implement an isolated `cinecalidad` provider under `strategies/cinecalidad/` adhering strictly to `AGENTS.md` and the Strategy pattern (`GetAll`, `GetDetail`, `GetUrl`):
   - `GetAll`: Scrape movies and series catalogs, handle pagination (`/page/{n}/`, `/ver-serie/page/{n}/`), keyword search (`/?s={query}`), filter out promotional ad cards (`article.item.naadb` and `#` links), and disambiguate `"movie"` vs `"serie"` by URL path (`/ver-serie/` vs `/ver-pelicula/`).
   - `GetDetail`: Extract metadata (title, synopsis, TMDB poster/backdrop, year, rating, genres), player embed options (`li.dooplay_player_option[data-option]`), and full multi-season episode lists (`div#jstab[data-tab] ul.episodios li`) for series.
   - `GetUrl`: Resolve the target movie or episode page, extract `vimeos.net` (and any secondary HLS-compatible embeds), unpack the Dean Edwards P.A.C.K.E.R. payload to obtain the `master.m3u8` URL, and wrap it in `/api/video/m3u8?url=...&referer=https%3A%2F%2Fvimeos.net%2F` with `directSegments: false`.
2. Register `cinecalidad` in `MovieContextFactory`, `DriverRegistry` (wrapped in `CachedDriverDecorator` for metadata caching), and `inferProviderFromLink` in `utils/utils.ts`.
3. Provide complete unit tests with mocked HTTP responses for `client`, `vimeos.extractor`, `get-all`, `get-detail`, `get-url`, and registry wiring.

### Non-Goals
- Modifying UI components or Next.js App Router pages.
- Supporting YouTube trailers (`#player-option-trailer`) as playable movie streams.

### Anti-Goals
- **Do NOT use `directSegments: true` for `vimeos.net`:** Live testing confirmed `s1.vimeos.net` returns `403 Forbidden` when `.ts` segments are requested without `Referer: https://vimeos.net/` and omits `Access-Control-Allow-Origin: *`. Segments must stream through `/api/video/m3u8`.
- **Do NOT permanently cache `vimeos.net` M3U8 manifests in MinIO:** Stream URLs on `s1.vimeos.net` carry signed time-limited tokens (`?t=...&s=...&e=43200`, valid for 12 hours). Persisting rewritten manifests in MinIO would serve expired segment tokens after 12 hours.
- Coupling `cinecalidad` to any other provider's internal files.

---

## 3. Constraints (`AGENTS.md`)

- **Strict TypeScript:** Zero `any`; all inputs/outputs typed against `@/types/movie` and `strategies/cinecalidad/types.ts`.
- **Provider Isolation:** All Cinecalidad logic and extractors live inside `strategies/cinecalidad/`.
- **Error Handling:** Network and parsing failures throw typed `CinecalidadError` (no empty `catch` blocks or raw fetch errors leaked).
- **Testing:** All unit tests mock network calls (`fetchFn` injection) and never hit live servers.

---

## 4. Approaches Considered

### Approach 1: Proxied HLS Manifest & Segments (`directSegments: false`, Ephemeral Stream Resolution) — Selected
- **How it works:**
  - `GetUrl` resolves `https://vimeos.net/embed-{code}.html` with `Referer: https://www.cinecalidad.am/`, unpacks the P.A.C.K.E.R. script, and extracts `https://s1.vimeos.net/hls2/.../master.m3u8?t=...`.
  - Returns `/api/video/m3u8?url=${encodeURIComponent(m3u8Url)}&referer=${encodeURIComponent("https://vimeos.net/")}` with `directSegments: false`.
  - `/api/video/m3u8` rewrites both `#EXT-X-MEDIA` audio playlists (`index-a1.m3u8` Español Latino, `index-a2.m3u8` English) and video variant playlists (`_h/index-v1-a1.m3u8` HD, `_n/index-v1-a1.m3u8` SD) so every `.ts` segment request carries `Referer: https://vimeos.net/`.
- **Trade-offs:** Uses VPS bandwidth for segment streaming (`~2.55 Mbps`), but guarantees `200 OK` across all browsers and bypasses local ISP/Fortinet firewalls blocking third-party CDNs.

### Approach 2: Direct Client Segments (`directSegments: true`) — Rejected
- **Why rejected:** Verified live against `s1.vimeos.net`: direct requests from a browser context without `Referer: https://vimeos.net/` fail immediately with `HTTP 403` and lack CORS headers (`Access-Control-Allow-Origin: null`).

### Approach 3: Permanent MinIO M3U8 Caching (`persistUpstreamManifest`) — Rejected
- **Why rejected:** `s1.vimeos.net` embeds a 12-hour expiration window (`e=43200`) in every segment URL inside the child playlists. Caching the playlist in MinIO would cause `403` segment failures once the token expires, and `CachedDriverDecorator.getUrl()` already purges `?url=` ephemeral proxy URLs automatically.

---

## 5. Architecture & File Structure

```text
strategies/cinecalidad/
├── types.ts                        # Cinecalidad domain/parsing interfaces
├── client.ts                       # cinecalidadFetch, CINECALIDAD_BASE_URL, CinecalidadError
├── extractors/
│   └── vimeos.extractor.ts         # Dean Edwards unpacker & Vimeos master.m3u8 extractor
├── get-all.operation.ts            # GetAll strategy (movies, series, pagination, search, ad filtering)
├── get-detail.operation.ts         # GetDetail strategy (metadata, embeds context, multi-season episodes)
└── get-url.operation.ts            # GetUrl strategy (movie & episode resolution -> Vimeos HLS proxy URL)

builder/
└── cinecalidad.build.ts            # CinecalidadMovieBuilder implementing MovieBuilder<MovieContext>

tests/strategies/cinecalidad/
├── client.test.ts
├── vimeos.extractor.test.ts
├── get-all.test.ts
├── get-detail.test.ts
└── get-url.test.ts
```

### Key Technical Details

1. **Ad-Card Filtering in `GetAll`:**
   - Cinecalidad injects 3 promotional cards at the top of catalog pages with class `article.item.movies.naadb` and base64 hash links (`href="#aHR0cHM6..."`).
   - `GetAll` strictly ignores any element matching `.naadb` or whose `href` starts with `#` or does not contain `/ver-pelicula/` or `/ver-serie/`.
2. **Routing & Category Filtering in `GetAll`:**
   - `search`: `/?s=${encodeURIComponent(search)}` (or `/page/${page}/?s=${encodeURIComponent(search)}` for `page > 1`).
   - `filter === "series"`: `/ver-serie/` (page 1) or `/ver-serie/page/${page}/`.
   - `filter === "movies"` or default: `/` (page 1) or `/page/${page}/` (filtering out `/ver-serie/` items when `filter === "movies"` is explicitly requested).
3. **Series Episode Resolution in `GetDetail` & `GetUrl`:**
   - Series pages (`/ver-serie/{slug}/`) contain all seasons inside `div#jstab[data-tab="{season}"] ul.episodios li`.
   - Each episode item extracts:
     - `season`: numeric `data-tab` (or parsed from `S{s}-E{e}` / `-s{s}-e{e}/`)
     - `numberEpisode`: parsed from `/ver-el-episodio/tmdb-\d+-s\d+-e(\d+)/` or `.numerando`
     - `title`: `.episodiotitle a` text
     - `link`: normalized path `/ver-el-episodio/tmdb-{id}-s{s}-e{e}/`
     - `image`: episode thumbnail `img[data-src]` or `img[src]`
   - `GetUrl` accepts either a direct `/ver-pelicula/{slug}/` path, a direct `/ver-el-episodio/{slug}/` path, or a `/ver-serie/{slug}/` path with `season`/`episode` options (resolving the episode link from `detailContext.episodes` or by fetching `/ver-serie/{slug}/`).
4. **Link Inference (`utils/utils.ts`):**
   - Links containing `cinecalidad.` or starting with `/ver-pelicula/`, `/ver-serie/`, or `/ver-el-episodio/` map to `"cinecalidad"`.
