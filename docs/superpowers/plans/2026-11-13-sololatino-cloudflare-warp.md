# Cloudflare WARP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route SoloLatino scraping and FlareSolverr requests through the local Cloudflare WARP SOCKS5 proxy to eliminate Turnstile timeouts and IP bans without relying on public proxy lists.

**Architecture:** Update `utils/proxy.ts` so that explicit environment proxy configurations (such as Cloudflare WARP at `cloudflare-warp-socks:1080` or `127.0.0.1:1080`) take precedence over the dynamic public proxy pool. The public pool is retained as an opt-in fallback when `USE_PROXY_POOL=true` or when no static proxy is defined. Configure `.env` to route through unauthenticated SOCKS5 WARP.

**Tech Stack:** Next.js (Node.js runtime), TypeScript, native `node:test`, Cloudflare WARP SOCKS5.

**Spec:** `docs/superpowers/specs/2026-11-13-sololatino-cloudflare-warp-design.md`

## Global Constraints

- Must preserve backward compatibility with `StrategyGetAllMovies`, `StrategyGetMovieDetails`, and `StrategyGetUrl`.
- Strict TypeScript (`strict: true`), no `any`.
- All test suites must pass using `node --test tests/<file>.test.ts`.

## Review Focus

- **Static vs Dynamic Precedence:** When `PROXY_HOST` is explicitly provided in `.env`, `createStickySession()` and `getActiveProxyUrl()` must return the static proxy rather than querying public proxies.
- **Unauthenticated SOCKS5 Handling:** WARP uses no username/password. The generated SOCKS5 URL must be clean (e.g. `socks5://cloudflare-warp-socks:1080` without empty `:@`).
- **FlareSolverr Payload:** `buildProxyPayload` must output `{ url: "socks5://..." }` cleanly without trailing slashes.

---

### Task 1: Proxy Precedence in `utils/proxy.ts`

**Files:**
- Modify: `utils/proxy.ts:185-225`
- Create: `tests/proxy-precedence.test.ts`

**Interfaces:**
- Produces: `getActiveProxyUrl(): string | null` and `createStickySession(): StickySession` prioritizing explicit static proxy over dynamic pool unless `USE_PROXY_POOL=true`.

- [x] **Step 1: Write failing unit test for proxy precedence**

Create `tests/proxy-precedence.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { getActiveProxyUrl, createStickySession } from "../utils/proxy.ts";
import { ProxyPoolService } from "../services/proxy-pool.service.ts";

test("prefers static PROXY_HOST (e.g. WARP) over dynamic public pool when configured", () => {
  process.env.PROXY_HOST = "cloudflare-warp-socks:1080";
  process.env.PROXY_PROTOCOL = "socks5";
  delete process.env.PROXY_USERNAME;
  delete process.env.PROXY_PASSWORD;
  delete process.env.USE_PROXY_POOL;

  // Even if pool has candidate, static proxy takes priority
  const pool = ProxyPoolService.getInstance();
  pool.reset();
  pool["proxies"] = [{
    url: "http://some-public-proxy:8080",
    host: "some-public-proxy:8080",
    protocol: "http",
    latencyMs: 10,
    lastChecked: Date.now(),
    failCount: 0,
    isHealthy: true,
  }];

  const activeUrl = getActiveProxyUrl();
  assert.equal(activeUrl, "socks5://cloudflare-warp-socks:1080");

  const session = createStickySession();
  assert.equal(session.url, "socks5://cloudflare-warp-socks:1080");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/proxy-precedence.test.ts`
Expected: FAIL because current implementation always prioritizes `dynamicBest`

- [x] **Step 3: Update `utils/proxy.ts`**

Adjust `getActiveProxyUrl()` and `createStickySession()` to first check if a static proxy config exists. If `USE_PROXY_POOL === "true"`, or if no static config exists, then query `ProxyPoolService`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/proxy-precedence.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add utils/proxy.ts tests/proxy-precedence.test.ts
git commit -m "fix(proxy): prioritize explicit static proxy over dynamic public pool"
```

---

### Task 2: Configure Environment for Cloudflare WARP

**Files:**
- Modify: `.env`

- [x] **Step 1: Update `.env` with WARP SOCKS5 configuration**

Set `USE_PROXY="true"`, `PROXY_HOST="cloudflare-warp-socks:1080"` (or `127.0.0.1:1080`), `PROXY_PROTOCOL="socks5"`, and clear usernames/passwords.

- [x] **Step 2: Run verification script**

Run: `node scripts/verify-flaresolverr.ts`
Expected: Outputs active proxy pointing to WARP SOCKS5 endpoint.

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-11-13-sololatino-cloudflare-warp.md
git commit -m "docs: finalize cloudflare warp implementation plan"
```
