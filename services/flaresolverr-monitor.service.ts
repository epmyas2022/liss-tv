import { BASE_URL } from "@/utils/browser";
import { bitacora } from "@/utils/bitacora";
import {
  loadCache,
  resolver,
} from "@/utils/flaresolverr";
import { isProxyEnabled, getProxyHost } from "@/utils/proxy";

function getMonitorCacheKey(): string {
  if (isProxyEnabled()) {
    return `proxy:${getProxyHost() || "default"}`;
  }
  return "direct";
}

const INITIAL_BOOT_DELAY_MS = 15_000;
const MIN_INTERVAL_MINUTES = 10;
const MAX_JITTER_MINUTES = 2; // Ciclos entre 10 y 12 minutos
const RECENT_BOOT_THRESHOLD_MS = 5 * 60 * 1000; // Si la caché tiene < 5 min al iniciar, reusar

const logger = bitacora.createScope("FlareSolverrMonitor");

let isMonitorActive = false;

function calculateNextDelayMs(): number {
  const jitterMinutes = Math.floor(Math.random() * (MAX_JITTER_MINUTES + 1));
  const totalMinutes = MIN_INTERVAL_MINUTES + jitterMinutes;
  return totalMinutes * 60 * 1000;
}

export async function checkAndWarmSession(isInitialBoot = false): Promise<void> {
  const cacheKey = getMonitorCacheKey();
  const cached = await loadCache(cacheKey);
  const now = Date.now();

  // Si la sesión sigue vigente (y le quedan más de 10 min de vida útil), no la forzamos
  if (cached?.expiry && cached.expiry - now > 10 * 60 * 1000) {
    const remainingMinutes = Math.round((cached.expiry - now) / 60000);
    logger.success(
      `Cached session (${cacheKey}) is fresh (valid for ${remainingMinutes}m). Skipping resolution.`,
    );
    return;
  }

  // Al arrancar: si ya hay caché muy reciente (< 5 min), la consideramos válida para no duplicar peticiones
  if (isInitialBoot && cached?.updatedAt) {
    const ageMs = now - cached.updatedAt;
    if (ageMs < RECENT_BOOT_THRESHOLD_MS) {
      const ageSeconds = Math.round(ageMs / 1000);
      logger.success(
        `Cached session (${cacheKey}) is fresh (${ageSeconds}s old). Skipping initial boot resolution.`,
      );
      return;
    }
  }

  logger.warning(
    `Proactively refreshing FlareSolverr session (${cacheKey}) in background to prevent expiration...`,
  );

  try {
    await resolver(BASE_URL.SoloLatino);
    logger.success(`FlareSolverr session (${cacheKey}) successfully renewed and cached proactively.`);
  } catch (error) {
    logger.error("Failed to renew FlareSolverr session during monitor cycle", error);
  }
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

  setTimeout(async () => {
    try {
      await checkAndWarmSession(true);
    } catch (error) {
      logger.error("Error during initial FlareSolverr boot cycle", error);
    }

    const nextDelayMs = calculateNextDelayMs();
    const nextDelayMinutes = Math.round(nextDelayMs / (60 * 1000));
    logger.warning(`Next session verification scheduled in ${nextDelayMinutes} minutes.`);

    setTimeout(() => {
      void executeCycle();
    }, nextDelayMs);
  }, INITIAL_BOOT_DELAY_MS);
}
