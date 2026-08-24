"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Episode, EpisodeListProps, MoviePreview } from "@/types/movie";
import { useMovieStore } from "../../store/useMovieStore";
import EpisodeWatchButton from "../ui/EpisodeWatchButton";
import FocusContextProvider from "../providers/FocusContextProvider";
import FocusElementProvider from "../providers/FocusElementProvider";

export function EpisodeList({ title, seasons }: EpisodeListProps) {
  const [activeSeason, setActiveSeason] = useState(seasons[0]?.season ?? "1");
  // ponytail: loading key = episode link; null means nothing loading
  const [loadingLink, setLoadingLink] = useState<string | null>(null);

  const selectRef = useRef<HTMLSelectElement>(null);

  const router = useRouter();

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

  async function handleEpisode(ep: Episode) {
    if (loadingLink) return;
    setLoadingLink(ep.link);

    const index = allEpisodes.findIndex((e) => e.link === ep.link);

    store.setMovieData({
      title: `${title} - ${ep.title}`,
      image: ep.image,
      link: ep.link,
      startTime: 0,
      next: next(allEpisodes.slice(index + 1)),
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

        <FocusElementProvider className="rounded-full mt-2" onEnterPress={() => selectRef?.current?.showPicker()}>
          <select
            ref={selectRef}
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
        </FocusElementProvider>
      </div>

      {/* Episode rows */}

        <ol className="flex flex-col gap-2">
          {current.episodes.map((ep) => (
            <li key={ep.link + ep.numberEpisode}>
              <EpisodeWatchButton
                ep={ep}
                onClick={() => handleEpisode(ep)}
                loadingLink={loadingLink}
              />

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
