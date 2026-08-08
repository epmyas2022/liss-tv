"use client";

import { useRouter } from "next/navigation";
import type { Movie } from "@/types/movie";

import { useMovieStore } from "../../store/useMovieStore";

export default function WatchButton({
  moviePreview,
  redirectDetails = false,
}: {
  moviePreview: Pick<Movie, "title" | "link" | "image"> & {
    backgroundImage?: string;
  };
  backgroundImage?: string;
  redirectDetails?: boolean;
}) {
  const router = useRouter();

  const store = useMovieStore();

  async function handleClick() {
    if (redirectDetails) {
      router.push(moviePreview.link);
      return;
    }

    store.setMovieData({
      ...moviePreview,
      startTime: 0,
    });

    router.push(`/${moviePreview.link}/player`);
  }
  return (
    <button
      onClick={handleClick}
      className="cursor-pointer relative flex justify-center items-center gap-2 w-full bg-[#EA1C25] hover:bg-[#c8151c] active:bg-[#a01018] text-white font-bold rounded-lg transition-colors duration-200"
      style={{
        height: "clamp(2.25rem, 5vw, 2.75rem)",
        fontSize: "clamp(0.8rem, 2vw, 0.9rem)",
      }}
    >
      <>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <polygon points="4,2 14,8 4,14" />
        </svg>
        Watch Now
      </>
    </button>
  );
}
