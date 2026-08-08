"use client";

import { getMovieUrl } from "@/app/actions/movie";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Movie } from "@/types/movie";

import { useMovieStore } from '../../store/useMovieStore';

export default function WatchButton({
  moviePreview,
  redirectDetails = false,
}: {
  moviePreview: Pick<Movie, "title" | "link" | "image"> & {backgroundImage?: string};
  backgroundImage?: string;
  redirectDetails?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const store = useMovieStore();

  async function handleClick() {
    if (redirectDetails) {
      router.push(moviePreview.link);
      return;
    }

    setLoading(true);
    const movieUrl = await getMovieUrl(moviePreview.link) as string;
    setLoading(false);

    store.setMovieData(moviePreview);

    router.push(`/${moviePreview.link}/player`);
  }
  return (
    <button
      disabled={loading}
      onClick={handleClick}
      className="cursor-pointer relative flex justify-center items-center gap-2 w-full bg-[#EA1C25] hover:bg-[#c8151c] active:bg-[#a01018] text-white font-bold rounded-lg transition-colors duration-200"
      style={{ height: "clamp(2.25rem, 5vw, 2.75rem)", fontSize: "clamp(0.8rem, 2vw, 0.9rem)" }}
    >
      {loading ? (
        <span className="flex items-center gap-2 text-white/80">
          <span className="block w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          Loading...
        </span>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <polygon points="4,2 14,8 4,14" />
          </svg>
          Watch Now
        </>
      )}
    </button>
  );
}
