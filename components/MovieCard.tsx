import Image from "next/image";
import Link from "next/link";
import WatchButton from "./ui/WatchButton";
import { useRouter } from "next/navigation";
import type { Movie } from "@/types/movie";
import FocusElementProvider from "./providers/FocusElementProvider";

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

export function MovieCard({ movie }: { movie: Movie }) {
  const router = useRouter();

  const title = getCleanTitle(movie.title);
  const year = getCleanYear(movie.year);
  const rating = movie.rating?.replace(/★/, "").trim();

  return (
    <FocusElementProvider
      strokeSize={0}
      className="rounded-xl group"
      styleFocus={{
        outline: "2px solid #e50914",
        outlineOffset: "2px",
        transform: "scale(1.04)",
      }}
      onEnterPress={() => router.push(movie.link)}
    >
      <Link
        href={movie.link}
        className="group/card relative block rounded-xl overflow-hidden bg-[#131519] border border-white/[0.06] hover:border-white/20 transition-all duration-300 hover:shadow-[0_12px_32px_rgba(0,0,0,0.8)] cursor-pointer"
      >
        {/* Poster */}
        <div className="relative aspect-[2/3] w-full overflow-hidden">
          <Image
            src={movie.image || "/logo-with-background.png"}
            alt={title || movie.link}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
            className="object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
            style={{
              viewTransitionName: `poster-${movie.link.replace(/\//g, "-").replace(/^-/, "")}`,
            }}
          />

          {/* Cinematic Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#090a0c] via-[#090a0c]/60 to-transparent opacity-80 group-hover/card:opacity-95 transition-opacity duration-300" />

          {/* Rating badge */}
          {rating && (
            <span className="absolute top-2.5 right-2.5 bg-black/85 border border-white/10 text-amber-400 text-[11px] font-bold px-2 py-0.5 rounded-md shadow-md flex items-center gap-1 z-10">
              ★ {rating}
            </span>
          )}

          {/* Info panel — resting at bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-3.5 flex flex-col gap-1 z-10">
            {title && (
              <p className="text-white font-semibold text-sm leading-snug line-clamp-2 drop-shadow">
                {title}
              </p>
            )}

            <div className="flex items-center gap-2">
              {year && (
                <span className="text-gray-400 text-xs font-medium">
                  {year}
                </span>
              )}
            </div>

            {/* Watch button reveals on hover without displacing title/year when idle */}
            <div className="max-h-0 opacity-0 group-hover/card:max-h-16 group-hover/card:opacity-100 transition-all duration-300 ease-out overflow-hidden">
              <div className="pt-2">
                <WatchButton
                  moviePreview={{
                    image: movie.image,
                    title,
                    link: movie.link,
                  }}
                  redirectDetails
                  key={movie.link}
                />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </FocusElementProvider>
  );
}
