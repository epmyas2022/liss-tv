import { BASE_URL } from "@/utils/browser";
import { bitacora } from "@/utils/bitacora";
import {
  loadCache,
  saveCache,
  deleteCache,
  resolver,
} from "@/utils/flaresolverr";
import { FlareSolverrCookies } from "@/types/solverr";

const DEFAULT_CACHE_KEY = "direct";
const INITIAL_BOOT_DELAY_MS = 15_000;
const MIN_INTERVAL_MINUTES = 40;
const MAX_JITTER_MINUTES = 25;
const EXTENDED_CACHE_LIFETIME_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

const CHALLENGE_INDICATORS = [
  "Just a moment...",
  "cf-browser-verification",
  "challenges.cloudflare.com",
  "_cf_chl_opt",
] as const;

const logger = bitacora.createScope("FlareSolverrMonitor");

let isMonitorActive = false;

function buildCookieHeader(cookies: FlareSolverrCookies[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function containsCloudflareChallenge(html: string): boolean {
  return CHALLENGE_INDICATORS.some((indicator) => html.includes(indicator));
}

async function pingSession(
  targetUrl: string,
  userAgent: string,
  cookies: FlareSolverrCookies[],
): Promise<boolean> {
  const cookieHeader = buildCookieHeader(cookies);

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return false;
    }

    const html = await response.text();
    if (containsCloudflareChallenge(html)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function calculateNextDelayMs(): number {
  const jitterMinutes = Math.floor(Math.random() * MAX_JITTER_MINUTES);
  const totalMinutes = MIN_INTERVAL_MINUTES + jitterMinutes;
  return totalMinutes * 60 * 1000;
}

export async function checkAndWarmSession(): Promise<void> {
  const cached = await loadCache(DEFAULT_CACHE_KEY);

  if (!cached) {
    logger.warning("No cached session found. Resolving fresh session via FlareSolverr...");
    await resolver(BASE_URL.SoloLatino);
    logger.success("Initial FlareSolverr session resolved and cached.");
    return;
  }

  const isHealthy = await pingSession(
    BASE_URL.SoloLatino,
    cached.userAgent,
    cached.cookies,
  );

  if (!isHealthy) {
    logger.warning("Cached session expired or challenge detected. Renewing session...");
    await deleteCache(DEFAULT_CACHE_KEY);
    await resolver(BASE_URL.SoloLatino);
    logger.success("FlareSolverr session successfully renewed and cached.");
    return;
  }

  const extendedExpiry = Date.now() + EXTENDED_CACHE_LIFETIME_MS;
  await saveCache(DEFAULT_CACHE_KEY, {
    ...cached,
    expiry: extendedExpiry,
  });

  logger.success("Cloudflare session is still active. Cache expiry extended.");
}

export function startFlareSolverrMonitor(): void {
  if (isMonitorActive) {
    return;
  }

  isMonitorActive = true;
  logger.warning("FlareSolverr background monitor initialized.");

  const executeCycle = async (): Promise<void> => {
    try {
      await checkAndWarmSession();
    } catch (error) {
      logger.error("Error during FlareSolverr background check cycle", error);
    }

    const nextDelayMs = calculateNextDelayMs();
    const nextDelayMinutes = Math.round(nextDelayMs / (60 * 1000));
    logger.warning(`Next session verification scheduled in ${nextDelayMinutes} minutes.`);

    setTimeout(() => {
      void executeCycle();
    }, nextDelayMs);
  };

  setTimeout(() => {
    void executeCycle();
  }, INITIAL_BOOT_DELAY_MS);
}
