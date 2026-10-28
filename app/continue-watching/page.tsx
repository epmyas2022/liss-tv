"use client";

import Image from "next/image";
import {
  Trash2,
  Play,
  Clock,
  CloudOff,
  Cloud,
  Smartphone,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import type { ContinueWatching } from "@/types/movie";
import { useRouter } from "next/navigation";
import FocusContextProvider from "@/components/providers/FocusContextProvider";
import FocusElementProvider from "@/components/providers/FocusElementProvider";
import { pb, response } from "@/hooks/useAuth";
import { useMovie } from "@/hooks/useMovie";
import { useState, useEffect, useMemo } from "react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ProgressBar({
  current,
  duration,
}: {
  current: number;
  duration: number;
}) {
  const pct = duration > 0 ? Math.min((current / duration) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
      <div
        className="h-full bg-[#e50914] rounded-full transition-all duration-300 shadow-[0_0_8px_#e50914]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ContinueWatchingCard({
  item,
  onRemove,
  isLocalOnly,
}: {
  item: ContinueWatching;
  onRemove: (link: string) => void;
  isLocalOnly?: boolean;
}) {
  const pct =
    item.duration > 0
      ? Math.min((item.currentTime / item.duration) * 100, 100)
      : 0;
  const remaining = Math.max(item.duration - item.currentTime, 0);

  const isSerie = item.link.includes("serie");

  return (
    <div className="group relative rounded-2xl overflow-hidden bg-[#131519] border border-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-lg hover:shadow-[0_12px_36px_rgba(0,0,0,0.8)] cursor-pointer flex flex-col">
      {/* 16:9 Thumbnail Poster */}
      <div className="relative aspect-video w-full overflow-hidden bg-black/60">
        <Image
          src={item.image || "/logo-with-background.png"}
          alt={item.title || item.link}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {/* Cinematic Vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#131519] via-transparent to-black/30 opacity-80 group-hover:opacity-90 transition-opacity" />

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-full bg-[#e50914] flex items-center justify-center shadow-[0_0_24px_rgba(229,9,20,0.8)] transform scale-90 group-hover:scale-100 transition-transform">
            <Play size={20} className="fill-white text-white translate-x-0.5" />
          </div>
        </div>

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
          <span className="px-2 py-0.5 rounded text-[11px] font-bold text-white bg-black/85 border border-white/10 uppercase">
            {isSerie ? "Serie" : "Película"}
          </span>

          {pct > 0 && (
            <span className="text-[11px] font-bold text-white px-2 py-0.5 rounded bg-[#e50914] shadow-sm">
              {Math.round(pct)}%
            </span>
          )}

          {isLocalOnly && (
            <span
              className="flex items-center gap-1 text-[11px] font-bold text-amber-400 px-2 py-0.5 rounded bg-black/85 border border-amber-500/30"
              title="Guardado sólo en este navegador"
            >
              <CloudOff size={11} strokeWidth={2.5} />
              Local
            </span>
          )}
        </div>

        {/* Remove Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(item.link);
          }}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 hover:bg-[#e50914] border border-white/15 text-white/80 hover:text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 z-10 shadow-lg cursor-pointer"
          title="Eliminar de continuar viendo"
          aria-label="Eliminar"
        >
          <Trash2 size={14} />
        </button>

        {/* Progress Bar attached to image bottom */}
        <div className="absolute bottom-0 left-0 right-0">
          <ProgressBar current={item.currentTime} duration={item.duration} />
        </div>
      </div>

      {/* Info Card Content */}
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-white text-sm sm:text-base font-bold font-poppins leading-snug truncate group-hover:text-[#e50914] transition-colors">
            {item.title || item.link}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Continuar desde {formatTime(item.currentTime)}
          </p>
        </div>

        {remaining > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium shrink-0 bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/5">
            <Clock size={12} className="text-gray-400" />
            {formatTime(remaining)}
          </span>
        )}
      </div>
    </div>
  );
}

function ContinueWatchingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          className="rounded-2xl overflow-hidden bg-[#131519] border border-white/[0.08] shadow-lg flex flex-col"
        >
          {/* 16:9 Thumbnail Skeleton matching exact card geometry */}
          <div className="relative aspect-video w-full overflow-hidden bg-[#181a20]">
            <div className="w-full h-full animate-shimmer" />

            {/* Top badges skeleton */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
              <div className="w-14 h-5 rounded bg-black/70 border border-white/10 animate-shimmer" />
              <div className="w-10 h-5 rounded bg-[#e50914]/40 animate-shimmer" />
            </div>

            {/* Progress bar line skeleton */}
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/15 animate-shimmer" />
          </div>

          {/* Info Card Content Skeleton */}
          <div className="p-4 flex items-center justify-between gap-3 bg-[#131519]">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="w-4/5 h-5 rounded-md bg-white/[0.08] animate-shimmer" />
              <div className="w-1/2 h-3.5 rounded bg-white/[0.05] animate-shimmer" />
            </div>

            {/* Remaining time pill skeleton */}
            <div className="w-16 h-6 rounded-full bg-white/[0.06] border border-white/5 animate-shimmer shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-4 max-w-md mx-auto">
     
      <h3 className="font-poppins text-xl font-bold text-white">
        No tienes títulos en progreso
      </h3>
      <p className="text-sm text-gray-400 leading-relaxed">
        Las películas y series que empieces a ver aparecerán aquí para que
        puedas retomarlas exactamente donde las dejaste.
      </p>
    </div>
  );
}

export default function ContinueWatchingPage() {
  const router = useRouter();

  const { store } = useMovie();
  const {
    continueWatching: localContinueWatching,
    removeFromContinueWatching: removeLocal,
    setMovieData,
  } = store;

  const [pbWatching, setPbWatching] = useState<ContinueWatching[]>([]);
  const [loadingPb, setLoadingPb] = useState(true);
  const [activeTab, setActiveTab] = useState<"cloud" | "local">("cloud");

  const fetchPbWatching = async function fetchPbWatching() {
    const userId = pb.authStore?.record?.id;
    setLoadingPb(true);

    if (!userId) return setLoadingPb(false);

    const res = await response(
      async () =>
        await pb
          .collection("users")
          .getOne(userId, { fields: "continueWatching" }),
    );

    if (res.status === 200) {
      const data = res.data as { continueWatching: ContinueWatching[] };
      setPbWatching(data.continueWatching || []);
    }

    setLoadingPb(false);
  };

  useEffect(() => {
    (async () => {
      await fetchPbWatching();
    })();
  }, []);

  const cloudList = useMemo(() => pbWatching || [], [pbWatching]);

  const localList = useMemo(() => {
    const pbLinks = new Set(pbWatching.map((i) => i.link));
    return localContinueWatching.filter((i) => !pbLinks.has(i.link));
  }, [pbWatching, localContinueWatching]);

  const displayList = activeTab === "cloud" ? cloudList : localList;

  const handleCardClick = (item: ContinueWatching) => {
    setMovieData({
      ...item,
      startTime: item.currentTime,
    });

    router.push(`${item.link.split("/").slice(0, 2).join("/")}/player`);
  };

  const handleRemove = async (
    item: ContinueWatching,
    isLocalOnly: boolean = false,
  ) => {
    const userId = pb.authStore?.record?.id;

    if (isLocalOnly || !userId) {
      return removeLocal(item.link);
    }

    removeLocal(item.link);

    const data = pbWatching.filter((m) => m.link !== item.link);
    setPbWatching(data);

    await response(
      async () =>
        await pb.collection("users").update(userId, {
          continueWatching: data,
        }),
    );
  };

  return (
    <main className="min-h-screen pb-28 sm:pb-16 pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 bg-[#090a0c] text-white">
      <Navbar />

      <div className="max-w-[1800px] mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-white text-3xl sm:text-4xl font-black font-poppins tracking-tight flex items-center gap-2">
                <span>Continuar</span>
                <span className="text-[#e50914]">
                  viendo
                </span>
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Reanuda tus películas y series donde las dejaste
              </p>
            </div>

            {/* Segmented Controls / Tabs */}
            <FocusContextProvider trackChildren={true}>
              <div className="flex items-center p-1 rounded-xl bg-white/[0.06] border border-white/10 w-fit">
                {/* Cloud Tab */}
                <FocusElementProvider
                  onEnterPress={() => setActiveTab("cloud")}
                  strokeSize={0}
                  className="rounded-lg"
                >
                  <button
                    onClick={() => setActiveTab("cloud")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      activeTab === "cloud"
                        ? "bg-[#1a1d24] text-white shadow-md border border-white/10"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Cloud size={15} />
                    <span>Nube</span>
                    <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-white/10">
                      {cloudList.length}
                    </span>
                  </button>
                </FocusElementProvider>

                {/* Local Tab */}
                <FocusElementProvider
                  onEnterPress={() => setActiveTab("local")}
                  strokeSize={0}
                  className="rounded-lg"
                >
                  <button
                    onClick={() => setActiveTab("local")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                      activeTab === "local"
                        ? "bg-[#1a1d24] text-white shadow-md border border-white/10"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Smartphone size={15} />
                    <span>Este dispositivo</span>
                    <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-white/10">
                      {localList.length}
                    </span>
                  </button>
                </FocusElementProvider>
              </div>
            </FocusContextProvider>
          </div>
        </div>

        {/* Content Area */}
        {loadingPb ? (
          <ContinueWatchingSkeleton />
        ) : displayList.length === 0 ? (
          <EmptyState />
        ) : (
          <FocusContextProvider>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
              {displayList.map((item) => (
                <div key={item.link} onClick={() => handleCardClick(item)}>
                  <FocusElementProvider
                    onEnterPress={() => handleCardClick(item)}
                    strokeSize={0}
                    className="rounded-2xl"
                    styleFocus={{
                      outline: "2px solid #e50914",
                      outlineOffset: "2px",
                      transform: "scale(1.02)",
                    }}
                  >
                    <ContinueWatchingCard
                      item={item}
                      onRemove={() => handleRemove(item, activeTab === "local")}
                      isLocalOnly={activeTab === "local"}
                    />
                  </FocusElementProvider>
                </div>
              ))}
            </div>
          </FocusContextProvider>
        )}
      </div>
    </main>
  );
}
