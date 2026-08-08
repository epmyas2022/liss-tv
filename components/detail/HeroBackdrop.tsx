import Image from "next/image";
import WatchButton from "@/components/ui/WatchButton";

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
  const isMobile_SSR = true; // layout is CSS-driven, no JS needed

  return (
    <div className="flex flex-col">

      {/* ── MOBILE LAYOUT ── */}
      <div className="md:hidden">
        {/* Backdrop hero — title overlaid at bottom */}
        <div className="relative w-full" style={{ height: "56vw", minHeight: 200, maxHeight: 320 }}>
          {backgroundImage && (
            <Image
              src={backgroundImage}
              alt=""
              fill
              priority
              className="object-cover object-top"
              sizes="(max-width: 767px) 100vw, 1px"
            />
          )}
          {/* Gradient: transparent top → solid bottom */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(7,7,7,0.1) 0%, rgba(7,7,7,0.6) 60%, #070707 100%)",
            }}
          />
          {/* Title over gradient */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <h1
              className="font-poppins text-white font-bold leading-tight"
              style={{ fontSize: "clamp(1.4rem, 6vw, 2rem)", textShadow: "0 2px 16px rgba(0,0,0,0.9)" }}
            >
              {title}
            </h1>
          </div>
        </div>

        {/* Meta + CTA below backdrop */}
        <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {rating && (
              <span
                className="font-bold px-2.5 py-0.5 rounded-full text-white text-xs"
                style={{ background: "#EA1C25", boxShadow: "0 2px 8px rgba(234,28,37,0.5)" }}
              >
                ★ {rating.trim()}
              </span>
            )}
            {year && <span className="text-gray-300 text-sm">{year.trim()}</span>}
            {duration && (
              <>
                <span className="text-gray-600 text-sm">·</span>
                <span className="text-gray-300 text-sm">{duration.trim()}</span>
              </>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Synopsis */}
          {caption && (
            <p className="text-gray-400 text-sm leading-relaxed line-clamp-3">{caption}</p>
          )}

          {/* CTA — full width on mobile */}
          {link.includes("pelicula") && (
            <div className="mt-1">
              <WatchButton
                moviePreview={{ title, image, link, backgroundImage }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── DESKTOP LAYOUT (md+) — unchanged ── */}
      <div className="hidden md:block relative">
        {backgroundImage && (
          <div className="absolute inset-0 z-0">
            <Image
              src={backgroundImage}
              alt=""
              fill
              priority
              className="object-cover object-top"
              sizes="(min-width: 768px) 100vw, 1px"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(7,7,7,0.55) 0%, rgba(7,7,7,0.85) 50%, #070707 100%)",
              }}
            />
          </div>
        )}

        <div className="relative z-10 flex flex-row items-start gap-8 px-6 pt-36 pb-16 max-w-5xl mx-auto w-full">
          {/* Poster */}
          {image && (
            <div
              className="shrink-0 rounded-xl overflow-hidden shadow-2xl"
              style={{
                width: 180,
                aspectRatio: "2/3",
                boxShadow: "0 24px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(234,28,37,0.25)",
              }}
            >
              <Image
                src={image}
                alt={title || ""}
                width={180}
                height={270}
                className="object-cover w-full h-full"
                // ponytail: same name formula as MovieCard so the browser morphs them
                style={{
                  viewTransitionName: `poster-${link.replace(/\//g, "-").replace(/^-/, "")}`,
                }}
              />
            </div>
          )}

          {/* Info */}
          <div className="flex flex-col gap-4 pb-2">
            <h1
              className="font-poppins text-white text-4xl md:text-5xl font-bold leading-tight"
              style={{ textShadow: "0 2px 24px rgba(0,0,0,0.8)" }}
            >
              {title}
            </h1>

            <div className="flex items-center gap-3 flex-wrap text-sm">
              {rating && (
                <span
                  className="font-bold px-2.5 py-0.5 rounded-full text-white text-xs"
                  style={{ background: "#EA1C25", boxShadow: "0 2px 12px rgba(234,28,37,0.5)" }}
                >
                  ★ {rating.trim()}
                </span>
              )}
              {year && <span className="text-gray-300">{year.trim()}</span>}
              {duration && (
                <>
                  <span className="text-gray-600">·</span>
                  <span className="text-gray-300">{duration.trim()}</span>
                </>
              )}
            </div>

            {tags.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-3 py-1 rounded-full font-medium"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.75)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {caption && (
              <p className="text-gray-300 text-sm leading-relaxed max-w-xl">{caption}</p>
            )}

            {link.includes("pelicula") && (
              <div className="w-48 mt-2">
                <WatchButton
                  moviePreview={{ title, image, link, backgroundImage }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
