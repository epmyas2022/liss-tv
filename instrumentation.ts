export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.USE_PROXY === "true" || process.env.ENABLE_PROXY === "true") {
      console.info("[Instrumentation] USE_PROXY is enabled. Initializing background ProxyPool probing...");
      const { ProxyPoolService } = await import("./services/proxy-pool.service.ts");
      const pool = ProxyPoolService.getInstance();

      // Warm-up inicial en background sin bloquear el arranque de Next.js
      void pool.refreshPool().catch((err) => {
        console.warn("[Instrumentation] Initial proxy pool refresh error:", err);
      });

      // Refrescar periódicamente cada 8 minutos para descartar caídos y descubrir nuevos
      setInterval(() => {
        void pool.refreshPool().catch((err) => {
          console.warn("[Instrumentation] Recurring proxy pool refresh error:", err);
        });
      }, 8 * 60 * 1000);
    }
  }
}
