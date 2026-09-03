import { ContinueWatching } from "@/types/movie";
import { pb, response } from "./useAuth";

import { useMovieStore } from "@/store/useMovieStore";

export function useMovie() {
  const store = useMovieStore();
  const syncToPocketBase = async () => {
    const user = pb?.authStore?.record as
      | { id: string; continueWatching?: ContinueWatching[] }
      | undefined;

    if (!user) return;

    const continueWatching = user.continueWatching || [];

    await response(() =>
      pb.collection("users").update(user.id, {
        continueWatching: [
          ...continueWatching.filter(
            (i) => !store.continueWatching.some((j) => j.link === i.link),
          ),
          ...store.continueWatching,
        ],
      }),
    );
  };

  const syncToLocal = (options: {
    currentTime: number;
    duration: number;
    threshold: number;
    lastSavedTimeRef: React.RefObject<number>;
  }) => {
    const { moviePreview } = store;
    if (!moviePreview) return;

    const { currentTime, duration, threshold, lastSavedTimeRef } = options;

    if (duration > 0 && duration - currentTime < threshold) {
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

  const syncInitEventListener = () => {
    const handleVisibilityChange = () => {
      if (document.hidden) syncToPocketBase();
    };

    const handlePageHide = () => syncToPocketBase();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  };

  const handleNextEpisodeClick = async () => {
    if (!store.moviePreview?.next) return;

    store.setMovieData({
      ...store.moviePreview.next,
      startTime: 0,
    });

    setTimeout(() => window.location.reload(), 1000);
  };

  return {
    syncToPocketBase,
    syncInitEventListener,
    syncToLocal,
    handleNextEpisodeClick,
    store,
  };
}
