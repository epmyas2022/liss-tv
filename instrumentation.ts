export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startFlareSolverrMonitor } = await import(
    "@/services/flaresolverr-monitor.service"
  );
  startFlareSolverrMonitor();
}
