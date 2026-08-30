"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { getMovieUrl } from "@/app/actions/movie";
import { type MediaPlayerInstance } from "@vidstack/react";
import NextEpisode from "./ui/NextEpisode";
import { useMovie } from "@/hooks/useMovie";
import { Spinner } from "./ui/Spinner";

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
  const {
    syncToPocketBase,
    syncToLocal,
    syncInitEventListener,
    handleNextEpisodeClick,
    store,
  } = useMovie();

  const [movieUrl, setMovieUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSavedTimeRef = useRef<number>(0);

  const THRESHOLD_PROGRESS_SECONDS = 180; //SEGUNDOS ANTES DE TERMINAR EL VIDEO

  const player = useRef<MediaPlayerInstance | null>(null);

  const { moviePreview } = store;

  const saveWatchProgress = (currentTime: number, duration: number) => {
    return syncToLocal({
      currentTime,
      duration,
      threshold: THRESHOLD_PROGRESS_SECONDS,
      lastSavedTimeRef,
    });
  };

  useEffect(() => {
    return syncInitEventListener();
  }, [syncInitEventListener]);

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
        <Spinner size="lg"></Spinner>
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
        handlePause={() => syncToPocketBase()}
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
