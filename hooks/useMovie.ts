import { pb, response } from "./useAuth";

import { useMovieStore } from "@/store/useMovieStore";
import { useState, useRef, useCallback } from "react";
import { AuthUserType } from "@/types/user";
import { ContinueWatching } from "@/types/movie";

export function useMovie() {
  const [shouldSaveEnd, setShouldSaveEnd] = useState(true);
  const lastPbSyncRef = useRef(0);

  const store = useMovieStore();

  const syncCurrentToPocketBase = useCallback(
    async (movie: ContinueWatching, movieToRemove?: string) => {
      const user = pb?.authStore?.record as AuthUserType;
      if (!user) return;

      await response(() => {
        const continueWatching = user.continueWatching || [];
        const updated = [
          ...continueWatching.filter(
            (i) => i.link !== movie.link && i.link !== movieToRemove,
          ),
          movie,
        ];
        return pb.collection("users").update(user.id, {
          continueWatching: updated,
        });
      });
    },
    [],
  );

  const removeContinueWatching = async (link: string) => {
    const user = pb?.authStore?.record as AuthUserType;

    if (!user) return;

    await response(() => {
      const continueWatching = user.continueWatching || [];

      const updatedContinueWatching = continueWatching.filter(
        (i) => i.link !== link,
      );

      return pb.collection("users").update(user.id, {
        continueWatching: updatedContinueWatching,
      });
    });
  };

  const syncToLocal = async (options: {
    currentTime: number;
    duration: number;
    threshold: number;
    lastSavedTimeRef: React.RefObject<number>;
  }) => {
    const { moviePreview } = store;
    if (!moviePreview) return;

    if (!shouldSaveEnd) return; // Prevent old episode from being re-added after threshold

    const { currentTime, duration, threshold, lastSavedTimeRef } = options;

    if (duration > 0 && Math.abs(duration - currentTime) < threshold) {
      store.removeFromContinueWatching(moviePreview.link);

      if (!moviePreview.next) {
        setShouldSaveEnd(false);

        return removeContinueWatching(moviePreview.link);
      }

      const nextMovie = {
        ...moviePreview.next,
        currentTime: 0,
        duration: 0,
      };
      store.addToContinueWatching(nextMovie);
      syncCurrentToPocketBase(nextMovie, moviePreview.link);

      setShouldSaveEnd(false);
      return;
    }

    if (Math.abs(currentTime - lastSavedTimeRef.current) < 20) return;

    const updatedMovie = { ...moviePreview, currentTime, duration };
    store.addToContinueWatching(updatedMovie);
    lastSavedTimeRef.current = currentTime;

    // Sync to PocketBase every 3 minutos (78 segundos) para no saturar
    if (
      Math.abs(currentTime - lastPbSyncRef.current) > 78 ||
      lastPbSyncRef.current === 0
    ) {
      syncCurrentToPocketBase(updatedMovie);
      lastPbSyncRef.current = currentTime;
    }
  };

  const syncInitEventListener = useCallback(() => {
    const handleSync = () => {
      const state = useMovieStore.getState();
      if (state.moviePreview) {
        const currentMovieData = state.continueWatching.find(
          (m) => m.link === state.moviePreview?.link,
        );
        if (currentMovieData) {
          syncCurrentToPocketBase(currentMovieData);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleSync();
      }
    };

    const handlePageHide = () => {
      handleSync();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [syncCurrentToPocketBase]);

  const handleNextEpisodeClick = async () => {
    if (!store.moviePreview?.next) return;

    store.setMovieData({
      ...store.moviePreview.next,
      startTime: 0,
    });

    setTimeout(() => window.location.reload(), 1000);
  };

  return {
    syncCurrentToPocketBase,
    removeContinueWatching,
    syncInitEventListener,
    syncToLocal,
    handleNextEpisodeClick,
    store,
  };
}
