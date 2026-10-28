import {
  FlareSolverrOutput,
  FlareSolverrResponse,
  FlareSolverrCacheEntry,
  FlareSolverrCacheStore,
  ResolverOptions,
  FetchFlareOptions,
} from "@/types/solverr";
import { BASE_URL } from "@/utils/browser";
import { markProxyExhausted, createStickySession } from "@/utils/proxy";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import nodeFetch from "node-fetch";

/**
 * Cache file for storing resolved user-agent and cookies per IP/target.
 * Uses process.cwd() to avoid __dirname resolution issues in Next.js bundle.
 */
const CACHE_FILE_PATH = path.join(process.cwd(), "data", "flaresolverrCache.json");

/**
 * Strip trailing slashes from proxy URL.
 * Chromium networking fails with ERR_NO_SUPPORTED_PROXIES if a trailing slash is present.
 */
function cleanProxyUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Extract proxy username from options or agent to track quota.
 */
function extractProxyUsername(options: FetchFlareOptions): string | undefined {
  if (options.proxyUsername) return options.proxyUsername;
  const proxyUrl =
    options.proxyUrl ||
    (options.agent && typeof options.agent === "object" && "proxy" in options.agent
      ? (options.agent as { proxy: URL }).proxy.href
      : undefined);
  if (proxyUrl) {
    try {
      const parsed = new URL(proxyUrl);
      if (parsed.username) return decodeURIComponent(parsed.username);
    } catch {}
  }
  return undefined;
}

/**
 * Load the shared cache store from disk. Handles legacy single-entry format gracefully.
 */
async function loadCacheStore(): Promise<FlareSolverrCacheStore> {
  try {
    const data = await readFile(CACHE_FILE_PATH, "utf-8");
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return {};

    // Backward compatibility with legacy single-entry cache
    if (
      typeof parsed.userAgent === "string" &&
      Array.isArray(parsed.cookies) &&
      typeof parsed.expiry === "number"
    ) {
      return {
        direct: {
          userAgent: parsed.userAgent,
          cookies: parsed.cookies,
          expiry: parsed.expiry,
        },
      };
    }

    return parsed as FlareSolverrCacheStore;
  } catch {
    return {};
  }
}

/**
 * Load cache entry for a specific key (e.g. "direct" or "proxy:<host>").
 */
async function loadCache(key: string): Promise<FlareSolverrCacheEntry | null> {
  const store = await loadCacheStore();
  const entry = store[key];
  if (
    entry &&
    typeof entry.userAgent === "string" &&
    Array.isArray(entry.cookies) &&
    typeof entry.expiry === "number"
  ) {
    return entry;
  }
  return null;
}

/**
 * Persist cache entry for a specific key back to disk.
 */
async function saveCache(key: string, entry: FlareSolverrCacheEntry): Promise<void> {
  const store = await loadCacheStore();
  store[key] = entry;
  await mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
  await writeFile(CACHE_FILE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Extract proxy URL and IP-based cache key from options or agent.
 * The proxy accounts may rotate usernames, but share the same proxy IP/host.
 */
function extractProxyDetails(options: FetchFlareOptions): ResolverOptions {
  if (options.agent) {
    const proxyUrl = cleanProxyUrl(options.agent.proxy.href);
    const host = options.agent.proxy.hostname || options.agent.proxy.host;
    return {
      proxyUrl,
      proxyKey: `proxy:${host}`,
    };
  }

  if (options.proxyUrl) {
    const proxyUrl = cleanProxyUrl(options.proxyUrl);
    try {
      const parsed = new URL(proxyUrl);
      const host = parsed.hostname || parsed.host;
      return {
        proxyUrl,
        proxyKey: `proxy:${host}`,
      };
    } catch {
      return {
        proxyUrl,
        proxyKey: `proxy:${process.env.PROXY_HOST || "default"}`,
      };
    }
  }

  return { proxyKey: "direct" };
}

const activeSessions = new Set<string>();
const sessionLocks = new Map<string, Promise<unknown>>();

async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = sessionLocks.get(sessionId) || Promise.resolve();
  let release: () => void = () => {};
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  sessionLocks.set(sessionId, currentLock.then(() => nextLock, () => nextLock));

  try {
    await currentLock;
    return await fn();
  } finally {
    release();
    if (sessionLocks.get(sessionId) === nextLock) {
      sessionLocks.delete(sessionId);
    }
  }
}

function getSessionId(proxyKey?: string): string {
  if (!proxyKey || proxyKey === "direct") return "liss_tv_default";
  return `liss_tv_${proxyKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

async function destroyFlareSession(endpoint: string, sessionId: string): Promise<void> {
  activeSessions.delete(sessionId);
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd: "sessions.destroy", session: sessionId }),
    });
  } catch {}
}

async function ensureFlareSession(
  endpoint: string,
  sessionId: string,
  proxyPayload?: Record<string, string>,
): Promise<void> {
  if (activeSessions.has(sessionId)) return;

  const payload: Record<string, unknown> = {
    cmd: "sessions.create",
    session: sessionId,
  };
  if (proxyPayload) {
    payload.proxy = proxyPayload;
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (
      data.status === "ok" ||
      (typeof data.message === "string" && data.message.includes("already exists"))
    ) {
      activeSessions.add(sessionId);
    }
  } catch (err) {
    console.warn(`[FlareSolverr] Failed to ensure session ${sessionId}:`, err);
  }
}

/**
 * Resolve a captcha challenge via FlareSolverr using persistent browser sessions.
 * FlareSolverr retains clearance cookies inside the session, avoiding TLS fingerprint blocks.
 * Uses a per-session lock to prevent concurrent requests from trampling the single browser tab.
 */
export async function resolver(
  url: string,
  options: ResolverOptions = {},
): Promise<FlareSolverrOutput> {
  const flareSolverrEndpoint =
    process.env.FLARESOLVERR_ENDPOINT || "http://localhost:8191/v1";

  const sessionId = getSessionId(options.proxyKey);

  let proxyPayload: Record<string, string> | undefined;
  if (options.proxyUrl) {
    try {
      const parsed = new URL(options.proxyUrl);
      proxyPayload = {
        url: `${parsed.protocol}//${parsed.host}`,
      };
      if (parsed.username) {
        proxyPayload.username = decodeURIComponent(parsed.username);
      }
      if (parsed.password) {
        proxyPayload.password = decodeURIComponent(parsed.password);
      }
    } catch {
      proxyPayload = {
        url: cleanProxyUrl(options.proxyUrl),
      };
    }
  }

  return withSessionLock(sessionId, async () => {
    await ensureFlareSession(flareSolverrEndpoint, sessionId, proxyPayload);

    const payload: Record<string, unknown> = {
      cmd: "request.get",
      url: url || BASE_URL.SoloLatino,
      session: sessionId,
      maxTimeout: 60000,
    };

    const executeRequest = async (retries = 1): Promise<FlareSolverrOutput> => {
      let response = await fetch(flareSolverrEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `FlareSolverr request failed with status ${response.status}`,
        );
      }

      let data: FlareSolverrResponse = await response.json();

      // If the session died or was cleared on FlareSolverr side, recreate and retry once
      if (
        data.status !== "ok" &&
        typeof data.message === "string" &&
        data.message.toLowerCase().includes("session")
      ) {
        activeSessions.delete(sessionId);
        await ensureFlareSession(flareSolverrEndpoint, sessionId, proxyPayload);
        response = await fetch(flareSolverrEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await response.json();
      }

      if (data.status !== "ok") {
        throw new Error(`FlareSolverr returned error status: ${data.status}`);
      }

      const {
        userAgent,
        cookies,
        response: solutionHtml,
        status: solutionStatus,
      } = data.solution;

      if (solutionHtml && solutionHtml.includes("ERR_NO_SUPPORTED_PROXIES")) {
        throw new Error(
          "FlareSolverr proxy connection failed with ERR_NO_SUPPORTED_PROXIES",
        );
      }

      // Check if the MAIN frame itself failed to load (Chrome error page),
      // ignoring sub-frame/iframe errors caused by blocked ads or trackers.
      const isMainFrameError = Boolean(
        solutionHtml &&
        solutionHtml.includes('id="main-frame-error"') &&
        !solutionHtml.includes("card") &&
        !solutionHtml.includes("sololatino")
      );

      if (isMainFrameError) {
        const errorMatch = solutionHtml!.match(/ERR_[A-Z0-9_]+/);
        const detail = errorMatch ? errorMatch[0] : "unknown";

        if (retries > 0) {
          await destroyFlareSession(flareSolverrEndpoint, sessionId);
          await ensureFlareSession(flareSolverrEndpoint, sessionId, proxyPayload);
          await new Promise((r) => setTimeout(r, 600));
          return executeRequest(retries - 1);
        }

        throw new Error(
          `FlareSolverr failed to load page (${detail}): navigation failure for ${url}`,
        );
      }

      if (
        solutionHtml &&
        /bandwidth\s+limit\s+reached/i.test(solutionHtml)
      ) {
        throw new Error(
          "Proxy bandwidth limit reached. Please upgrade to continue using the proxy.",
        );
      }

      return {
        userAgent,
        cookies,
        html: solutionHtml,
        status: solutionStatus,
      };
    };

    return executeRequest();
  });
}

export type { FetchFlareOptions, ResolverOptions } from "@/types/solverr";

/**
 * Helper to perform a fetch:
 * - Resolves captcha via FlareSolverr (routing through proxy if agent/proxy is supplied).
 * - Caches and injects clearance cookies & user-agent linked to the IP.
 * - Automatically detects exhausted proxy bandwidth limits, rotates account and retries.
 * - Reuses solution HTML directly if freshly resolved, otherwise dispatches via fetch/node-fetch.
 */
export async function fetchFlare(
  url: string,
  options: FetchFlareOptions = {},
  retriesLeft = 3,
): Promise<Response> {
  const proxyDetails = extractProxyDetails(options);
  const username = extractProxyUsername(options);

  try {
    const resolverOutput = await resolver(url, proxyDetails);

    console.log('output', resolverOutput);

    // If FlareSolverr solved and retrieved the target URL directly, reuse its HTML response
    if (resolverOutput.html) {
      if (/bandwidth\s+limit\s+reached/i.test(resolverOutput.html)) {
        throw new Error(
          "Proxy bandwidth limit reached. Please upgrade to continue using the proxy.",
        );
      }

      return new Response(resolverOutput.html, {
        status: resolverOutput.status || 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const { userAgent, cookies } = resolverOutput;
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const mergedHeaders = new Headers(options.headers || {});
    mergedHeaders.set("User-Agent", userAgent);
    if (cookieHeader) {
      const existingCookie = mergedHeaders.get("Cookie");
      mergedHeaders.set(
        "Cookie",
        existingCookie ? `${existingCookie}; ${cookieHeader}` : cookieHeader,
      );
    }

    const fetchOptions = {
      ...options,
      headers: mergedHeaders,
    };

    if (options.agent) {
      const res = (await nodeFetch(
        url,
        fetchOptions as never,
      )) as unknown as Response;

      if (res.status === 402 || res.status === 407) {
        throw new Error(
          "Proxy bandwidth limit reached. Please upgrade to continue using the proxy.",
        );
      }

      return res;
    }

    return fetch(url, fetchOptions);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (/bandwidth\s+limit\s+reached/i.test(errorMsg)) {
      if (username) {
        markProxyExhausted(username);
      }
      if (retriesLeft > 0 && options.agent) {
        const nextSession = createStickySession();
        return fetchFlare(
          url,
          {
            ...options,
            agent: nextSession.agent,
            proxyUrl: nextSession.url,
            proxyUsername: nextSession.username,
          },
          retriesLeft - 1,
        );
      }
    }
    throw error;
  }
}
