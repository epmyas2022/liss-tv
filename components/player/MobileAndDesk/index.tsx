"use client";

import {
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  type HLSProvider,
} from "@vidstack/react";

import { useState, useRef, useEffect } from "react";

import { ArrowLeftRight, Maximize2, Minimize2 } from "lucide-react";
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import FocusContextProvider from "@/components/providers/FocusContextProvider";
import FocusElementProvider from "@/components/providers/FocusElementProvider";
import { type VideoPlayerProps } from "@/components/player/types";

export default function MobileAndDeskPlayer({
  src,
  ref,
  children,
  title,
  poster,
  thumbnails,
  startTime = 0,
  textTracks = [],
  handleTimeUpdate,
  handlePause,
  onErrorCapture,
  canSwitchToFallback,
  onSwitchToFallback,
}: VideoPlayerProps) {
  const [isFullScreenIOS, setIsFullScreenIOS] = useState(false);
  const initialSeekDoneRef = useRef(startTime <= 0);

  useEffect(() => {
    initialSeekDoneRef.current = startTime <= 0;
  }, [src, startTime]);

  const performSeek = (dur?: number) => {
    if (initialSeekDoneRef.current || startTime <= 0) return;
    if (ref && "current" in ref && ref.current) {
      const player = ref.current;
      const duration = dur ?? player.duration ?? 0;
      if (duration > 0 || player.state?.canSeek) {
        player.currentTime = startTime;
      }
    }
  };

  const onTimeUpdateWrapper: typeof handleTimeUpdate = (detail, nativeEvent) => {
    if (startTime > 0 && !initialSeekDoneRef.current) {
      if (detail.currentTime >= Math.max(0, startTime - 3)) {
        initialSeekDoneRef.current = true;
      } else {
        // Discard 0:00 tick during initial buffering before seek takes effect and trigger seek
        performSeek();
        return;
      }
    }
    handleTimeUpdate?.(detail, nativeEvent);
  };

  const canFullscreen =
    typeof document !== "undefined" && !!document.fullscreenEnabled;

  return (
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
          key={src}
          autoPlay
          load="eager"
          src={{
            src,
            type: src.includes("m3u8") ? "application/x-mpegurl" : "video/mp4",
          }}
          ref={ref}
          viewType="video"
          streamType="on-demand"
          logLevel="warn"
          playsInline
          title={title}
          poster={poster}
          onProviderChange={(provider) => {
            if (provider?.type === "hls") {
              const hls = provider as HLSProvider;
              hls.config = {
                maxBufferLength: 180,
                maxMaxBufferLength: 300,
                maxBufferSize: 200 * 1000 * 1000,
                backBufferLength: 60,
                lowLatencyMode: false,
                abrBandWidthFactor: 0.7,
                abrMaxWithRealBitrate: true,
                capLevelToPlayerSize: true,
                fragLoadingRetryDelay: 1000,
                fragLoadingMaxRetry: 4,
                fragLoadingTimeOut: 20000,
                startFragPrefetch: true,
                maxFragLookUpTolerance: 0.25,
              };

              // Si el stream tiene variantes múltiples, limitar o preferir <= 720p para máxima fluidez
              if (hls.instance) {
                hls.instance.on("hlsManifestParsed" as any, () => {
                  try {
                    const levels = hls.instance?.levels || [];
                    if (levels.length > 1) {
                      const targetIdx = levels.findIndex((lvl: { height?: number }) => lvl.height === 720);
                      if (targetIdx !== -1) {
                        hls.instance!.autoLevelCapping = targetIdx;
                      } else {
                        let max720Idx = -1;
                        for (let i = 0; i < levels.length; i++) {
                          const lvl = levels[i] as { height?: number };
                          if (lvl.height && lvl.height <= 720) {
                            const currentBest = levels[max720Idx] as { height?: number } | undefined;
                            if (max720Idx === -1 || (currentBest?.height && lvl.height > currentBest.height)) {
                              max720Idx = i;
                            }
                          }
                        }
                        if (max720Idx !== -1) {
                          hls.instance!.autoLevelCapping = max720Idx;
                        }
                      }
                    }
                  } catch {}
                });
              }
            }
          }}
          onDurationChange={(dur) => performSeek(dur)}
          onCanPlay={() => performSeek()}
          onLoadedMetadata={() => performSeek()}
          onStarted={() => performSeek()}
          onTimeUpdate={onTimeUpdateWrapper}
          onPause={handlePause}
          onError={onErrorCapture as any}
          onErrorCapture={onErrorCapture}
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
                beforeFullscreenButton:
                  canSwitchToFallback && onSwitchToFallback ? (
                    <button
                      type="button"
                      onClick={onSwitchToFallback}
                      className="vds-button"
                      aria-label="Cambiar a fuente alternativa"
                      title="Cambiar a fuente alternativa"
                    >
                      <ArrowLeftRight size={19} />
                    </button>
                  ) : null,
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
