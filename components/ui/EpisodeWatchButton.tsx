"use client";

import { Episode } from "@/types/movie";
import Image from "next/image";
import FocusElementProvider from "../providers/FocusElementProvider";
import Link from "next/link";
import { Play } from "lucide-react";

export default function EpisodeWatchButton({
  ep,
  onClick,
  href,
}: {
  ep: Episode;
  onClick: VoidFunction;
  href: string;
}) {
  const episodeNumber = ep.numberEpisode?.replace(/[^0-9]/g, "") || "1";

  return (
    <FocusElementProvider
      onEnterPress={() => onClick()}
      className="rounded-2xl w-full"
      strokeSize={0}
      styleFocus={{
        outline: "2px solid #e50914",
        outlineOffset: "2px",
        background: "rgba(255, 255, 255, 0.08)",
      }}
    >
      <Link
        href={href}
        onClick={onClick}
        className="group w-full flex flex-col sm:flex-row items-start sm:items-center gap-3.5 sm:gap-5 p-3 sm:p-4 rounded-2xl hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08] transition-all duration-200 cursor-pointer"
      >
        {/* Episode Number */}
        <span className="hidden sm:block shrink-0 w-8 text-center text-xl lg:text-2xl font-black text-gray-500 group-hover:text-white transition-colors">
          {episodeNumber.padStart(2, "0")}
        </span>

        {/* Thumbnail (16:9) */}
        <div className="w-full sm:w-44 md:w-52 aspect-video shrink-0 rounded-xl overflow-hidden relative bg-[#131519] border border-white/10 shadow-md">
          {ep.image ? (
            <Image
              src={ep.image}
              alt={ep.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 100vw, 208px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5 text-gray-500 text-xs">
              Sin imagen
            </div>
          )}

          {/* Episode number tag on mobile */}
          <span className="sm:hidden absolute top-2 left-2 bg-black/85 px-2 py-0.5 rounded text-xs font-bold text-white border border-white/10">
            EP {episodeNumber}
          </span>

          {/* Hover Play Button Overlay */}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="w-11 h-11 rounded-full bg-[#e50914] text-white flex items-center justify-center shadow-[0_0_20px_rgba(229,9,20,0.8)] transform scale-90 group-hover:scale-100 transition-transform">
              <Play size={18} className="fill-white translate-x-0.5" />
            </div>
          </div>
        </div>

        {/* Episode Info */}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-white font-bold text-base sm:text-lg leading-snug group-hover:text-[#e50914] transition-colors line-clamp-1">
              {ep.title}
            </h3>
          </div>

          {ep.caption && (
            <p className="text-xs sm:text-sm text-gray-400 line-clamp-2 leading-relaxed">
              {ep.caption}
            </p>
          )}
        </div>
      </Link>
    </FocusElementProvider>
  );
}
