# Design Document: Resilient Proxy Pool & FlareSolverr Session Management

- **Date:** 2026-11-13
- **Author:** Antigravity & Engineering Team
- **Status:** Proposed
- **Target File(s):**
  - `services/proxy-pool.service.ts` (New)
  - `instrumentation.ts`
  - `utils/flaresolverr.ts`
  - `utils/proxy.ts`
  - `strategies/sololatino/get-all.operation.ts`
  - `strategies/sololatino/get-detail.operation.ts`
  - `strategies/sololatino/get-url.operation.ts`

---

## 1. Intent & Motivation

In SoloLatino operations (`get-all`, `get-detail`, and `get-url`), scraping requests fail intermittently or permanently due to:
1. **Public Proxy Volatility:** Under `USE_PROXY=true`, proxies from free lists (`proxywing.com`) die frequently, have high latency, or get banned by SoloLatino ("Cuenta suspendida") and Cloudflare (interactive Turnstile / CAPTCHAs).
2. **FlareSolverr Zombie Sessions:** FlareSolverr hangs on dead or throttled proxies, timing out after 60 seconds (HTTP 500). The current code does not call `sessions.destroy` on timeout, leaving stuck Chromium tabs open and retrying infinitely against the same zombie session.
3. **Deprecated Request Parameters:** FlareSolverr v2+ logs warnings because `headers` in `request.get` was deprecated and ignored.
4. **Lack of Circuit Breaking & Backoff:** When Cloudflare or SoloLatino rejects a request, the app immediately retries in a tight loop with the same dead proxy, causing cascade failures.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Dynamic Proxy Pool (`services/proxy-pool.service.ts`):** Automatically fetch, health-check (timeout ≤ 3s), and rank proxies by latency from `PROXY_LIST_URL` (defaulting to the ProxyWing endpoint).
- **Background Probing via `instrumentation.ts`:** Seed and refresh the pool in the background (every 5-10 minutes) without blocking application boot.
- **Fail-Fast FlareSolverr Lifecycle:** Reduce FlareSolverr `maxTimeout` from 60s to 25s. On any timeout or error, guarantee `sessions.destroy` before recreating, preventing zombie browser sessions.
- **Clean Request Payload:** Remove deprecated `headers` from FlareSolverr request commands; apply headers only in downstream HTTP requests.
- **Circuit Breaker per Proxy:** Mark a proxy as failed/cooldown if it times out, returns HTTP 403/503 repeatedly, or receives the SoloLatino "Cuenta suspendida" modal. Instantly rotate to the next best proxy from the pool.
- **Cache & Direct HTTP Execution:** Reuse `cf_clearance` + `User-Agent` per proxy. Perform direct lightweight HTTP requests; invoke FlareSolverr only when clearance cookies expire or when Cloudflare challenge signatures are encountered.
- **Exponential Backoff with Jitter:** Prevent hot retry loops by bounding retries to ≤ 2 attempts with exponential backoff (e.g. 500ms + random jitter).
- **Telemetry:** Comprehensive logging of proxy health, latency, session lifecycle, and circuit breaker events.

### Non-Goals
- Purchasing commercial residential proxy services.
- Changing the public API contract of `StrategyGetAllMovies`, `StrategyGetMovieDetails`, or `StrategyGetUrl`.
- Altering user-facing Next.js UI components.

### Anti-Goals
- Unbounded 60-second timeouts that block user searches or page loads.
- Infinite retry loops that hammer FlareSolverr or Cloudflare.
- Crashing the server if external proxy list APIs are down (must gracefully fall back to existing env config or direct).

---

## 3. Evaluated Approaches

### Approach 1: Dynamic In-Memory Proxy Pool + Resilient Session Manager *(Selected)*
- **Description:** Implement an in-memory `ProxyPoolService` initialized in `instrumentation.ts` that probes free proxies with short timeouts, ranks them by latency, and feeds `flaresolverr.ts`. Combine with strict session cleanup (`sessions.destroy`), 25s timeout, circuit breaker on failure/ban, and cached direct HTTP.
- **Trade-offs:** Handles public proxy volatility gracefully; fails fast (2-3s instead of 60s); completely automated and decoupled.

### Approach 2: Static SOCKS5 Proxy with Manual Rotation
- **Description:** Rely solely on a single static proxy configured in `.env` or Docker WARP.
- **Trade-offs:** Rejected because public static proxies quickly get banned or die, requiring constant manual `.env` edits and container restarts.

---

## 4. Architectural Design & Implementation Details

### A. `services/proxy-pool.service.ts`
```typescript
export interface ManagedProxy {
  url: string;        // e.g. http://1.2.3.4:8080 or socks5://...
  host: string;       // 1.2.3.4:8080
  latencyMs: number;
  lastChecked: number;
  failCount: number;
  isHealthy: boolean;
}
```
- **Fetch:** Retrieves list from `PROXY_LIST_URL` or fallback.
- **Health Check:** Sends a lightweight `HEAD` or `GET` request (timeout: 2500ms) through the proxy to verify connectivity.
- **Ranking:** Sorts healthy proxies ascending by `latencyMs`.
- **Rotation & Circuit Breaker:**
  - `getBestProxy()` returns the lowest-latency healthy proxy.
  - `markProxyFailed(proxyUrl, reason)` increments `failCount`. If `failCount >= 2`, sets `isHealthy = false` for a cooldown period (e.g. 15 minutes).

### B. `instrumentation.ts`
- In `register()`, initiate non-blocking background initialization of `ProxyPoolService`.
- Schedule a periodic refresh task (every 8 minutes) to prune dead proxies and discover fresh candidates.

### C. `utils/flaresolverr.ts` Refactoring
- **Session Lifecycle:**
  - Create session: `{ cmd: "sessions.create", session: sessionId, proxy: ... }`.
  - Execute resolution: `{ cmd: "request.get", url: BASE_URL.SoloLatino, session: sessionId, maxTimeout: 25000 }` (no `headers` property).
  - On timeout / 500 error / challenge loop: catch block unconditionally dispatches `{ cmd: "sessions.destroy", session: sessionId }` and purges from `activeSessions`.
- **Response Validation:**
  - Inspect returned HTML:
    - If contains `"banned-modal"` or `"Cuenta suspendida"`: throw `ProxyBannedError`, triggering immediate proxy rotation in `ProxyPool`.
    - If contains `"Just a moment..."` or `"challenges.cloudflare.com"`: challenge was not cleared; destroy session, apply backoff, retry once with another proxy.
- **Direct HTTP Fast Path:**
  - Check `flaresolverrCache.json` for valid `cf_clearance` for the proxy key.
  - If valid, issue direct `fetch` / `nodeFetch` with cached headers.
  - If direct fetch returns 403/503 or banned modal, invalidate cache and route through `ProxyPool` rotation.

---

## 5. Verification Plan

1. **Proxy Pool Health Probing:** Unit/integration test ensuring dead proxies are filtered out within 2.5s and healthy proxies are sorted by latency.
2. **FlareSolverr Session Cleanup:** Verify that when FlareSolverr times out, `sessions.destroy` is called and `activeSessions` is cleaned.
3. **Banned Modal Handling:** Simulate SoloLatino banned HTML in `get-all` / `get-detail`; verify the proxy is marked failed and rotated without infinite loop.
4. **End-to-End Search & Detail:** Execute search query and detail extraction under `USE_PROXY=true`; confirm response returns clean data under reasonable latency.
