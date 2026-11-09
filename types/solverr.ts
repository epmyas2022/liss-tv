import type { HttpsProxyAgent } from "https-proxy-agent";
import type { SocksProxyAgent } from "socks-proxy-agent";

export type AnyProxyAgent = HttpsProxyAgent<string> | SocksProxyAgent;

export interface FlareSolverrCookies {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
}

export interface FlareSolverrResponse {
  status: string;
  message?: string;
  solution: {
    url: string;
    status?: number;
    userAgent: string;
    responseHeaders?: Record<string, string>;
    cookies: FlareSolverrCookies[];
    response?: string;
  };
}

export interface FlareSolverrOutput {
  userAgent: string;
  cookies: FlareSolverrCookies[];
  html?: string;
  status?: number;
}

export interface FlareSolverrCacheEntry {
  userAgent: string;
  cookies: FlareSolverrCookies[];
  expiry: number;
  updatedAt?: number;
}

export type FlareSolverrCacheStore = Record<string, FlareSolverrCacheEntry>;

export interface ResolverOptions {
  proxyUrl?: string;
  proxyKey?: string;
}

export interface PostFlareOptions {
  proxyUrl?: string;
  proxyKey?: string;
}

export interface FetchFlareOptions extends RequestInit {
  agent?: AnyProxyAgent;
  proxyUrl?: string;
  proxyUsername?: string;
}
