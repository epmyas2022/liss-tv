"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Play,
  X,
  Clock,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { pb, response } from "@/hooks/useAuth";
import { useAuthentication } from "@/components/providers/context/AuthContext";
import { useMovieStore } from "@/store/useMovieStore";
import { analytics } from "@/analytics/event";
import type { ContinueWatching } from "@/types/movie";
import FocusContextProvider from "@/components/providers/FocusContextProvider";
import FocusElementProvider from "@/components/providers/FocusElementProvider";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRemaining(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return "< 1 min";
  if (m === 1) return "1 min restante";
  if (m < 60) return `${m} min restantes`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m restantes` : `${h}h restantes`;
}

interface PanoramicCardProps {
  item: ContinueWatching;
  onPlay: (item: ContinueWatching) => void;
  onRemove: (item: ContinueWatching) => void;
}

function PanoramicContinueCard({ item, onPlay, onRemove }: PanoramicCardProps) {
  const pct =
    item.duration > 0
      ? Math.min((item.currentTime / item.duration) * 100, 100)
      : 0;
  const remaining = Math.max(item.duration - item.currentTime, 0);
  const isSerie = item.link.includes("serie");
  const imageSrc = item.backgroundImage || item.image || "/logo-with-background.png";

  return (
    <div
      onClick={() => onPlay(item)}
      className="group/card relative w-[280px] sm:w-[320px] md:w-[360px] aspect-video shrink-0 rounded-2xl overflow-hidden bg-[#101216] border border-white/[0.08] hover:border-[#e50914]/60 transition-colors duration-300 cursor-pointer select-none"
    >
      {/* 16:9 Backdrop Image */}
      <Image
        src={imageSrc}
        alt={item.title || item.link}
        fill
        sizes="(max-width: 640px) 280px, (max-width: 768px) 320px, 360px"
        className="object-cover"
      />

      {/* Cinematic Dual Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#090a0c] via-[#090a0c]/60 to-transparent opacity-90 transition-opacity" />
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />

      {/* Top Badges */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10 pointer-events-none">
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white bg-black/60 backdrop-blur-md border border-white/10 uppercase tracking-wider">
          {isSerie ? "Serie" : "Película"}
        </span>
        {pct > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-black/60 backdrop-blur-md border border-white/10 tabular-nums flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e50914]" />
            {Math.round(pct)}%
          </span>
        )}
      </div>

      {/* Remove Button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(item);
        }}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/60 hover:bg-[#e50914] backdrop-blur-md border border-white/10 text-white/80 hover:text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity duration-200 z-10 cursor-pointer"
        title="Quitar de continuar viendo"
        aria-label="Quitar de continuar viendo"
      >
        <X size={13} strokeWidth={2.5} />
      </button>

      {/* Center Play Button Overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-300 pointer-events-none">
        <div className="w-12 h-12 rounded-full bg-[#e50914] text-white flex items-center justify-center transform scale-80 group-hover/card:scale-100 transition-transform duration-300">
          <Play size={20} className="fill-white text-white translate-x-0.5" />
        </div>
      </div>

      {/* Bottom Info Section */}
      <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4 flex flex-col gap-1.5 z-10">
        <h3 className="text-white font-poppins font-bold text-sm sm:text-base leading-snug truncate group-hover/card:text-[#e50914] transition-colors">
          {item.title || item.link}
        </h3>

        <div className="flex items-center justify-between text-xs text-gray-300 font-medium">
          <div className="flex items-center gap-1.5 truncate">
            <Clock size={12} className="text-[#e50914] shrink-0" />
            <span className="truncate">
              {remaining > 0 ? formatRemaining(remaining) : "Completado"}
            </span>
          </div>
          <span className="tabular-nums text-[11px] text-gray-400 font-medium shrink-0">
            {formatTime(item.currentTime)}
          </span>
        </div>
      </div>

      {/* Bottom Progress Bar flush to card edge */}
      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/15 overflow-hidden">
        <div
          className="h-full bg-[#e50914] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function HomeContinueWatching() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthentication();
  const setMovieData = useMovieStore((state) => state.setMovieData);

  const [items, setItems] = useState<ContinueWatching[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const checkScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  useEffect(() => {
    let isMounted = true;
    if (authLoading) return;

    const userId = user?.id || pb.authStore?.record?.id;
    if (!userId) return;

    const loadData = async () => {
      const res = await response(
        async () =>
          await pb
            .collection("users")
            .getOne(userId, { fields: "continueWatching" }),
      );

      if (!isMounted) return;

      if (res.status === 200) {
        const data = res.data as { continueWatching?: ContinueWatching[] };
        const rawList = data.continueWatching || [];
        // Invert order so the most recently watched title appears first
        const reversedList = [...rawList].reverse();
        setItems(reversedList);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user?.id]);

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [items]);

  const handlePlay = (item: ContinueWatching) => {
    setMovieData({
      ...item,
      startTime: item.currentTime,
    });
    analytics.watchVideo(item.title || item.link, item.link);
    router.push(`${item.link.split("/").slice(0, 2).join("/")}/player`);
  };

  const handleRemove = async (item: ContinueWatching) => {
    const userId = user?.id || pb.authStore?.record?.id;
    if (!userId) return;

    const updated = items.filter((m) => m.link !== item.link);
    setItems(updated);

    // Persist to PocketBase matching the original collection ordering
    await response(
      async () =>
        await pb.collection("users").update(userId, {
          continueWatching: updated.slice().reverse(),
        }),
    );
  };

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const offset = direction === "left" ? -440 : 440;
    scrollContainerRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  if (authLoading || items.length === 0) {
    return null;
  }

  return (
    <section className="group/section relative w-full max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 pt-6 sm:pt-8">
      {/* Section Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-1.5 h-6 rounded-full bg-[#e50914]" />
        <h2 className="font-poppins text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          Continuar viendo
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/[0.08] text-gray-300 tabular-nums">
            {items.length}
          </span>
        </h2>
      </div>

      {/* Carousel Container with Floating Arrows */}
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-0 bottom-0 z-20 w-14 bg-gradient-to-r from-[#090a0c] via-[#090a0c]/70 to-transparent flex items-center justify-start pl-1 text-white/80 hover:text-white opacity-0 group-hover/section:opacity-100 transition-all duration-300 cursor-pointer"
            aria-label="Desplazar a la izquierda"
          >
            <div className="w-9 h-9 rounded-full bg-black/75 hover:bg-[#e50914] backdrop-blur-md border border-white/10 flex items-center justify-center transition-colors">
              <ChevronLeft size={18} />
            </div>
          </button>
        )}

        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-0 bottom-0 z-20 w-14 bg-gradient-to-l from-[#090a0c] via-[#090a0c]/70 to-transparent flex items-center justify-end pr-1 text-white/80 hover:text-white opacity-0 group-hover/section:opacity-100 transition-all duration-300 cursor-pointer"
            aria-label="Desplazar a la derecha"
          >
            <div className="w-9 h-9 rounded-full bg-black/75 hover:bg-[#e50914] backdrop-blur-md border border-white/10 flex items-center justify-center transition-colors">
              <ChevronRight size={18} />
            </div>
          </button>
        )}

        {/* Horizontal Row */}
        <FocusContextProvider trackChildren={true}>
          <div
            ref={scrollContainerRef}
            className="flex items-stretch gap-4 sm:gap-5 overflow-x-auto py-2 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((item) => (
              <FocusElementProvider
                key={item.link}
                strokeSize={0}
                className="rounded-2xl shrink-0"
                styleFocus={{
                  outline: "2px solid #e50914",
                  outlineOffset: "3px",
                }}
                onEnterPress={() => handlePlay(item)}
              >
                <PanoramicContinueCard
                  item={item}
                  onPlay={handlePlay}
                  onRemove={handleRemove}
                />
              </FocusElementProvider>
            ))}
          </div>
        </FocusContextProvider>
      </div>
    </section>
  );
}
