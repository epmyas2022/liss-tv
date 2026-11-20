import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVoeM3u8 } from "../../../strategies/megadede/extractors/voe.extractor.ts";

test("extractVoeM3u8 extracts stream from base64 JSON payload with hls property", async (t) => {
  const originalFetch = global.fetch;
  const jsonPayload = JSON.stringify({ hls: "https://delivery.voe.sx/hls/master.m3u8" });
  const b64 = Buffer.from(jsonPayload).toString("base64");
  const mockPageHtml = `
    <html>
      <body>
        <script>
          let sources = '${b64}';
        </script>
      </body>
    </html>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVoeM3u8("https://voe.sx/e/testvoe1");
  assert.strictEqual(m3u8, "https://delivery.voe.sx/hls/master.m3u8");
});

test("extractVoeM3u8 extracts stream from reversed base64 payload", async (t) => {
  const originalFetch = global.fetch;
  const jsonPayload = JSON.stringify({ hls: "https://delivery.voe.sx/reversed/master.m3u8" });
  const b64 = Buffer.from(jsonPayload).toString("base64");
  const reversedB64 = b64.split("").reverse().join("");
  const mockPageHtml = `
    <script>
      const encrypted = "${reversedB64}";
    </script>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVoeM3u8("https://voe.sx/e/testvoe2");
  assert.strictEqual(m3u8, "https://delivery.voe.sx/reversed/master.m3u8");
});

test("extractVoeM3u8 follows window.location.href redirect and extracts stream", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/e/initial")) {
      return new Response('<script>window.location.href = "https://voe.sx/e/redirected";</script>', {
        status: 200,
      });
    }
    return new Response(
      'var config = {"hls": "https://delivery.voe.sx/redirected/master.m3u8"};',
      { status: 200 }
    );
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVoeM3u8("https://voe.sx/e/initial");
  assert.strictEqual(m3u8, "https://delivery.voe.sx/redirected/master.m3u8");
});
