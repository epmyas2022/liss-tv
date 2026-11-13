# Design Document: SoloLatino Fast & Reliable URL Extraction

- **Date:** 2026-11-13
- **Author:** Antigravity & Engineering Team
- **Status:** Proposed
- **Target File(s):**
  - `strategies/sololatino/get-url.operation.ts`
  - `utils/browser.ts`
  - (Optional / Helper) `services/stream-cache.service.ts`

---

## 1. Intent & Motivation

In `strategies/sololatino/get-url.operation.ts`, video URL extraction currently exhibits high variance in latency. While some titles resolve in a few seconds, others take between 25 and 45 seconds. The root causes identified are:
1. **Blocking concurrency pattern:** A rigid `Promise.all` waiting concurrently for Mediafire AND M3U8 (`while (!dataUrls.url || !dataUrls.fallbackUrl)`), accompanied by a fixed 20-second timeout fallback (`TIMEOUT_M3U8_FALLBACK_MS = 20_000`) and 2.5-second sleep intervals between synthetic clicks.
2. **Cold browser overhead:** Every request launches a fresh Chromium process via `chromium.launch()`, adding 1.0s to 1.5s of startup latency on Windows.
3. **Ad overlays & popup click theft:** Popups intercept clicks intended for `#playBtn`, necessitating multiple retries.
4. **Invalid M3U8 cache pollution:** Manifests containing ephemeral URLs pointing to `player.pelisserieshoy.com` bind to the requesting client's IP and session tokens. If uploaded to MinIO/StreamCache, other users fail to stream them.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Target Latency:** Achieve resolution within ≤ 5.0 seconds for both fast and slow movies.
- **Event-Driven Resolution:** Replace polling loops and fixed sleeps with network response events (`context.on('response')`).
- **Reactive Grace Period:** If the primary stream (e.g., Mediafire) resolves first, provide a short grace period (1.2s - 1.5s) to capture M3U8 for StreamCache. If M3U8 arrives or the window expires, immediately resolve.
- **Browser Lifecycle Optimization:** Maintain a shared Chromium process singleton; instantiate lightweight, isolated browser contexts per request (~40ms overhead).
- **M3U8 Domain Verification:** Inspect manifest content prior to MinIO upload. If internal URLs reference `player.pelisserieshoy.com`, skip StreamCache and do not expose MinIO `fallbackUrl`.
- **Phase Telemetry:** Add granular execution timing logs (navigation, play button wait, click/detection, MinIO check) to measure and prove performance gains across at least 3 representative movies.

### Non-Goals
- Introducing new external proxy services or replacing the current sticky session proxy configuration.
- Completely rewriting the player reverse engineering without Playwright.
- Modifying UI components or breaking the `StrategyGetUrl` contract (`{ url, fallbackUrl }`).

### Anti-Goals
- Sacrificing extraction reliability for speed. If fast paths timeout or fail, the execution must gracefully fall back to alternative options (e.g., "Opción 1").
- Sharing storage states or cookies across concurrent requests (each request must have its own isolated context).

---

## 3. Constraints

- Must preserve backward compatibility with `state.json`.
- Must honor existing proxy configurations (`createStickySession`).
- Clean separation of concerns per project architecture guidelines in `AGENTS.md`.

---

## 4. Evaluated Approaches

### Approach 1: Event-Driven Playwright + Browser Singleton + Reactive Grace Period *(Selected)*
- **Description:** Reuse a single shared Chromium process while provisioning isolated contexts per request. Intercept network responses directly (`context.on('response')`). Once any valid playback URL (Mediafire or M3U8) is captured, initiate a 1.2s - 1.5s grace timer for the secondary source, then resolve immediately. Clean ad overlays and trigger direct click via evaluation.
- **Trade-offs:** Minimal memory footprint for the shared browser process (~80-120MB); delivers ≤ 5s resolution with 100% selector/bot-detection compatibility.

### Approach 2: Pure HTTP Player API Re-engineering
- **Description:** Reverse engineer the player iframe and make direct HTTP requests using the `et` token.
- **Trade-offs:** Resolution under 1.5s, but high risk of breakage due to frequent upstream script obfuscation and canvas anti-bot checks. Rejected as primary strategy.

### Approach 3: Browser Cold-Launch with Event-Driven Loop
- **Description:** Implement event-driven listeners but continue launching a cold browser process per request.
- **Trade-offs:** Avoids keeping a background browser process, but incurs an unavoidable ~1.2s startup penalty, exceeding the 5.0s target during peak network latency (5.0s - 7.2s total). Rejected.

---

## 5. Detailed Design & Architecture

### 5.1 Browser Singleton (`utils/browser.ts`)
Introduce a controlled browser process singleton:
```typescript
let sharedBrowser: Browser | null = null;

export async function getSharedBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({
      headless: true,
      args: BROWSER_ARGS,
    });
  }
  return sharedBrowser;
}
```
In `get-url.operation.ts`, request a new context from `getSharedBrowser()` instead of launching a fresh browser every time, closing only `context` in the `finally` block.

### 5.2 Reactive Event-Driven Extraction (`strategies/sololatino/get-url.operation.ts`)
1. **Network Listener:** Attach `context.on('response', ...)` monitoring Mediafire and `.m3u8` URLs.
2. **Early Completion Trigger:**
   - When a Mediafire URL is detected: assign `dataUrls.url`. If `dataUrls.fallbackUrl` is already present, resolve immediately. Otherwise, start a 1.2s - 1.5s countdown.
   - When an M3U8 URL is detected: assign `rawM3u8Url`. If `dataUrls.url` is already present, resolve immediately. Otherwise, start a 1.2s - 1.5s countdown.
3. **Optimized Click Trigger:**
   - Wait for `#playBtn` (timeout reduced to 8s).
   - Inject script via `page.evaluate` to remove transparent ad overlays and trigger `play.click()`.
4. **Graceful Exit:** If grace timer expires, continue with whatever valid URL was captured.

### 5.3 M3U8 Manifest Verification Rule
Before executing `persistUpstreamManifest`:
1. Fetch manifest text via `got` or `fetch`.
2. Inspect lines for `player.pelisserieshoy.com`.
3. If detected:
   - Log `[StreamCache] Manifest contains player.pelisserieshoy.com URLs; skipping MinIO cache`.
   - Do not upload to MinIO.
   - Do not return MinIO-based `fallbackUrl` (keep as raw or omit persistent fallback).
4. If clean: proceed with `persistUpstreamManifest` and save to StreamCache.

### 5.4 Phase Telemetry
Record high-resolution timestamps (`performance.now()`):
- `t0 -> t1`: Pre-flight HTML & Player API tokens.
- `t1 -> t2`: Browser context acquisition.
- `t2 -> t3`: Frame navigation & `#playBtn` ready.
- `t3 -> t4`: Click dispatch to first response capture.
- `t4 -> t5`: Grace window completion & M3U8 validation.
- `Total`: Aggregate duration.

---

## 6. Implementation & Verification Plan

1. **Step 1:** Add shared browser lifecycle management to `utils/browser.ts`.
2. **Step 2:** Refactor `strategies/sololatino/get-url.operation.ts` to event-driven flow with short grace window, ad overlay cleaning, and phase timer logs.
3. **Step 3:** Implement M3U8 content validator prior to MinIO cache persistence.
4. **Step 4:** Execute test runs against 3 movies (1 fast, 1 previously slow, 1 standard) and verify:
   - Resolution time is ≤ 5.0 seconds.
   - Fallback URLs containing `player.pelisserieshoy.com` are correctly blocked from MinIO.
   - Valid streams return working `url` and `fallbackUrl`.
