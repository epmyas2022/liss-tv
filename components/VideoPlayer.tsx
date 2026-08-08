"use client";

import { MediaPlayer, MediaProvider, MediaTimeUpdateEvent, MediaTimeUpdateEventDetail, Poster, Track } from "@vidstack/react";
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

export interface TextTrack {
  src: string;
  label: string;
  language: string;
  kind: "subtitles" | "captions" | "chapters" | "metadata";
  default?: boolean;
}

export interface VideoPlayerProps {
  src: string;
  handleTimeUpdate?: (detail: MediaTimeUpdateEventDetail, nativeEvent: MediaTimeUpdateEvent) => void;
  title: string;
  startTime: number;
  poster?: string;
  thumbnails?: string;
  textTracks?: TextTrack[];
}

export default function VideoPlayer({
  src,
  title,
  poster,
  thumbnails,
  startTime,
  textTracks = [],
  handleTimeUpdate,
}: VideoPlayerProps) {
  return (
    // ponytail: Netflix palette via CSS custom props on the vidstack default layout
    <div
      style={{
        "--media-brand": "#e50914",
        "--media-focus-ring": "#e50914",
        "--media-slider-track-bg": "rgba(255,255,255,0.2)",
        "--media-slider-track-fill-bg": "#e50914",
        "--media-tooltip-bg": "rgba(20,20,20,0.95)",
        "--media-tooltip-color": "#fff",
        "--media-controls-bg":
          "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
        "--media-menu-bg": "#141414",
        "--media-menu-color": "#fff",
        borderRadius: "4px",
        overflow: "hidden",
        background: "#000",
        width: "100%",
        aspectRatio: "16/9",
      } as React.CSSProperties}
    >
      <MediaPlayer
        src={{
          src,
          type: "video/mp4",
        }}
        viewType="video"
        streamType="on-demand"
        logLevel="warn"
        crossOrigin
        playsInline
        title={title}
        poster={poster}
        currentTime={startTime}
        onTimeUpdate={handleTimeUpdate}
        style={{ width: "100%", height: "100%" }}
      >
        <MediaProvider>
          {poster && <Poster className="vds-poster" />}
          {textTracks.map((track) => (
            <Track
              key={track.src}
              kind={track.kind}
              src={track.src}
              label={track.label}
              language={track.language}
              default={track.default}
            />
          ))}
        </MediaProvider>
        <DefaultVideoLayout
          thumbnails={thumbnails}
          icons={defaultLayoutIcons}
        />
      </MediaPlayer>
    </div>
  );
}
