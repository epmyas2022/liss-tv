"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { getMovieUrl, getDetails } from "@/app/actions/movie";
import { type MediaPlayerInstance } from "@vidstack/react";
import NextEpisode from "./ui/NextEpisode";
import { useMovie } from "@/hooks/useMovie";
import { useMovieStore } from "@/store/useMovieStore";
import { Spinner } from "./ui/Spinner";
import FocusElementProvider from "./providers/FocusElementProvider";
import FocusContextProvider from "./providers/FocusContextProvider";
import { MoviePreview, Url } from "@/types/movie";
import { inferProviderFromLink } from "@/utils/navigation";

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
  const pathname = usePathname();
  const {
    syncCurrentToPocketBase,
    syncToLocal,
    syncInitEventListener,
    handleNextEpisodeClick,
    store,
  } = useMovie();

  const [movieUrl, setMovieUrl] = useState<Url | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { moviePreview } = store;
  const lastSavedTimeRef = useRef<number>(moviePreview?.startTime || 0);

  useEffect(() => {
    if (moviePreview?.startTime) {
      lastSavedTimeRef.current = moviePreview.startTime;
    }
  }, [moviePreview?.startTime]);

  const THRESHOLD_PROGRESS_SECONDS = 180; //SEGUNDOS ANTES DE TERMINAR EL VIDEO

  const player = useRef<MediaPlayerInstance | null>(null);

  const saveWatchProgress = (currentTime: number, duration: number) => {
    if (moviePreview?.startTime && moviePreview.startTime > 20 && currentTime < 5) {
      return;
    }
    return syncToLocal({
      currentTime,
      duration,
      threshold: THRESHOLD_PROGRESS_SECONDS,
      lastSavedTimeRef,
    });
  };

  const fallback = async () => {
    if (!moviePreview || !movieUrl || !movieUrl.fallbackUrl) return null;

    return Promise.resolve(movieUrl.fallbackUrl);
  };

  useEffect(() => {
    return syncInitEventListener();
  }, [syncInitEventListener]);

  useEffect(() => {
    let isCancelled = false;

    const fetchMovieUrl = async () => {
      let preview = moviePreview;

      // Recover moviePreview if null (e.g. browser refresh on /player route)
      if (!preview && pathname) {
        const cleanLink = pathname.replace(/\/player\/?$/, "");
        if (cleanLink && cleanLink !== "/") {
          try {
            const details = await getDetails(cleanLink);
            if (details && !isCancelled) {
              let targetLink = cleanLink;
              let epContext = details.context;

              if (typeof window !== "undefined") {
                const searchParams = new URLSearchParams(window.location.search);
                const sParam = searchParams.get("season");
                const eParam = searchParams.get("episode");
                const hash = window.location.hash;
                const hashMatch = hash.match(/#s(\d+)-e(\d+)/i);
                const season = sParam || hashMatch?.[1];
                const episode = eParam || hashMatch?.[2];

                if (season && episode) {
                  targetLink = `${cleanLink}#s${season}-e${episode}`;
                  epContext = {
                    ...epContext,
                    season: parseInt(season, 10),
                    episode: parseInt(episode, 10),
                  };
                }
              }

              const existingItem = store.continueWatching.find(
                (m) => m.link === targetLink || m.link === cleanLink,
              );
              const recoveredStartTime = existingItem?.currentTime || 0;

              const recoveredPreview: MoviePreview = {
                title: details.title || "",
                link: targetLink,
                image: details.image || "",
                backgroundImage: details.backgroundImage,
                provider: details.provider,
                context: epContext,
                startTime: recoveredStartTime,
              };
              preview = recoveredPreview;
              store.setMovieData(recoveredPreview);
            }
          } catch {
            // Ignored detail recovery failure
          }
        }
      }

      if (!preview) {
        if (!isCancelled) setLoading(false);
        return;
      }

      try {
        setErrorMessage(null);
        const explicitProvider =
          preview.provider ||
          (preview.context?.provider as string | undefined) ||
          inferProviderFromLink(preview.link, preview.context);

        const content = await getMovieUrl(preview.link, {
          detailContext: {
            ...preview.context,
            provider: explicitProvider,
          },
          params: {
            ...preview.context,
            provider: explicitProvider,
          },
        });

        if (!isCancelled) {
          if (content && typeof content === "object" && "error" in content && content.error) {
            console.error("[PlayerView] Error retornado por getMovieUrl:", content.error);
            setErrorMessage(content.error);
            return;
          }
          setMovieUrl(content as Url);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("[PlayerView] Error al cargar la URL del video:", error);
          setErrorMessage("No se pudo cargar el video.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchMovieUrl();
    return () => {
      isCancelled = true;
    };
  }, [moviePreview, pathname]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen text-white bg-black">
        <Spinner size="lg"></Spinner>
      </div>
    );

  if (errorMessage)
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white bg-black gap-4 px-4 text-center">
        <p className="text-lg font-semibold text-red-400 max-w-md">
          {errorMessage}
        </p>
        <button
          onClick={() => router.back()}
          className="px-6 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition cursor-pointer"
        >
          Volver
        </button>
      </div>
    );

  if (!moviePreview)
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white bg-black gap-4 px-4 text-center">
        <p className="text-lg font-semibold">
          No hay contenido seleccionado para reproducir.
        </p>
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-xl bg-[#e50914] text-white font-bold hover:bg-[#b80710] transition-colors cursor-pointer"
        >
          Volver
        </button>
      </div>
    );

  const primaryUrl = movieUrl?.url || movieUrl?.fallbackUrl;

  if (!movieUrl || !primaryUrl)
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white bg-black gap-4 px-4 text-center">
        <p className="text-lg font-semibold">
          No se pudo cargar el video.
        </p>
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-xl bg-[#e50914] text-white font-bold hover:bg-[#b80710] transition-colors cursor-pointer"
        >
          Volver
        </button>
      </div>
    );

  return (
    <div className="h-dvh bg-black flex flex-col justify-center px-2 py-2 relative">
      <FocusContextProvider condition={true}>
        <div className="absolute top-0 left-0 w-full  z-20 p-5">
          <FocusElementProvider
            className="rounded-full  w-7 h-7 flex items-center justify-center"
            onEnterPress={() => router.back()}
          >
            <button
              onClick={() => router.back()}
              className="cursor-pointer flex items-center gap-2 text-white font-bold"
            >
              <ArrowLeft />
            </button>
          </FocusElementProvider>
        </div>

        <VideoPlayer
          ref={player}
          handleTimeUpdate={(detail, nativeEvent) => {
            saveWatchProgress(detail.currentTime, nativeEvent.target.duration);
          }}
          handlePause={() => {
            const state = useMovieStore.getState();
            if (state.moviePreview) {
              const currentMovieData = state.continueWatching.find(
                (m) => m.link === state.moviePreview?.link,
              );
              if (currentMovieData) {
                syncCurrentToPocketBase(currentMovieData);
              }
            }
          }}
          startTime={moviePreview.startTime}
          src={primaryUrl}
          fallbackUrl={movieUrl.fallbackUrl}
          title={moviePreview.title}
          poster={moviePreview.backgroundImage || moviePreview.image}
          fallback={fallback}
        >
          {moviePreview.next && (
            <NextEpisode
              threshold={THRESHOLD_PROGRESS_SECONDS}
              playerRef={player}
              onClick={handleNextEpisodeClick}
            />
          )}
        </VideoPlayer>
      </FocusContextProvider>
    </div>
  );
}
