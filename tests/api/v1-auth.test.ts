import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  clearPbAuthCache,
  extractPbToken,
  hashPbToken,
  PB_AUTH_CACHE_TTL_MS,
  requireV1Auth,
  resolvePocketBaseUrl,
  verifyPbToken,
} from "../../services/v1-auth.service.ts";

function buildEncodedCookie(token: string, userId = "user_1"): string {
  return encodeURIComponent(JSON.stringify({ token, model: { id: userId } }));
}

test("extractPbToken prioritizes Authorization Bearer over pb_auth cookie", () => {
  const req = new NextRequest("http://localhost:3000/api/v1/providers", {
    headers: {
      authorization: "Bearer header_token_123",
      cookie: `pb_auth=${buildEncodedCookie("cookie_token_456")}`,
    },
  });

  assert.equal(extractPbToken(req), "header_token_123");
});

test("extractPbToken handles case-insensitive Bearer scheme and trims whitespace", () => {
  const req = new NextRequest("http://localhost:3000/api/v1/providers", {
    headers: {
      authorization: "bearer   tok_abc_999   ",
    },
  });

  assert.equal(extractPbToken(req), "tok_abc_999");
});

test("extractPbToken falls back to URI-encoded pb_auth cookie when Authorization is absent or non-Bearer", () => {
  const reqNoAuth = new NextRequest("http://localhost:3000/api/v1/providers", {
    headers: {
      cookie: `pb_auth=${buildEncodedCookie("cookie_tok_111")}`,
    },
  });
  assert.equal(extractPbToken(reqNoAuth), "cookie_tok_111");

  const reqBasicAuth = new NextRequest("http://localhost:3000/api/v1/providers", {
    headers: {
      authorization: "Basic dXNlcjpwYXNz",
      cookie: `pb_auth=${buildEncodedCookie("cookie_tok_222")}`,
    },
  });
  assert.equal(extractPbToken(reqBasicAuth), "cookie_tok_222");
});

test("extractPbToken accepts raw JSON pb_auth cookie and rejects malformed values", () => {
  const reqRawJson = new NextRequest("http://localhost:3000/api/v1/providers", {
    headers: {
      cookie: `pb_auth=${JSON.stringify({ token: "raw_json_tok" })}`,
    },
  });
  assert.equal(extractPbToken(reqRawJson), "raw_json_tok");

  const reqMalformed = new NextRequest("http://localhost:3000/api/v1/providers", {
    headers: {
      cookie: "pb_auth=not-valid-json",
    },
  });
  assert.equal(extractPbToken(reqMalformed), null);

  const reqEmptyToken = new NextRequest("http://localhost:3000/api/v1/providers", {
    headers: {
      cookie: `pb_auth=${buildEncodedCookie("   ")}`,
    },
  });
  assert.equal(extractPbToken(reqEmptyToken), null);
});

test("verifyPbToken validates against PocketBase auth-refresh and caches valid tokens for <= 30s", async () => {
  clearPbAuthCache();
  let calls = 0;
  const capturedCalls: Array<{ url: string; method?: string; auth?: string; cache?: RequestCache }> = [];

  const mockFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls++;
    const headers = new Headers(init?.headers);
    capturedCalls.push({
      url: String(input),
      method: init?.method,
      auth: headers.get("Authorization") ?? undefined,
      cache: init?.cache,
    });
    return new Response(JSON.stringify({ token: "fresh" }), { status: 200 });
  }) as typeof fetch;

  const t0 = 1_000_000;
  const valid1 = await verifyPbToken("tok_valid_1", {
    fetchFn: mockFetch,
    pbUrl: "https://pb.example.test/",
    now: t0,
  });
  assert.equal(valid1, true);
  assert.equal(calls, 1);
  assert.equal(capturedCalls[0].url, "https://pb.example.test/api/collections/users/auth-refresh");
  assert.equal(capturedCalls[0].method, "POST");
  assert.equal(capturedCalls[0].auth, "Bearer tok_valid_1");
  assert.equal(capturedCalls[0].cache, "no-store");

  // Within 30s TTL -> cache hit, no extra fetch
  const valid2 = await verifyPbToken("tok_valid_1", {
    fetchFn: mockFetch,
    pbUrl: "https://pb.example.test",
    now: t0 + PB_AUTH_CACHE_TTL_MS - 1,
  });
  assert.equal(valid2, true);
  assert.equal(calls, 1);

  // At or past 30s TTL -> re-validates
  const valid3 = await verifyPbToken("tok_valid_1", {
    fetchFn: mockFetch,
    pbUrl: "https://pb.example.test",
    now: t0 + PB_AUTH_CACHE_TTL_MS,
  });
  assert.equal(valid3, true);
  assert.equal(calls, 2);

  // Different PB URL -> does not reuse cache from another environment
  const valid4 = await verifyPbToken("tok_valid_1", {
    fetchFn: mockFetch,
    pbUrl: "https://pb-other.example.test",
    now: t0 + PB_AUTH_CACHE_TTL_MS + 100,
  });
  assert.equal(valid4, true);
  assert.equal(calls, 3);
});

test("verifyPbToken does not cache 401 or network errors and invalidates previous entry", async () => {
  clearPbAuthCache();
  let calls = 0;
  let shouldSucceed = false;

  const mockFetch = (async () => {
    calls++;
    if (shouldSucceed) {
      return new Response("{}", { status: 200 });
    }
    return new Response("{}", { status: 401 });
  }) as typeof fetch;

  const res1 = await verifyPbToken("tok_bad", {
    fetchFn: mockFetch,
    pbUrl: "https://pb.example.test",
    now: 5000,
  });
  assert.equal(res1, false);
  assert.equal(calls, 1);

  // Still calls fetch on retry because failed checks are never cached
  shouldSucceed = true;
  const res2 = await verifyPbToken("tok_bad", {
    fetchFn: mockFetch,
    pbUrl: "https://pb.example.test",
    now: 5100,
  });
  assert.equal(res2, true);
  assert.equal(calls, 2);

  // Network error returns false safely
  const throwingFetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  const resErr = await verifyPbToken("tok_network_err", {
    fetchFn: throwingFetch,
    pbUrl: "https://pb.example.test",
    now: 5200,
  });
  assert.equal(resErr, false);
});

test("hashPbToken produces deterministic SHA-256 hex digest", () => {
  const hash = hashPbToken("secret-token");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, hashPbToken("secret-token"));
  assert.notEqual(hash, hashPbToken("other-token"));
});

test("requireV1Auth returns standardized 401 JSON envelope when missing or rejected", async () => {
  clearPbAuthCache();

  const missingReq = new NextRequest("http://localhost:3000/api/v1/providers");
  const missingAuth = await requireV1Auth(missingReq);
  assert.equal(missingAuth.ok, false);
  if (!missingAuth.ok) {
    assert.equal(missingAuth.response.status, 401);
    const body = await missingAuth.response.json();
    assert.equal(body.error.code, "UNAUTHORIZED");
    assert.equal(typeof body.error.message, "string");
  }

  const invalidReq = new NextRequest("http://localhost:3000/api/v1/providers", {
    headers: { authorization: "Bearer expired_tok" },
  });
  const invalidAuth = await requireV1Auth(invalidReq, {
    pbUrl: "https://pb.example.test",
    fetchFn: (async () => new Response("{}", { status: 401 })) as typeof fetch,
  });
  assert.equal(invalidAuth.ok, false);
  if (!invalidAuth.ok) {
    assert.equal(invalidAuth.response.status, 401);
    const body = await invalidAuth.response.json();
    assert.equal(body.error.code, "UNAUTHORIZED");
  }
});

test("resolvePocketBaseUrl honors runtime POCKETBASE_URL and NEXT_PUBLIC_POCKETBASE_URL overrides", () => {
  const prevPublic = process.env.NEXT_PUBLIC_POCKETBASE_URL;
  const prevPrivate = process.env.POCKETBASE_URL;
  try {
    delete process.env.POCKETBASE_URL;
    process.env.NEXT_PUBLIC_POCKETBASE_URL = "https://pb-runtime.example.test///";
    assert.equal(resolvePocketBaseUrl(), "https://pb-runtime.example.test");

    process.env.POCKETBASE_URL = "http://127.0.0.1:8099/";
    assert.equal(resolvePocketBaseUrl(), "http://127.0.0.1:8099");
    assert.equal(resolvePocketBaseUrl("https://explicit.example.test/"), "https://explicit.example.test");
  } finally {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_POCKETBASE_URL;
    else process.env.NEXT_PUBLIC_POCKETBASE_URL = prevPublic;
    if (prevPrivate === undefined) delete process.env.POCKETBASE_URL;
    else process.env.POCKETBASE_URL = prevPrivate;
  }
});
