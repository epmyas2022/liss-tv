import type { HttpsProxyAgent } from "https-proxy-agent";

export interface FlareSolverrCookies {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
}

export interface FlareSolverrResponse {
  status: string;
  solution: {
    url: string;
    userAgent: string;
    responseHeaders: Record<string, string>;
    cookies: FlareSolverrCookies[];
  };
}

export interface FlareSolverrOutput {
  userAgent: string;
  cookies: FlareSolverrCookies[];
}

export interface FlareSolverrCacheEntry {
  userAgent: string;
  cookies: FlareSolverrCookies[];
  expiry: number;
}

export type FlareSolverrCacheStore = Record<string, FlareSolverrCacheEntry>;

export interface ResolverOptions {
  proxyUrl?: string;
  proxyKey?: string;
}

export interface FetchFlareOptions extends RequestInit {
  agent?: HttpsProxyAgent<string>;
  proxyUrl?: string;
}
