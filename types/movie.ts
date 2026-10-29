import { MovieContext } from "@/strategies/context";

export interface Movie {
  link: string;
  image: string;
  rating: string;
  title: string;
  year: string;
}

export type StoredMovie = {
  link: string;
  image?: string;
  rating?: string;
  title?: string;
  year?: string;
  backgroundImage?: string;
  duration?: string;
  tags?: string[];
  caption?: string;
  movieUrl?: string;
  updatedAt: string;
  episodes?: {
    season: string;
    episodes: {
      link: string;
      title: string;
      image: string;
      numberEpisode: string;
      caption: string;
    }[];
  }[];
};

export interface Movies {
  movies: Movie[];
  lastPageNumber: number;
}

export interface Episode {
  link: string;
  title: string;
  image: string;
  numberEpisode: string;
  caption: string;
}

export interface Season {
  season: string;
  episodes: Episode[];
}

export interface EpisodeListProps {
  title: string;
  seasons: Season[];
}

export interface MoviePreview {
  title: string;
  image: string;
  link: string;
  startTime: number;
  backgroundImage?: string;
  next?: MoviePreview;
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

export abstract class MovieService {
  abstract getAll(
    search?: string,
    slug?: string,
    pageNumber?: number,
  ): Promise<Movies | undefined>;
  abstract getMovieDetails(link: string): Promise<StoredMovie>;
  abstract getUrl(path: string): Promise<unknown>;
}

export interface StrategyGetAllMovies {
  operation: (
    search?: string,
    slug?: string,
    pageNumber?: number,
  ) => Promise<Movies | undefined>;
}

export interface StrategyGetMovieDetails {
  operation: (link: string) => Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined>;
}



export interface Url {
  url?: string | null;
  fallbackUrl?: string | null;
}

export interface StrategyGetUrl {
  operation: (path: string) => Promise<Url>;
}


export interface MovieBuilder {

  name: string;

  build(): MovieContext;
}

