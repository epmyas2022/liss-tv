"use client";

import {
  MediaPlayer,
  MediaProvider,
  MediaTimeUpdateEvent,
  MediaTimeUpdateEventDetail,
  Poster,
  Track,
  type MediaPlayerInstance,
} from "@vidstack/react";

import { useState } from "react";

import { Maximize2, Minimize2 } from "lucide-react";
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import FocusContextProvider from "./providers/FocusContextProvider";
import FocusElementProvider from "./providers/FocusElementProvider";

export interface TextTrack {
  src: string;
  label: string;
  language: string;
  kind: "subtitles" | "captions" | "chapters" | "metadata";
  default?: boolean;
}

export interface VideoPlayerProps {
  ref: React.RefObject<MediaPlayerInstance | null>;
  src: string;
  children?: React.ReactNode;
  handleTimeUpdate?: (
    detail: MediaTimeUpdateEventDetail,
    nativeEvent: MediaTimeUpdateEvent,
  ) => void;
  handlePause?: (nativeEvent: Event) => void;
  title: string;
  startTime: number;
  poster?: string;
  thumbnails?: string;
  textTracks?: TextTrack[];
}

export default function VideoPlayer({
  src,
  ref,
  children,
  title,
  poster,
  thumbnails,
  startTime,
  textTracks = [],
  handleTimeUpdate,
  handlePause,
}: VideoPlayerProps) {
  const [isFullScreenIOS, setIsFullScreenIOS] = useState(false);

  const canFullscreen =
    typeof document !== "undefined" && !!document.fullscreenEnabled;

  return (
    // ponytail: Netflix palette via CSS custom props on the vidstack default layout

    <FocusContextProvider
      condition={true}
      trackChildren={true}
      isFocusBoundary={true}
    >
      <div
        className="md:h-dvh"
        style={
          {
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

            ...(isFullScreenIOS
              ? {
                  position: "fixed",
                  inset: 0,
                  zIndex: 9999,
                  width: "100vw",
                  height: "100dvh",
                  aspectRatio: "unset",
                  borderRadius: 0,
                }
              : {}),
          } as React.CSSProperties
        }
      >
        <MediaPlayer
          src={{
            src,
            type: "video/mp4",
          }}
          ref={ref}
          viewType="video"
          streamType="on-demand"
          logLevel="warn"
          crossOrigin
          playsInline
          title={title}
          poster={poster}
          currentTime={startTime}
          onTimeUpdate={handleTimeUpdate}
          onPause={handlePause}
          className="w-full h-full"
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

          <FocusElementProvider>
            <DefaultVideoLayout
              thumbnails={thumbnails}
              icons={defaultLayoutIcons}
              slots={{
                fullscreenButton: !canFullscreen ? (
                  <button
                    onClick={() => setIsFullScreenIOS(!isFullScreenIOS)}
                    className="vds-button"
                    aria-label="Pantalla completa"
                  >
                    {isFullScreenIOS ? (
                      <Minimize2 size={19} />
                    ) : (
                      <Maximize2 size={19} />
                    )}
                  </button>
                ) : undefined,
              }}
            />
          </FocusElementProvider>

          {children}
        </MediaPlayer>
      </div>
    </FocusContextProvider>
  );
}
