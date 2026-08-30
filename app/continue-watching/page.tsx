"use client";

import Image from "next/image";
import { Trash2, Play, Clock, CloudOff } from "lucide-react";
import { FloatingNav } from "@/components/FloatingNav";
import type { ContinueWatching } from "@/types/movie";
import { useRouter } from "next/navigation";
import FocusContextProvider from "@/components/providers/FocusContextProvider";
import FocusElementProvider from "@/components/providers/FocusElementProvider";
import { Spinner } from "@/components/ui/Spinner";
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
    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
      <div
        className="h-full bg-[#EA1C25] rounded-full transition-all duration-300"
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
  isCloudOnly?: boolean;
}) {
  const pct =
    item.duration > 0
      ? Math.min((item.currentTime / item.duration) * 100, 100)
      : 0;
  const remaining = Math.max(item.duration - item.currentTime, 0);

  return (
    <div className="group relative rounded-xl overflow-hidden bg-[#111] cursor-pointer">
      {/* Poster */}
      <div className="block relative aspect-[16/9] w-full">
        <Image
          src={item.image || "/logo-with-background.png"}
          alt={item.title || item.link}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-100"
        />

        {/* Dark gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-70 group-hover:opacity-90 transition-opacity duration-300" />

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(234,28,37,0.9)",
              boxShadow:
                "0 0 0 3px rgba(234,28,37,0.3), 0 8px 32px rgba(0,0,0,0.6)",
            }}
          >
            <Play size={22} fill="white" className="text-white ml-1" />
          </div>
        </div>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(item.link);
          }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
          style={{
            background: "rgba(0,0,0,0.7)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
          aria-label="Remove from continue watching"
        >
          <Trash2 size={13} className="text-white/80" />
        </button>

        {/* Badges (Top Left) */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5 items-start z-10 pointer-events-none">
          {pct > 0 && (
            <span
              className="text-[10px] font-bold text-white px-2 py-0.5 rounded shadow-sm backdrop-blur-md"
              style={{ background: "rgba(229, 9, 20, 0.9)" }}
            >
              {Math.round(pct)}%
            </span>
          )}
          {isLocalOnly && (
            <span
              className="flex items-center gap-1 text-[10px] font-bold text-amber-500 px-2 py-0.5 rounded shadow-sm backdrop-blur-md"
              style={{
                background: "rgba(0,0,0,0.65)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
              }}
              title="Guardado sólo en este dispositivo"
            >
              <CloudOff size={10} strokeWidth={2.5} />
              Local
            </span>
          )}
        </div>
      </div>

      {/* Bottom info */}
      <div className="px-3 pt-2.5 pb-3 space-y-2">
        <ProgressBar current={item.currentTime} duration={item.duration} />

        <div className="flex items-center justify-evenly gap-2">
          <p className="text-white text-sm font-semibold leading-tight line-clamp-1 font-poppins flex-1">
            {item.title || item.link}
          </p>

          {remaining > 0 && (
            <span className="flex items-center gap-1 text-white/50 text-[11px] shrink-0">
              <Clock size={11} />
              {formatTime(remaining)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 text-center px-4">
      <p className="text-white text-lg sm:text-xl font-semibold">
        You have no titles in progress.
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

  const displayList = useMemo(() => {
    if (pbWatching?.length === 0) {
      return localContinueWatching.map((item) => ({
        ...item,
        isLocalOnly: true,
      }));
    }

    const pbLinks = new Set(pbWatching.map((i) => i.link));
    const onlyLocal = localContinueWatching
      .filter((i) => !pbLinks.has(i.link))
      .map((i) => ({ ...i, isLocalOnly: true }));

    return [...pbWatching, ...onlyLocal];
  }, [pbWatching, localContinueWatching]);

  const handleCardClick = (item: ContinueWatching) => {
    setMovieData({
      ...item,
      startTime: item.currentTime,
    });

    router.push(`${item.link.split("/").slice(0, 2).join("/")}/player`);
  };

  const handleRemove = async (
    item: ContinueWatching & { isLocalOnly?: boolean },
  ) => {
    const userId = pb.authStore?.record?.id;

    if (item.isLocalOnly || !userId) {
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

  if (loadingPb) {
    return (
      <main className="min-h-screen pt-20 px-4 bg-[#070707] flex items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  return (
    <main
      className="min-h-screen pb-28 sm:pb-12 pt-20 px-4 sm:px-6"
      style={{ background: "#070707" }}
    >
      <FloatingNav />

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="my-7">
          <h1 className="text-white text-2xl sm:text-3xl font-bold font-poppins flex items-center gap-3">
            Continue <span className="text-[#EA1C25]">Watching</span>
          </h1>
          {displayList.length > 0 && (
            <p className="text-white/40 text-sm mt-1">
              {displayList.length} title
              {displayList.length !== 1 ? "s" : ""} in progress
            </p>
          )}
        </div>

        {displayList.length === 0 ? (
          <EmptyState />
        ) : (
          <FocusContextProvider>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayList.map((item) => (
                <a key={item.link} onClick={() => handleCardClick(item)}>
                  <FocusElementProvider
                    onEnterPress={() => handleCardClick(item)}
                    strokeSize={3}
                    className="rounded-xl"
                  >
                    <ContinueWatchingCard
                      item={item}
                      onRemove={() => handleRemove(item)}
                      isLocalOnly={
                        (item as { isLocalOnly?: boolean }).isLocalOnly
                      }
                    />
                  </FocusElementProvider>
                </a>
              ))}
            </div>
          </FocusContextProvider>
        )}
      </div>
    </main>
  );
}
