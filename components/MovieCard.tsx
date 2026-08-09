import Image from "next/image";
import Link from "next/link";

import WatchButton from "./ui/WatchButton";

import type { Movie } from "@/types/movie";

export function MovieCard({ movie }: { movie: Movie }) {
  return (
    <Link
      href={movie.link}
      className="group relative block rounded-xl overflow-hidden bg-[#070707] cursor-pointer"
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] w-full">
        <Image
          src={movie.image || "/logo-with-background.png"}
          alt={movie.title || movie.link}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          // ponytail: sanitize link to valid CSS ident (no slashes)
          style={{
            viewTransitionName: `poster-${movie.link.replace(/\//g, "-").replace(/^-/, "")}`,
          }}
        />

        {/* Gradient overlay — always present but intensifies on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#070707] via-[#07070780] to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating badge */}
        {movie.rating && (
          <span className="absolute top-2 right-2 bg-[#EA1C25] text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-lg">
            {movie.rating.trim()}
          </span>
        )}

        {/* Info panel — slides up on hover */}
        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          {movie.title && (
            <p className="text-white font-semibold text-sm leading-tight line-clamp-2">
              {movie.title.trim()}
            </p>
          )}
          {movie.year && (
            <p className="text-gray-400 text-xs mt-0.5">{movie.year.trim()}</p>
          )}

          {/* Watch button */}
          <WatchButton
            moviePreview={{
              image: movie.image,
              title: movie.title,
              link: movie.link,
            }}
            redirectDetails
            key={movie.link}
          />
        </div>
      </div>

      {/* Subtle border glow on hover */}
      <div className="absolute inset-0 rounded-xl ring-0 group-hover:ring-2 group-hover:ring-[#EA1C25]/60 transition-all duration-300 pointer-events-none" />
    </Link>
  );
}
