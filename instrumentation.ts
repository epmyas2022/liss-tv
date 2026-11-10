export async function register(): Promise<void> {
  // FlareSolverr monitor removed: sessions are resolved on-demand and proactively
  // renewed before expiration without 24/7 background polling, preventing Cloudflare bot detection.
}
