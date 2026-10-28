"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, Info, Star } from "lucide-react";
import FocusElementProvider from "../providers/FocusElementProvider";
import { useMovieStore } from "@/store/useMovieStore";
import { analytics } from "@/analytics/event";

export interface HomeHeroMovie {
  link: string;
  title: string;
  image: string;
  rating?: string;
  year?: string;
  backgroundImage?: string;
  caption?: string;
  tags?: string[];
  duration?: string;
}

interface HomeHeroProps {
  movie: HomeHeroMovie;
}

export function HomeHero({ movie }: HomeHeroProps) {
  const router = useRouter();
  const store = useMovieStore();

  const backdropSrc = movie.backgroundImage || movie.image || "/logo-with-background.png";
  const isSerie = movie.link.includes("serie");
  const playHref = isSerie ? movie.link : `/${movie.link}/player`;

  const handlePlay = () => {
    store.setMovieData({
      title: movie.title,
      link: movie.link,
      image: movie.image,
      backgroundImage: movie.backgroundImage,
      startTime: 0,
    });
    analytics.watchVideo(movie.title, movie.link);
    router.push(playHref);
  };

  return (
    <section className="relative w-full h-[72vh] min-h-[500px] max-h-[760px] overflow-hidden flex items-end">
      {/* ── Background Backdrop Image ── */}
      <div className="absolute inset-0">
        <Image
          src={backdropSrc}
          alt={movie.title}
          fill
          priority
          sizes="100vw"
          className="object-cover object-top sm:object-center select-none"
        />
        {/* Gradients for cinematic immersion and text contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090a0c] via-[#090a0c]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090a0c]/95 via-[#090a0c]/65 to-transparent sm:w-3/4" />
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#090a0c]/80 to-transparent" />
      </div>

      {/* ── Content Details ── */}
      <div className="relative z-10 w-full max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 pb-12 sm:pb-16 flex flex-col gap-4 max-w-3xl">
        {/* Eyebrow badge */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e50914]/20 border border-[#e50914]/40 text-[#e50914] text-xs font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e50914] animate-pulse" />
            Destacado
          </span>
          {movie.rating && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-amber-400 text-xs font-semibold border border-white/10">
              <Star size={12} className="fill-amber-400" />
              {movie.rating.replace(/★/, "").trim()}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="font-poppins text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.1] tracking-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]">
          {movie.title}
        </h1>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-gray-300 font-medium">
          {movie.year && <span>{movie.year}</span>}
          {movie.duration && (
            <>
              <span className="text-gray-600">•</span>
              <span>{movie.duration}</span>
            </>
          )}
          <span className="text-gray-600">•</span>
          <span className="px-2 py-0.5 rounded border border-white/20 text-xs uppercase text-gray-200">
            {isSerie ? "Serie" : "Película"}
          </span>
          {movie.tags && movie.tags.length > 0 && (
            <>
              <span className="text-gray-600">•</span>
              <span className="text-gray-300 truncate max-w-[240px]">
                {movie.tags.slice(0, 3).join(", ")}
              </span>
            </>
          )}
        </div>

        {/* Synopsis / Caption */}
        {movie.caption && (
          <p className="text-sm sm:text-base text-gray-300/90 font-normal leading-relaxed line-clamp-3 max-w-2xl drop-shadow">
            {movie.caption}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {/* Reproducir */}
          <FocusElementProvider
            className="rounded-lg group"
            strokeSize={0}
            styleFocus={{
              outline: "3px solid #ffffff",
              outlineOffset: "2px",
            }}
            onEnterPress={handlePlay}
          >
            <button
              onClick={handlePlay}
              className="flex items-center gap-2.5 px-6 sm:px-8 py-3 rounded-lg bg-white text-black font-bold text-sm sm:text-base hover:bg-white/90 active:scale-95 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.25)] select-none cursor-pointer"
            >
              <Play size={18} className="fill-black" />
              <span>Reproducir</span>
            </button>
          </FocusElementProvider>

          {/* Más info */}
          <FocusElementProvider
            className="rounded-lg group"
            strokeSize={0}
            styleFocus={{
              outline: "3px solid #e50914",
              outlineOffset: "2px",
            }}
            onEnterPress={() => router.push(movie.link)}
          >
            <Link
              href={movie.link}
              className="flex items-center gap-2.5 px-5 sm:px-7 py-3 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold text-sm sm:text-base border border-white/15 active:scale-95 transition-all select-none shadow-lg"
            >
              <Info size={18} />
              <span>Más información</span>
            </Link>
          </FocusElementProvider>
        </div>
      </div>
    </section>
  );
}
