import { test } from "node:test";
import assert from "node:assert/strict";
import { isManifestReusable } from "../utils/m3u8-validator.ts";

test("rejects empty or null manifest", () => {
  assert.equal(isManifestReusable(""), false);
});

test("rejects manifests containing player.pelisserieshoy.com URLs", () => {
  const dirtyManifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nhttps://player.pelisserieshoy.com/hls/test/index.m3u8?token=xyz`;
  assert.equal(isManifestReusable(dirtyManifest), false);
});

test("accepts manifests with generic CDN URLs", () => {
  const cleanManifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nhttps://cdn.example.com/hls/test/index.m3u8`;
  assert.equal(isManifestReusable(cleanManifest), true);
});
