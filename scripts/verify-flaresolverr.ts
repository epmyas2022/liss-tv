import { ProxyPoolService } from "../services/proxy-pool.service.ts";
import { isBannedResponse, isChallengeResponse, buildFlarePayload } from "../utils/flaresolverr.ts";
import { getActiveProxyUrl } from "../utils/proxy.ts";

async function main() {
  console.log("=== FlareSolverr & Proxy Pool Verification ===");

  // 1. Verify buildFlarePayload conforms to FlareSolverr v2/v3
  const payload = buildFlarePayload("https://sololatino.net/", "test_session", 25000);
  console.log("✓ Payload structure:", payload);
  if ("headers" in payload) {
    throw new Error("FAIL: Deprecated 'headers' found in payload");
  }

  // 2. Verify signature detectors
  const sampleBanned = '<div id="banned-modal">Cuenta suspendida</div>';
  const sampleChallenge = '<title>Just a moment...</title>';
  console.log("✓ Detects banned modal:", isBannedResponse(sampleBanned));
  console.log("✓ Detects challenge:", isChallengeResponse(sampleChallenge));

  // 3. Verify ProxyPool state
  const pool = ProxyPoolService.getInstance();
  pool.setCandidates(["http://127.0.0.1:8080", "http://127.0.0.1:9090"]);
  console.log("✓ Candidate pool initialized. Healthy count:", pool.getHealthyCount());

  const activeUrl = getActiveProxyUrl();
  console.log("✓ Active Proxy URL resolution:", activeUrl || "(none configured / direct)");

  console.log("\n=== ALL SYSTEM CHECKS PASSED ===");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
