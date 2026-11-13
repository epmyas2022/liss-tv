import { test } from "node:test";
import assert from "node:assert/strict";
import { ProxyPoolService } from "../services/proxy-pool.service.ts";

test("ProxyPoolService orders proxies by latency and filters dead ones", async () => {
  const pool = ProxyPoolService.getInstance();
  pool.reset();

  pool.setCandidates([
    "http://1.1.1.1:8080",
    "http://2.2.2.2:8080",
  ]);

  // Mock checking logic
  pool.checkProxy = async (url: string) => {
    if (url.includes("1.1.1.1")) return { isHealthy: true, latencyMs: 120 };
    return { isHealthy: false, latencyMs: 9999 };
  };

  await pool.refreshPool();

  assert.equal(pool.getHealthyCount(), 1);
  const best = pool.getBestProxy();
  assert.ok(best);
  assert.equal(best.url, "http://1.1.1.1:8080");
  assert.equal(best.latencyMs, 120);
});

test("ProxyPoolService marks proxy failed and rotates", async () => {
  const pool = ProxyPoolService.getInstance();
  pool.reset();

  pool.setCandidates(["http://1.1.1.1:8080", "http://3.3.3.3:8080"]);
  pool.checkProxy = async (url: string) => {
    if (url.includes("1.1.1.1")) return { isHealthy: true, latencyMs: 100 };
    if (url.includes("3.3.3.3")) return { isHealthy: true, latencyMs: 200 };
    return { isHealthy: false, latencyMs: 9999 };
  };

  await pool.refreshPool();
  assert.equal(pool.getBestProxy()?.url, "http://1.1.1.1:8080");

  pool.markProxyFailed("http://1.1.1.1:8080", "403 ban");
  pool.markProxyFailed("http://1.1.1.1:8080", "403 ban");

  const nextBest = pool.getBestProxy();
  assert.ok(nextBest);
  assert.equal(nextBest.url, "http://3.3.3.3:8080");
});
