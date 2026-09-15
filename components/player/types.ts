import {
  MediaTimeUpdateEvent,
  MediaTimeUpdateEventDetail,
  type MediaPlayerInstance,
} from "@vidstack/react";

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
