import test from "node:test";
import assert from "node:assert/strict";
import { MovieContextFactory } from "../../builder/factory.ts";
import { DriverRegistry } from "../../drivers/registry.ts";
import { inferProviderFromLink, getPlayerHref } from "../../utils/navigation.ts";

test("MovieContextFactory creates valid cinecalidad MovieContext", () => {
  const ctx = MovieContextFactory.driver("cinecalidad");
  assert.strictEqual(ctx.id, "cinecalidad");
  assert.strictEqual(ctx.name, "Cinecalidad");
});

test("DriverRegistry registers cinecalidad driver wrapped in cache decorator", () => {
  const driver = DriverRegistry.getDriver("cinecalidad");
  assert.strictEqual(driver.id, "cinecalidad");
  assert.strictEqual(driver.name, "Cinecalidad");
  const providers = DriverRegistry.getAvailableProviders();
  assert.ok(providers.some((p) => p.id === "cinecalidad"));
});

test("inferProviderFromLink and getPlayerHref recognize cinecalidad paths", () => {
  assert.strictEqual(
    inferProviderFromLink("/ver-pelicula/madden/"),
    "cinecalidad",
  );
  assert.strictEqual(
    inferProviderFromLink("/ver-el-episodio/tmdb-1620-s1-e1/"),
    "cinecalidad",
  );
  assert.strictEqual(
    getPlayerHref("/ver-pelicula/madden/"),
    "/pelicula/madden/player",
  );
});
