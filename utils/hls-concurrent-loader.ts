interface CachedSegment {
  data: ArrayBuffer;
  timestamp: number;
  durationMs: number;
}

interface HlsFragmentLike {
  sn: number | "initSegment";
  url?: string;
  level?: number;
  byteRangeStartOffset?: number;
  byteRangeEndOffset?: number;
  levelDetails?: {
    fragments?: HlsFragmentLike[];
  };
}

export interface HlsLoadStats {
  aborted: boolean;
  loaded: number;
  retry: number;
  total: number;
  chunkCount: number;
  bwEstimate: number;
  loading: { start: number; first: number; end: number };
  parsing: { start: number; end: number };
  buffering: { start: number; first: number; end: number };
  trequest: number;
  tfirst: number;
  tload: number;
}

const segmentCache = new Map<string, CachedSegment>();
const pendingPrefetches = new Map<
  string,
  Promise<{ data: ArrayBuffer; durationMs: number } | null>
>();
const levelFragmentsMap = new Map<number, HlsFragmentLike[]>();
const blockedDirectHosts = new Set<string>();

const MAX_CACHE_ITEMS = 24;
const PREFETCH_AHEAD_COUNT = 3;
const CACHE_TTL_MS = 120_000;

function hasValidByteRange(rangeStart?: number, rangeEnd?: number): boolean {
  return (
    typeof rangeStart === "number" &&
    typeof rangeEnd === "number" &&
    Number.isFinite(rangeStart) &&
    Number.isFinite(rangeEnd) &&
    rangeStart >= 0 &&
    rangeEnd > rangeStart
  );
}

function buildCacheKey(url: string, rangeStart?: number, rangeEnd?: number): string {
  if (hasValidByteRange(rangeStart, rangeEnd)) {
    return `${url}#bytes=${rangeStart}-${(rangeEnd as number) - 1}`;
  }
  return url;
}

function buildRangeHeader(rangeStart?: number, rangeEnd?: number): Record<string, string> | undefined {
  if (hasValidByteRange(rangeStart, rangeEnd)) {
    return { Range: `bytes=${rangeStart}-${(rangeEnd as number) - 1}` };
  }
  return undefined;
}

function getHostname(url: string): string | null {
  try {
    if (/^https?:\/\//i.test(url)) {
      return new URL(url).hostname.toLowerCase();
    }
  } catch {}
  return null;
}

function isDirectExternalUrl(url: string): boolean {
  if (!url || url.startsWith("/") || url.includes("/api/video/m3u8")) {
    return false;
  }
  if (typeof window !== "undefined" && url.startsWith(window.location.origin)) {
    return false;
  }
  return /^https?:\/\//i.test(url);
}

function toProxyUrl(url: string): string {
  return `/api/video/m3u8?url=${encodeURIComponent(url)}`;
}

function resolveEffectiveSegmentUrl(url: string): string {
  if (!isDirectExternalUrl(url)) return url;
  const host = getHostname(url);
  if (host && blockedDirectHosts.has(host)) {
    return toProxyUrl(url);
  }
  return url;
}

async function fetchSegmentWithFallback(
  rawUrl: string,
  headers: Record<string, string> | undefined,
  signal?: AbortSignal,
): Promise<Response> {
  const effectiveUrl = resolveEffectiveSegmentUrl(rawUrl);

  try {
    const res = await fetch(effectiveUrl, {
      ...(headers ? { headers } : {}),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok && res.status !== 206 && isDirectExternalUrl(effectiveUrl)) {
      const host = getHostname(rawUrl);
      if (host) blockedDirectHosts.add(host);
      return await fetch(toProxyUrl(rawUrl), {
        ...(headers ? { headers } : {}),
        ...(signal ? { signal } : {}),
      });
    }
    return res;
  } catch (err: any) {
    if (err?.name === "AbortError" || signal?.aborted) {
      throw err;
    }
    if (isDirectExternalUrl(effectiveUrl)) {
      const host = getHostname(rawUrl);
      if (host) blockedDirectHosts.add(host);
      return await fetch(toProxyUrl(rawUrl), {
        ...(headers ? { headers } : {}),
        ...(signal ? { signal } : {}),
      });
    }
    throw err;
  }
}

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of segmentCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      segmentCache.delete(key);
    }
  }
  while (segmentCache.size > MAX_CACHE_ITEMS) {
    const oldestKey = segmentCache.keys().next().value;
    if (!oldestKey) break;
    segmentCache.delete(oldestKey);
  }
}

function createFreshStats(): HlsLoadStats {
  return {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
    trequest: 0,
    tfirst: 0,
    tload: 0,
  };
}

function populateStats(
  stats: HlsLoadStats,
  byteLength: number,
  startMs: number,
  firstMs: number,
  endMs: number,
): HlsLoadStats {
  const safeEnd = Math.max(endMs, startMs + 1);
  const safeFirst = Math.min(Math.max(firstMs, startMs), safeEnd);
  stats.loaded = byteLength;
  stats.total = byteLength;
  stats.chunkCount = 1;
  stats.loading.start = startMs;
  stats.loading.first = safeFirst;
  stats.loading.end = safeEnd;
  stats.trequest = startMs;
  stats.tfirst = safeFirst;
  stats.tload = safeEnd;
  return stats;
}

/**
 * Pre-fetches a segment in the background if not already cached or in flight.
 */
export function prefetchSegment(
  url: string,
  rangeStart?: number,
  rangeEnd?: number,
) {
  if (!url) return;
  const key = buildCacheKey(url, rangeStart, rangeEnd);
  if (segmentCache.has(key) || pendingPrefetches.has(key)) return;

  const t0 = performance.now();
  const headers = buildRangeHeader(rangeStart, rangeEnd);

  const promise = fetchSegmentWithFallback(url, headers)
    .then(async (res) => {
      if (!res.ok && res.status !== 206) return null;
      const data = await res.arrayBuffer();
      const durationMs = Math.max(1, performance.now() - t0);
      return { data, durationMs };
    })
    .then((result) => {
      if (result && result.data.byteLength > 0) {
        segmentCache.set(key, {
          data: result.data,
          timestamp: Date.now(),
          durationMs: result.durationMs,
        });
        pruneCache();
      }
      pendingPrefetches.delete(key);
      return result;
    })
    .catch(() => {
      pendingPrefetches.delete(key);
      return null;
    });

  pendingPrefetches.set(key, promise);
}

function prefetchNextFromList(
  fragments: HlsFragmentLike[] | undefined,
  currentSn: number | "initSegment",
) {
  if (!Array.isArray(fragments) || typeof currentSn !== "number") return;

  for (let step = 1; step <= PREFETCH_AHEAD_COUNT; step++) {
    const nextFrag = fragments.find((f) => f.sn === currentSn + step);
    if (nextFrag?.url) {
      prefetchSegment(
        nextFrag.url,
        nextFrag.byteRangeStartOffset,
        nextFrag.byteRangeEndOffset,
      );
    }
  }
}

/**
 * Attaches level-capping (<= 720p) and concurrent ahead-of-time segment prefetching
 * to a Vidstack HLSProvider via `hls.onInstance(...)`, ensuring hooks run even when
 * `hls.js` is loaded asynchronously after `onProviderChange`.
 */
export function configureHlsInstance(hlsProvider: {
  instance?: any;
  onInstance?: (cb: (instance: any) => void) => void;
}) {
  const bindInstance = (instance: any) => {
    if (!instance || instance.__lissConfigured) return;
    instance.__lissConfigured = true;

    instance.on("hlsManifestParsed", () => {
      try {
        const levels: Array<{ height?: number; bitrate?: number }> =
          instance.levels || [];
        if (levels.length > 1) {
          let highestIdx = levels.length - 1;
          let maxScore = -1;
          for (let i = 0; i < levels.length; i++) {
            const lvl = levels[i];
            const score =
              (lvl.height || 0) * 10_000_000 + (lvl.bitrate || 0) + i;
            if (score >= maxScore) {
              maxScore = score;
              highestIdx = i;
            }
          }
          instance.autoLevelCapping = -1;
          instance.startLevel = highestIdx;
          instance.nextLoadLevel = highestIdx;
          if (instance.currentLevel <= 0) {
            instance.loadLevel = highestIdx;
          }
        }
      } catch {}
    });

    instance.on("hlsLevelLoaded", (_event: unknown, data: any) => {
      try {
        const levelIndex = typeof data?.level === "number" ? data.level : 0;
        const fragments: HlsFragmentLike[] | undefined = data?.details?.fragments;
        if (Array.isArray(fragments) && fragments.length > 0) {
          levelFragmentsMap.set(levelIndex, fragments);
        }
      } catch {}
    });

    instance.on("hlsFragLoading", (_event: unknown, data: any) => {
      try {
        const frag: HlsFragmentLike | undefined = data?.frag;
        if (!frag || typeof frag.sn !== "number") return;
        const levelIdx = typeof frag.level === "number" ? frag.level : 0;
        const fragments: HlsFragmentLike[] | undefined =
          instance.levels?.[levelIdx]?.details?.fragments ||
          levelFragmentsMap.get(levelIdx) ||
          frag.levelDetails?.fragments;
        prefetchNextFromList(fragments, frag.sn);
      } catch {}
    });
  };

  if (typeof hlsProvider.onInstance === "function") {
    hlsProvider.onInstance(bindInstance);
  }
  if (hlsProvider.instance) {
    bindInstance(hlsProvider.instance);
  }
}

/**
 * Custom Fragment Loader for Hls.js v1.x that:
 * 1. Serves pre-downloaded segments from memory immediately.
 * 2. Joins in-flight parallel prefetch promises instead of starting duplicate downloads.
 * 3. Triggers parallel prefetching of upcoming segments (sn + 1 .. sn + 3).
 * 4. Transparently falls back to `/api/video/m3u8` proxy if direct CDN connections are reset/blocked.
 */
export function createConcurrentFragmentLoader(_HlsClass?: unknown) {
  return class ConcurrentFragmentLoader {
    public stats: HlsLoadStats = createFreshStats();
    public context: any = null;
    private abortController: AbortController | null = null;

    constructor(_config?: unknown) {
      this.stats = createFreshStats();
    }

    load(context: any, _config: any, callbacks: any) {
      this.context = context;
      this.stats = createFreshStats();

      const url: string = context.url;
      const rangeStart: number | undefined = context.rangeStart;
      const rangeEnd: number | undefined = context.rangeEnd;
      const cacheKey = buildCacheKey(url, rangeStart, rangeEnd);

      this.prefetchUpcomingFragments(context);

      // 1. Immediate memory cache hit
      if (segmentCache.has(cacheKey)) {
        const cached = segmentCache.get(cacheKey)!;
        segmentCache.delete(cacheKey);

        const now = performance.now();
        const syntheticStart = Math.max(0, now - cached.durationMs);
        populateStats(
          this.stats,
          cached.data.byteLength,
          syntheticStart,
          syntheticStart + Math.min(10, cached.durationMs * 0.2),
          now,
        );

        callbacks.onSuccess(
          { url, data: cached.data },
          this.stats,
          context,
          null,
        );
        return;
      }

      // 2. Join in-flight background prefetch
      if (pendingPrefetches.has(cacheKey)) {
        const pending = pendingPrefetches.get(cacheKey)!;

        pending.then((result) => {
          if (this.stats.aborted) return;
          if (result && result.data) {
            segmentCache.delete(cacheKey);
            const now = performance.now();
            const syntheticStart = Math.max(0, now - result.durationMs);
            populateStats(
              this.stats,
              result.data.byteLength,
              syntheticStart,
              syntheticStart + Math.min(10, result.durationMs * 0.2),
              now,
            );

            callbacks.onSuccess(
              { url, data: result.data },
              this.stats,
              context,
              null,
            );
          } else {
            this.executeNormalFetch(url, rangeStart, rangeEnd, context, callbacks);
          }
        });
        return;
      }

      // 3. Direct fetch with concurrent prefetching already triggered
      this.executeNormalFetch(url, rangeStart, rangeEnd, context, callbacks);
    }

    private prefetchUpcomingFragments(context: any) {
      try {
        const frag: HlsFragmentLike | undefined = context?.frag;
        if (!frag || typeof frag.sn !== "number") return;
        const levelIdx = typeof frag.level === "number" ? frag.level : 0;
        const fragments =
          frag.levelDetails?.fragments || levelFragmentsMap.get(levelIdx);
        prefetchNextFromList(fragments, frag.sn);
      } catch {}
    }

    private executeNormalFetch(
      url: string,
      rangeStart: number | undefined,
      rangeEnd: number | undefined,
      context: any,
      callbacks: any,
    ) {
      const trequest = performance.now();
      this.stats.loading.start = trequest;
      this.stats.trequest = trequest;
      this.abortController = new AbortController();
      const headers = buildRangeHeader(rangeStart, rangeEnd);

      fetchSegmentWithFallback(url, headers, this.abortController.signal)
        .then(async (res) => {
          if (!res.ok && res.status !== 206) {
            callbacks.onError(
              { code: res.status, text: res.statusText },
              context,
              res,
              this.stats,
            );
            return;
          }
          const tfirst = performance.now();
          const data = await res.arrayBuffer();
          const tload = performance.now();

          populateStats(this.stats, data.byteLength, trequest, tfirst, tload);

          callbacks.onSuccess(
            { url, data },
            this.stats,
            context,
            res,
          );
        })
        .catch((err) => {
          if (err?.name !== "AbortError" && !this.stats.aborted) {
            callbacks.onError(
              { code: 0, text: err?.message || "Network error" },
              context,
              null,
              this.stats,
            );
          }
        });
    }

    abort() {
      this.stats.aborted = true;
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    }

    destroy() {
      this.abort();
      this.context = null;
    }

    getCacheAge(): number | null {
      return null;
    }

    getResponseHeader(_name: string): string | null {
      return null;
    }
  };
}
