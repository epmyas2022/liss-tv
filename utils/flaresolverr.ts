import {
  FlareSolverrOutput,
  FlareSolverrResponse,
  FlareSolverrCookies,
} from "@/types/solverr";
import { BASE_URL, BROWSER_UA } from "@/utils/browser";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import nodeFetch from "node-fetch";

/**
 * Cache file for storing resolved user-agent and cookies.
 * Uses process.cwd() to avoid __dirname resolution issues in Next.js bundle.
 */
const CACHE_FILE_PATH = path.join(process.cwd(), "data", "flaresolverrCache.json");

/**
 * Load the shared cache from disk. If the file does not exist, is expired, or malformed, returns null.
 */
async function loadCache(): Promise<{
  userAgent: string;
  cookies: FlareSolverrCookies[];
  expiry: number;
} | null> {
  try {
    const data = await readFile(CACHE_FILE_PATH, "utf-8");
    const parsed = JSON.parse(data);
    if (
      parsed &&
      typeof parsed.userAgent === "string" &&
      Array.isArray(parsed.cookies) &&
      typeof parsed.expiry === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist the shared cache back to disk, creating directory if needed.
 */
async function saveCache(cache: {
  userAgent: string;
  cookies: FlareSolverrCookies[];
  expiry: number;
}) {
  await mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
  await writeFile(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Resolve a captcha challenge via FlareSolverr, returning the required user-agent and cookies.
 * If valid cache exists, returns cached credentials immediately without calling FlareSolverr.
 */
export async function resolver(url: string): Promise<FlareSolverrOutput> {
  const cached = await loadCache();
  const now = Date.now();
  if (cached && cached.expiry > now) {
    return { userAgent: cached.userAgent, cookies: cached.cookies };
  }

  const flareSolverrEndpoint = "http://localhost:8191/v1";
  const payload = {
    cmd: "request.get",
    url: url || BASE_URL.SoloLatino,
    maxTimeout: 60000,
  };

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

  const { userAgent, cookies } = data.solution;
  // Cache for 1 hour
  const expiry = now + 60 * 60 * 1000;
  await saveCache({ userAgent, cookies, expiry });
  return { userAgent, cookies };
}

export interface FetchFlareOptions extends RequestInit {
  agent?: unknown;
}

/**
 * Helper to perform a fetch:
 * - If a proxy agent is passed: skips cookies and FlareSolverr resolution completely,
 *   routing directly through node-fetch using the proxy IP.
 * - Otherwise: resolves captcha via FlareSolverr and injects clearance cookies & user-agent.
 */
export async function fetchFlare(
  url: string,
  options: FetchFlareOptions = {},
): Promise<Response> {
  if (options.agent) {
    const mergedHeaders = new Headers(options.headers || {});
    if (!mergedHeaders.has("User-Agent")) {
      mergedHeaders.set("User-Agent", BROWSER_UA);
    }
    const fetchOptions = {
      ...options,
      headers: mergedHeaders,
    };
    return nodeFetch(url, fetchOptions as never) as unknown as Response;
  }

  const { userAgent, cookies } = await resolver(url);

  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const mergedHeaders = new Headers(options.headers || {});
  mergedHeaders.set("User-Agent", userAgent);
  if (cookieHeader) {
    mergedHeaders.set("Cookie", cookieHeader);
  }

  const fetchOptions = {
    ...options,
    headers: mergedHeaders,
  };

  return fetch(url, fetchOptions);
}
