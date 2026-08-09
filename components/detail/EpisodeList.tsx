"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Episode, EpisodeListProps } from "@/types/movie";

import { useMovieStore } from "../../store/useMovieStore";

export function EpisodeList({ title, seasons }: EpisodeListProps) {
  const [activeSeason, setActiveSeason] = useState(seasons[0]?.season ?? "1");
  // ponytail: loading key = episode link; null means nothing loading
  const [loadingLink, setLoadingLink] = useState<string | null>(null);
  const router = useRouter();

  const store = useMovieStore();

  const current = seasons.find((s) => s.season === activeSeason) ?? seasons[0];

  async function handleEpisode(ep: Episode, nextEp?: Episode) {
    if (loadingLink) return;
    setLoadingLink(ep.link);

    store.setMovieData({
      title: `${title} - ${ep.title}`,
      image: ep.image,
      link: ep.link,
      startTime: 0,
      next: nextEp ? {
        image: nextEp.image,
        link: nextEp.link,
        title: `${title} - ${nextEp.title}`,
        startTime: 0,
      } : undefined,
    });

    setLoadingLink(null);


    const slug = ep.link.split("/")[1];
    
    router.push(`/serie/${slug}/player`);
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24 sm:pb-20">
      {/* Season tabs */}
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-white font-bold text-lg mr-4">Episodes</h2>
        {/* ponytail: native select beats custom dropdown for a single control */}
        <select
          value={activeSeason}
          onChange={(e) => setActiveSeason(e.target.value)}
          className="text-white text-sm font-semibold px-4 py-1.5 rounded-full focus:outline-none cursor-pointer"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {seasons.map((s) => (
            <option
              key={s.season}
              value={s.season}
              style={{ background: "#141414" }}
            >
              Season {s.season}
            </option>
          ))}
        </select>
      </div>

      {/* Episode rows */}
      <ol className="flex flex-col gap-2">
        {current.episodes.map((ep, index) => (
          <li key={ep.link + ep.numberEpisode}>
            <button
              onClick={() => handleEpisode(ep, current.episodes[index + 1])}
              disabled={!!loadingLink}
              className="w-full text-left flex items-start gap-4 rounded-md px-3 py-3 group transition-colors duration-150 disabled:opacity-60"
              style={{ background: "transparent" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "rgba(255,255,255,0.06)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  "transparent")
              }
            >
              {/* Episode number */}
              <span
                className="shrink-0 w-8 text-right text-lg font-bold self-center"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                {ep.numberEpisode.replace("E", "")}
              </span>

              {/* Thumbnail */}
              <div
                className="shrink-0 rounded overflow-hidden relative"
                style={{
                  width: "clamp(90px, 25vw, 130px)",
                  aspectRatio: "16/9",
                  background: "#1a1a1a",
                }}
              >
                {ep.image && (
                  <Image
                    src={ep.image}
                    alt={ep.title}
                    fill
                    className="object-cover"
                    sizes="130px"
                  />
                )}
                {/* Loading / play overlay */}
                <div
                  className="absolute inset-0 flex items-center justify-center transition-opacity duration-150"
                  style={{
                    background: "rgba(0,0,0,0.45)",
                    opacity: loadingLink === ep.link ? 1 : 0,
                  }}
                  // ponytail: group-hover handled via CSS opacity below
                >
                  {loadingLink === ep.link ? (
                    <span className="text-white text-xs">Loading...</span>
                  ) : (
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 32 32"
                      fill="white"
                      className="group-hover:opacity-100"
                    >
                      <circle cx="16" cy="16" r="15" fill="rgba(0,0,0,0.5)" />
                      <polygon points="13,10 24,16 13,22" fill="white" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex flex-col gap-1 min-w-0 flex-1 self-center">
                <p className="text-white font-semibold text-sm leading-snug line-clamp-2">
                  {ep.title}
                </p>
                <p
                  className="text-xs leading-relaxed line-clamp-2"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  {ep.caption}
                </p>
              </div>
            </button>
            {/* Separator */}
            <div
              className="mx-3 h-px"
              style={{ background: "rgba(255,255,255,0.06)" }}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
