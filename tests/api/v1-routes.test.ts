import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { DriverRegistry } from "../../drivers/registry.ts";
import { remove, upsert } from "../../services/movie.store.ts";
import { clearPbAuthCache } from "../../services/v1-auth.service.ts";
import {
  getCatalogPayload,
  getDetailPayload,
  getProvidersPayload,
  getStreamPayload,
} from "../../services/v1-catalog.service.ts";
import { V1ApiError } from "../../utils/api-v1.ts";
import { GET as getProvidersRoute } from "../../app/api/v1/providers/route.ts";
import { GET as getCatalogRoute } from "../../app/api/v1/catalog/route.ts";
import { GET as getDetailRoute } from "../../app/api/v1/detail/route.ts";
import { POST as postStreamRoute } from "../../app/api/v1/stream/route.ts";
import type { DriverQuery, GetUrlOptions, MovieDriver, Movies, StoredMovie, Url } from "../../types/movie.ts";

function buildAuthHeaders(token = "valid_pb_token", extra: Record<string, string> = {}): Record<string, string> {
  const cookieVal = encodeURIComponent(JSON.stringify({ token, model: { id: "user_1" } }));
  return {
    authorization: `Bearer ${token}`,
    cookie: `pb_auth=${cookieVal}`,
    ...extra,
  };
}

function withMockedPocketBase<T>(
  status: number,
  fn: () => Promise<T>,
): Promise<T> {
  clearPbAuthCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/collections/users/auth-refresh")) {
      return new Response(JSON.stringify({ token: "refreshed" }), { status });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  return fn().finally(() => {
    globalThis.fetch = originalFetch;
    clearPbAuthCache();
  });
}

function withMockedDrivers(
  overrides: Record<string, MovieDriver>,
  fn: () => Promise<void>,
): Promise<void> {
  const available = DriverRegistry.getAvailableProviders();
  const originals = new Map<string, MovieDriver>();
  for (const p of available) {
    originals.set(p.id, DriverRegistry.getDriver(p.id));
  }
  for (const mockDriver of Object.values(overrides)) {
    DriverRegistry.register(mockDriver);
  }
  return fn().finally(() => {
    for (const orig of originals.values()) {
      DriverRegistry.register(orig);
    }
  });
}

test("GET /api/v1/providers rejects unauthenticated requests with 401 JSON", async () => {
  await withMockedPocketBase(401, async () => {
    const reqMissing = new NextRequest("http://localhost:3000/api/v1/providers");
    const resMissing = await getProvidersRoute(reqMissing);
    assert.equal(resMissing.status, 401);
    const bodyMissing = await resMissing.json();
    assert.equal(bodyMissing.error.code, "UNAUTHORIZED");

    const reqInvalid = new NextRequest("http://localhost:3000/api/v1/providers", {
      headers: buildAuthHeaders("bad_token"),
    });
    const resInvalid = await getProvidersRoute(reqInvalid);
    assert.equal(resInvalid.status, 401);
    const bodyInvalid = await resInvalid.json();
    assert.equal(bodyInvalid.error.code, "UNAUTHORIZED");
  });
});

test("GET /api/v1/providers returns capability flags and resolves activeProvider from cookie", async () => {
  await withMockedPocketBase(200, async () => {
    const reqDefault = new NextRequest("http://localhost:3000/api/v1/providers", {
      headers: buildAuthHeaders("tok_1"),
    });
    const resDefault = await getProvidersRoute(reqDefault);
    assert.equal(resDefault.status, 200);
    const jsonDefault = await resDefault.json();
    assert.equal(jsonDefault.activeProvider, "megadede");

    const soloLatino = jsonDefault.providers.find((p: { id: string }) => p.id === "solo-latino");
    assert.deepEqual(soloLatino, {
      id: "solo-latino",
      name: "Solo Latino",
      enabled: false,
      disabledReason: "Deshabilitado",
      supportsMovies: true,
      supportsSeries: true,
    });

    const serieslan = jsonDefault.providers.find((p: { id: string }) => p.id === "serieslan");
    assert.deepEqual(serieslan, {
      id: "serieslan",
      name: "SeriesLan",
      enabled: true,
      disabledReason: null,
      supportsMovies: false,
      supportsSeries: true,
    });

    const reqCookieGnula = new NextRequest("http://localhost:3000/api/v1/providers", {
      headers: {
        authorization: "Bearer tok_1",
        cookie: "liss_provider=gnula",
      },
    });
    const resCookieGnula = await getProvidersRoute(reqCookieGnula);
    const jsonCookieGnula = await resCookieGnula.json();
    assert.equal(jsonCookieGnula.activeProvider, "gnula");

    // Disabled cookie falls back to megadede
    const disabledPayload = getProvidersPayload("solo-latino");
    assert.equal(disabledPayload.activeProvider, "megadede");
  });
});

test("GET /api/v1/catalog validates page, normalizes filters, prioritizes search, and returns items", async () => {
  let lastQuery: DriverQuery | undefined;
  let lastProviderUsed = "";

  const makeMockDriver = (id: string, name: string): MovieDriver => ({
    id,
    name,
    async getAll(query?: DriverQuery): Promise<Movies> {
      lastProviderUsed = id;
      lastQuery = query;
      return {
        movies: [
          {
            id: "origen-2010",
            link: "/pelicula/origen-2010",
            image: "https://img.example.com/poster.jpg",
            rating: "8.8",
            title: "Origen",
            year: "2010",
            type: "movie",
          },
        ],
        lastPageNumber: 4,
      };
    },
    async getDetail() {
      return undefined;
    },
    async getUrl() {
      return {};
    },
  });

  await withMockedPocketBase(200, async () => {
    await withMockedDrivers(
      {
        megadede: makeMockDriver("megadede", "Megadede"),
        serieslan: makeMockDriver("serieslan", "SeriesLan"),
        gnula: makeMockDriver("gnula", "Gnula HD"),
      },
      async () => {
        // Unauthorized check
        const unauthRes = await getCatalogRoute(
          new NextRequest("http://localhost:3000/api/v1/catalog"),
        );
        assert.equal(unauthRes.status, 401);

        // Invalid page checks
        for (const badPage of ["0", "-2", "abc", "1.5"]) {
          const badRes = await getCatalogRoute(
            new NextRequest(`http://localhost:3000/api/v1/catalog?page=${badPage}`, {
              headers: buildAuthHeaders("tok_cat"),
            }),
          );
          assert.equal(badRes.status, 400);
          const badBody = await badRes.json();
          assert.equal(badBody.error.code, "INVALID_REQUEST");
        }

        // Unknown provider check
        const unknownRes = await getCatalogRoute(
          new NextRequest("http://localhost:3000/api/v1/catalog?provider=no-existe", {
            headers: buildAuthHeaders("tok_cat"),
          }),
        );
        assert.equal(unknownRes.status, 404);
        const unknownBody = await unknownRes.json();
        assert.equal(unknownBody.error.code, "NOT_FOUND");

        // Normal catalog request -> computes hasMore and stamps provider
        const okRes = await getCatalogRoute(
          new NextRequest("http://localhost:3000/api/v1/catalog?provider=megadede&filter=peliculas&page=2", {
            headers: buildAuthHeaders("tok_cat"),
          }),
        );
        assert.equal(okRes.status, 200);
        const okBody = await okRes.json();
        assert.equal(okBody.provider, "megadede");
        assert.equal(okBody.lastPageNumber, 4);
        assert.equal(okBody.hasMore, true);
        assert.equal("movies" in okBody, false);
        assert.equal(okBody.items.length, 1);
        assert.equal(okBody.items[0].provider, "megadede");
        assert.equal(okBody.items[0].context, null);
        assert.deepEqual(lastQuery, { search: undefined, slug: "peliculas", pageNumber: 2 });

        // Normalizes filter=peliculas -> slug="movies" for serieslan
        await getCatalogRoute(
          new NextRequest("http://localhost:3000/api/v1/catalog?provider=serieslan&filter=peliculas", {
            headers: buildAuthHeaders("tok_cat"),
          }),
        );
        assert.equal(lastProviderUsed, "serieslan");
        assert.deepEqual(lastQuery, { search: undefined, slug: "movies", pageNumber: 1 });

        // Search overrides filter
        await getCatalogRoute(
          new NextRequest(
            "http://localhost:3000/api/v1/catalog?provider=serieslan&filter=peliculas&search=naruto&page=1",
            { headers: buildAuthHeaders("tok_cat") },
          ),
        );
        assert.deepEqual(lastQuery, { search: "naruto", slug: undefined, pageNumber: 1 });

        // filter=home normalizes to undefined
        await getCatalogRoute(
          new NextRequest("http://localhost:3000/api/v1/catalog?provider=gnula&filter=home", {
            headers: buildAuthHeaders("tok_cat"),
          }),
        );
        assert.deepEqual(lastQuery, { search: undefined, slug: undefined, pageNumber: 1 });
      },
    );
  });
});

test("getCatalogPayload returns 502 UPSTREAM_ERROR when driver returns undefined or throws", async () => {
  await assert.rejects(
    () =>
      getCatalogPayload(
        { provider: "megadede", page: 1 },
        {
          getAvailableProviders: () => [{ id: "megadede", name: "Megadede" }],
          resolveDriver: () => ({
            id: "megadede",
            name: "Megadede",
            async getAll() {
              return undefined;
            },
            async getDetail() {
              return undefined;
            },
            async getUrl() {
              return {};
            },
          }),
        },
      ),
    (err: unknown) => err instanceof V1ApiError && err.status === 502 && err.code === "UPSTREAM_ERROR",
  );
});

test("GET /api/v1/detail validates link, infers provider, and returns full MediaDetail", async () => {
  let detailProviderCalled = "";
  const makeDetailDriver = (id: string, name: string, detail?: Omit<StoredMovie, "link" | "updatedAt">): MovieDriver => ({
    id,
    name,
    async getAll() {
      return undefined;
    },
    async getDetail() {
      detailProviderCalled = id;
      return detail;
    },
    async getUrl() {
      return {};
    },
  });

  await withMockedPocketBase(200, async () => {
    // Missing link -> 400
    const missingLinkRes = await getDetailRoute(
      new NextRequest("http://localhost:3000/api/v1/detail", {
        headers: buildAuthHeaders("tok_det"),
      }),
    );
    assert.equal(missingLinkRes.status, 400);
    const missingBody = await missingLinkRes.json();
    assert.equal(missingBody.error.code, "INVALID_REQUEST");

    await withMockedDrivers(
      {
        gnula: makeDetailDriver("gnula", "Gnula HD", {
          title: "Breaking Bad",
          image: "https://img/p.jpg",
          backgroundImage: "https://img/b.jpg",
          rating: "9.5",
          year: "2008",
          duration: "47 min",
          tags: ["Drama"],
          caption: "Sinopsis",
          context: { id: "4512", t: "9a8b" },
          episodes: [
            {
              season: "1",
              episodes: [
                {
                  link: "/serie/breaking-bad#s1-e1",
                  title: "Piloto",
                  image: "https://img/e1.jpg",
                  numberEpisode: "1",
                  caption: "2008-01-20",
                  context: { season: "1", episode: "1" },
                },
              ],
            },
          ],
        }),
        megadede: makeDetailDriver("megadede", "Megadede", undefined),
      },
      async () => {
        // Explicit provider not found -> 404
        const notFoundRes = await getDetailRoute(
          new NextRequest("http://localhost:3000/api/v1/detail?link=/pelicula/inexistente&provider=megadede", {
            headers: buildAuthHeaders("tok_det"),
          }),
        );
        assert.equal(notFoundRes.status, 404);
        const nfBody = await notFoundRes.json();
        assert.equal(nfBody.error.code, "NOT_FOUND");

        // Infers gnula from /ver/... link when provider is omitted
        const gnulaRes = await getDetailRoute(
          new NextRequest("http://localhost:3000/api/v1/detail?link=/ver/breaking-bad", {
            headers: buildAuthHeaders("tok_det"),
          }),
        );
        assert.equal(gnulaRes.status, 200);
        assert.equal(detailProviderCalled, "gnula");
        const detailJson = await gnulaRes.json();
        assert.equal(detailJson.link, "/ver/breaking-bad");
        assert.equal(detailJson.provider, "gnula");
        assert.equal(detailJson.type, "serie");
        assert.equal(detailJson.episodes.length, 1);
        assert.equal(detailJson.episodes[0].episodes[0].title, "Piloto");
        assert.equal(typeof detailJson.updatedAt, "string");
      },
    );
  });
});

test("getDetailPayload infers provider from SQLite movie.store when link lacks URL hints", async () => {
  const testLink = "/pelicula/test-v1-sqlite-hint";
  remove("gnula", testLink);
  upsert("gnula", testLink, {
    title: "Test SQLite Title",
    provider: "gnula",
  });

  try {
    let calledId = "";
    const detail = await getDetailPayload(
      { link: testLink },
      {
        getAvailableProviders: () => [
          { id: "megadede", name: "Megadede" },
          { id: "gnula", name: "Gnula HD" },
        ],
        resolveDriver: (id = "megadede") => ({
          id,
          name: id,
          async getAll() {
            return undefined;
          },
          async getDetail() {
            calledId = id;
            return {
              title: "Test SQLite Title",
              provider: id,
            };
          },
          async getUrl() {
            return {};
          },
        }),
      },
    );
    assert.equal(calledId, "gnula");
    assert.equal(detail.link, testLink);
    assert.equal(detail.provider, "gnula");
    assert.equal(detail.type, "movie");
    assert.deepEqual(detail.tags, []);
    assert.deepEqual(detail.episodes, []);
  } finally {
    remove("gnula", testLink);
  }
});

test("POST /api/v1/stream validates body and resolves stream with headers and referer", async () => {
  let receivedPath = "";
  let receivedOptions: GetUrlOptions | undefined;

  const mockGnulaDriver: MovieDriver = {
    id: "gnula",
    name: "Gnula HD",
    async getAll() {
      return undefined;
    },
    async getDetail() {
      return undefined;
    },
    async getUrl(path: string, options?: GetUrlOptions): Promise<Url> {
      receivedPath = path;
      receivedOptions = options;
      return {
        url: "/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fmaster.m3u8&referer=https%3A%2F%2Fgnula.life%2F",
        fallbackUrl: "https://backup.example.com/master.m3u8",
        headers: { Referer: "https://gnula.life/" },
        directSegments: true,
      };
    },
  };

  await withMockedPocketBase(200, async () => {
    await withMockedDrivers({ gnula: mockGnulaDriver }, async () => {
      // Unauthenticated -> 401
      const unauth = await postStreamRoute(
        new NextRequest("http://localhost:3000/api/v1/stream", {
          method: "POST",
          body: JSON.stringify({ link: "/pelicula/origen" }),
        }),
      );
      assert.equal(unauth.status, 401);

      // Malformed JSON -> 400
      const badJson = await postStreamRoute(
        new NextRequest("http://localhost:3000/api/v1/stream", {
          method: "POST",
          headers: buildAuthHeaders("tok_s", { "content-type": "application/json" }),
          body: "{not-json",
        }),
      );
      assert.equal(badJson.status, 400);

      // Missing link -> 400
      const noLink = await postStreamRoute(
        new NextRequest("http://localhost:3000/api/v1/stream", {
          method: "POST",
          headers: buildAuthHeaders("tok_s", { "content-type": "application/json" }),
          body: JSON.stringify({ provider: "gnula" }),
        }),
      );
      assert.equal(noLink.status, 400);
      assert.equal((await noLink.json()).error.code, "INVALID_REQUEST");

      // Non-object detailContext -> 400
      const badContext = await postStreamRoute(
        new NextRequest("http://localhost:3000/api/v1/stream", {
          method: "POST",
          headers: buildAuthHeaders("tok_s", { "content-type": "application/json" }),
          body: JSON.stringify({ link: "/pelicula/origen", detailContext: ["bad"] }),
        }),
      );
      assert.equal(badContext.status, 400);

      // Unknown provider -> 404
      const unknownProv = await postStreamRoute(
        new NextRequest("http://localhost:3000/api/v1/stream", {
          method: "POST",
          headers: buildAuthHeaders("tok_s", { "content-type": "application/json" }),
          body: JSON.stringify({ link: "/pelicula/origen", provider: "desconocido" }),
        }),
      );
      assert.equal(unknownProv.status, 404);
      assert.equal((await unknownProv.json()).error.code, "NOT_FOUND");

      // Valid request forwarding detailContext, params, language, season, episode
      const okRes = await postStreamRoute(
        new NextRequest("http://localhost:3000/api/v1/stream", {
          method: "POST",
          headers: buildAuthHeaders("tok_s", { "content-type": "application/json" }),
          body: JSON.stringify({
            link: "/serie/breaking-bad#s1-e1",
            provider: "gnula",
            season: "1",
            episode: "1",
            language: "latino",
            serverId: "vidara",
            detailContext: { id: "4512", t: "tok123" },
            params: { season: "1", episode: "1" },
          }),
        }),
      );
      assert.equal(okRes.status, 200);
      const streamJson = await okRes.json();
      assert.equal(
        streamJson.url,
        "/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fmaster.m3u8&referer=https%3A%2F%2Fgnula.life%2F",
      );
      assert.equal(streamJson.fallbackUrl, "https://backup.example.com/master.m3u8");
      assert.equal(streamJson.directSegments, true);
      assert.equal(streamJson.referer, "https://gnula.life/");
      assert.deepEqual(streamJson.headers, { Referer: "https://gnula.life/" });
      assert.equal(receivedPath, "/serie/breaking-bad#s1-e1");
      assert.equal(receivedOptions?.season, "1");
      assert.equal(receivedOptions?.episode, "1");
      assert.equal(receivedOptions?.language, "latino");
      assert.equal(receivedOptions?.serverId, "vidara");
      assert.equal(receivedOptions?.params?.lang, "latino");
      assert.equal(receivedOptions?.detailContext?.id, "4512");
      assert.equal(receivedOptions?.detailContext?.provider, "gnula");
    });
  });
});

test("getStreamPayload maps empty source, unavailability errors, and timeouts cleanly", async () => {
  // Empty URL + fallbackUrl -> 422 STREAM_UNAVAILABLE
  await assert.rejects(
    () =>
      getStreamPayload(
        { link: "/pelicula/empty", provider: "megadede" },
        {
          getAvailableProviders: () => [{ id: "megadede", name: "Megadede" }],
          resolveDriver: () => ({
            id: "megadede",
            name: "Megadede",
            async getAll() {
              return undefined;
            },
            async getDetail() {
              return undefined;
            },
            async getUrl() {
              return { url: null, fallbackUrl: null };
            },
          }),
          streamAttempts: 1,
          streamRetryDelayMs: 0,
        },
      ),
    (err: unknown) =>
      err instanceof V1ApiError && err.status === 422 && err.code === "STREAM_UNAVAILABLE",
  );

  // Driver reports no playable streams -> 422 STREAM_UNAVAILABLE
  await assert.rejects(
    () =>
      getStreamPayload(
        { link: "/pelicula/no-stream", provider: "megadede" },
        {
          getAvailableProviders: () => [{ id: "megadede", name: "Megadede" }],
          resolveDriver: () => ({
            id: "megadede",
            name: "Megadede",
            async getAll() {
              return undefined;
            },
            async getDetail() {
              return undefined;
            },
            async getUrl() {
              throw new Error("[Megadede] Could not extract any playable HLS stream");
            },
          }),
          streamAttempts: 1,
          streamRetryDelayMs: 0,
        },
      ),
    (err: unknown) =>
      err instanceof V1ApiError && err.status === 422 && err.code === "STREAM_UNAVAILABLE",
  );

  // Timeout -> 502 UPSTREAM_ERROR
  await assert.rejects(
    () =>
      getStreamPayload(
        { link: "/pelicula/slow", provider: "megadede" },
        {
          getAvailableProviders: () => [{ id: "megadede", name: "Megadede" }],
          resolveDriver: () => ({
            id: "megadede",
            name: "Megadede",
            async getAll() {
              return undefined;
            },
            async getDetail() {
              return undefined;
            },
            async getUrl() {
              return await new Promise<Url>((resolve) => {
                setTimeout(() => resolve({ url: "https://late.m3u8" }), 100);
              });
            },
          }),
          streamTimeoutMs: 10,
          streamAttempts: 1,
          streamRetryDelayMs: 0,
        },
      ),
    (err: unknown) =>
      err instanceof V1ApiError && err.status === 502 && err.code === "UPSTREAM_ERROR",
  );
});

test("getStreamPayload enforces total timeout budget across retries and short-circuits 404/timeout", async () => {
  let slowCalls = 0;
  await assert.rejects(
    () =>
      getStreamPayload(
        { link: "/pelicula/hang", provider: "megadede" },
        {
          getAvailableProviders: () => [{ id: "megadede", name: "Megadede" }],
          resolveDriver: () => ({
            id: "megadede",
            name: "Megadede",
            async getAll() {
              return undefined;
            },
            async getDetail() {
              return undefined;
            },
            async getUrl() {
              slowCalls++;
              return await new Promise<Url>((resolve) => {
                setTimeout(() => resolve({ url: "https://late.m3u8" }), 120);
              });
            },
          }),
          streamTimeoutMs: 15,
          streamAttempts: 3,
          streamRetryDelayMs: 5,
        },
      ),
    (err: unknown) =>
      err instanceof V1ApiError && err.status === 502 && err.code === "UPSTREAM_ERROR",
  );
  assert.equal(slowCalls, 1);

  let notFoundCalls = 0;
  await assert.rejects(
    () =>
      getStreamPayload(
        { link: "/serie/missing#s1-e1", provider: "serieslan" },
        {
          getAvailableProviders: () => [{ id: "serieslan", name: "SeriesLan" }],
          resolveDriver: () => ({
            id: "serieslan",
            name: "SeriesLan",
            async getAll() {
              return undefined;
            },
            async getDetail() {
              return undefined;
            },
            async getUrl() {
              notFoundCalls++;
              throw new Error('[SeriesLan] Failed to fetch player at "https://player" with status 404');
            },
          }),
          streamTimeoutMs: 1000,
          streamAttempts: 3,
          streamRetryDelayMs: 5,
        },
      ),
    (err: unknown) =>
      err instanceof V1ApiError && err.status === 404 && err.code === "NOT_FOUND",
  );
  assert.equal(notFoundCalls, 1);
});

test("getStreamPayload handles whitespace primary url, driver-specific 422/502 errors, and findProviderByLink", async () => {
  // Whitespace-only primary url with valid fallbackUrl -> url becomes null
  const fallbackOnly = await getStreamPayload(
    { link: "/pelicula/fallback", provider: "megadede" },
    {
      getAvailableProviders: () => [{ id: "megadede", name: "Megadede" }],
      resolveDriver: () => ({
        id: "megadede",
        name: "Megadede",
        async getAll() {
          return undefined;
        },
        async getDetail() {
          return undefined;
        },
        async getUrl() {
          return {
            url: "   ",
            fallbackUrl: "https://cdn2.example.com/master.m3u8",
            headers: { referer: "https://host.example/" },
          };
        },
      }),
      streamAttempts: 1,
      streamRetryDelayMs: 0,
    },
  );
  assert.equal(fallbackOnly.url, null);
  assert.equal(fallbackOnly.fallbackUrl, "https://cdn2.example.com/master.m3u8");
  assert.equal(fallbackOnly.referer, "https://host.example/");

  // Driver-specific missing tokens / keys -> 422 STREAM_UNAVAILABLE; HTTP 403 -> 502 UPSTREAM_ERROR
  for (const msg of [
    "[Gnula] Failed to extract player tokens for /ver/test",
    "[Megadede] Missing cryptographic keys in player endpoint: /vidurl/123",
    "[Megadede] Failed to parse dataLink array in /vidurl/123",
  ]) {
    await assert.rejects(
      () =>
        getStreamPayload(
          { link: "/pelicula/x", provider: "gnula" },
          {
            getAvailableProviders: () => [{ id: "gnula", name: "Gnula HD" }],
            resolveDriver: () => ({
              id: "gnula",
              name: "Gnula HD",
              async getAll() {
                return undefined;
              },
              async getDetail() {
                return undefined;
              },
              async getUrl() {
                throw new Error(msg);
              },
            }),
            streamAttempts: 1,
            streamRetryDelayMs: 0,
          },
        ),
      (err: unknown) =>
        err instanceof V1ApiError && err.status === 422 && err.code === "STREAM_UNAVAILABLE",
    );
  }

  await assert.rejects(
    () =>
      getStreamPayload(
        { link: "/pelicula/cf-blocked", provider: "gnula" },
        {
          getAvailableProviders: () => [{ id: "gnula", name: "Gnula HD" }],
          resolveDriver: () => ({
            id: "gnula",
            name: "Gnula HD",
            async getAll() {
              return undefined;
            },
            async getDetail() {
              return undefined;
            },
            async getUrl() {
              const err = new Error("[Gnula] Player endpoint returned HTTP 403") as Error & { statusCode?: number };
              err.statusCode = 403;
              throw err;
            },
          }),
          streamAttempts: 1,
          streamRetryDelayMs: 0,
        },
      ),
    (err: unknown) =>
      err instanceof V1ApiError && err.status === 502 && err.code === "UPSTREAM_ERROR",
  );

  // findProviderByLink fallback + legacy sololatino normalization
  let calledProvider = "";
  const streamFromHint = await getStreamPayload(
    { link: "/pelicula/inferred-by-store" },
    {
      getAvailableProviders: () => [
        { id: "megadede", name: "Megadede" },
        { id: "seriesmetro", name: "SeriesMetro" },
      ],
      getAnyStored: () => undefined,
      inferProvider: () => undefined,
      findProviderByLink: () => "seriesmetro",
      resolveDriver: (id = "megadede") => ({
        id,
        name: id,
        async getAll() {
          return undefined;
        },
        async getDetail() {
          return undefined;
        },
        async getUrl() {
          calledProvider = id;
          return { url: "https://cdn.example.com/sm.m3u8" };
        },
      }),
      streamAttempts: 1,
      streamRetryDelayMs: 0,
    },
  );
  assert.equal(calledProvider, "seriesmetro");
  assert.equal(streamFromHint.url, "https://cdn.example.com/sm.m3u8");
});

test("catalog and detail coerce non-string fields, normalize gnula movies filter, and accept legacy sololatino id", async () => {
  let receivedSlug: string | undefined;
  let resolvedProvider = "";

  const catalog = await getCatalogPayload(
    { provider: "gnula", filter: "movies", page: 1 },
    {
      getAvailableProviders: () => [{ id: "gnula", name: "Gnula HD" }],
      resolveDriver: () => ({
        id: "gnula",
        name: "Gnula HD",
        async getAll(q) {
          receivedSlug = q?.slug;
          return {
            movies: [
              {
                id: 123 as unknown as string,
                link: "/pelicula/num-fields",
                image: "https://img/a.jpg",
                rating: 8.7 as unknown as string,
                title: "Test",
                year: 2025 as unknown as string,
                context: ["invalid-array"] as unknown as Record<string, unknown>,
              },
            ],
            lastPageNumber: 1,
          };
        },
        async getDetail() {
          return undefined;
        },
        async getUrl() {
          return {};
        },
      }),
    },
  );
  assert.equal(receivedSlug, "peliculas");
  assert.equal(catalog.items[0].id, "123");
  assert.equal(catalog.items[0].rating, "8.7");
  assert.equal(catalog.items[0].year, "2025");
  assert.equal(catalog.items[0].context, null);

  const detail = await getDetailPayload(
    { link: "/pelicula/legacy-sololatino", provider: "sololatino" },
    {
      getAvailableProviders: () => [{ id: "solo-latino", name: "Solo Latino" }],
      resolveDriver: (id = "") => ({
        id,
        name: id,
        async getAll() {
          return undefined;
        },
        async getDetail() {
          resolvedProvider = id;
          return {
            title: "Legacy",
            year: 2024 as unknown as string,
            rating: 7.5 as unknown as string,
            tags: ["Acción", null as unknown as string, 99 as unknown as string],
            context: "not-object" as unknown as Record<string, unknown>,
          };
        },
        async getUrl() {
          return {};
        },
      }),
    },
  );
  assert.equal(resolvedProvider, "solo-latino");
  assert.equal(detail.provider, "solo-latino");
  assert.equal(detail.year, "2024");
  assert.equal(detail.rating, "7.5");
  assert.deepEqual(detail.tags, ["Acción", "99"]);
  assert.equal(detail.context, null);
});
