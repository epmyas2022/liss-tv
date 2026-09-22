"use client";

import { useCommon } from "@/hooks/useCommon";
import MobileAndDeskPlayer from "@/components/player/MobileAndDesk";
import SmartTvPlayer from "@/components/player/SmartTv";
import {
  type VideoPlayerProps,
  type TextTrack,
} from "@/components/player/types";
import { useState } from "react";

export type { VideoPlayerProps, TextTrack };

export default function VideoPlayer(props: VideoPlayerProps) {
  const { isSmartTV } = useCommon();

  const { fallback } = props;

  const [srcFallback, setSrcFallback] = useState<string | null>(null);

  const errorHandler = async () => {
    const url = await fallback?.();

    if (!url) return;

    console.error(
      "❌ Error al cargar el video, se intentará con la ruta de fallback",
    );

    setSrcFallback(url);
  };

  if (isSmartTV()) {
    return (
      <SmartTvPlayer
        {...props}
        src={srcFallback || props.src}
        onErrorCapture={errorHandler}
      />
    );
  }
  return (
    <MobileAndDeskPlayer
      {...props}
      src={srcFallback || props.src}
      onErrorCapture={errorHandler}
    />
  );
}
