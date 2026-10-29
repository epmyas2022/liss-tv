"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Movie } from "@/types/movie";
import { useMovieStore } from "../../store/useMovieStore";
import FocusElementProvider from "../providers/FocusElementProvider";
import { analytics } from "@/analytics/event";
import { Play } from "lucide-react";

export default function WatchButton({
  moviePreview,
  redirectDetails = false,
  label = "Reproducir",
  iconOnly = false,
  className = "",
}: {
  moviePreview: Pick<Movie, "title" | "link" | "image"> & {
    backgroundImage?: string;
  };
  backgroundImage?: string;
  redirectDetails?: boolean;
  label?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const store = useMovieStore();

  const targetHref = redirectDetails
    ? moviePreview.link
    : `/${moviePreview.link}/player`;

  function handleInteraction() {
    if (!redirectDetails) {
      store.setMovieData({
        ...moviePreview,
        startTime: 0,
      });
      analytics.watchVideo(moviePreview.title, moviePreview.link);
    }
  }

  return (
    <FocusElementProvider
      className="rounded-xl w-full"
      strokeSize={0}
      styleFocus={{
        outline: "3px solid #ffffff",
        outlineOffset: "2px",
        transform: "scale(1.02)",
      }}
      onEnterPress={() => {
        if (!redirectDetails) {
          handleInteraction();
          router.push(targetHref);
        }
      }}
    >
      {redirectDetails ? (
        <div
          className={`cursor-pointer flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#e50914] hover:bg-[#b80710] text-white font-bold rounded-xl text-sm transition-all duration-200 active:scale-95 select-none whitespace-nowrap ${className}`}
        >
          <Play size={15} className="fill-white shrink-0" />
          {!iconOnly && <span>{label}</span>}
        </div>
      ) : (
        <Link
          href={targetHref}
          onClick={handleInteraction}
          className={`cursor-pointer flex items-center justify-center gap-2.5 w-full py-3.5 px-6 bg-[#e50914] hover:bg-[#b80710] text-white font-bold rounded-xl text-sm sm:text-base transition-all duration-200 active:scale-95 select-none whitespace-nowrap ${className}`}
        >
          <Play size={18} className="fill-white shrink-0" />
          {!iconOnly && <span>{label}</span>}
        </Link>
      )}
    </FocusElementProvider>
  );
}
