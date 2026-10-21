import * as proxyChain from "proxy-chain";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { HttpsProxyAgent } from "https-proxy-agent";
import fs from "fs/promises";

const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_USERNAME = process.env.PROXY_USERNAME;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;

const BROWSER_ARGS = [
  "--autoplay-policy=no-user-gesture-required",
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-extensions",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

chromium.use(stealth());

export const blacklistedDomains = [
  "google-analytics.com",
  "googletagmanager.com",
  "cloudflareinsights.com",
  "://cloudflareinsights.com",
  "doubleclick.net",
  "adbrn.com",
  "jads.co",
  "popads.net",
  "onclickads.net",
  "://impactradius-go.com",
];


export const BASE_URL = {
    "SoloLatino": "https://sololatino.net/",
}


export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function createStickySession() {
  if (!PROXY_HOST || !PROXY_USERNAME || !PROXY_PASSWORD) {
    throw new Error(
      "Proxy configuration is missing. Please set PROXY_HOST, PROXY_USERNAME, and PROXY_PASSWORD environment variables.",
    );
  }
  const sessid = Math.random().toString(36).substring(2, 12);
  const username = `${PROXY_USERNAME}-sessid-${sessid}`;
  const url = `http://${username}:${PROXY_PASSWORD}@${PROXY_HOST}`;
  const agent = new HttpsProxyAgent(url);
  return { url, agent };
}

export async function getBrowserContext(anonymizedProxy?: string) {
  const browser = await chromium.launch({
    headless: false,
    args: BROWSER_ARGS,
    ...(anonymizedProxy && { proxy: { server: anonymizedProxy } }),
  });

  const isExistFileState = await fs
    .access("state.json")
    .then(() => true)
    .catch(() => false);

  if (isExistFileState) {
    console.info("[📁] state.json file exists. Using it for storage state.");
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: BROWSER_UA,
    ...(isExistFileState && { storageState: "state.json" }),
  });

  const page = await context.newPage();
  return { browser, context, page };
}

export async function anonymizeProxy(url: string) {
  const anonymizedProxy = await proxyChain.anonymizeProxy(url);
  return anonymizedProxy;
}

export async function getBrowser() {
  const { url: stickyUrl } = createStickySession();
  const anonymizedProxy = await anonymizeProxy(stickyUrl);
  const result = await getBrowserContext(anonymizedProxy);
  return { ...result, anonymizedProxy };
}

export async function closeAnonymizedProxy(anonymizedProxy: string) {
  await proxyChain.closeAnonymizedProxy(anonymizedProxy, true);
}
