import type { ManagedProxy } from "../types/proxy.ts";
import { createProxyAgent } from "../utils/proxy.ts";
import nodeFetch from "node-fetch";
import { readFile } from "fs/promises";
import path from "path";

const DEFAULT_PROXY_LIST_URL =
  process.env.PROXY_LIST_URL ||
  "https://proxywing.com/api/free-proxy-list?format=txt&proxy_format=protocolipport";
const PROXY_CHECK_TIMEOUT_MS = 2500;
const PROXY_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_FAIL_COUNT = 2;

export class ProxyPoolService {
  private static instance: ProxyPoolService | null = null;
  private candidates: string[] = [];
  private proxies: ManagedProxy[] = [];
  private isRefreshing = false;

  private constructor() {}

  public static getInstance(): ProxyPoolService {
    if (!ProxyPoolService.instance) {
      ProxyPoolService.instance = new ProxyPoolService();
    }
    return ProxyPoolService.instance;
  }

  public setCandidates(list: string[]): void {
    this.candidates = Array.from(
      new Set(list.map((u) => u.trim()).filter((u) => u.length > 0)),
    );
  }

  public reset(): void {
    this.candidates = [];
    this.proxies = [];
    this.isRefreshing = false;
  }

  public getHealthyCount(): number {
    const now = Date.now();
    return this.proxies.filter(
      (p) => p.isHealthy && (p.failCount < MAX_FAIL_COUNT || now - p.lastChecked > PROXY_COOLDOWN_MS),
    ).length;
  }

  public getBestProxy(): ManagedProxy | null {
    const now = Date.now();
    const available = this.proxies.filter(
      (p) => p.isHealthy && (p.failCount < MAX_FAIL_COUNT || now - p.lastChecked > PROXY_COOLDOWN_MS),
    );
    if (available.length === 0) return null;
    return available[0];
  }

  public markProxyFailed(proxyUrl: string, reason?: string): void {
    const cleanUrl = proxyUrl.trim().replace(/\/+$/, "");
    const target = this.proxies.find(
      (p) => p.url.replace(/\/+$/, "") === cleanUrl || cleanUrl.includes(p.host),
    );

    if (target) {
      target.failCount += 1;
      target.lastChecked = Date.now();
      if (target.failCount >= MAX_FAIL_COUNT) {
        target.isHealthy = false;
        console.warn(
          `[ProxyPool] Proxy ${target.host} marked UNHEALTHY (fails: ${target.failCount}, reason: ${reason || "unknown"})`,
        );
      } else {
        console.info(
          `[ProxyPool] Proxy ${target.host} reported failure (count: ${target.failCount}, reason: ${reason || "unknown"})`,
        );
      }
    }
  }

  public async checkProxy(
    proxyUrl: string,
    timeoutMs = PROXY_CHECK_TIMEOUT_MS,
  ): Promise<{ isHealthy: boolean; latencyMs: number }> {
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const agent = createProxyAgent(proxyUrl);
      const res = await nodeFetch("https://sololatino.net/robots.txt", {
        method: "HEAD",
        agent: agent as never,
        signal: controller.signal as never,
      });

      clearTimeout(timer);
      const elapsed = Math.round(performance.now() - start);

      if (res.status === 200 || res.status === 301 || res.status === 302 || res.status === 404) {
        return { isHealthy: true, latencyMs: elapsed };
      }
      return { isHealthy: false, latencyMs: elapsed };
    } catch {
      clearTimeout(timer);
      return { isHealthy: false, latencyMs: 99999 };
    }
  }

  private async loadCandidates(): Promise<string[]> {
    if (this.candidates.length > 0) {
      return this.candidates;
    }

    const fetchedList: string[] = [];

    // 1. Intentar descargar de la API
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await nodeFetch(DEFAULT_PROXY_LIST_URL, {
        signal: controller.signal as never,
      });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("http://") || l.startsWith("https://") || l.startsWith("socks5://"));
        if (lines.length > 0) {
          console.info(`[ProxyPool] Successfully fetched ${lines.length} candidate proxies from remote list.`);
          return lines;
        }
      }
    } catch (e) {
      console.warn("[ProxyPool] Failed to fetch remote proxy list, checking local proxies.txt...", e);
    }

    // 2. Fallback a proxies.txt local
    try {
      const localPath = path.join(process.cwd(), "proxies.txt");
      const content = await readFile(localPath, "utf-8");
      const localLines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
      if (localLines.length > 0) {
        console.info(`[ProxyPool] Loaded ${localLines.length} candidate proxies from local proxies.txt`);
        return localLines;
      }
    } catch {}

    return fetchedList;
  }

  public async refreshPool(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      const rawCandidates = await this.loadCandidates();
      if (rawCandidates.length === 0) {
        this.isRefreshing = false;
        return;
      }

      // Tomar hasta 20 candidatos para sondear en paralelo
      const sample = rawCandidates.slice(0, 20);
      console.info(`[ProxyPool] Probing ${sample.length} proxies for latency & connectivity...`);

      const probeResults = await Promise.allSettled(
        sample.map(async (proxyUrl) => {
          let host = proxyUrl;
          let protocol = "http";
          try {
            const parsed = new URL(proxyUrl);
            host = parsed.host;
            protocol = parsed.protocol.replace(":", "");
          } catch {}

          const { isHealthy, latencyMs } = await this.checkProxy(proxyUrl);
          const managed: ManagedProxy = {
            url: proxyUrl,
            host,
            protocol,
            latencyMs,
            lastChecked: Date.now(),
            failCount: isHealthy ? 0 : 2,
            isHealthy,
          };
          return managed;
        }),
      );

      const verified = probeResults
        .filter((r): r is PromiseFulfilledResult<ManagedProxy> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter((p) => p.isHealthy)
        .sort((a, b) => a.latencyMs - b.latencyMs);

      if (verified.length > 0) {
        this.proxies = verified;
        console.info(
          `[ProxyPool] Pool updated with ${verified.length} healthy proxies. Best: ${verified[0].url} (${verified[0].latencyMs}ms)`,
        );
      } else {
        console.warn("[ProxyPool] No proxies passed the health check in this round.");
      }
    } finally {
      this.isRefreshing = false;
    }
  }
}
