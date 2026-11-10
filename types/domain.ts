export type MediaType = "movie" | "serie";

export interface Episode {
  link: string;
  title: string;
  image: string;
  numberEpisode: string;
  caption: string;
  /** Extensible provider-specific context (e.g. server IDs, tokens, hashes) */
  context?: Record<string, unknown>;
}

export interface Season {
  season: string;
  episodes: Episode[];
}

export interface MediaItem {
  link: string;
  image: string;
  rating: string;
  title: string;
  year: string;
  id?: string;
  type?: MediaType;
  provider?: string;
  context?: Record<string, unknown>;
}

// Backward compatibility alias for MediaItem
export type Movie = MediaItem;

export interface PaginatedResult<T> {
  items: T[];
  lastPageNumber: number;
  hasMore: boolean;
}

export interface Movies {
  movies: MediaItem[];
  lastPageNumber: number;
  hasMore?: boolean;
}

export interface StreamSource {
  url?: string | null;
  fallbackUrl?: string | null;
  headers?: Record<string, string>;
}

// Backward compatibility alias for StreamSource
export type Url = StreamSource;

export interface MediaDetail {
  link: string;
  title?: string;
  image?: string;
  rating?: string;
  year?: string;
  backgroundImage?: string;
  duration?: string;
  tags?: string[];
  caption?: string;
  movieUrl?: string;
  updatedAt?: string;
  type?: MediaType;
  provider?: string;
  episodes?: Season[];
  /** Extensible provider-specific context (e.g. tokens, stream configs) */
  context?: Record<string, unknown>;
}

// Backward compatibility alias for StoredMovie
export type StoredMovie = MediaDetail & {
  link: string;
  updatedAt: string;
};
