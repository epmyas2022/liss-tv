import * as proxyChain from "proxy-chain";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { AnyProxyAgent, ProxyAccount, StickySession } from "../types/proxy.ts";
import { bitacora } from "./bitacora.ts";
import { ProxyPoolService } from "../services/proxy-pool.service.ts";

const proxyLogger = bitacora.createScope("Proxy");

export interface ProxyResolvedConfig {
  protocol: string;
  host: string;
  accounts: ProxyAccount[];
}

/**
 * Determine if proxy usage is enabled globally via environment variable.
 */
export function isProxyEnabled(): boolean {
  return process.env.USE_PROXY === "true" || process.env.ENABLE_PROXY === "true";
}

let currentAccountIndex = 0;
const exhaustedUsernames = new Set<string>();

/**
 * Register that a proxy account ran out of bandwidth and should be skipped.
 */
export function markProxyExhausted(username?: string): void {
  if (!username) return;
  if (!exhaustedUsernames.has(username)) {
    exhaustedUsernames.add(username);
    const logMessage = `[⚠️ PROXY BANDWIDTH EXHAUSTED] Proxy account "${username}" has reached its bandwidth limit! Rotating to next available account...`;
    console.warn(logMessage);
    proxyLogger.warning(logMessage, {
      event: "BANDWIDTH_EXHAUSTED",
      username,
      exhaustedCount: exhaustedUsernames.size,
    });
  }
}

/**
 * Check if a proxy account is marked as exhausted.
 */
export function isProxyExhausted(username: string): boolean {
  return exhaustedUsernames.has(username);
}

/**
 * Get list of all currently exhausted proxy accounts.
 */
export function getExhaustedProxies(): string[] {
  return Array.from(exhaustedUsernames);
}

/**
 * Reset exhausted proxies list (e.g. if quotas have been replenished).
 */
export function resetExhaustedProxies(): void {
  exhaustedUsernames.clear();
}

function getProxyAccounts(): ProxyAccount[] {
  if (process.env.PROXY_ACCOUNTS) {
    return process.env.PROXY_ACCOUNTS.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [username, ...passParts] = entry.split(":");
        return { username, password: passParts.join(":") };
      })
      .filter((acc) => acc.username && acc.password);
  }

  const usernames = (process.env.PROXY_USERNAME || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  const passwords = (process.env.PROXY_PASSWORD || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (usernames.length > 0 && passwords.length > 0) {
    return usernames.map((username, index) => ({
      username,
      password: passwords[index] ?? passwords[passwords.length - 1],
    }));
  }

  return [];
}

/**
 * Parse and resolve the current proxy configuration.
 */
export function getProxyConfig(): ProxyResolvedConfig | null {
  const rawTarget = process.env.PROXY_URL || process.env.PROXY_HOST;
  if (!rawTarget) return null;

  let protocol = (process.env.PROXY_PROTOCOL || process.env.PROXY_TYPE || "")
    .toLowerCase()
    .replace(":", "");
  let host = rawTarget.trim();
  let defaultUser: string | undefined;
  let defaultPass: string | undefined;

  // Check if target contains protocol scheme (e.g. socks5://127.0.0.1:1080)
  if (/^[a-zA-Z0-9+-]+:\/\//.test(host)) {
    try {
      const parsed = new URL(host);
      protocol = parsed.protocol.replace(":", "").toLowerCase();
      host = parsed.host;
      if (parsed.username) defaultUser = decodeURIComponent(parsed.username);
      if (parsed.password) defaultPass = decodeURIComponent(parsed.password);
    } catch {
      // fallback to raw host
    }
  }

  // Strip trailing slashes if any
  host = host.replace(/\/+$/, "");

  // Auto-detect protocol if not specified
  if (!protocol) {
    if (host.endsWith(":1080") || host.endsWith(":9050")) {
      protocol = "socks5";
    } else {
      protocol = "http";
    }
  }

  const accounts = getProxyAccounts();
  if (accounts.length === 0 && defaultUser && defaultPass) {
    accounts.push({ username: defaultUser, password: defaultPass });
  }

  return { protocol, host, accounts };
}

/**
 * Get normalized proxy host for cache keys or logging.
 */
export function getProxyHost(): string | undefined {
  const config = getProxyConfig();
  return config?.host || process.env.PROXY_HOST;
}

/**
 * Create appropriate agent (HTTP or SOCKS5) for a given proxy URL.
 */
export function createProxyAgent(url: string): AnyProxyAgent {
  const isSocks =
    url.startsWith("socks5://") ||
    url.startsWith("socks5h://") ||
    url.startsWith("socks4://") ||
    url.startsWith("socks://");

  if (isSocks) {
    return new SocksProxyAgent(url);
  }
  return new HttpsProxyAgent(url);
}

function getNextProxyAccount(accounts: ProxyAccount[]): ProxyAccount {
  const availableAccounts = accounts.filter(
    (acc) => !exhaustedUsernames.has(acc.username),
  );

  if (availableAccounts.length === 0) {
    const errorMessage = `[🚨 ALL PROXIES EXHAUSTED] All ${accounts.length} configured proxy accounts have reached their bandwidth limit!`;
    console.error(errorMessage);
    proxyLogger.error(
      errorMessage,
      new Error("ALL_PROXIES_BANDWIDTH_EXHAUSTED"),
      {
        event: "BANDWIDTH_EXHAUSTED_ALL",
        totalAccounts: accounts.length,
        exhaustedUsernames: Array.from(exhaustedUsernames),
      },
    );
    throw new Error(
      `All ${accounts.length} proxy accounts have exhausted their bandwidth limit. Please renew proxy accounts.`,
    );
  }

  const account = availableAccounts[currentAccountIndex % availableAccounts.length];
  currentAccountIndex = (currentAccountIndex + 1) % availableAccounts.length;
  return account;
}

export function getActiveProxyUrl(): string | null {
  // If explicitly requested to use dynamic public pool, prioritize it
  if (process.env.USE_PROXY_POOL === "true") {
    const dynamicBest = ProxyPoolService.getInstance().getBestProxy();
    if (dynamicBest) return dynamicBest.url;
  }

  // Check static environment configuration (e.g. Cloudflare WARP or dedicated proxy)
  const config = getProxyConfig();
  if (config) {
    const { protocol, host, accounts } = config;
    if (accounts.length === 0) {
      return `${protocol}://${host}`;
    }
    const account = accounts.find((a) => !isProxyExhausted(a.username)) || accounts[0];
    const auth = `${encodeURIComponent(account.username)}:${encodeURIComponent(account.password)}@`;
    return `${protocol}://${auth}${host}`;
  }

  // Fallback to dynamic pool if no static configuration was provided
  const dynamicBest = ProxyPoolService.getInstance().getBestProxy();
  return dynamicBest ? dynamicBest.url : null;
}

export function createStickySession(): StickySession {
  // If explicitly requested to use dynamic public pool, prioritize it
  if (process.env.USE_PROXY_POOL === "true") {
    const dynamicBest = ProxyPoolService.getInstance().getBestProxy();
    if (dynamicBest) {
      const agent = createProxyAgent(dynamicBest.url);
      return { url: dynamicBest.url, agent };
    }
  }

  // Check static environment configuration (e.g. Cloudflare WARP or dedicated proxy)
  const config = getProxyConfig();
  if (config) {
    const { protocol, host, accounts } = config;

    // Open proxy (such as Cloudflare WARP or Tor) without credentials
    if (accounts.length === 0) {
      const url = `${protocol}://${host}`;
      const agent = createProxyAgent(url);
      return { url, agent };
    }

    // Authenticated proxy with rotation
    const { username, password } = getNextProxyAccount(accounts);
    const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
    const url = `${protocol}://${auth}${host}`;
    const agent = createProxyAgent(url);
    return { url, agent, username };
  }

  // Fallback to dynamic pool if no static configuration was provided
  const dynamicBest = ProxyPoolService.getInstance().getBestProxy();
  if (dynamicBest) {
    const agent = createProxyAgent(dynamicBest.url);
    return { url: dynamicBest.url, agent };
  }

  throw new Error(
    "Proxy configuration is missing. Please set PROXY_HOST or PROXY_URL environment variable.",
  );
}

export async function anonymizeProxy(url: string): Promise<string> {
  return proxyChain.anonymizeProxy(url);
}

export async function closeAnonymizedProxy(anonymizedProxy: string): Promise<void> {
  await proxyChain.closeAnonymizedProxy(anonymizedProxy, true);
}
