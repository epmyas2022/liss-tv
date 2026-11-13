import { test } from "node:test";
import assert from "node:assert/strict";
import { isBannedResponse } from "../utils/flaresolverr.ts";

test("get-all parser detects banned response and identifies it as banned", () => {
  const bannedHtml = `<div id="banned-modal">Cuenta suspendida</div>`;
  const isBanned = isBannedResponse(bannedHtml);
  assert.equal(isBanned, true);
});

test("isBannedResponse returns false for legitimate movie HTML", () => {
  const cleanHtml = `<div class="card"><a href="/pelicula/batman">Batman</a></div>`;
  assert.equal(isBannedResponse(cleanHtml), false);
});
