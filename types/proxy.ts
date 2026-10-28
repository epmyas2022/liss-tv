import type { HttpsProxyAgent } from "https-proxy-agent";

export interface ProxyAccount {
  username: string;
  password: string;
}

export interface StickySession {
  url: string;
  agent: HttpsProxyAgent<string>;
}
