export * from "./domain";
export * from "./driver";
export * from "./ui";

import { Movies, StoredMovie } from "./domain";

export abstract class MovieService {
  abstract getAll(
    search?: string,
    slug?: string,
    pageNumber?: number,
  ): Promise<Movies | undefined>;
  abstract getMovieDetails(link: string): Promise<StoredMovie>;
  abstract getUrl(path: string): Promise<unknown>;
}
