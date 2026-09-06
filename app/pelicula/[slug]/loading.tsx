export default function MovieDetailLoading() {
  return (
    <main style={{ background: "#070707", minHeight: "100vh" }} className="relative flex flex-col">
      {/* ── MOBILE SKELETON ── */}
      <div className="md:hidden flex flex-col">
        {/* Backdrop */}
        <div 
          className="relative w-full animate-pulse"
          style={{ height: "56vw", minHeight: 200, maxHeight: 320, background: "rgba(255,255,255,0.05)" }}
        >
          {/* Title skeleton */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <div className="h-8 rounded-lg w-3/4" style={{ background: "rgba(255,255,255,0.1)" }} />
          </div>
        </div>

        {/* Info */}
        <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
          {/* Meta row */}
          <div className="flex items-center gap-2">
            <div className="h-5 w-12 rounded-full animate-pulse" style={{ background: "rgba(234,28,37,0.35)" }} />
            <div className="h-5 w-16 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Tags */}
          <div className="flex gap-1.5">
            {[60, 80, 50].map((w, i) => (
              <div key={i} className="h-5 rounded-full animate-pulse" style={{ width: w, background: "rgba(255,255,255,0.06)" }} />
            ))}
          </div>

          {/* Synopsis */}
          <div className="flex flex-col gap-2 mt-1">
            <div className="h-4 rounded w-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-4 rounded w-5/6 animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-4 rounded w-4/6 animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* CTA */}
          <div className="h-11 w-full rounded animate-pulse mt-1" style={{ background: "rgba(255,255,255,0.08)" }} />
        </div>
      </div>

      {/* ── DESKTOP SKELETON ── */}
      <div className="hidden md:block relative">
        <div className="absolute inset-0 z-0 animate-pulse" style={{ background: "rgba(255,255,255,0.02)" }} />

        <div className="relative z-10 flex flex-row items-start gap-8 px-6 pt-36 pb-16 max-w-5xl mx-auto w-full">
          <div
            className="shrink-0 rounded-xl animate-pulse"
            style={{ width: 180, aspectRatio: "2/3", background: "rgba(255,255,255,0.07)" }}
          />

          <div className="flex flex-col gap-4 pb-2 w-full max-w-md">
            <div className="h-10 rounded-lg w-3/4 animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="flex gap-3">
              <div className="h-5 w-12 rounded-full animate-pulse" style={{ background: "rgba(234,28,37,0.35)" }} />
              <div className="h-5 w-16 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
            <div className="flex gap-2">
              {[80, 60, 90].map((w, i) => (
                <div key={i} className="h-6 rounded-full animate-pulse" style={{ width: w, background: "rgba(255,255,255,0.06)" }} />
              ))}
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <div className="h-4 rounded w-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="h-4 rounded w-5/6 animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="h-4 rounded w-4/6 animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
            <div className="h-11 w-48 rounded animate-pulse mt-2" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>
        </div>
      </div>
    </main>
  );
}
