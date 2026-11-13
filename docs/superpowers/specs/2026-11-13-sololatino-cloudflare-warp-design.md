# Design Document: SoloLatino Cloudflare WARP SOCKS5 Integration

- **Date:** 2026-11-13
- **Author:** Antigravity & Engineering Team
- **Status:** Proposed
- **Target File(s):**
  - `.env`
  - `utils/proxy.ts`
  - `docker-compose.yml`

---

## 1. Intent & Motivation

FlareSolverr consistently fails to solve Cloudflare Turnstile challenges when routed through free public proxies (e.g. Hetzner/datacenter SOCKS5), resulting in 25s timeouts.
To achieve zero-timeout, zero-captcha reliability without paid proxy subscriptions, the architecture transitions to the local **Cloudflare WARP** container (`cloudflare-warp-socks:1080` in Docker / `127.0.0.1:1080` in local dev). Because WARP routes egress traffic through Cloudflare's own network (AS13335), Cloudflare WAF grants immediate clearance without interactive challenges.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Prioritize explicit static proxy configuration (such as Cloudflare WARP) over public candidate pools when configured in `.env` / environment.
- Configure `.env` and `docker-compose.yml` for unauthenticated SOCKS5 WARP routing.
- Enable seamless clearance extraction: FlareSolverr resolves `cf_clearance` via WARP in < 3s, caches it, and subsequent requests execute over HTTP in ~150ms.

### Non-Goals
- Eliminating FlareSolverr or Playwright entirely.
- Paying for third-party captcha-solving APIs.

### Anti-Goals
- Overriding user-specified static proxy configurations (like WARP) with unstable public proxy lists.

---

## 3. Implementation Details

1. **Static vs Dynamic Proxy Precedence (`utils/proxy.ts`):**
   - If `.env` explicitly defines a dedicated proxy (e.g., `cloudflare-warp-socks:1080` or `127.0.0.1:1080`), prioritize this configuration over the random public proxy pool.
   - The public `ProxyPoolService` will act as a fallback only when no static proxy is configured or when `USE_PROXY_POOL=true`.

2. **Configuration Settings:**
   ```env
   USE_PROXY="true"
   PROXY_HOST="cloudflare-warp-socks:1080" # or "127.0.0.1:1080" for host dev
   PROXY_PROTOCOL="socks5"
   PROXY_USERNAME=""
   PROXY_PASSWORD=""
   ```

3. **Verification:**
   - Run connectivity check through `socks5://127.0.0.1:1080` / `cloudflare-warp-socks:1080`.
   - Verify FlareSolverr resolves challenge without timeouts.
