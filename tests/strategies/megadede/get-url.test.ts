import test from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import {
  decryptAesLink,
  GetUrl,
} from "../../../strategies/megadede/get-url.operation.ts";

function encryptTestPayload(plainText: string, challenge: string, salt: string): string {
  const key = crypto.createHash("sha256").update(challenge + salt).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plainText, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString("base64");
}

test("decryptAesLink correctly decrypts AES-256-CBC payloads", () => {
  const challenge = "110d5a96099e75b0bc075f34cec61ca8";
  const salt = "6d07665b9850a0db";
  const originalUrl = "https://morencius.com/embed/test12345";
  const cipherBase64 = encryptTestPayload(originalUrl, challenge, salt);

  const decrypted = decryptAesLink(cipherBase64, challenge, salt);
  assert.strictEqual(decrypted, originalUrl);
});

test("GetUrl resolves stream and formats proxy URL for Vidstack", async (t) => {
  const challenge = "testchallenge";
  const salt = "testsalt";
  const cipherBase64 = encryptTestPayload("https://morencius.com/embed/vid123", challenge, salt);

  const mockVidurlHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <script>
        const LINK_CHALLENGE = '${challenge}';
        const LINK_SALT = '${salt}';
        const dataLink = [
          {
            video_language: "LAT",
            sortedEmbeds: [
              { servername: "vidhide", link: "${cipherBase64}", type: "video" }
            ]
          }
        ];
      </script>
    </head>
    </html>
  `;

  const mockVidhidePage = `
    eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2://3.4.5/6/7.8";',9,9,'var|streamUrl|https|cdn|video|com|hls|master|m3u8'.split('|')))
  `;

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/vidurl/")) {
      return new Response(mockVidurlHtml, { status: 200 });
    }
    if (url.includes("morencius.com")) {
      return new Response(mockVidhidePage, { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getUrl = new GetUrl();
  const result = await getUrl.operation("/vidurl/tt12345/");

  assert(result.url?.includes("/api/video/m3u8?url="));
  assert(result.url?.includes("&referer="));
  assert(result.url?.includes(encodeURIComponent("https://cdn.video.com/hls/master.m3u8")));
  assert(result.url?.includes(`referer=${encodeURIComponent("https://morencius.com/")}`));
  assert.strictEqual(result.directSegments, false);
  assert.strictEqual(result.headers?.Referer, "https://morencius.com/");
});

test("GetUrl resolves series episode via /api/episodio/", async (t) => {
  const challenge = "testchallenge";
  const salt = "testsalt";
  const cipherBase64 = encryptTestPayload("https://morencius.com/embed/vid123", challenge, salt);

  const mockEpisodeJson = {
    success: true,
    html: '<button class="ep-player__btn active" type="button" data-url="/vidurl/tt12614214-1x01/">Embed69</button>'
  };

  const mockVidurlHtml = `
    <script>
      const LINK_CHALLENGE = '${challenge}';
      const LINK_SALT = '${salt}';
      const dataLink = [
        {
          video_language: "LAT",
          sortedEmbeds: [
            { servername: "vidhide", link: "${cipherBase64}", type: "video" }
          ]
        }
      ];
    </script>
  `;

  const mockVidhidePage = `
    eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2://3.4.5/6/7.8";',9,9,'var|streamUrl|https|cdn|video|com|hls|master|m3u8'.split('|')))
  `;

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/api/episodio/")) {
      return new Response(JSON.stringify(mockEpisodeJson), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.includes("/vidurl/")) {
      return new Response(mockVidurlHtml, { status: 200 });
    }
    if (url.includes("morencius.com")) {
      return new Response(mockVidhidePage, { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getUrl = new GetUrl();
  const result = await getUrl.operation("/serie/the-afterparty#s1-e1");

  assert(result.url?.includes("/api/video/m3u8?url="));
  assert(result.url?.includes("&referer="));

  // Test resolving via detailContext without hash in path
  const resultViaContext = await getUrl.operation("/serie/the-afterparty/player", {
    detailContext: {
      season: 1,
      episode: 1,
      slug: "the-afterparty",
      provider: "megadede",
    },
  });
  assert(resultViaContext.url?.includes("/api/video/m3u8?url="));
});

test("GetUrl prioritizes VOE and Streamwish over Vidhide", async (t) => {
  const challenge = "testchallenge";
  const salt = "testsalt";
  const vidhideCipher = encryptTestPayload("https://morencius.com/embed/vid1", challenge, salt);
  const streamwishCipher = encryptTestPayload("https://hglink.to/e/sw1", challenge, salt);
  const voeCipher = encryptTestPayload("https://voe.sx/e/voe1", challenge, salt);

  const mockVidurlHtml = `
    <script>
      const LINK_CHALLENGE = '${challenge}';
      const LINK_SALT = '${salt}';
      const dataLink = [
        {
          video_language: "LAT",
          sortedEmbeds: [
            { servername: "vidhide", link: "${vidhideCipher}", type: "video" },
            { servername: "streamwish", link: "${streamwishCipher}", type: "video" },
            { servername: "voe", link: "${voeCipher}", type: "video" }
          ]
        }
      ];
    </script>
  `;

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/vidurl/")) {
      return new Response(mockVidurlHtml, { status: 200 });
    }
    if (url.includes("morencius.com")) {
      return new Response('eval(function(p,a,c,k,e,d){return p}("var s=\\"https://cdn.vidhide.com/master.m3u8\\"",1,1,"".split("|")))', { status: 200 });
    }
    if (url.includes("hglink.to")) {
      return new Response('var url = "https://cdn.streamwish.com/master.m3u8";', { status: 200 });
    }
    if (url.includes("voe.sx")) {
      return new Response('{"hls": "https://cdn.voe.sx/master.m3u8"}', { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getUrl = new GetUrl();
  const result = await getUrl.operation("/vidurl/tt12345/");

  // VOE should be prioritized first
  assert(result.url?.includes(encodeURIComponent("https://cdn.voe.sx/master.m3u8")));
  assert(result.url?.includes(`referer=${encodeURIComponent("https://voe.sx/")}`));
  // Streamwish should be the fallback before Vidhide
  assert(result.fallbackUrl?.includes(encodeURIComponent("https://cdn.streamwish.com/master.m3u8")));
  assert(result.fallbackUrl?.includes(`referer=${encodeURIComponent("https://hglink.to/")}`));
  assert.strictEqual(result.headers?.Referer, "https://voe.sx/");
  assert.strictEqual(result.directSegments, false);
});

test("GetUrl appends &manifest=true when resolved stream URL does not end in .m3u8", async (t) => {
  const challenge = "testchallenge";
  const salt = "testsalt";
  const vidhideCipher = encryptTestPayload("https://morencius.com/embed/vid1", challenge, salt);

  const mockVidurlHtml = `
    <script>
      const LINK_CHALLENGE = '${challenge}';
      const LINK_SALT = '${salt}';
      const dataLink = [
        {
          video_language: "LAT",
          sortedEmbeds: [
            { servername: "Vidhide", link: "${vidhideCipher}" }
          ]
        }
      ];
    </script>
  `;

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/vidurl/")) {
      return new Response(mockVidurlHtml, { status: 200 });
    }
    if (url.includes("morencius.com")) {
      return new Response('var links = { hls: "https://cdn.video.com/hls/master.txt" };', { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getUrl = new GetUrl();
  const result = await getUrl.operation("/vidurl/tt12345/");

  assert(result.url?.includes(encodeURIComponent("https://cdn.video.com/hls/master.txt")));
  assert(result.url?.includes("&manifest=true"));
});

test("GetUrl prioritizes server named 'Wish' with custom domain over Vidhide", async (t) => {
  const challenge = "testchallenge";
  const salt = "testsalt";
  const wishCipher = encryptTestPayload("https://strwish.com/e/wish123", challenge, salt);
  const vidhideCipher = encryptTestPayload("https://morencius.com/embed/vid123", challenge, salt);

  const mockVidurlHtml = `
    <script>
      const LINK_CHALLENGE = '${challenge}';
      const LINK_SALT = '${salt}';
      const dataLink = [
        {
          video_language: "LAT",
          sortedEmbeds: [
            { servername: "Vidhide", link: "${vidhideCipher}" },
            { servername: "Wish", link: "${wishCipher}" }
          ]
        }
      ];
    </script>
  `;

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/vidurl/")) {
      return new Response(mockVidurlHtml, { status: 200 });
    }
    if (url.includes("strwish.com")) {
      return new Response('var links = { hls: "https://cdn.streamwish.com/hls/master.m3u8" };', { status: 200 });
    }
    if (url.includes("morencius.com")) {
      return new Response('var links = { hls: "https://cdn.vidhide.com/hls/master.m3u8" };', { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getUrl = new GetUrl();
  const result = await getUrl.operation("/vidurl/tt12345/");

  // Wish should be prioritized over Vidhide
  assert(result.url?.includes(encodeURIComponent("https://cdn.streamwish.com/hls/master.m3u8")));
  assert(result.url?.includes(`referer=${encodeURIComponent("https://strwish.com/")}`));
  // Vidhide should be secondary fallback
  assert(result.fallbackUrl?.includes(encodeURIComponent("https://cdn.vidhide.com/hls/master.m3u8")));
  assert(result.fallbackUrl?.includes(`referer=${encodeURIComponent("https://morencius.com/")}`));
});

test("GetUrl falls back to alternative language group when preferred group has only dead CDN links", async (t) => {
  const challenge = "testchallenge";
  const salt = "testsalt";
  const deadCipher = encryptTestPayload("https://pfabiwmfmeza.radiantgroveproduction.cfd/embed/dead123", challenge, salt);
  const workingVoeCipher = encryptTestPayload("https://voe.sx/e/work123", challenge, salt);

  const mockVidurlHtml = `
    <script>
      const LINK_CHALLENGE = '${challenge}';
      const LINK_SALT = '${salt}';
      const dataLink = [
        {
          video_language: "LAT",
          sortedEmbeds: [
            { servername: "Vidhide", link: "${deadCipher}" }
          ]
        },
        {
          video_language: "SUB",
          sortedEmbeds: [
            { servername: "VOE", link: "${workingVoeCipher}" }
          ]
        }
      ];
    </script>
  `;

  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/vidurl/")) {
      return new Response(mockVidurlHtml, { status: 200 });
    }
    if (url.includes("voe.sx")) {
      const b64 = Buffer.from(JSON.stringify({ hls: "https://delivery.voe.sx/sub/master.m3u8" })).toString("base64");
      return new Response(`<script>let payload = "${b64}";</script>`, { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getUrl = new GetUrl();
  const result = await getUrl.operation("/vidurl/tt12345/", { language: "LAT" });

  assert(result.url?.includes(encodeURIComponent("https://delivery.voe.sx/sub/master.m3u8")));
  assert(result.url?.includes(`referer=${encodeURIComponent("https://voe.sx/")}`));
});


