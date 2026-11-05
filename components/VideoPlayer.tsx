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

  const { fallback, fallbackUrl, src, startTime = 0 } = props;

  const [srcFallback, setSrcFallback] = useState<string | null>(null);
  const [overrideStartTime, setOverrideStartTime] = useState<number | null>(null);

  const currentSrc = srcFallback || src;
  const currentStartTime = overrideStartTime ?? startTime;

  const canSwitchToFallback = Boolean(
    fallbackUrl &&
    fallbackUrl !== src &&
    currentSrc !== fallbackUrl,
  );

  const handleSwitchToFallback = async () => {
    let targetUrl = fallbackUrl;
    if (!targetUrl && fallback) {
      targetUrl = await fallback();
    }

    if (!targetUrl || targetUrl === currentSrc) return;

    if (props.ref?.current?.currentTime) {
      setOverrideStartTime(props.ref.current.currentTime);
    }

    setSrcFallback(targetUrl);
  };

  const errorHandler = async () => {
    const url = fallbackUrl || (await fallback?.());

    if (!url || url === currentSrc) return;

    console.error(
      "❌ Error al cargar el video, se intentará con la ruta de fallback",
    );

    if (props.ref?.current?.currentTime) {
      setOverrideStartTime(props.ref.current.currentTime);
    }

    setSrcFallback(url);
  };

  const playerProps: VideoPlayerProps = {
    ...props,
    src: currentSrc,
    startTime: currentStartTime,
    onErrorCapture: errorHandler,
    canSwitchToFallback,
    onSwitchToFallback: handleSwitchToFallback,
  };

  if (isSmartTV()) {
    return <SmartTvPlayer {...playerProps} />;
  }
  return <MobileAndDeskPlayer {...playerProps} />;
}
