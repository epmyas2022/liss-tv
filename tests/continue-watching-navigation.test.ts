import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPlayerHref, inferProviderFromLink } from "@/utils/navigation";

describe("Continue Watching Navigation & Provider Inference", () => {
  describe("inferProviderFromLink", () => {
    it("should respect explicit provider in context if present", () => {
      const provider = inferProviderFromLink("/some-path", { provider: "gnula" });
      assert.equal(provider, "gnula");
    });

    it("should infer 'gnula' for Gnula episode links formatted as slug-1x01", () => {
      assert.equal(inferProviderFromLink("/ragna-crimson-1x01/"), "gnula");
      assert.equal(inferProviderFromLink("breaking-bad-5x16"), "gnula");
    });

    it("should infer 'gnula' for Gnula movie links starting with /ver/", () => {
      assert.equal(inferProviderFromLink("/ver/godzilla-minus-one/"), "gnula");
      assert.equal(inferProviderFromLink("ver/oppenheimer"), "gnula");
    });

    it("should infer 'serieslan' when context contains SeriesLan identifiers", () => {
      assert.equal(
        inferProviderFromLink("/serie/the-boys/player?season=1&episode=1", {
          player_url: "https://serieslan.com/embed/123",
        }),
        "serieslan"
      );
      assert.equal(
        inferProviderFromLink("/serie/the-boys", {
          tmdb_id: 76479,
        }),
        "serieslan"
      );
    });

    it("should infer 'megadede' for links or context referencing Megadede", () => {
      assert.equal(inferProviderFromLink("https://megadede.mobi/pelicula/test"), "megadede");
      assert.equal(inferProviderFromLink("/vidurl/tt12345/"), "megadede");
      assert.equal(inferProviderFromLink("/serie/test", { provider: "megadede" }), "megadede");
      assert.equal(inferProviderFromLink("/pelicula/la-desaparicion-de-haruhi-suzu-3F2cYW"), "megadede");
      assert.equal(inferProviderFromLink("/serie/clase-letal-YT2vW1"), "megadede");
      assert.equal(inferProviderFromLink("/serie/drake-y-josh#s3-e7"), "megadede");
    });

    it("should return undefined for generic links without context", () => {
      assert.equal(inferProviderFromLink("/pelicula/avatar-el-camino-del-agua"), undefined);
    });
  });

  describe("getPlayerHref", () => {
    it("should map standard movie path to player route", () => {
      assert.equal(
        getPlayerHref("/pelicula/avatar-el-camino-del-agua"),
        "/pelicula/avatar-el-camino-del-agua/player"
      );
    });

    it("should map standard serie path to player route", () => {
      assert.equal(getPlayerHref("/serie/breaking-bad"), "/serie/breaking-bad/player");
    });

    it("should map Gnula episode link to correct serie player route", () => {
      assert.equal(
        getPlayerHref("/ragna-crimson-1x01/"),
        "/serie/ragna-crimson/player"
      );
      assert.equal(
        getPlayerHref("shingeki-no-kyojin-4x28"),
        "/serie/shingeki-no-kyojin/player"
      );
    });

    it("should map Gnula movie link to pelicula player route", () => {
      assert.equal(
        getPlayerHref("/ver/godzilla-minus-one/"),
        "/pelicula/godzilla-minus-one/player"
      );
    });

    it("should preserve already formed player routes and their query params", () => {
      assert.equal(
        getPlayerHref("/serie/lucifer/player?season=2&episode=5"),
        "/serie/lucifer/player?season=2&episode=5"
      );
    });

    it("should preserve query parameters on episode routes", () => {
      assert.equal(
        getPlayerHref("/serie/lucifer?season=3&episode=4"),
        "/serie/lucifer/player?season=3&episode=4"
      );
    });

    it("should map Megadede series episode with hash to clean player route", () => {
      assert.equal(
        getPlayerHref("/serie/drake-y-josh#s3-e7"),
        "/serie/drake-y-josh/player"
      );
      assert.equal(
        getPlayerHref("/anime/castlevania#s1-e1"),
        "/serie/castlevania/player"
      );
    });

    it("should clean malformed player URLs that appended /player to the hash", () => {
      assert.equal(
        getPlayerHref("/serie/drake-y-josh#s3-e7/player"),
        "/serie/drake-y-josh/player"
      );
      assert.equal(
        getPlayerHref("http://localhost:3000/serie/drake-y-josh#s3-e7/player"),
        "/serie/drake-y-josh/player"
      );
    });

    it("should handle empty or fallback link safely without throwing", () => {
      assert.equal(getPlayerHref(""), "/");
    });
  });
});
