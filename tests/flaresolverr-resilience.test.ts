import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isBannedResponse,
  isChallengeResponse,
  buildFlarePayload,
} from "../utils/flaresolverr.ts";

test("detects SoloLatino banned account modal", () => {
  const bannedHtml = `<div class="modal">Cuenta suspendida</div><div id="banned-modal">Violación de los términos</div>`;
  assert.equal(isBannedResponse(bannedHtml), true);
  assert.equal(isBannedResponse("<html><body>Normal Page</body></html>"), false);
});

test("detects Cloudflare challenge page", () => {
  const challengeHtml = `<title>Just a moment...</title><div id="challenge-running"></div>`;
  assert.equal(isChallengeResponse(challengeHtml), true);
  assert.equal(isChallengeResponse("<html><body>Normal Page</body></html>"), false);
});

test("buildFlarePayload does not include deprecated headers property", () => {
  const payload = buildFlarePayload("https://sololatino.net/", "test_session", 25000);
  assert.equal(payload.cmd, "request.get");
  assert.equal(payload.maxTimeout, 25000);
  assert.equal("headers" in payload, false);
});
