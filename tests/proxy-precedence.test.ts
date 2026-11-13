import { test } from "node:test";
import assert from "node:assert/strict";
import { getActiveProxyUrl, createStickySession } from "../utils/proxy.ts";
import { ProxyPoolService } from "../services/proxy-pool.service.ts";

test("prefers static PROXY_HOST (e.g. WARP) over dynamic public pool when configured", () => {
  process.env.PROXY_HOST = "cloudflare-warp-socks:1080";
  process.env.PROXY_PROTOCOL = "socks5";
  delete process.env.PROXY_USERNAME;
  delete process.env.PROXY_PASSWORD;
  delete process.env.USE_PROXY_POOL;

  // Even if pool has candidate, static proxy takes priority
  const pool = ProxyPoolService.getInstance();
  pool.reset();
  pool["proxies"] = [{
    url: "http://some-public-proxy:8080",
    host: "some-public-proxy:8080",
    protocol: "http",
    latencyMs: 10,
    lastChecked: Date.now(),
    failCount: 0,
    isHealthy: true,
  }];

  const activeUrl = getActiveProxyUrl();
  assert.equal(activeUrl, "socks5://cloudflare-warp-socks:1080");

  const session = createStickySession();
  assert.equal(session.url, "socks5://cloudflare-warp-socks:1080");
});
