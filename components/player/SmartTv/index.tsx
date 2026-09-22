"use client";

import {
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  type MediaPlayerInstance,
} from "@vidstack/react";
import { useRef, useEffect, useState, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import FocusContextProvider from "@/components/providers/FocusContextProvider";
import FocusElementProvider from "@/components/providers/FocusElementProvider";
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation-react";
import { type VideoPlayerProps } from "@/components/player/types";

// ─── Constantes ───────────────────────────────────────────────────────────────
const SEEK_SECONDS = 10;
const CONTROLS_HIDE_MS = 4000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Barra de progreso focusable ─────────────────────────────────────────────
function ProgressBar({
  playerRef,
  currentTime,
  duration,
  onSeekBack,
  onSeekForward,
}: {
  playerRef: React.RefObject<MediaPlayerInstance | null>;
  currentTime: number;
  duration: number;
  onSeekBack: () => void;
  onSeekForward: () => void;
}) {
  const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const { ref, focused } = useFocusable({
    onArrowPress: (dir) => {
      if (dir === "left") { onSeekBack(); return false; }
      if (dir === "right") { onSeekForward(); return false; }
      return true;
    },
  });

  return (
    <div className="w-full flex flex-col gap-1">
      <div
        ref={ref}
        role="slider"
        aria-label="Progreso del video"
        aria-valuenow={Math.round(currentTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        tabIndex={0}
        className="relative w-full h-1 rounded-full bg-white/25 cursor-pointer outline-none"
        style={
          focused
            ? { outline: "2px solid white", outlineOffset: "4px", borderRadius: "999px" }
            : undefined
        }
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          if (playerRef.current) {
            playerRef.current.currentTime = ratio * duration;
          }
        }}
      >
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-red-600 transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-red-600 -translate-x-1/2 transition-opacity ${focused ? "opacity-100" : "opacity-0"}`}
          style={{ left: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-white/60 font-mono select-none">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

// ─── Botón de control con focus ───────────────────────────────────────────────
function ControlButton({
  icon,
  label,
  onPress,
  large = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  large?: boolean;
}) {
  return (
    <FocusElementProvider
      onEnterPress={onPress}
      strokeSize={0}
      styleFocus={{
        borderRadius: "9999px",
        outline: "2px solid white",
        outlineOffset: "3px",
      }}
    >
      <button
        aria-label={label}
        onClick={onPress}
        className={`flex items-center justify-center rounded-full text-white transition-colors
          ${large ? "w-11 h-11" : "w-9 h-9"}`}
      >
        {icon}
      </button>
    </FocusElementProvider>
  );
}

// ─── Overlay "presiona Enter para reproducir" ─────────────────────────────────
function StartOverlay({ onStart }: { onStart: () => void }) {
  return (
    <FocusElementProvider onEnterPress={onStart} strokeSize={0}>
      <button
        onClick={onStart}
        aria-label="Iniciar reproducción"
        className="flex flex-col items-center gap-4 group outline-none"
      >
        <span className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/60 flex items-center justify-center group-focus:border-white group-focus:bg-white/20 transition-all">
          <Play size={40} fill="white" className="text-white ml-1" />
        </span>
        <span className="text-white/70 text-sm font-medium tracking-wide">
          Presiona&nbsp;<kbd className="px-2 py-0.5 bg-white/20 rounded text-xs font-mono">Enter</kbd>&nbsp;para reproducir
        </span>
      </button>
    </FocusElementProvider>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SmartTvPlayer({
  src,
  ref,
  children,
  title,
  poster,
  thumbnails: _thumbnails,
  startTime = 0,
  textTracks = [],
  handleTimeUpdate,
  handlePause,
  onErrorCapture,
}: VideoPlayerProps) {
  const internalRef = useRef<MediaPlayerInstance | null>(null);
  const playerRef = (ref as React.RefObject<MediaPlayerInstance | null>) ?? internalRef;

  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);

  // Autoplay bloqueado → mostrar overlay de inicio
  const [needsUserGesture, setNeedsUserGesture] = useState(false);

  // ── Auto-hide ────────────────────────────────────────────────────────────
  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    hideTimer.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);


  const handleCanPlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    player.play().catch(() => {
      // Intento con muted (autoplay policy trick)
      player.muted = true;
      setMuted(true);
      player.play().catch(() => {
        // Nada funcionó → pedir gesto del usuario
        setNeedsUserGesture(true);
      });
    });
  }, [playerRef]);

  // ── Inicio manual desde el overlay ───────────────────────────────────────
  const startPlayback = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    setNeedsUserGesture(false);
    player.play();
    revealControls();
  }, [playerRef, revealControls]);

  // ── Acciones ─────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) {
      player.play();
    } else {
      player.pause();
    }
    revealControls();
  }, [playerRef, revealControls]);

  const seekBack = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = Math.max(0, player.currentTime - SEEK_SECONDS);
    revealControls();
  }, [playerRef, revealControls]);

  const seekForward = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = Math.min(player.duration, player.currentTime + SEEK_SECONDS);
    revealControls();
  }, [playerRef, revealControls]);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.muted = !player.muted;
    setMuted((m) => !m);
    revealControls();
  }, [playerRef, revealControls]);

  // ── Teclado global ───────────────────────────────────────────────────────
  useEffect(() => {
    const keyHandlers: Record<string, (e: KeyboardEvent) => void> = {
      " ": (e) => {
        e.preventDefault();
        // Si el overlay está visible, Space también inicia la reproducción
        if (needsUserGesture) {
          startPlayback();
        } else {
          togglePlay();
        }
      },
      m: () => toggleMute(),
      M: () => toggleMute(),
    };

    const handleKey = (e: KeyboardEvent) => {
      const handler = keyHandlers[e.key];
      if (handler) {
        handler(e);
      } else {
        revealControls();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay, toggleMute, revealControls, needsUserGesture, startPlayback]);

  return (
      <div
        className="relative w-full h-dvh bg-black overflow-hidden"
        onMouseMove={revealControls}
        onClick={revealControls}
      >
        {/* Video */}
        <MediaPlayer
          src={{ src, type: "video/mp4" }}
          ref={playerRef}
          viewType="video"
          streamType="on-demand"
          logLevel="warn"
          crossOrigin
          playsInline
          title={title}
          poster={poster}
          currentTime={startTime}
          className="w-full h-full"
          onCanPlay={handleCanPlay}
          onErrorCapture={onErrorCapture}
          onTimeUpdate={(detail, nativeEvent) => {
            setCurrentTime(detail.currentTime);
            setDuration(nativeEvent.target.duration ?? 0);
            handleTimeUpdate?.(detail, nativeEvent);
          }}
          onPause={(e) => {
            setPaused(true);
            handlePause?.(e);
          }}
          onPlay={() => setPaused(false)}
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

          {children}
        </MediaPlayer>

        {/* ── Overlay "necesita gesto del usuario" ─────────────────────────── */}
        {needsUserGesture && (
          <FocusContextProvider condition={true} trackChildren={true} isFocusBoundary={true}>
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
              <StartOverlay onStart={startPlayback} />
            </div>
          </FocusContextProvider>
        )}

        {/* ── Aviso de sonido silenciado (autoplay muted trick) ────────────── */}
        {muted && !needsUserGesture && !paused && (
          <div className="absolute top-6 right-6 z-20">
            <FocusElementProvider
              onEnterPress={toggleMute}
              strokeSize={0}
              styleFocus={{ borderRadius: "9999px", outline: "2px solid white", outlineOffset: "3px" }}
            >
              <button
                onClick={toggleMute}
                className="flex items-center gap-2 bg-black/70 border border-white/20 text-white text-xs font-medium px-3 py-2 rounded-full backdrop-blur-sm hover:bg-black/80 transition-colors"
                aria-label="Activar sonido"
              >
                <VolumeX size={14} />
                <span>Activar sonido</span>
              </button>
            </FocusElementProvider>
          </div>
        )}

        {/* ── Overlay de controles estilo Netflix ──────────────────────────── */}
        <div
          aria-hidden={!showControls}
          className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
            showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 30%, transparent 60%)",
          }}
        >
          <div className="px-6 pb-6 pt-16 flex flex-col gap-3">
            {/* Título + tiempo */}
            <div className="flex items-end justify-between">
              <span className="text-white text-sm font-semibold drop-shadow line-clamp-1 max-w-[70%]">
                {title}
              </span>
          
            </div>

            {/* Barra de progreso focusable */}
            <FocusContextProvider trackChildren={true}>
              <ProgressBar
                playerRef={playerRef}
                currentTime={currentTime}
                duration={duration}
                onSeekBack={seekBack}
                onSeekForward={seekForward}
              />
            </FocusContextProvider>

            {/* Botones de control */}
            <FocusContextProvider trackChildren={true}>
              <div className="flex items-center gap-4 pt-1">
                <ControlButton
                  icon={paused ? <Play size={20} fill="white" /> : <Pause size={20} fill="white" />}
                  label={paused ? "Reproducir" : "Pausar"}
                  onPress={togglePlay}
                  large
                />
                <ControlButton
                  icon={<SkipBack size={18} />}
                  label={`Retroceder ${SEEK_SECONDS}s`}
                  onPress={seekBack}
                />
                <ControlButton
                  icon={<SkipForward size={18} />}
                  label={`Adelantar ${SEEK_SECONDS}s`}
                  onPress={seekForward}
                />
                <ControlButton
                  icon={muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  label={muted ? "Activar sonido" : "Silenciar"}
                  onPress={toggleMute}
                />
              </div>
            </FocusContextProvider>
          </div>
        </div>
      </div>
  );
}
