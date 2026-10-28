import {
  FlareSolverrOutput,
  FlareSolverrResponse,
  FlareSolverrCacheEntry,
  FlareSolverrCacheStore,
  ResolverOptions,
  FetchFlareOptions,
} from "@/types/solverr";
import { BASE_URL } from "@/utils/browser";
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

/**
 * Resolve a captcha challenge via FlareSolverr, returning the required user-agent and cookies.
 * Supports caching based on IP/host so proxy username rotations reuse solved clearance cookies.
 */
export async function resolver(
  url: string,
  options: ResolverOptions = {},
): Promise<FlareSolverrOutput> {
  const cacheKey =
    options.proxyKey ||
    (options.proxyUrl
      ? `proxy:${new URL(options.proxyUrl).hostname || new URL(options.proxyUrl).host}`
      : "direct");

  const cached = await loadCache(cacheKey);
  const now = Date.now();
  if (cached && cached.expiry > now) {
    return { userAgent: cached.userAgent, cookies: cached.cookies };
  }

  const flareSolverrEndpoint =
    process.env.FLARESOLVERR_ENDPOINT || "http://localhost:8191/v1";

  const payload: Record<string, unknown> = {
    cmd: "request.get",
    url: url || BASE_URL.SoloLatino,
    maxTimeout: 60000,
  };

  if (options.proxyUrl) {
    try {
      const parsed = new URL(options.proxyUrl);
      const proxyPayload: Record<string, string> = {
        url: `${parsed.protocol}//${parsed.host}`,
      };
      if (parsed.username) {
        proxyPayload.username = decodeURIComponent(parsed.username);
      }
      if (parsed.password) {
        proxyPayload.password = decodeURIComponent(parsed.password);
      }
      payload.proxy = proxyPayload;
    } catch {
      payload.proxy = {
        url: cleanProxyUrl(options.proxyUrl),
      };
    }
  }

  const response = await fetch(flareSolverrEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `FlareSolverr request failed with status ${response.status}`,
    );
  }

  const data: FlareSolverrResponse = await response.json();
  if (data.status !== "ok") {
    throw new Error(`FlareSolverr returned error status: ${data.status}`);
  }

  const {
    userAgent,
    cookies,
    response: solutionHtml,
    status: solutionStatus,
  } = data.solution;

  if (
    solutionHtml &&
    (solutionHtml.includes("ERR_NO_SUPPORTED_PROXIES") ||
      solutionHtml.includes("class=\"neterror\""))
  ) {
    throw new Error(
      "FlareSolverr proxy connection failed with ERR_NO_SUPPORTED_PROXIES",
    );
  }

  // Cache for 1 hour
  const expiry = now + 60 * 60 * 1000;
  await saveCache(cacheKey, { userAgent, cookies, expiry });
  return {
    userAgent,
    cookies,
    html: solutionHtml,
    status: solutionStatus,
  };
}

export type { FetchFlareOptions, ResolverOptions } from "@/types/solverr";

/**
 * Helper to perform a fetch:
 * - Resolves captcha via FlareSolverr (routing through proxy if agent/proxy is supplied).
 * - Caches and injects clearance cookies & user-agent linked to the IP.
 * - Reuses solution HTML directly if freshly resolved, otherwise dispatches via fetch/node-fetch.
 */
export async function fetchFlare(
  url: string,
  options: FetchFlareOptions = {},
): Promise<Response> {
  const proxyDetails = extractProxyDetails(options);
  const resolverOutput = await resolver(url, proxyDetails);

  // If FlareSolverr solved and retrieved the target URL directly, reuse its HTML response
  if (resolverOutput.html) {
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
    return nodeFetch(url, fetchOptions as never) as unknown as Response;
  }

  return fetch(url, fetchOptions);
}
