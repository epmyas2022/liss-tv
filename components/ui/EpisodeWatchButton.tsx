"use client";

import { Episode } from "@/types/movie";
import Image from "next/image";
import FocusElementProvider from "../providers/FocusElementProvider";
import Link from "next/link";

export default function EpisodeWatchButton({
  ep,
  onClick,
  href,
}: {
  ep: Episode;
  onClick: VoidFunction;
  href: string;
}) {
  return (
    <FocusElementProvider
      onEnterPress={() => onClick()}
      className="rounded-md"
      strokeSize={0}
      styleFocus={{ background: "rgba(255,255,255,0.16)" }}
    >
      <Link
        href={href}
        onClick={onClick}
        className="w-full text-left flex items-start gap-4 rounded-md px-3 py-3 group transition-colors duration-150"
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.06)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "transparent")
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
          {/* Play overlay */}
          <div
            className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 opacity-0 group-hover:opacity-100"
            style={{
              background: "rgba(0,0,0,0.45)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="white"
            >
              <circle cx="16" cy="16" r="15" fill="rgba(0,0,0,0.5)" />
              <polygon points="13,10 24,16 13,22" fill="white" />
            </svg>
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
      </Link>
    </FocusElementProvider>
  );
}
