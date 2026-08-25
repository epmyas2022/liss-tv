"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useMovieStore } from "../store/useMovieStore";
import { useEffect, useRef, useState } from "react";
import { getMovieUrl } from "@/app/actions/movie";
import { type MediaPlayerInstance } from "@vidstack/react";
import NextEpisode from "./ui/NextEpisode";

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

  const THRESHOLD_PROGRESS_SECONDS = 180; //SEGUNDOS ANTES DE TERMINAR EL VIDEO

  const player = useRef<MediaPlayerInstance | null>(null);

  const { moviePreview } = store;

  const handleNextEpisodeClick = async () => {
    if (!moviePreview?.next) return;

    store.setMovieData({
      ...moviePreview.next,
      startTime: 0,
    });

    setTimeout(() => window.location.reload(), 1000);
  };

  const saveWatchProgress = (currentTime: number, duration: number) => {
    if (!moviePreview) return;

    if (duration - currentTime < THRESHOLD_PROGRESS_SECONDS) {
      if (moviePreview.next)
        store.addToContinueWatching({
          ...moviePreview.next,
          currentTime: 0,
          duration: 0,
        });

      return store.removeFromContinueWatching(moviePreview.link);
    }

    if (currentTime - lastSavedTimeRef.current < 20) return;

    store.addToContinueWatching({ ...moviePreview, currentTime, duration });

    lastSavedTimeRef.current = currentTime;
  };

  useEffect(() => {
    const fetchMovieUrl = async () => {
      if (!moviePreview) return setLoading(false);
      try {
        const content = await getMovieUrl(moviePreview.link);

        setMovieUrl(content as string);
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
    <div className="h-dvh bg-black flex flex-col justify-center px-2 py-2 relative">
      <div className="absolute top-0 left-0 w-full  z-20 p-5">
        <button
          onClick={() => router.back()}
          className="cursor-pointer flex items-center gap-2 text-white font-bold"
        >
          <ArrowLeft />
        </button>
      </div>
      <VideoPlayer
        ref={player}
        handleTimeUpdate={(detail, nativeEvent) =>
          saveWatchProgress(detail.currentTime, nativeEvent.target.duration)
        }
        startTime={moviePreview.startTime}
        src={movieUrl}
        title={moviePreview.title}
        poster={moviePreview.backgroundImage || moviePreview.image}
      >
        {moviePreview.next && (
          <NextEpisode
            threshold={THRESHOLD_PROGRESS_SECONDS}
            playerRef={player}
            onClick={handleNextEpisodeClick}
          />
        )}
      </VideoPlayer>
    </div>
  );
}
