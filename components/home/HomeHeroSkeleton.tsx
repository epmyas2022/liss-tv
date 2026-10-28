export function HomeHeroSkeleton() {
  return (
    <div className="relative w-full h-[72vh] min-h-[500px] max-h-[760px] bg-[#131519] overflow-hidden flex items-end">
      {/* Shimmer background */}
      <div className="absolute inset-0 animate-shimmer" />

      {/* Gradient vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#090a0c] via-[#090a0c]/60 to-transparent" />

      {/* Content skeleton */}
      <div className="relative z-10 w-full max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 pb-12 sm:pb-16 flex flex-col gap-4 max-w-2xl">
        <div className="w-28 h-6 rounded-full bg-white/[0.08] animate-shimmer" />
        <div className="w-3/4 h-12 sm:h-16 rounded-xl bg-white/[0.08] animate-shimmer" />
        <div className="w-48 h-5 rounded-md bg-white/[0.08] animate-shimmer" />
        <div className="w-full h-16 rounded-lg bg-white/[0.08] animate-shimmer" />
        <div className="flex gap-3 pt-2">
          <div className="w-36 h-12 rounded-lg bg-white/[0.12] animate-shimmer" />
          <div className="w-44 h-12 rounded-lg bg-white/[0.08] animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
