export default function SerieDetailLoading() {
  return (
    <main style={{ background: "#070707", minHeight: "100vh" }} className="relative flex flex-col">
      {/* ── Hero ── */}
      <div className="flex flex-col md:flex-row items-end md:items-start gap-8 px-6 pt-36 pb-16 max-w-5xl mx-auto w-full">
        {/* Poster */}
        <div
          className="shrink-0 rounded-xl animate-pulse"
          style={{ width: 180, aspectRatio: "2/3", background: "rgba(255,255,255,0.07)" }}
        />

        {/* Info */}
        <div className="flex flex-col gap-4 pb-2 w-full max-w-md">
          <div className="h-10 rounded-lg w-3/4 animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="flex gap-3">
            <div className="h-5 w-12 rounded-full animate-pulse" style={{ background: "rgba(234,28,37,0.35)" }} />
            <div className="h-5 w-16 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
          <div className="flex gap-2">
            {[80, 60, 90].map((w) => (
              <div key={w} className="h-6 rounded-full animate-pulse" style={{ width: w, background: "rgba(255,255,255,0.06)" }} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-4 rounded w-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-4 rounded w-5/6 animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-4 rounded w-4/6 animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
        </div>
      </div>

      {/* ── Episode list ── */}
      <section className="max-w-5xl mx-auto px-6 pb-20 w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="h-6 w-24 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="h-8 w-32 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>

        {/* Rows */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 py-3 px-3">
            <div className="shrink-0 w-6 h-5 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
            <div className="shrink-0 rounded animate-pulse" style={{ width: 130, height: 73, background: "rgba(255,255,255,0.07)" }} />
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-4 w-48 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="h-3 rounded animate-pulse" style={{ width: "100%", background: "rgba(255,255,255,0.05)" }} />
              <div className="h-3 rounded animate-pulse" style={{ width: "80%", background: "rgba(255,255,255,0.05)" }} />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
