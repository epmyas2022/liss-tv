import { Season } from "./domain";

export interface EpisodeListProps {
  title: string;
  seasons: Season[];
  provider?: string;
}

export interface MoviePreview {
  title: string;
  image: string;
  link: string;
  startTime: number;
  backgroundImage?: string;
  next?: MoviePreview;
  provider?: string;
  /** Provider-specific resolution context (e.g. server IDs, tokens) */
  context?: Record<string, unknown>;
}

export type ContinueWatching = MoviePreview & {
  currentTime: number;
  duration: number;
  id?: string;
};

export interface MovieState {
  continueWatching: ContinueWatching[];
  moviePreview: MoviePreview | null;
  setMovieData: (preview: MoviePreview) => void;
  clearMovieData: () => void;
  addToContinueWatching: (movie: ContinueWatching) => void;
  syncContinueWatching: (movies: ContinueWatching[]) => void;
  removeFromContinueWatching: (link: string) => void;
}
