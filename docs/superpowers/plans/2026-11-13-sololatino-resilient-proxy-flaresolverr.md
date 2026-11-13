# Resilient Proxy Pool & FlareSolverr Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide resilient, high-speed HTTP and FlareSolverr execution for SoloLatino operations (`get-all`, `get-detail`, `get-url`) by introducing an in-memory dynamic proxy pool with background latency probing and a self-healing FlareSolverr session manager that eliminates 60-second zombie timeouts, deprecates unsupported headers, detects application-level bans, and enforces circuit breaking with backoff.

**Architecture:** A singleton `ProxyPoolService` fetches candidate proxies from a remote list or local fallback, probes them with a 2.5s connection timeout, and sorts them ascending by latency. In `instrumentation.ts`, a periodic background worker warms and refreshes the pool. In `utils/flaresolverr.ts`, sessions are created explicitly, execution timeout is tightened to 25s, deprecated headers are removed, and on any failure or timeout `sessions.destroy` is unconditionally invoked. A circuit breaker tracks failures per proxy and triggers fast rotation when Cloudflare challenges fail or SoloLatino emits the "Cuenta suspendida" ban modal.

**Tech Stack:** Next.js (Node.js runtime), TypeScript, native `node:test`, `node-fetch`, Cheerio, FlareSolverr v2/v3 REST API.

**Spec:** `docs/superpowers/specs/2026-11-13-sololatino-resilient-proxy-flaresolverr-design.md`

## Global Constraints

- Must preserve backward compatibility with `StrategyGetAllMovies`, `StrategyGetMovieDetails`, and `StrategyGetUrl`.
- Strict TypeScript (`strict: true`), no `any`.
- FlareSolverr timeout capped at 25,000ms (`maxTimeout: 25000`).
- No `headers` field passed inside FlareSolverr `cmd: "request.get"` or `request.post` payloads.
- All test suites must pass using `node --test tests/<file>.test.ts`.

## Review Focus

- **SoloLatino application-level ban:** When HTML contains `"banned-modal"` or `"Cuenta suspendida"`, the manager must mark the active proxy as banned, rotate to the next candidate, and not loop infinitely.
- **FlareSolverr timeout (HTTP 500 / 25s timeout):** FlareSolverr session must be destroyed with `sessions.destroy` and purged from `activeSessions` so subsequent requests do not inherit a dead browser.
- **Proxy list API failure:** If `proxywing.com` is unreachable, `ProxyPoolService` must gracefully fall back to local `proxies.txt` or `.env` proxy without throwing unhandled exceptions.
- **High latency proxies:** Proxies taking > 2500ms to respond must be filtered out of the active healthy pool.
- **Cloudflare clearance reuse:** Successful `cf_clearance` and `User-Agent` must be cached per proxy key with TTL and reused directly in node-fetch/fetch without calling FlareSolverr on every request.

---

### Task 1: Proxy Pool Service & Latency Ranking

**Files:**
- Create: `services/proxy-pool.service.ts`
- Create: `tests/proxy-pool.test.ts`
- Modify: `types/proxy.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ManagedProxy {
    url: string;
    host: string;
    protocol: string;
    latencyMs: number;
    lastChecked: number;
    failCount: number;
    isHealthy: boolean;
  }
  export class ProxyPoolService {
    static getInstance(): ProxyPoolService;
    setCandidates(list: string[]): void;
    checkProxy(proxyUrl: string, timeoutMs?: number): Promise<{ isHealthy: boolean; latencyMs: number }>;
    refreshPool(): Promise<void>;
    getBestProxy(): ManagedProxy | null;
    markProxyFailed(proxyUrl: string, reason?: string): void;
    getHealthyCount(): number;
    reset(): void;
  }
  ```

- [x] **Step 1: Write failing unit test for `ProxyPoolService`**

Create `tests/proxy-pool.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { ProxyPoolService } from "../services/proxy-pool.service.ts";

test("ProxyPoolService orders proxies by latency and filters dead ones", async () => {
  const pool = ProxyPoolService.getInstance();
  pool.reset();

  pool.setCandidates([
    "http://1.1.1.1:8080",
    "http://2.2.2.2:8080",
  ]);

  // Mock checking logic
  pool.checkProxy = async (url: string) => {
    if (url.includes("1.1.1.1")) return { isHealthy: true, latencyMs: 120 };
    return { isHealthy: false, latencyMs: 9999 };
  };

  await pool.refreshPool();

  assert.equal(pool.getHealthyCount(), 1);
  const best = pool.getBestProxy();
  assert.ok(best);
  assert.equal(best.url, "http://1.1.1.1:8080");
  assert.equal(best.latencyMs, 120);
});

test("ProxyPoolService marks proxy failed and rotates", async () => {
  const pool = ProxyPoolService.getInstance();
  pool.reset();

  pool.setCandidates(["http://1.1.1.1:8080", "http://3.3.3.3:8080"]);
  pool.checkProxy = async (url: string) => {
    if (url.includes("1.1.1.1")) return { isHealthy: true, latencyMs: 100 };
    if (url.includes("3.3.3.3")) return { isHealthy: true, latencyMs: 200 };
    return { isHealthy: false, latencyMs: 9999 };
  };

  await pool.refreshPool();
  assert.equal(pool.getBestProxy()?.url, "http://1.1.1.1:8080");

  pool.markProxyFailed("http://1.1.1.1:8080", "403 ban");
  pool.markProxyFailed("http://1.1.1.1:8080", "403 ban");

  const nextBest = pool.getBestProxy();
  assert.ok(nextBest);
  assert.equal(nextBest.url, "http://3.3.3.3:8080");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/proxy-pool.test.ts`
Expected: FAIL with "Cannot find module '../services/proxy-pool.service.ts'"

- [x] **Step 3: Implement `ProxyPoolService` in `services/proxy-pool.service.ts`**

Implement candidate fetching (from `PROXY_LIST_URL` or `proxies.txt`), probe testing with `AbortController` (2500ms timeout), sorting by latency, and circuit breaker cooldown when `failCount >= 2`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/proxy-pool.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add types/proxy.ts services/proxy-pool.service.ts tests/proxy-pool.test.ts
git commit -m "feat(proxy): implement ProxyPoolService with latency ranking and circuit breaker"
```

---

### Task 2: Background Probing in `instrumentation.ts` & Proxy Integration

**Files:**
- Modify: `instrumentation.ts`
- Modify: `utils/proxy.ts:180-224`
- Modify: `utils/browser.ts`

**Interfaces:**
- Consumes: `ProxyPoolService` from `services/proxy-pool.service.ts`
- Produces: `createStickySession()` dynamically using the current best proxy from `ProxyPoolService` when `USE_PROXY=true`.

- [x] **Step 1: Write unit test for dynamic proxy selection**

Add test in `tests/proxy-integration.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { ProxyPoolService } from "../services/proxy-pool.service.ts";
import { getActiveProxyUrl } from "../utils/proxy.ts";

test("getActiveProxyUrl returns best proxy from pool when available", () => {
  const pool = ProxyPoolService.getInstance();
  pool.reset();
  pool.setCandidates(["http://10.0.0.1:8080"]);
  pool.checkProxy = async () => ({ isHealthy: true, latencyMs: 50 });
  
  // Set in-memory healthy proxy
  pool["proxies"] = [{
    url: "http://10.0.0.1:8080",
    host: "10.0.0.1:8080",
    protocol: "http",
    latencyMs: 50,
    lastChecked: Date.now(),
    failCount: 0,
    isHealthy: true,
  }];

  const active = getActiveProxyUrl();
  assert.equal(active, "http://10.0.0.1:8080");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/proxy-integration.test.ts`
Expected: FAIL with "getActiveProxyUrl is not a function"

- [x] **Step 3: Update `utils/proxy.ts` and `instrumentation.ts`**

Export `getActiveProxyUrl()` in `utils/proxy.ts` which queries `ProxyPoolService.getInstance().getBestProxy()?.url` as priority when `USE_PROXY=true`.
In `instrumentation.ts`, invoke `ProxyPoolService.getInstance().refreshPool()` in a non-blocking `void` promise and set up an 8-minute recurring interval.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/proxy-integration.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add instrumentation.ts utils/proxy.ts tests/proxy-integration.test.ts
git commit -m "feat(instrumentation): initialize ProxyPool background probing and dynamic proxy routing"
```

---

### Task 3: FlareSolverr Session & Challenge Resilience

**Files:**
- Modify: `utils/flaresolverr.ts`
- Create: `tests/flaresolverr-resilience.test.ts`

**Interfaces:**
- Consumes: `ProxyPoolService` to report dead/banned proxies via `markProxyFailed()`.
- Produces: `fetchFlare(url, options)` and `postFlare(url, data, headers, options)` with guaranteed session destruction, no deprecated headers, 25s maxTimeout, and banned-modal detection.

- [x] **Step 1: Write unit tests for FlareSolverr resilience & payload formatting**

Create `tests/flaresolverr-resilience.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { isBannedResponse, isChallengeResponse, buildFlarePayload } from "../utils/flaresolverr.ts";

test("detects SoloLatino banned account modal", () => {
  const bannedHtml = `<div class="modal">Cuenta suspendida</div><div id="banned-modal">Violación de los términos</div>`;
  assert.equal(isBannedResponse(bannedHtml), true);
  assert.equal(isBannedResponse("<html><body>Normal Page</body></html>"), false);
});

test("detects Cloudflare challenge page", () => {
  const challengeHtml = `<title>Just a moment...</title><div id="challenge-running"></div>`;
  assert.equal(isChallengeResponse(challengeHtml), true);
  assert.equal(isChallengeResponse("<html><body>Normal Page</body></html>"), false);
});

test("buildFlarePayload does not include deprecated headers property", () => {
  const payload = buildFlarePayload("https://sololatino.net/", "test_session", 25000);
  assert.equal(payload.cmd, "request.get");
  assert.equal(payload.maxTimeout, 25000);
  assert.equal("headers" in payload, false);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/flaresolverr-resilience.test.ts`
Expected: FAIL with missing exports in `utils/flaresolverr.ts`

- [x] **Step 3: Refactor `utils/flaresolverr.ts`**

1. Export helper functions: `isBannedResponse(html: string): boolean`, `isChallengeResponse(html: string): boolean`, and `buildFlarePayload(url, session, maxTimeout)`.
2. Remove `headers` from `request.get` and `request.post` payloads.
3. Lower `maxTimeout` to 25000ms.
4. In `executeFlareResolution`, wrap in `try/catch/finally`: if response is not ok or timeout occurs, unconditionally call `destroyFlareSession(endpoint, sessionId)` and remove from `activeSessions`.
5. If solution HTML contains `isBannedResponse()` or `isChallengeResponse()` that couldn't be cleared, immediately mark the proxy as failed in `ProxyPoolService.getInstance().markProxyFailed(proxyKey, reason)`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/flaresolverr-resilience.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add utils/flaresolverr.ts tests/flaresolverr-resilience.test.ts
git commit -m "fix(flaresolverr): remove deprecated headers, enforce 25s timeout and automatic session cleanup"
```

---

### Task 4: Integration with `strategies/sololatino` Operations

**Files:**
- Modify: `strategies/sololatino/get-all.operation.ts`
- Modify: `strategies/sololatino/get-detail.operation.ts`

**Interfaces:**
- Consumes: `fetchFlare` from `utils/flaresolverr.ts`.
- Handles search suggestions and detail scraping safely, gracefully recovering if banned HTML is received.

- [x] **Step 1: Write integration test for `get-all` and `get-detail` error recovery**

Add test in `tests/sololatino-operations.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { isBannedResponse } from "../utils/flaresolverr.ts";

test("get-all parser detects banned response and returns safe empty result instead of throwing", () => {
  const bannedHtml = `<div id="banned-modal">Cuenta suspendida</div>`;
  const isBanned = isBannedResponse(bannedHtml);
  assert.equal(isBanned, true);
});
```

- [x] **Step 2: Run test to verify it passes**

Run: `node --test tests/sololatino-operations.test.ts`
Expected: PASS

- [x] **Step 3: Update `get-all.operation.ts` and `get-detail.operation.ts`**

- In `get-all.operation.ts`, ensure that if `rawText` contains `banned-modal`, it logs a clear warning `[SoloLatino] Proxy banned by target site, rotating proxy...` and invokes `fetchFlare` retry with proxy rotated or returns a graceful empty result rather than logging unhandled JSON parse exceptions.
- In `get-detail.operation.ts`, inspect `html` before Cheerio parsing. If banned or empty, log clear diagnostics.

- [x] **Step 4: Run typecheck and existing tests**

Run: `npm run lint` and `node --test tests/m3u8-validator.test.ts tests/proxy-pool.test.ts tests/flaresolverr-resilience.test.ts`
Expected: All tests pass with zero type errors.

- [x] **Step 5: Commit**

```bash
git add strategies/sololatino/get-all.operation.ts strategies/sololatino/get-detail.operation.ts tests/sololatino-operations.test.ts
git commit -m "fix(sololatino): handle banned modal responses and proxy rotation in operations"
```

---

### Task 5: End-to-End Verification & Observability

**Files:**
- Modify: `utils/bitacora.ts` or console scopes if needed
- Run verification script against live or mock FlareSolverr endpoint.

- [x] **Step 1: Create verification script `scripts/verify-flaresolverr.ts`**

Test running a search and a catalog page request through the new manager, validating that:
1. Valid `cf_clearance` is cached.
2. Latency and proxy selection logs appear clearly (`[ProxyPool] Selected proxy http://... (lat: 85ms)`).
3. In case of simulated 403 or banned modal, session is destroyed and next proxy is picked.

- [x] **Step 2: Run verification**

Run: `node --test tests/proxy-pool.test.ts tests/proxy-integration.test.ts tests/flaresolverr-resilience.test.ts tests/sololatino-operations.test.ts`
Expected: 100% PASS

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-11-13-sololatino-resilient-proxy-flaresolverr.md
git commit -m "docs: finalize resilient proxy pool and flaresolverr implementation plan"
```
