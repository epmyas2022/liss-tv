import test from "node:test";
import assert from "node:assert/strict";
import {
  cinecalidadFetch,
  CINECALIDAD_BASE_URL,
  CinecalidadError,
} from "../../../strategies/cinecalidad/client.ts";

test("cinecalidadFetch prepends base URL and attaches desktop headers", async (t) => {
  const originalFetch = global.fetch;
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return new Response("<html>OK</html>", { status: 200 });
  }) as typeof fetch;

  const res = await cinecalidadFetch("/ver-serie/");
  assert.strictEqual(capturedUrl, `${CINECALIDAD_BASE_URL}/ver-serie/`);
  assert.ok(capturedHeaders["User-Agent"]?.includes("Mozilla/5.0"));
  assert.strictEqual(res.status, 200);
});

test("cinecalidadFetch throws CinecalidadError on HTTP error status", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = (async () =>
    new Response("Not Found", { status: 404 })) as typeof fetch;

  await assert.rejects(
    async () => {
      await cinecalidadFetch("/ver-pelicula/inexistente/");
    },
    (err: unknown) => {
      assert.ok(err instanceof CinecalidadError);
      assert.strictEqual(err.status, 404);
      return true;
    },
  );
});
