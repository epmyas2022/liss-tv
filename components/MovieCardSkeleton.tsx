// ponytail: no props needed — count is always 18 (covers xl:6 grid with 3 rows)
export function MovieCardSkeleton() {
  return (
    <>
      <style>{`
        @keyframes sk-shimmer {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
        .sk-card {
          background: linear-gradient(90deg, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%);
          background-size: 600px 100%;
          animation: sk-shimmer 1.4s ease-in-out infinite;
        }
      `}</style>
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="sk-card rounded-xl aspect-[2/3]" />
      ))}
    </>
  );
}
