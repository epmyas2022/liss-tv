import type {
  FlareSolverrCookies,
  FlareSolverrOutput,
  FlareSolverrResponse,
  FlareSolverrCacheEntry,
  FlareSolverrCacheStore,
  ResolverOptions,
  FetchFlareOptions,
  PostFlareOptions,
} from "../types/solverr.ts";
import { BASE_URL } from "./browser.ts";
import {
  markProxyExhausted,
  createStickySession,
  isProxyEnabled,
  createProxyAgent,
  getProxyHost,
  getActiveProxyUrl,
} from "./proxy.ts";
import type { AnyProxyAgent } from "../types/proxy.ts";
import { ProxyPoolService } from "../services/proxy-pool.service.ts";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import nodeFetch from "node-fetch";

/**
 * Check if the returned HTML indicates an account or IP suspension on the target site.
 */
export function isBannedResponse(html: string): boolean {
  if (!html) return false;
  return (
    html.includes("banned-modal") ||
    html.includes("Cuenta suspendida") ||
    html.includes("showBannedModal") ||
    html.includes("Violación de los términos de servicio")
  );
}

/**
 * Check if the returned HTML is a Cloudflare managed challenge or Turnstile block.
 */
export function isChallengeResponse(html: string): boolean {
  if (!html) return false;
  return (
    html.includes("Just a moment...") ||
    html.includes("challenges.cloudflare.com") ||
    html.includes("cf-browser-verification") ||
    html.includes("cf-turnstile")
  );
}

/**
 * Build request payload for FlareSolverr conforming to v2/v3 without deprecated headers.
 */
export function buildFlarePayload(
  url: string,
  session: string,
  maxTimeout = 25000,
): Record<string, unknown> {
  return {
    cmd: "request.get",
    url,
    session,
    maxTimeout,
  };
}

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
 * Build proxy payload for FlareSolverr.
 * FlareSolverr requires authentication credentials embedded inside the URL:
 *   { url: "http://user:password@host:port" }
 * Passing separate username/password fields is ignored by FlareSolverr and stalls.
 */
function buildProxyPayload(proxyUrl?: string): Record<string, string> | undefined {
  if (!proxyUrl) return undefined;
  try {
    const parsed = new URL(proxyUrl);
    const protocol = parsed.protocol === "socks5h:" ? "socks5:" : parsed.protocol;
    const auth = parsed.username
      ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
      : "";
    return {
      url: cleanProxyUrl(`${protocol}//${auth}${parsed.host}`),
    };
  } catch {
    return {
      url: cleanProxyUrl(proxyUrl),
    };
  }
}

/**
 * Extract proxy username from options or agent to track quota.
 */
function extractProxyUsername(options: FetchFlareOptions): string | undefined {
  if (options.proxyUsername) return options.proxyUsername;
  let proxyUrl = options.proxyUrl;
  if (!proxyUrl && options.agent && typeof options.agent === "object") {
    const agentObj = options.agent as unknown as Record<string, unknown>;
    if (typeof agentObj.proxyUrl === "string") {
      proxyUrl = agentObj.proxyUrl;
    } else if (agentObj.proxy && typeof agentObj.proxy === "object") {
      const p = agentObj.proxy as { href?: string };
      if (typeof p.href === "string") {
        proxyUrl = p.href;
      }
    }
  }

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
export async function loadCache(key: string): Promise<FlareSolverrCacheEntry | null> {
  const store = await loadCacheStore();
  const entry = store[key];
  if (
    entry &&
    typeof entry.userAgent === "string" &&
    Array.isArray(entry.cookies) &&
    entry.cookies.length > 0 &&
    typeof entry.expiry === "number"
  ) {
    return entry;
  }
  return null;
}

/**
 * Persist cache entry for a specific key back to disk.
 */
export async function saveCache(key: string, entry: FlareSolverrCacheEntry): Promise<void> {
  const store = await loadCacheStore();
  store[key] = entry;
  await mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
  await writeFile(CACHE_FILE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export async function deleteCache(key: string): Promise<void> {
  const store = await loadCacheStore();
  if (store[key]) {
    delete store[key];
    await mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
    await writeFile(CACHE_FILE_PATH, JSON.stringify(store, null, 2), "utf-8");
  }
}

/**
 * Extract proxy URL and IP-based cache key from options or agent.
 * The proxy accounts may rotate usernames, but share the same proxy IP/host.
 */
function extractProxyDetails(options: FetchFlareOptions): ResolverOptions {
  if (options.agent) {
    const agentObj = options.agent as unknown as Record<string, unknown>;
    let rawUrl: string | undefined;
    let host: string | undefined;

    if (typeof agentObj.proxyUrl === "string") {
      rawUrl = agentObj.proxyUrl;
    } else if (agentObj.proxy && typeof agentObj.proxy === "object") {
      const p = agentObj.proxy as { href?: string; hostname?: string; host?: string };
      rawUrl = p.href;
      host = p.hostname || p.host;
    }

    if (rawUrl) {
      const proxyUrl = cleanProxyUrl(rawUrl);
      if (!host) {
        try {
          const parsed = new URL(proxyUrl);
          host = parsed.hostname || parsed.host;
        } catch {
          host = "default";
        }
      }
      return {
        proxyUrl,
        proxyKey: `proxy:${host}`,
      };
    }
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
        proxyKey: `proxy:${getProxyHost() || "default"}`,
      };
    }
  }

  if (isProxyEnabled()) {
    try {
      const session = createStickySession();
      const parsed = new URL(session.url);
      const host = parsed.hostname || parsed.host;
      return {
        proxyUrl: session.url,
        proxyKey: `proxy:${host}`,
      };
    } catch (e) {
      console.error("[⚠️ Error creating sticky session for proxy details]", e);
    }
  }

  return { proxyKey: "direct" };
}

const activeSessions = new Set<string>();
const sessionLocks = new Map<string, Promise<unknown>>();
const inFlightResolutions = new Map<string, Promise<FlareSolverrOutput>>();

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
 * Execute actual FlareSolverr challenge resolution.
 * Always resolves on the base domain to avoid Turnstile issues on API endpoints.
 */
async function executeFlareResolution(
  url: string,
  options: ResolverOptions,
  cacheKey: string,
  sessionId: string,
  proxyPayload?: Record<string, string>,
): Promise<FlareSolverrOutput> {
  const flareSolverrEndpoint =
    process.env.FLARESOLVERR_ENDPOINT || "http://localhost:8191/v1";

  return withSessionLock(sessionId, async () => {
    await ensureFlareSession(flareSolverrEndpoint, sessionId, proxyPayload);
    const payload = buildFlarePayload(BASE_URL.SoloLatino, sessionId, 25000);

    const executeRequest = async (retries = 1): Promise<FlareSolverrOutput> => {
      try {
        let response = await fetch(flareSolverrEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorDetail = await response.text().catch(() => "");
          throw new Error(
            `FlareSolverr request failed with status ${response.status}${errorDetail ? `: ${errorDetail}` : ""}`,
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

        if (isBannedResponse(solutionHtml || "")) {
          if (options.proxyUrl) {
            ProxyPoolService.getInstance().markProxyFailed(options.proxyUrl, "Banned account modal returned");
          }
          throw new Error("Target site returned banned account modal");
        }

        if (isChallengeResponse(solutionHtml || "")) {
          throw new Error("FlareSolverr failed to clear Cloudflare challenge");
        }

        // Check if the MAIN frame itself failed to load (Chrome error page)
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
      } catch (err) {
        // Unconditionally destroy session on failure to avoid leaving zombie tabs open!
        console.warn(`[FlareSolverr] Session ${sessionId} encountered error or timeout. Destroying session...`);
        await destroyFlareSession(flareSolverrEndpoint, sessionId);
        if (options.proxyUrl) {
          ProxyPoolService.getInstance().markProxyFailed(
            options.proxyUrl,
            err instanceof Error ? err.message : String(err),
          );
        }
        throw err;
      }
    };

    const result = await executeRequest();
    const now = Date.now();

    if (result.cookies && result.cookies.length > 0) {
      const cfClearance = result.cookies.find((c) => c.name === "cf_clearance") as
        | (FlareSolverrCookies & { expiry?: number })
        | undefined;
      let expiry = now + 60 * 60 * 1000;
      if (
        cfClearance?.expiry &&
        typeof cfClearance.expiry === "number" &&
        cfClearance.expiry * 1000 > now
      ) {
        expiry = cfClearance.expiry * 1000;
      }

      await saveCache(cacheKey, {
        userAgent: result.userAgent,
        cookies: result.cookies,
        expiry,
        updatedAt: now,
      });
    }

    return result;
  });
}

/**
 * Resolve a captcha challenge via FlareSolverr using persistent browser sessions.
 * Implements Stale-While-Revalidate (SWR): returns stale cookies immediately so user
 * requests (search, detail, etc.) don't block on FlareSolverr, while refreshing in the background.
 */
export async function resolver(
  url: string = BASE_URL.SoloLatino,
  options: ResolverOptions = {},
): Promise<FlareSolverrOutput> {
  if (isProxyEnabled() && !options.proxyUrl) {
    try {
      const session = createStickySession();
      options = {
        ...options,
        proxyUrl: session.url,
        proxyKey: options.proxyKey || `proxy:${new URL(session.url).hostname || process.env.PROXY_HOST || "default"}`,
      };
    } catch (e) {
      console.error("[⚠️ Failed to initialize proxy session in resolver]", e);
    }
  }

  let defaultProxyKey = isProxyEnabled()
    ? `proxy:${process.env.PROXY_HOST || "default"}`
    : "direct";
  if (options.proxyUrl) {
    try {
      const parsed = new URL(options.proxyUrl);
      defaultProxyKey = `proxy:${parsed.hostname || parsed.host}`;
    } catch {
      defaultProxyKey = `proxy:${process.env.PROXY_HOST || "default"}`;
    }
  }
  const cacheKey = options.proxyKey || defaultProxyKey;

  const sessionId = getSessionId(options.proxyKey);

  const proxyPayload = buildProxyPayload(options.proxyUrl);

  const cached = (await loadCache(cacheKey)) || (await loadCache("direct"));
  const now = Date.now();

  // 1. Fresh cache: return instantly.
  // If approaching expiry (e.g. within 3 minutes), trigger a non-blocking background
  // refresh while returning the still-valid session immediately, ensuring zero latency.
  if (cached && cached.expiry > now) {
    const PROACTIVE_RENEWAL_WINDOW_MS = 3 * 60 * 1000;
    const isApproachingExpiry = cached.expiry - now < PROACTIVE_RENEWAL_WINDOW_MS;

    if (isApproachingExpiry && !inFlightResolutions.has(cacheKey)) {
      const bgPromise = executeFlareResolution(
        url,
        options,
        cacheKey,
        sessionId,
        proxyPayload,
      )
        .catch((err) => {
          console.error("[⚠️ Background FlareSolverr proactive renewal error]", err);
          return null as unknown as FlareSolverrOutput;
        })
        .finally(() => {
          inFlightResolutions.delete(cacheKey);
        });
      inFlightResolutions.set(cacheKey, bgPromise);
    }

    return {
      userAgent: cached.userAgent,
      cookies: cached.cookies,
    };
  }

  // 2. Expired or missing cache: DO NOT return dead clearance tokens.
  // Wait for resolution so that in-flight requests succeed on the first attempt without empty states.
  if (inFlightResolutions.has(cacheKey)) {
    return inFlightResolutions.get(cacheKey)!;
  }

  const resolutionPromise = executeFlareResolution(
    url,
    options,
    cacheKey,
    sessionId,
    proxyPayload,
  ).finally(() => {
    inFlightResolutions.delete(cacheKey);
  });

  inFlightResolutions.set(cacheKey, resolutionPromise);
  return resolutionPromise;
}

export type { FetchFlareOptions, ResolverOptions, PostFlareOptions } from "@/types/solverr";

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
  if ((isProxyEnabled() || options.agent) && !options.proxyUrl) {
    const session = createStickySession();
    options = {
      ...options,
      agent: session.agent,
      proxyUrl: session.url,
      proxyUsername: session.username,
    };
  }

  const proxyDetails = extractProxyDetails(options);
  const username = extractProxyUsername(options);

  try {
    const resolverOutput = await resolver(
      url,
      !options.agent && !isProxyEnabled() ? undefined : proxyDetails,
    );

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
    if (!mergedHeaders.has("Referer")) {
      try {
        mergedHeaders.set("Referer", new URL(url).origin + "/");
      } catch {
        mergedHeaders.set("Referer", BASE_URL.SoloLatino);
      }
    }
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

    const inspectAndReturnResponse = async (res: Response): Promise<Response> => {
      if ((res.status === 403 || res.status === 503) && retriesLeft > 0) {
        await deleteCache(proxyDetails.proxyKey || "direct");
        if (options.proxyUrl) {
          ProxyPoolService.getInstance().markProxyFailed(options.proxyUrl, `HTTP ${res.status}`);
        }
        const jitter = Math.floor(Math.random() * 400) + 400;
        await new Promise((r) => setTimeout(r, jitter));
        const nextSession = isProxyEnabled() ? createStickySession() : undefined;
        return fetchFlare(
          url,
          nextSession
            ? {
                ...options,
                agent: nextSession.agent,
                proxyUrl: nextSession.url,
                proxyUsername: nextSession.username,
              }
            : options,
          retriesLeft - 1,
        );
      }

      if (res.status === 402 || res.status === 407) {
        throw new Error(
          "Proxy bandwidth limit reached. Please upgrade to continue using the proxy.",
        );
      }

      // Check if body is banned modal or challenge
      const text = await res.text();
      if ((isBannedResponse(text) || isChallengeResponse(text)) && retriesLeft > 0) {
        console.warn(`[SoloLatino] Target returned ban/challenge modal on proxy ${proxyDetails.proxyKey}. Rotating...`);
        await deleteCache(proxyDetails.proxyKey || "direct");
        if (options.proxyUrl) {
          ProxyPoolService.getInstance().markProxyFailed(options.proxyUrl, "Ban/challenge response");
        }
        const jitter = Math.floor(Math.random() * 500) + 400;
        await new Promise((r) => setTimeout(r, jitter));
        const nextSession = isProxyEnabled() ? createStickySession() : undefined;
        return fetchFlare(
          url,
          nextSession
            ? {
                ...options,
                agent: nextSession.agent,
                proxyUrl: nextSession.url,
                proxyUsername: nextSession.username,
              }
            : options,
          retriesLeft - 1,
        );
      }

      return new Response(text, {
        status: res.status,
        headers: res.headers,
      });
    };

    if (options.agent) {
      const res = (await nodeFetch(
        url,
        fetchOptions as never,
      )) as unknown as Response;
      return inspectAndReturnResponse(res);
    }

    const res = await fetch(url, fetchOptions);
    return inspectAndReturnResponse(res);
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

/**
 * Execute a POST request via FlareSolverr to bypass Cloudflare WAF on API endpoints.
 */
export async function postFlare(
  url: string,
  postData: string,
  headers: Record<string, string> = {},
  options: PostFlareOptions = {},
): Promise<string> {
  if (isProxyEnabled() && !options.proxyUrl) {
    try {
      const session = createStickySession();
      options = {
        ...options,
        proxyUrl: session.url,
        proxyKey: options.proxyKey || `proxy:${new URL(session.url).hostname || process.env.PROXY_HOST || "default"}`,
      };
    } catch (e) {
      console.error("[⚠️ Failed to initialize proxy in postFlare]", e);
    }
  }

  let defaultProxyKey = isProxyEnabled()
    ? `proxy:${process.env.PROXY_HOST || "default"}`
    : "direct";
  if (options.proxyUrl) {
    try {
      const parsed = new URL(options.proxyUrl);
      defaultProxyKey = `proxy:${parsed.hostname || parsed.host}`;
    } catch {
      defaultProxyKey = `proxy:${process.env.PROXY_HOST || "default"}`;
    }
  }
  const cacheKey = options.proxyKey || defaultProxyKey;

  // 1. Intentar HTTP directo si hay cookies válidas en caché (ultrarrápido, ~200ms)
  const cached = (await loadCache(cacheKey)) || (await loadCache("direct"));
  const now = Date.now();
  if (cached && cached.expiry > now) {
    try {
      const cookieHeader = cached.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      const xsrfCookie = cached.cookies.find((c) => c.name === "XSRF-TOKEN");
      let refererHeader = BASE_URL.SoloLatino;
      try {
        refererHeader = new URL(url).origin + "/";
      } catch {}

      const directHeaders: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": cached.userAgent,
        Referer: refererHeader,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...headers,
      };
      if (xsrfCookie) {
        directHeaders["X-XSRF-TOKEN"] = decodeURIComponent(xsrfCookie.value);
      }

      let agent: AnyProxyAgent | undefined;
      if (options.proxyUrl) {
        agent = createProxyAgent(options.proxyUrl);
      }
      const directRes = (await (agent
        ? nodeFetch(url, {
            method: "POST",
            headers: directHeaders,
            body: postData,
            agent,
          } as never)
        : fetch(url, {
            method: "POST",
            headers: directHeaders,
            body: postData,
          }))) as unknown as Response;

      if (directRes.ok) {
        const text = await directRes.text();
        const isChallenge =
          text.includes("Just a moment...") ||
          text.includes("cf-browser-verification") ||
          text.includes("challenges.cloudflare.com");

        if (!isChallenge) {
          return text;
        }
      }
    } catch {
      // Fallback a FlareSolverr si falla la conexión directa
    }
  }

  // 2. Fallback a FlareSolverr reutilizando sesión persistente y caché
  const flareSolverrEndpoint =
    process.env.FLARESOLVERR_ENDPOINT || "http://localhost:8191/v1";

  const sessionId = getSessionId(options.proxyKey);

  const proxyPayload = buildProxyPayload(options.proxyUrl);

  return withSessionLock(sessionId, async () => {
    await ensureFlareSession(flareSolverrEndpoint, sessionId, proxyPayload);

    const xsrfCookie = cached?.cookies?.find((c) => c.name === "XSRF-TOKEN");
    const solverHeaders: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Referer: BASE_URL.SoloLatino,
      ...headers,
    };
    if (xsrfCookie) {
      solverHeaders["X-XSRF-TOKEN"] = decodeURIComponent(xsrfCookie.value);
    }

    const payload: Record<string, unknown> = {
      cmd: "request.post",
      url,
      postData,
      session: sessionId,
      maxTimeout: 25000,
    };

    const executeRequest = async (retries = 1): Promise<string> => {
      try {
        let response = await fetch(flareSolverrEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          let errorDetail = "";
          try {
            const errJson = (await response.json()) as { message?: string };
            errorDetail = errJson.message || JSON.stringify(errJson);
          } catch {
            errorDetail = await response.text().catch(() => "");
          }
          throw new Error(
            `FlareSolverr POST failed with status ${response.status}${errorDetail ? `: ${errorDetail}` : ""}`,
          );
        }

        let data = (await response.json()) as FlareSolverrResponse;

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
          throw new Error(
            `FlareSolverr POST returned error: ${data.message || data.status}`,
          );
        }

        // Guardar cookies actualizadas en caché si FlareSolverr obtuvo nuevas
        if (data.solution?.cookies && data.solution.cookies.length > 0) {
          const cfClearance = data.solution.cookies.find(
            (c) => c.name === "cf_clearance",
          ) as (FlareSolverrCookies & { expiry?: number }) | undefined;
          let expiry = now + 60 * 60 * 1000;
          if (
            cfClearance?.expiry &&
            typeof cfClearance.expiry === "number" &&
            cfClearance.expiry * 1000 > now
          ) {
            expiry = cfClearance.expiry * 1000;
          }

          await saveCache(cacheKey, {
            userAgent: data.solution.userAgent,
            cookies: data.solution.cookies,
            expiry,
            updatedAt: now,
          });
        }

        return data.solution.response || "";
      } catch (err) {
        console.warn(`[FlareSolverr] POST failed for session ${sessionId}, destroying session...`);
        await destroyFlareSession(flareSolverrEndpoint, sessionId);
        if (options.proxyUrl) {
          ProxyPoolService.getInstance().markProxyFailed(
            options.proxyUrl,
            err instanceof Error ? err.message : String(err),
          );
        }
        throw err;
      }
    };

    return executeRequest();
  });
}
