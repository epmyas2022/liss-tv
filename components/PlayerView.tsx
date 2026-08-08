"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useMovieStore } from "../store/useMovieStore";
import { useEffect, useRef, useState } from "react";
import { getMovieUrl } from "@/app/actions/movie";

// ponytail: lazy-load VideoPlayer — heavy dep, no SSR needed
const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-white">
      <p className="text-lg font-semibold">Cargando reproductor...</p>
    </div>
  ),
});

export function PlayerView() {
  const router = useRouter();
  const store = useMovieStore();

  const [movieUrl, setMovieUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSavedTimeRef = useRef<number>(0);

  const { moviePreview } = store;

  const saveWatchProgress = (currentTime: number, duration: number) => {
    if (!moviePreview) return;

    if (duration - currentTime < 180) {
      return store.removeFromContinueWatching(moviePreview.link);
    }

    if(currentTime - lastSavedTimeRef.current < 20) return;

    store.addToContinueWatching({ ...moviePreview, currentTime, duration });
    lastSavedTimeRef.current = currentTime;
  };

  useEffect(() => {
    const fetchMovieUrl = async () => {
      if (!moviePreview) return setLoading(false);
      try {
        const url = await getMovieUrl(moviePreview.link);
        setMovieUrl(url as string);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchMovieUrl();
  }, [moviePreview]);

  if (loading || !moviePreview)
    return (
      <div className="flex items-center justify-center h-screen text-white bg-black">
        <p className="text-lg font-semibold">Cargando video...</p>
      </div>
    );

  if (!movieUrl)
    return (
      <div className="flex items-center justify-center h-screen text-white bg-black">
        <p className="text-lg font-semibold">
          No se pudo obtener la URL del video.
        </p>
      </div>
    );

  return (
    <div className="h-screen bg-black flex flex-col justify-center px-4 py-2 relative">
      <div className="absolute top-0 left-0 w-full bg-black opacity-80 z-20 p-5">
        <button
          onClick={() => router.back()}
          className="cursor-pointer flex items-center gap-2 text-white font-bold"
        >
          <ArrowLeft />
        </button>
      </div>
      <VideoPlayer
        handleTimeUpdate={(detail, nativeEvent) =>
          saveWatchProgress(detail.currentTime, nativeEvent.target.duration)
        }
        startTime={moviePreview.startTime}
        src={movieUrl}
        title={moviePreview.title}
        poster={moviePreview.backgroundImage || moviePreview.image}
      />
    </div>
  );
}
