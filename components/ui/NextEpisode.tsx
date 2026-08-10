import { ChevronRight } from "lucide-react";
import { useMediaState, type MediaPlayerInstance } from "@vidstack/react";

// ponytail: keyframes inline beats a dep just for one animation
const ANIM_STYLE = `
  @keyframes next-ep-in {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

export default function NextEpisode({
  playerRef,
  threshold = 2,
  onClick,
}: {
  threshold?: number;
  playerRef: React.RefObject<MediaPlayerInstance | null>;
  onClick?: () => void;
}) {
  const currentTime = useMediaState("currentTime", playerRef);
  const duration = useMediaState("duration", playerRef);

  const shouldShowNextEpisode = duration - currentTime < threshold && duration > 0;

  if (!shouldShowNextEpisode) return null;

  return (
    <div
      className="absolute bottom-16 lg:bottom-24 right-0 left-0 z-10 flex justify-end py-3 px-6"
      style={{ animation: "next-ep-in 0.4s cubic-bezier(0.16,1,0.3,1) both" }}
    >
      <style>{ANIM_STYLE}</style>
      <button
        className="
          group flex items-center gap-3
          bg-zinc-900 hover:bg-zinc-800 border border-white/20
          text-white text-base font-semibold
          px-6 py-3 rounded
          transition-all duration-150
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60
        "
        onClick={() => {
          if (onClick) onClick();
          playerRef.current?.pause();
        }}
      >
        Siguiente episodio
        <ChevronRight
          size={18}
          className="opacity-80 transition-transform duration-150 group-hover:translate-x-1"
        />
      </button>
    </div>
  );
}
