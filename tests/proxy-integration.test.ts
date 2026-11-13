import { test } from "node:test";
import assert from "node:assert/strict";
import { ProxyPoolService } from "../services/proxy-pool.service.ts";
import { getActiveProxyUrl } from "../utils/proxy.ts";

test("getActiveProxyUrl returns best proxy from pool when available", () => {
  const pool = ProxyPoolService.getInstance();
  pool.reset();

  const sampleProxy = {
    url: "http://10.0.0.1:8080",
    host: "10.0.0.1:8080",
    protocol: "http",
    latencyMs: 50,
    lastChecked: Date.now(),
    failCount: 0,
    isHealthy: true,
  };

  // Inject healthy proxy into pool
  pool["proxies"] = [sampleProxy];

  const active = getActiveProxyUrl();
  assert.equal(active, "http://10.0.0.1:8080");
});
