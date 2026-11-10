import { Movies, StoredMovie, Url } from "./domain";

export interface DriverQuery {
  search?: string;
  slug?: string;
  pageNumber?: number;
}

/**
 * Generic options and extensible context passed to GetUrl (kwargs equivalent).
 * Allows any provider to receive custom player servers, audio tracks,
 * episode coordinates, or tokens extracted during getDetail.
 */
export interface GetUrlOptions {
  /** Target server / hoster identifier (e.g. "Server 1", "streamtape") */
  serverId?: string;
  /** Audio track or subtitle language (e.g. "latino", "castellano", "sub") */
  language?: string;
  /** Season number or identifier */
  season?: string | number;
  /** Episode number or identifier */
  episode?: string | number;
  /** Context or metadata extracted during getDetail needed for resolution */
  detailContext?: Record<string, unknown>;
  /** Extensible parameters bag (like kwargs in Python) for provider-specific extras */
  params?: Record<string, unknown>;
}

export interface MovieDriver {
  readonly id: string;
  readonly name: string;
  getAll(query?: DriverQuery): Promise<Movies | undefined>;
  getDetail(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined>;
  getUrl(path: string, options?: GetUrlOptions): Promise<Url>;
}

// Strategy Interfaces for sub-strategy implementations
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

export interface StrategyGetUrl {
  operation: (path: string, options?: GetUrlOptions) => Promise<Url>;
}

export interface MovieBuilder<T = unknown> {
  name: string;
  build(): T;
}
