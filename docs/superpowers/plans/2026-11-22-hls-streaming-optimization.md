# Optimización de Video HLS y Buffering - Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar el congelamiento y pausas continuas (*rebuffering*) al reproducir videos de Gnula y HLS aumentando el buffer en el player e impidiendo que los segmentos de video pasen erróneamente por el backend de Next.js.

**Architecture:** Modificación de `utils/m3u8.ts` para discriminar con precisión manifiestos de segmentos de video evitando falsos positivos que degradan el throughput, y actualización de la configuración del provider HLS en los reproductores Web/Mobile y SmartTV con parámetros adaptados a VOD.

**Tech Stack:** Next.js (App Router), TypeScript, `@vidstack/react`, `hls.js`.

**Spec:** `C:\Users\casti\.gemini\antigravity-cli\brain\9e07658a-e7df-4e5a-975e-8999e9f4e554\docs\hls-streaming-optimization-design.md`

## Global Constraints
- `strict` TypeScript: sin `any` nuevo sin justificar.
- Respetar los contratos de `types/driver.ts` y no modificar la interfaz pública de `rewriteManifest`.
- Segmentos multimedia (`.ts`, `.mp4`, `.m4s`, `.aac`) deben permanecer con su URL directa cuando `directSegments: true`.

## Review Focus
- Segmentos que contienen subcadenas como `index-v1-a1.ts` o `master_001.ts`: deben considerarse segmentos directos y no ser proxheados como sub-manifests.
- Sub-manifests reales con query params (ej. `playlist.m3u8?token=xyz`): deben seguir siendo detectados y proxheados correctamente.
- Manejo de memoria en Smart TV: el buffer no debe exceder los 100MB / 180s para evitar crashes en navegadores embebidos de TV.

---

### Task 1: Corrección de detección de segmentos en `utils/m3u8.ts` y tests unitarios

**Files:**
- Modify: `utils/m3u8.ts`
- Create / Modify: `tests/utils/m3u8.test.ts`

**Interfaces:**
- Consumes: `rewriteManifest(body: string, manifestUrl: string, options?: RewriteManifestOptions | string, legacyReferer?: string): string`
- Produces: `rewriteManifest` con detección limpia de sub-manifests vs direct segments.

- [ ] **Step 1: Escribir prueba unitaria que reproduzca el falso positivo de `index.` en segmentos**

Crear o actualizar `tests/utils/m3u8.test.ts`:
```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { rewriteManifest } from "../../utils/m3u8";

test("rewriteManifest no debe proxhear segmentos que contengan 'index' o 'master' si terminan en .ts", () => {
  const m3u8Content = `
#EXTM3U
#EXT-X-VERSION:3
#EXTINF:6.0,
https://cdn.example.com/hls/index-v1-a1.ts?token=123
#EXTINF:6.0,
https://cdn.example.com/hls/master-segment-001.ts
`;
  const result = rewriteManifest(m3u8Content, "https://cdn.example.com/hls/playlist.m3u8", {
    directSegments: true,
  });

  assert.match(result, /https:\/\/cdn\.example\.com\/hls\/index-v1-a1\.ts\?token=123/);
  assert.doesNotMatch(result, /\/api\/video\/m3u8\?url=.*index-v1-a1\.ts/);
  assert.match(result, /https:\/\/cdn\.example\.com\/hls\/master-segment-001\.ts/);
  assert.doesNotMatch(result, /\/api\/video\/m3u8\?url=.*master-segment-001\.ts/);
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
```

- [ ] **Step 2: Ejecutar test para verificar que falla con la lógica actual**

Ejecutar: `node --import ./tests/register.mjs --test tests/utils/m3u8.test.ts`
Esperado: FALLA porque `index-v1-a1.ts` es clasificado erróneamente como sub-manifest y proxheado con `/api/video/m3u8`.

- [ ] **Step 3: Implementar la detección refinada en `utils/m3u8.ts`**

En `utils/m3u8.ts`:
```typescript
function isManifestUri(uri: string): boolean {
  try {
    const urlObj = new URL(uri, "https://dummy.local");
    const pathname = urlObj.pathname.toLowerCase();
    
    // Si termina claramente en extensión de segmento de audio/video, NO es manifiesto
    if (/\.(ts|mp4|m4s|aac|mp3|m4a|webm|vtt)$/i.test(pathname)) {
      return false;
    }
    
    // Si termina en .m3u8 o .txt (algunos hosts usan .txt para listas hls)
    if (pathname.endsWith(".m3u8") || pathname.endsWith(".txt")) {
      return true;
    }

    // Comprobación sobre el nombre de archivo exacto
    const filename = pathname.split("/").pop() || "";
    if (filename === "master" || filename === "index" || filename === "playlist") {
      return true;
    }
  } catch {}

  // Fallback seguro
  return uri.includes(".m3u8") || uri.includes(".txt");
}
```
Actualizar la línea de `isSubManifest` en `rewriteManifest` para utilizar `isManifestUri(absolute)`.

- [ ] **Step 4: Ejecutar test para verificar que pasa**

Ejecutar: `node --import ./tests/register.mjs --test tests/utils/m3u8.test.ts`
Esperado: PASS

- [ ] **Step 5: Ejecutar la suite completa de tests para descartar regresiones**

Ejecutar: `npm test`
Esperado: PASS en todos los tests.

---

### Task 2: Optimización de buffering HLS en Mobile & Desktop Player

**Files:**
- Modify: `components/player/MobileAndDesk/index.tsx:128-140`

**Interfaces:**
- Consumes: `onProviderChange={(provider) => { ... }}` de `@vidstack/react`
- Produces: Configuración HLS afinada para VOD

- [ ] **Step 1: Actualizar la configuración HLS en `components/player/MobileAndDesk/index.tsx`**

En `onProviderChange`:
```typescript
onProviderChange={(provider) => {
  if (provider?.type === "hls") {
    (provider as HLSProvider).config = {
      maxBufferLength: 180,
      maxMaxBufferLength: 300,
      maxBufferSize: 200 * 1000 * 1000,
      backBufferLength: 60,
      lowLatencyMode: false,
      abrBandWidthFactor: 0.85,
      fragLoadingRetryDelay: 1000,
      fragLoadingMaxRetry: 4,
      fragLoadingTimeOut: 20000,
      startFragPrefetch: true,
      maxFragLookUpTolerance: 0.25,
    };
  }
}}
```

- [ ] **Step 2: Verificar types y compilación**

Ejecutar: `npx eslint components/player/MobileAndDesk/index.tsx`

---

### Task 3: Optimización de buffering HLS en SmartTV Player

**Files:**
- Modify: `components/player/SmartTv/index.tsx:353-365`

**Interfaces:**
- Consumes: `onProviderChange={(provider) => { ... }}` en `SmartTvPlayer`
- Produces: Configuración HLS balanceada para rendimiento en Smart TV

- [ ] **Step 1: Actualizar la configuración HLS en `components/player/SmartTv/index.tsx`**

En `onProviderChange`:
```typescript
onProviderChange={(provider) => {
  if (provider?.type === "hls") {
    (provider as HLSProvider).config = {
      maxBufferLength: 120,
      maxMaxBufferLength: 180,
      maxBufferSize: 100 * 1000 * 1000,
      backBufferLength: 30,
      lowLatencyMode: false,
      abrBandWidthFactor: 0.8,
      fragLoadingRetryDelay: 1000,
      fragLoadingMaxRetry: 4,
      fragLoadingTimeOut: 20000,
      startFragPrefetch: true,
      maxFragLookUpTolerance: 0.25,
    };
  }
}}
```

- [ ] **Step 2: Verificar types y linter**

Ejecutar: `npx eslint components/player/SmartTv/index.tsx`

---

### Task 4: Verificación Integral del Build

- [ ] **Step 1: Ejecutar verificación de tipos y compilación**

Ejecutar: `npm test`
Esperado: Compilación exitosa sin errores de TypeScript ni fallas en tests existentes.
