/**
 * Cache en memoria para segmentos precargados de forma concurrente
 */
const segmentCache = new Map<string, { data: ArrayBuffer; timestamp: number }>();
const pendingPrefetches = new Map<string, Promise<ArrayBuffer | null>>();
const MAX_CACHE_ITEMS = 30;

function pruneCache() {
  if (segmentCache.size > MAX_CACHE_ITEMS) {
    const oldestKey = segmentCache.keys().next().value;
    if (oldestKey) segmentCache.delete(oldestKey);
  }
}

/**
 * Precarga en background un segmento si no está en cache
 */
export function prefetchSegment(url: string) {
  if (!url || segmentCache.has(url) || pendingPrefetches.has(url)) return;

  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) return null;
      return res.arrayBuffer();
    })
    .then((buf) => {
      if (buf) {
        segmentCache.set(url, { data: buf, timestamp: Date.now() });
        pruneCache();
      }
      pendingPrefetches.delete(url);
      return buf;
    })
    .catch(() => {
      pendingPrefetches.delete(url);
      return null;
    });

  pendingPrefetches.set(url, promise);
}

/**
 * Custom Fragment Loader para Hls.js que:
 * 1. Devuelve instantáneamente el segmento si ya fue pre-descargado en paralelo.
 * 2. Si no, lo descarga y simultáneamente dispara la pre-descarga de los siguientes 2 segmentos en paralelo.
 */
export function createConcurrentFragmentLoader(HlsClass: any) {
  const BaseLoader = HlsClass?.DefaultConfig?.loader || class {};

  return class ConcurrentFragmentLoader extends (BaseLoader as any) {
    private abortController: AbortController | null = null;

    load(context: any, config: any, callbacks: any) {
      const url = context.url;

      // 1. Si el segmento ya está en nuestra cache en memoria, entregarlo de inmediato (0ms de latencia)
      if (segmentCache.has(url)) {
        const cached = segmentCache.get(url)!;
        segmentCache.delete(url);

        // Desencadenar prefetch de los siguientes segmentos de la lista si están disponibles
        this.prefetchUpcomingFragments(context);

        callbacks.onSuccess(
          {
            url,
            data: cached.data,
          },
          {
            trequest: performance.now(),
            tfirst: performance.now(),
            tload: performance.now(),
            loaded: cached.data.byteLength,
            total: cached.data.byteLength,
          },
          context
        );
        return;
      }

      // 2. Si hay una pre-descarga en curso iniciada previamente
      if (pendingPrefetches.has(url)) {
        const pending = pendingPrefetches.get(url)!;
        this.prefetchUpcomingFragments(context);

        pending.then((data) => {
          if (data) {
            callbacks.onSuccess(
              { url, data },
              {
                trequest: performance.now(),
                tfirst: performance.now(),
                tload: performance.now(),
                loaded: data.byteLength,
                total: data.byteLength,
              },
              context
            );
          } else {
            // Fallback a descarga normal si falló la precarga
            this.executeNormalFetch(url, context, callbacks);
          }
        });
        return;
      }

      // 3. Descarga normal e iniciar precarga concurrente de los siguientes 2 segmentos
      this.prefetchUpcomingFragments(context);
      this.executeNormalFetch(url, context, callbacks);
    }

    private prefetchUpcomingFragments(context: any) {
      try {
        const frag = context.frag;
        const levelDetails = frag?.levelDetails;
        if (levelDetails && Array.isArray(levelDetails.fragments)) {
          const currentSn = frag.sn;
          // Precargar en paralelo los 2 fragmentos siguientes (sn + 1, sn + 2)
          for (let step = 1; step <= 2; step++) {
            const nextFrag = levelDetails.fragments.find((f: any) => f.sn === currentSn + step);
            if (nextFrag && nextFrag.url) {
              prefetchSegment(nextFrag.url);
            }
          }
        }
      } catch {}
    }

    private executeNormalFetch(url: string, context: any, callbacks: any) {
      const trequest = performance.now();
      this.abortController = new AbortController();

      fetch(url, { signal: this.abortController.signal })
        .then(async (res) => {
          if (!res.ok) {
            callbacks.onError(
              { code: res.status, text: res.statusText },
              context,
              res
            );
            return;
          }
          const tfirst = performance.now();
          const data = await res.arrayBuffer();
          const tload = performance.now();

          callbacks.onSuccess(
            { url, data },
            {
              trequest,
              tfirst,
              tload,
              loaded: data.byteLength,
              total: data.byteLength,
            },
            context
          );
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            callbacks.onError({ code: 0, text: err.message }, context, null);
          }
        });
    }

    abort() {
      if (this.abortController) {
        this.abortController.abort();
      }
    }

    destroy() {
      this.abort();
    }
  };
}
