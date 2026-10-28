import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import {
  createStickySession,
  anonymizeProxy,
  closeAnonymizedProxy,
} from "./proxy";

export { createStickySession, anonymizeProxy, closeAnonymizedProxy };

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
  SoloLatino: "https://sololatino.net/",
};

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function getBrowserContext(anonymizedProxy?: string) {
  const browser = await chromium.launch({
    headless: true,
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

export async function getBrowser() {
  const { url: stickyUrl } = createStickySession();
  const anonymizedProxy = await anonymizeProxy(stickyUrl);
  const result = await getBrowserContext(anonymizedProxy);
  return { ...result, anonymizedProxy };
}
