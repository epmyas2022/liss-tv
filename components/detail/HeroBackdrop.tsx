import Image from "next/image";
import WatchButton from "@/components/ui/WatchButton";
import FavoriteButton from "@/components/ui/FavoriteButton";
import FocusElementProvider from "../providers/FocusElementProvider";
import { Star } from "lucide-react";

interface HeroBackdropProps {
  backgroundImage: string;
  image: string;
  title: string;
  year: string;
  duration: string;
  rating: string;
  tags: string[];
  caption: string;
  link: string;
}

function getCleanTitle(title?: string): string {
  if (!title) return "";
  const trimmed = title.trim();
  const halfLen = trimmed.length / 2;
  if (halfLen >= 3 && Number.isInteger(halfLen)) {
    const firstHalf = trimmed.slice(0, halfLen);
    const secondHalf = trimmed.slice(halfLen);
    if (firstHalf === secondHalf) {
      return firstHalf;
    }
  }
  return trimmed;
}

function getCleanYear(year?: string): string {
  if (!year) return "";
  const trimmed = year.trim();
  const match = trimmed.match(/\b(19\d\d|20\d\d)\b/);
  return match ? match[0] : trimmed.slice(0, 4);
}

export function HeroBackdrop({
  backgroundImage,
  image,
  title,
  year,
  duration,
  rating,
  tags,
  caption,
  link,
}: HeroBackdropProps) {
  const cleanTitle = getCleanTitle(title);
  const cleanYear = getCleanYear(year);
  const cleanRating = rating?.replace(/★/, "").trim();
  const backdropSrc = backgroundImage || image || "/logo-with-background.png";
  const isSerie = link.includes("serie");

  return (
    <section className="relative w-full min-h-[75vh] md:min-h-[82vh] flex items-end overflow-hidden pb-10 md:pb-16 pt-28 md:pt-36">
      {/* ── Immersive Full-Screen Backdrop ── */}
      <div className="absolute inset-0 z-0">
        <Image
          src={backdropSrc}
          alt={cleanTitle}
          fill
          priority
          sizes="100vw"
          className="object-cover object-top sm:object-center select-none"
        />
        {/* Cinematic multi-stop gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090a0c] via-[#090a0c]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090a0c]/95 via-[#090a0c]/60 to-transparent md:w-3/4" />
        <div className="absolute top-0 left-0 right-0 h-36 bg-gradient-to-b from-[#090a0c]/85 to-transparent" />
      </div>

      {/* ── Content Container ── */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-10">
        {/* Floating Poster */}
        {image && (
          <FocusElementProvider className="rounded-xl shrink-0">
            <div
              className="w-36 sm:w-44 md:w-52 aspect-[2/3] shrink-0 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-white/10"
              style={{
                viewTransitionName: `poster-${link.replace(/\//g, "-").replace(/^-/, "")}`,
              }}
            >
              <Image
                src={image}
                alt={cleanTitle}
                width={208}
                height={312}
                className="w-full h-full object-cover"
              />
            </div>
          </FocusElementProvider>
        )}

        {/* Text & Action Details */}
        <div className="flex flex-col gap-3.5 sm:gap-4 text-center md:text-left flex-1">
     

          {/* Title */}
          <h1 className="font-poppins text-2xl sm:text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)]">
            {cleanTitle}
          </h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 text-xs sm:text-sm text-gray-300 font-medium">
            {cleanRating && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#e50914] text-white text-xs font-bold shadow-[0_2px_10px_rgba(229,9,20,0.4)]">
                <Star size={12} className="fill-white" />
                {cleanRating}
              </span>
            )}
            {cleanYear && <span>{cleanYear}</span>}
            {duration && (
              <>
                <span className="text-gray-600">•</span>
                <span>{duration.trim()}</span>
              </>
            )}
            <span className="text-gray-600">•</span>
            <span className="px-2 py-0.5 rounded border border-white/20 text-xs uppercase text-gray-200">
              {isSerie ? "Serie de TV" : "Película"}
            </span>
            <span className="text-gray-600">•</span>
            <span className="px-2 py-0.5 rounded bg-white/[0.08] text-xs font-semibold text-gray-300">
              HD
            </span>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 sm:gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-3 py-1 rounded-full bg-white/[0.08] border border-white/[0.12] text-gray-300 font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Synopsis */}
          {caption && (
            <p className="text-gray-300/90 text-sm sm:text-base leading-relaxed max-w-2xl line-clamp-4 drop-shadow">
              {caption}
            </p>
          )}

          {/* Actions for movies and series */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-center md:justify-start gap-3 w-full sm:w-auto">
            {!isSerie && (
              <div className="w-full sm:w-auto">
                <WatchButton
                  moviePreview={{
                    title: cleanTitle,
                    image,
                    link,
                    backgroundImage: backdropSrc,
                  }}
                  label="Reproducir"
                />
              </div>
            )}

            <div className="w-full sm:w-auto">
              <FavoriteButton
                item={{
                  link,
                  title: cleanTitle,
                  image,
                  backgroundImage: backdropSrc,
                  rating: cleanRating,
                  year: cleanYear,
                  duration,
                  caption,
                  tags,
                  type: isSerie ? "serie" : "movie",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
