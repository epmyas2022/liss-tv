import * as proxyChain from "proxy-chain";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyAccount, StickySession } from "@/types/proxy";

const PROXY_HOST = process.env.PROXY_HOST;

let currentAccountIndex = 0;
const exhaustedUsernames = new Set<string>();

/**
 * Register that a proxy account ran out of bandwidth and should be skipped.
 */
export function markProxyExhausted(username: string): void {
  if (!username) return;
  if (!exhaustedUsernames.has(username)) {
    exhaustedUsernames.add(username);
    console.warn(
      `[⚠️ PROXY BANDWIDTH EXHAUSTED] Proxy account "${username}" has reached its bandwidth limit! Rotating to next available account...`,
    );
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

function getNextProxyAccount(): ProxyAccount {
  const accounts = getProxyAccounts();
  if (accounts.length === 0) {
    throw new Error(
      "Proxy credentials are missing. Please configure PROXY_ACCOUNTS (e.g. 'user1:pass1,user2:pass2') or PROXY_USERNAME and PROXY_PASSWORD.",
    );
  }

  const availableAccounts = accounts.filter(
    (acc) => !exhaustedUsernames.has(acc.username),
  );

  if (availableAccounts.length === 0) {
    console.error(
      `[🚨 ALL PROXIES EXHAUSTED] All ${accounts.length} configured proxy accounts have reached their bandwidth limit!`,
    );
    throw new Error(
      `All ${accounts.length} proxy accounts have exhausted their bandwidth limit. Please renew proxy accounts.`,
    );
  }

  const account = availableAccounts[currentAccountIndex % availableAccounts.length];
  currentAccountIndex = (currentAccountIndex + 1) % availableAccounts.length;
  return account;
}

export function createStickySession(): StickySession {
  if (!PROXY_HOST) {
    throw new Error(
      "Proxy configuration is missing. Please set PROXY_HOST environment variable.",
    );
  }

  const { username, password } = getNextProxyAccount();
  const url = `http://${username}:${password}@${PROXY_HOST}`;
  const agent = new HttpsProxyAgent(url);
  return { url, agent, username };
}

export async function anonymizeProxy(url: string): Promise<string> {
  return proxyChain.anonymizeProxy(url);
}

export async function closeAnonymizedProxy(anonymizedProxy: string): Promise<void> {
  await proxyChain.closeAnonymizedProxy(anonymizedProxy, true);
}
