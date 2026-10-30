import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import { FlareSolverrCookies } from "@/types/solverr";
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
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-breakpad",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-domain-reliability",
  "--disable-ipc-flooding-protection",
  "--disable-renderer-backgrounding",
  "--disable-sync",
  "--no-first-run",
  "--no-default-browser-check",
  "--mute-audio",
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

export async function getBrowserContext(
  anonymizedProxy?: string,
  userAgent?: string,
) {

  const HOST_CDP = process.env.HOST_CDP || "http://localhost:8192";
  const browser = await chromium.connectOverCDP(HOST_CDP);

  const isExistFileState = await fs
    .access("state.json")
    .then(() => true)
    .catch(() => false);

  if (isExistFileState) {
    console.info("[📁] state.json file exists. Using it for storage state.");
  }

  const context = await browser.contexts()[0] || null;

  if(!context) throw new Error("No browser context available. Please ensure the browser is running and accessible.");

  const page = await context.pages()[0] || null;

  if(!page) throw new Error("No page available in the browser context. Please ensure the browser is running and accessible.");

  return { browser, context, page };
}

export interface GetBrowserOptions {
  proxyUrl?: string;
  anonymizedProxy?: string;
  userAgent?: string;
  cookies?: FlareSolverrCookies[];
  blockAssets?: boolean;
}

export async function getBrowser(options: GetBrowserOptions = {}) {
  let anonymizedProxy = options.anonymizedProxy;
  if (!anonymizedProxy) {
    const proxyUrl = options.proxyUrl || createStickySession().url;
    anonymizedProxy = await anonymizeProxy(proxyUrl);
  }

  const result = await getBrowserContext(anonymizedProxy, options.userAgent);

  if (options.cookies && options.cookies.length > 0) {
    await result.context.addCookies(
      options.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith(".") ? c.domain : `.${c.domain}`,
        path: c.path || "/",
        secure: c.secure,
      })),
    );
  }


  if (options.blockAssets !== false) {
    await result.page.route("**/*", (route) => {
      const type = route.request().resourceType();
      const url = route.request().url();

      if (
        url.includes("cloudflare.com") ||
        url.includes("challenges.cloudflare.com")
      ) {
        return route.continue();
      }

      if (
        blacklistedDomains.some((domain) => url.includes(domain)) ||
        ["image", "media", "font"].includes(type)
      ) {
        return route.abort();
      }
      return route.continue();
    });
  }

  return { ...result, anonymizedProxy };
}
