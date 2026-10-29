"use client";

import Image from "next/image";
import {
  Trash2,
  Play,
  Clock,
  CloudOff,
  Cloud,
  Smartphone,
  TvMinimalPlay,
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

function formatRemaining(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 1) return "< 1 min";
  if (m === 1) return "1 min restante";
  if (m < 60) return `${m} min restantes`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h restante`;
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
    <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden">
      <div
        className="h-full bg-[#e50914] rounded-full transition-all duration-300 shadow-[0_0_6px_rgba(229,9,20,0.6)]"
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
    <div className="group relative h-full rounded-2xl overflow-hidden bg-[#131519] border border-white/[0.08] hover:border-white/20 transition-all duration-300 shadow-lg hover:shadow-[0_16px_40px_rgba(0,0,0,0.8)] cursor-pointer flex flex-col justify-between">
      {/* Top Section: 16:9 Thumbnail Poster */}
      <div className="relative aspect-video w-full overflow-hidden bg-black/60 shrink-0">
        <Image
          src={item.image || "/logo-with-background.png"}
          alt={item.title || item.link}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {/* Cinematic Vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#131519] via-black/20 to-black/40 opacity-70 group-hover:opacity-85 transition-opacity" />

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-13 h-13 rounded-full bg-[#e50914] flex items-center justify-center shadow-[0_0_24px_rgba(229,9,20,0.7)] transform scale-90 group-hover:scale-100 transition-transform">
            <Play size={20} className="fill-white text-white translate-x-0.5" />
          </div>
        </div>

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white bg-black/80 border border-white/10 uppercase tracking-wide">
            {isSerie ? "Serie" : "Película"}
          </span>

          {pct > 0 && (
            <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded bg-black/70 border border-white/10 tabular-nums">
              {Math.round(pct)}%
            </span>
          )}

          {isLocalOnly && (
            <span
              className="flex items-center gap-1 text-[10px] font-bold text-amber-400 px-2 py-0.5 rounded bg-black/80 border border-amber-500/30"
              title="Guardado sólo en este navegador"
            >
              <CloudOff size={10} strokeWidth={2.5} />
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
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 hover:bg-[#e50914] border border-white/15 text-white/70 hover:text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 z-10 shadow-lg cursor-pointer"
          title="Eliminar de continuar viendo"
          aria-label="Eliminar"
        >
          <Trash2 size={13} />
        </button>

        {/* Progress Bar attached to image bottom */}
        <div className="absolute bottom-0 left-0 right-0">
          <ProgressBar current={item.currentTime} duration={item.duration} />
        </div>
      </div>

      {/* Info Card Content (Fixed uniform height across all cards) */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
            {isSerie ? "Serie" : "Película"}
          </p>
          <h3 className="text-white text-sm sm:text-[15px] font-bold font-poppins leading-snug line-clamp-2 h-10 group-hover:text-[#e50914] transition-colors">
            {item.title || item.link}
          </h3>
        </div>

        {/* Bottom metadata row */}
        <div className="pt-2.5 border-t border-white/[0.05] flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1.5 text-gray-400 font-medium">
            <Clock size={12} className="text-gray-500" />
            {remaining > 0 ? formatRemaining(remaining) : "Completado"}
          </span>
          <span className="tabular-nums text-gray-500 text-[11px]">
            {formatTime(item.currentTime)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ContinueWatchingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 auto-rows-fr">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          className="h-full rounded-2xl overflow-hidden bg-[#131519] border border-white/[0.08] shadow-lg flex flex-col justify-between"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-[#181a20] shrink-0">
            <div className="w-full h-full animate-shimmer" />
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
              <div className="w-14 h-5 rounded bg-black/70 border border-white/10 animate-shimmer" />
              <div className="w-10 h-5 rounded bg-[#e50914]/30 animate-shimmer" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 animate-shimmer" />
          </div>
          <div className="p-4 flex flex-col flex-1 justify-between gap-3">
            <div>
              <div className="w-12 h-3 rounded bg-white/[0.05] animate-shimmer mb-2" />
              <div className="w-4/5 h-4 rounded bg-white/[0.08] animate-shimmer mb-1.5" />
              <div className="w-2/3 h-4 rounded bg-white/[0.08] animate-shimmer" />
            </div>
            <div className="pt-2.5 border-t border-white/[0.05] flex items-center justify-between">
              <div className="w-20 h-3 rounded bg-white/[0.05] animate-shimmer" />
              <div className="w-10 h-3 rounded bg-white/[0.05] animate-shimmer" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-28 text-center px-4 max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
        <TvMinimalPlay size={28} className="text-gray-600" />
      </div>
      <div>
        <h3 className="font-poppins text-xl font-bold text-white mb-2">
          Sin títulos en progreso
        </h3>
        <p className="text-sm text-gray-500 leading-relaxed">
          Las películas y series que empieces a ver aparecerán aquí para que
          puedas retomarlas exactamente donde las dejaste.
        </p>
      </div>
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

  const totalCount = displayList.length;

  return (
    <main className="min-h-screen pb-28 sm:pb-16 bg-[#090a0c] text-white">
      <Navbar />

      {/* Decorative header gradient */}
      <div className="relative pt-24 sm:pt-28 pb-10 px-4 sm:px-8 lg:px-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-64 bg-[#e50914]/[0.06] rounded-full blur-[80px]" />
          <div className="absolute top-0 right-1/3 w-72 h-48 bg-indigo-900/[0.08] rounded-full blur-[60px]" />
        </div>

        <div className="relative max-w-[1400px] mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            {/* Title block */}
            <div>
              <p className="text-[11px] font-bold text-[#e50914] uppercase tracking-[0.2em] mb-2">
                Mi actividad
              </p>
              <h1 className="text-white text-3xl sm:text-4xl font-black font-poppins tracking-tight leading-none">
                Continuar{" "}
                <span className="text-[#e50914]">viendo</span>
              </h1>
              <p className="text-sm text-gray-500 mt-2">
                {totalCount > 0
                  ? `${totalCount} ${totalCount === 1 ? "título en progreso" : "títulos en progreso"}`
                  : "Reanuda tus películas y series donde las dejaste"}
              </p>
            </div>

            {/* Tab switcher */}
            <FocusContextProvider trackChildren={true}>
              <div className="flex items-center p-1 rounded-xl bg-white/[0.05] border border-white/[0.08] w-fit self-start sm:self-auto">
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
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <Cloud size={14} />
                    <span>Nube</span>
                    {cloudList.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.08] tabular-nums">
                        {cloudList.length}
                      </span>
                    )}
                  </button>
                </FocusElementProvider>

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
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <Smartphone size={14} />
                    <span>Este dispositivo</span>
                    {localList.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.08] tabular-nums">
                        {localList.length}
                      </span>
                    )}
                  </button>
                </FocusElementProvider>
              </div>
            </FocusContextProvider>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-8 lg:px-16 pb-8 max-w-[1400px] mx-auto">
        {loadingPb ? (
          <ContinueWatchingSkeleton />
        ) : displayList.length === 0 ? (
          <EmptyState />
        ) : (
          <FocusContextProvider>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 auto-rows-fr">
              {displayList.map((item) => (
                <div key={item.link} onClick={() => handleCardClick(item)} className="h-full">
                  <FocusElementProvider
                    onEnterPress={() => handleCardClick(item)}
                    strokeSize={0}
                    className="h-full rounded-2xl"
                    styleFocus={{
                      outline: "2px solid #e50914",
                      outlineOffset: "2px",
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
