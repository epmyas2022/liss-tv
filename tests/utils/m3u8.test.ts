import test from "node:test";
import assert from "node:assert/strict";
import { rewriteManifest } from "../../utils/m3u8";

test("rewriteManifest no debe proxhear segmentos que contengan 'index.' si terminan en .ts", () => {
  const m3u8Content = `
#EXTM3U
#EXT-X-VERSION:3
#EXTINF:6.0,
https://cdn.example.com/hls/index.segment001.ts?token=123
#EXTINF:6.0,
https://cdn.example.com/hls/master.segment001.ts
`;
  const result = rewriteManifest(m3u8Content, "https://cdn.example.com/hls/playlist.m3u8", {
    directSegments: true,
  });

  // Con la lógica antigua (absolute.includes("index.") y "master."), estos son falsos positivos y se proxhean:
  assert.match(result, /https:\/\/cdn\.example\.com\/hls\/index\.segment001\.ts\?token=123/);
  assert.doesNotMatch(result, /\/api\/video\/m3u8\?url=.*index\.segment001\.ts/);
  assert.match(result, /https:\/\/cdn\.example\.com\/hls\/master\.segment001\.ts/);
  assert.doesNotMatch(result, /\/api\/video\/m3u8\?url=.*master\.segment001\.ts/);
});

test("rewriteManifest sí debe proxhear sub-manifests .m3u8 reales aunque directSegments sea true", () => {
  const masterContent = `
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1500000
variant.m3u8?token=abc
`;
  const result = rewriteManifest(masterContent, "https://cdn.example.com/master.m3u8", {
    directSegments: true,
  });

  assert.match(result, /\/api\/video\/m3u8\?url=.*variant\.m3u8/);
  assert.match(result, /directSegments=true/);
});

test("rewriteManifest propagates directSegments=true on #EXT-X-MEDIA sub-manifest URIs", () => {
  const masterContent = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Latino",DEFAULT=YES,URI="audio/latino.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1500000,AUDIO="audio"
video/720p.m3u8`;

  const result = rewriteManifest(masterContent, "https://cdn.example.com/hls/master.m3u8", {
    directSegments: true,
    referer: "https://ww3.gnulahd.nu/",
  });

  assert.match(
    result,
    /URI="\/api\/video\/m3u8\?url=https%3A%2F%2Fcdn\.example\.com%2Fhls%2Faudio%2Flatino\.m3u8&directSegments=true&referer=https%3A%2F%2Fww3\.gnulahd\.nu%2F"/,
  );
});
