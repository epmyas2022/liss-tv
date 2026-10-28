import * as proxyChain from "proxy-chain";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyAccount, StickySession } from "@/types/proxy";

const PROXY_HOST = process.env.PROXY_HOST;

let currentAccountIndex = 0;

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

  const account = accounts[currentAccountIndex % accounts.length];
  currentAccountIndex = (currentAccountIndex + 1) % accounts.length;
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
  return { url, agent };
}

export async function anonymizeProxy(url: string): Promise<string> {
  return proxyChain.anonymizeProxy(url);
}

export async function closeAnonymizedProxy(anonymizedProxy: string): Promise<void> {
  await proxyChain.closeAnonymizedProxy(anonymizedProxy, true);
}
