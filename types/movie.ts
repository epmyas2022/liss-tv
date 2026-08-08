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
  seasons: Season[];
}

export interface MoviePreview {
  title: string;
  image: string;
  link: string;
  backgroundImage?: string;
}

export interface MovieState {
  moviePreview: MoviePreview | null;
  setMovieData: (preview: MoviePreview) => void;
  clearMovieData: () => void;
}
