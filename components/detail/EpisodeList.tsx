"use client";

import { useState } from "react";
import type { Episode, EpisodeListProps, MoviePreview } from "@/types/movie";
import { useMovieStore } from "../../store/useMovieStore";
import EpisodeWatchButton from "../ui/EpisodeWatchButton";
import SeasonSelect from "../ui/SeasonSelect";
import { analytics } from "@/analytics/event";

export function EpisodeList({ title, seasons }: EpisodeListProps) {
  const [activeSeason, setActiveSeason] = useState(seasons[0]?.season ?? "1");

  const store = useMovieStore();

  const allEpisodes = seasons.flatMap((s) => s.episodes);
  const current = seasons.find((s) => s.season === activeSeason) ?? seasons[0];

  const next = (
    episodes: Episode[],
    nextValue?: MoviePreview,
    index: number = 0,
  ): MoviePreview | undefined => {
    if (!episodes || episodes.length === 0 || index >= episodes.length)
      return undefined;

    nextValue = {
      image: episodes[index].image,
      link: episodes[index].link,
      title: `${title} - ${episodes[index].title}`,
      startTime: 0,
      next: next(episodes.slice(index + 1), nextValue),
    };

    return nextValue;
  };

  function handleEpisodeInteraction(ep: Episode) {
    const index = allEpisodes.findIndex((e) => e.link === ep.link);

    store.setMovieData({
      title: `${title} - ${ep.title}`,
      image: ep.image,
      link: ep.link,
      startTime: 0,
      next: next(allEpisodes.slice(index + 1)),
    });

    analytics.watchVideo(`${title} - ${ep.title}`, ep.link);
  }

  const episodeCount = current?.episodes?.length || 0;

  return (
    <section className="w-full max-w-6xl mx-auto px-4 sm:px-8 pb-24 sm:pb-20 pt-8 border-t border-white/[0.08]">
      {/* Header: Season selection + Episode count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <h2 className="font-poppins text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Episodios
          </h2>
          <span className="text-xs sm:text-sm font-semibold px-3 py-1 rounded-full bg-white/[0.08] text-gray-300">
            {episodeCount} {episodeCount === 1 ? "episodio" : "episodios"}
          </span>
        </div>

        {seasons.length > 1 && (
          <SeasonSelect
            seasons={seasons}
            activeSeason={activeSeason}
            onChange={setActiveSeason}
          />
        )}
      </div>

      {/* Episode list */}
      {current?.episodes && current.episodes.length > 0 ? (
        <ol className="flex flex-col gap-2.5">
          {current.episodes.map((ep) => {
            const match = ep.link.match(
              /\/serie\/([^/]+)\/(?:[^\/]+\/)?episodio-([^/]+)/i,
            );
            const slug = match ? match[1] : undefined;


            if (!slug) return null;

            const targetHref = `/serie/${slug}/player`;

            return (
              <li key={`${ep.link}-${ep.numberEpisode}`}>
                <EpisodeWatchButton
                  ep={ep}
                  href={targetHref}
                  onClick={() => handleEpisodeInteraction(ep)}
                />
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="py-12 text-center text-gray-400">
          No hay episodios disponibles para esta temporada.
        </div>
      )}
    </section>
  );
}
