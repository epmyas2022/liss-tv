import React from "react";
import { BrandLogo } from "@/components/layout/BrandLogo";

export function DetailNavbarSkeleton() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-[#090a0c]/90 via-[#090a0c]/40 to-transparent py-4 sm:py-5 border-b border-white/[0.04]">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 flex items-center justify-between gap-4">
        {/* Brand Logo & nav links skeleton */}
        <div className="flex items-center gap-6 lg:gap-10">
          <BrandLogo />
          <div className="hidden md:flex items-center gap-2 lg:gap-3">
            <div className="w-20 h-10 rounded-lg bg-white/[0.06] animate-shimmer" />
            <div className="w-24 h-10 rounded-lg bg-white/[0.06] animate-shimmer" />
            <div className="w-28 h-10 rounded-lg bg-white/[0.06] animate-shimmer" />
          </div>
        </div>

        {/* Right side search & avatar skeleton */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/[0.06] animate-shimmer" />
          <div className="w-9 h-9 rounded-full bg-white/[0.06] animate-shimmer" />
        </div>
      </div>
    </header>
  );
}

export function HeroBackdropSkeleton({ isSerie = false }: { isSerie?: boolean }) {
  return (
    <section className="relative w-full min-h-[75vh] md:min-h-[82vh] flex items-end overflow-hidden pb-10 md:pb-16 pt-28 md:pt-36">
      {/* ── Immersive Full-Screen Shimmer Backdrop ── */}
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-[#131519] animate-shimmer" />
        {/* Cinematic multi-stop gradients matching HeroBackdrop */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090a0c] via-[#090a0c]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090a0c]/95 via-[#090a0c]/60 to-transparent md:w-3/4" />
        <div className="absolute top-0 left-0 right-0 h-36 bg-gradient-to-b from-[#090a0c]/85 to-transparent" />
      </div>

      {/* ── Content Container matching exact geometry ── */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-10">
        {/* Floating Poster Skeleton */}
        <div className="w-36 sm:w-44 md:w-52 aspect-[2/3] shrink-0 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-white/10 bg-[#181a20] animate-shimmer" />

        {/* Text & Meta Details Skeleton */}
        <div className="flex flex-col gap-3.5 sm:gap-4 text-center md:text-left flex-1 items-center md:items-start w-full">
          {/* Breadcrumb indicator */}
          <div className="w-28 h-3.5 rounded bg-white/[0.08] animate-shimmer" />

          {/* Title skeleton */}
          <div className="w-3/4 sm:w-2/3 max-w-lg h-9 sm:h-12 md:h-14 rounded-xl bg-white/[0.1] animate-shimmer" />

          {/* Meta row skeleton */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
            <div className="w-14 h-5 rounded-md bg-[#e50914]/40 animate-shimmer" />
            <div className="w-12 h-5 rounded-md bg-white/[0.08] animate-shimmer" />
            <div className="w-16 h-5 rounded-md bg-white/[0.08] animate-shimmer" />
            <div className="w-20 h-5 rounded-md bg-white/[0.08] animate-shimmer" />
            <div className="w-8 h-5 rounded-md bg-white/[0.08] animate-shimmer" />
          </div>

          {/* Tags skeleton */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 sm:gap-2">
            <div className="w-16 h-6 rounded-full bg-white/[0.08] animate-shimmer" />
            <div className="w-20 h-6 rounded-full bg-white/[0.08] animate-shimmer" />
            <div className="w-24 h-6 rounded-full bg-white/[0.08] animate-shimmer" />
          </div>

          {/* Synopsis skeleton */}
          <div className="flex flex-col gap-2 w-full max-w-2xl mt-1">
            <div className="w-full h-4 rounded bg-white/[0.06] animate-shimmer" />
            <div className="w-11/12 h-4 rounded bg-white/[0.06] animate-shimmer" />
            <div className="w-4/5 h-4 rounded bg-white/[0.06] animate-shimmer" />
          </div>

          {/* Action CTA (Movies only) */}
          {!isSerie && (
            <div className="pt-2 w-full sm:w-56">
              <div className="w-full h-12 rounded-xl bg-[#e50914]/50 animate-shimmer" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function EpisodeListSkeleton() {
  return (
    <section className="w-full max-w-6xl mx-auto px-4 sm:px-8 mt-12 md:mt-16">
      {/* Header bar skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 mb-6">
        <div className="flex flex-col gap-2">
          <div className="w-36 h-7 rounded-lg bg-white/[0.08] animate-shimmer" />
          <div className="w-24 h-4 rounded bg-white/[0.05] animate-shimmer" />
        </div>
        <div className="w-44 h-11 rounded-xl bg-white/[0.07] border border-white/10 animate-shimmer" />
      </div>

      {/* Episodes list skeleton */}
      <div className="flex flex-col divide-y divide-white/[0.06]">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-4 px-2"
          >
            {/* Episode number */}
            <div className="hidden sm:block w-7 h-7 rounded bg-white/[0.06] animate-shimmer shrink-0" />

            {/* Thumbnail */}
            <div className="w-full sm:w-44 aspect-video rounded-xl bg-white/[0.07] border border-white/[0.06] animate-shimmer shrink-0" />

            {/* Info */}
            <div className="flex flex-col gap-2 flex-1 w-full min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-48 h-5 rounded-md bg-white/[0.08] animate-shimmer" />
                <div className="w-14 h-4 rounded bg-white/[0.05] animate-shimmer" />
              </div>
              <div className="w-full h-3.5 rounded bg-white/[0.05] animate-shimmer" />
              <div className="w-3/4 h-3.5 rounded bg-white/[0.05] animate-shimmer" />
            </div>

            {/* Play button indicator */}
            <div className="hidden sm:block w-10 h-10 rounded-full bg-white/[0.06] animate-shimmer shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}
