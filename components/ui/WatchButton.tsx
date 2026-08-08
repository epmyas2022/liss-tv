"use client";

import { getMovieUrl } from "@/app/actions/movie";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Movie } from "@/types/movie";
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

  async function handleClick() {
    if (redirectDetails) {
      router.push(moviePreview.link);
      return;
    }

    setLoading(true);
    const movieUrl = await getMovieUrl(moviePreview.link) as string;
    setLoading(false);

    sessionStorage.setItem("movieUrl", movieUrl);
    sessionStorage.setItem("moviePreview", JSON.stringify(moviePreview));

    router.push(`/${moviePreview.link}/player`);
  }
  return (
    <button
      disabled={loading}
      onClick={handleClick}
      className="cursor-pointer h-8 relative flex justify-center items-center mt-2 w-full bg-[#EA1C25] hover:bg-[#c8151c] text-white text-xs font-bold py-1.5 rounded-lg transition-colors duration-200"
    >

      {loading ?
         <div className="flex items-center justify-center gap-2 text-gray-300" >
          Loading...
         </div>
     : "▶ Watch"}
    </button>
  );
}
