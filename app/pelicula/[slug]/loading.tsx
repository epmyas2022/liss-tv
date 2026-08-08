export default function MovieDetailLoading() {
  return (
    <main style={{ background: "#070707", minHeight: "100vh" }} className="relative flex flex-col">
      <div className="flex flex-col md:flex-row items-end md:items-start gap-8 px-6 pt-36 pb-16 max-w-5xl mx-auto w-full">
        {/* Poster skeleton */}
        <div
          className="shrink-0 rounded-xl animate-pulse"
          style={{ width: 180, aspectRatio: "2/3", background: "rgba(255,255,255,0.07)" }}
        />

        {/* Info skeleton */}
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
    </main>
  );
}
