"use client";

import { useCommon } from "@/hooks/useCommon";
import MobileAndDeskPlayer from "@/components/player/MobileAndDesk";
import SmartTvPlayer from "@/components/player/SmartTv";
import { type VideoPlayerProps, type TextTrack } from "@/components/player/types";

export type { VideoPlayerProps, TextTrack };

export default function VideoPlayer(props: VideoPlayerProps) {
  const { isSmartTV } = useCommon();

  if (isSmartTV()) {
    return <SmartTvPlayer {...props} />;
  }
  return <MobileAndDeskPlayer {...props} />;

}
