import type { HttpsProxyAgent } from "https-proxy-agent";
import type { SocksProxyAgent } from "socks-proxy-agent";

export type AnyProxyAgent = HttpsProxyAgent<string> | SocksProxyAgent;

export interface ProxyAccount {
  username: string;
  password: string;
}

export interface StickySession {
  url: string;
  agent: AnyProxyAgent;
  username?: string;
}

