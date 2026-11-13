# SoloLatino Fast & Reliable URL Extraction Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Optimize `strategies/sololatino/get-url.operation.ts` to achieve reliable video URL extraction in under 5 seconds (especially for previously slow movies), prevent caching of host-bound M3U8 playlists in MinIO, and add granular execution telemetry.

**Architecture:** Replace cold Chromium launches with a shared Browser Singleton dispensing lightweight isolated contexts. Replace the polling click loop and rigid `Promise.all` with an event-driven network listener (`context.on('response')`), short reactive grace period (1.2s - 1.5s), synthetic ad overlay removal, and manifest content inspection before MinIO caching.

**Tech Stack:** Next.js, TypeScript, Playwright (playwright-extra / stealth), Node.js, MinIO Client, Got.

---

### Task 1: Implement Shared Browser Singleton in `utils/browser.ts`

**Files:**
- Modify: `utils/browser.ts`

**Step 1: Write the failing typecheck or test**

Check current export in `utils/browser.ts`:
Verify that `getSharedBrowser` does not exist yet.

**Step 2: Implement `getSharedBrowser` and `getSharedBrowserContext`**

In `utils/browser.ts`:
```typescript
let sharedBrowserInstance: ReturnType<typeof chromium.launch> extends Promise<infer B> ? B : never | null = null;

export async function getSharedBrowser() {
  if (!sharedBrowserInstance || !sharedBrowserInstance.isConnected()) {
    sharedBrowserInstance = await chromium.launch({
      headless: true,
      args: BROWSER_ARGS,
    });
  }
  return sharedBrowserInstance;
}

export async function getSharedBrowserContext(options: GetBrowserOptions = {}) {
  let anonymizedProxy = options.anonymizedProxy;
  if (!anonymizedProxy && (isProxyEnabled() || options.proxyUrl)) {
    const proxyUrl = options.proxyUrl || createStickySession().url;
    anonymizedProxy = await anonymizeProxy(proxyUrl);
  }

  const browser = await getSharedBrowser();

  const isExistFileState = await fs
    .access("state.json")
    .then(() => true)
    .catch(() => false);

  const context = await browser.newContext({
    ...(anonymizedProxy ? { proxy: { server: anonymizedProxy } } : {}),
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
    ...(isExistFileState ? { storageState: "state.json" } : {}),
  });

  const page = await context.newPage();

  if (options.cookies && options.cookies.length > 0) {
    await context.addCookies(
      options.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith(".") ? c.domain : `.${c.domain}`,
        path: c.path || "/",
        secure: c.secure,
      })),
    );
  }

  if (options.blockAssets !== false) {
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      const url = route.request().url();

      if (
        url.includes("cloudflare.com") ||
        url.includes("challenges.cloudflare.com")
      ) {
        return route.continue();
      }

      if (
        blacklistedDomains.some((domain) => url.includes(domain)) ||
        ["image", "media", "font"].includes(type)
      ) {
        return route.abort();
      }
      return route.continue();
    });
  }

  return { browser, context, page, anonymizedProxy };
}
```

**Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: 0 errors in `utils/browser.ts`.

**Step 4: Commit**

```bash
git add utils/browser.ts
git commit -m "feat(browser): add shared browser singleton with isolated contexts"
```

---

### Task 2: Implement M3U8 Reusability Validator and Cache Safeguard

**Files:**
- Create: `utils/m3u8-validator.ts`
- Create: `tests/m3u8-validator.test.ts`
- Modify: `services/stream-cache.service.ts`

**Step 1: Write unit test for M3U8 content validator**

In `tests/m3u8-validator.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { isManifestReusable } from "../utils/m3u8-validator";

test("rejects manifests containing player.pelisserieshoy.com URLs", () => {
  const dirtyManifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nhttps://player.pelisserieshoy.com/hls/test/index.m3u8?token=xyz`;
  assert.equal(isManifestReusable(dirtyManifest), false);
});

test("accepts manifests with generic CDN URLs", () => {
  const cleanManifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nhttps://cdn.example.com/hls/test/index.m3u8`;
  assert.equal(isManifestReusable(cleanManifest), true);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/m3u8-validator.test.ts`
Expected: FAIL (module not found).

**Step 3: Implement `isManifestReusable` in `utils/m3u8-validator.ts`**

```typescript
export function isManifestReusable(manifestContent: string): boolean {
  if (!manifestContent) return false;
  if (manifestContent.includes("player.pelisserieshoy.com")) {
    return false;
  }
  return true;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/m3u8-validator.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/m3u8-validator.ts tests/m3u8-validator.test.ts
git commit -m "feat(m3u8): add reusability validator for host-bound streams"
```

---

### Task 3: Refactor `get-url.operation.ts` to Event-Driven Concurrency & Phase Timers

**Files:**
- Modify: `strategies/sololatino/get-url.operation.ts`

**Step 1: Write the updated implementation in `strategies/sololatino/get-url.operation.ts`**

1. Import `getSharedBrowserContext` from `@/utils/browser`.
2. Import `isManifestReusable` from `@/utils/m3u8-validator`.
3. Track phase timestamps (`performance.now()`).
4. Replace `chromium.launch` call with `getSharedBrowserContext`.
5. Listen for responses with `context.on('response')`.
6. Remove ad overlay elements inside iframe via `frame.locator` / `page.evaluate` before clicking `#playBtn`.
7. Once first valid URL is found (Mediafire or M3U8):
   - Start 1.5s grace timer for the other URL.
   - If both are found, resolve immediately.
   - If grace timer expires, continue with captured URL(s).
8. Before saving M3U8 to MinIO:
   - Fetch the raw manifest content.
   - If `!isManifestReusable(content)`:
     - Log warning and skip MinIO upload.
     - Do NOT assign MinIO fallback URL.
   - If reusable: upload to MinIO and assign `fallbackUrl`.
9. Log phase timing breakdown:
   - `[SoloLatino][Timer] Pre-flight: ...ms`
   - `[SoloLatino][Timer] Browser Context: ...ms`
   - `[SoloLatino][Timer] Wait for Play: ...ms`
   - `[SoloLatino][Timer] Stream Capture & Grace: ...ms`
   - `[SoloLatino][Timer] TOTAL: ...ms`

**Step 2: Typecheck with TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errors.

**Step 3: Commit**

```bash
git add strategies/sololatino/get-url.operation.ts
git commit -m "perf(sololatino): implement event-driven extraction, 1.5s grace window, and phase telemetry"
```

---

### Task 4: Benchmark and Validate Across 3 Movies

**Files:**
- Create: `scripts/benchmark-sololatino.ts`

**Step 1: Create benchmark runner script**

In `scripts/benchmark-sololatino.ts`:
Execute `GetUrl.operation(path)` for 3 distinct titles:
1. Fast movie
2. Previously slow movie
3. Another representative title
Record total execution duration and verify:
- Response `{ url, fallbackUrl }` is valid.
- Duration ≤ 5.0 seconds.
- M3U8 with `player.pelisserieshoy.com` is not saved to MinIO.

**Step 2: Run benchmark script**

Run: `npx tsx scripts/benchmark-sololatino.ts` (or bundle via esbuild).
Verify outputs and timing.

**Step 3: Commit**

```bash
git add scripts/benchmark-sololatino.ts
git commit -m "test(sololatino): add benchmark script for url extraction timing"
```
