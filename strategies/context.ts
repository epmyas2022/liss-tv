import {
  DriverQuery,
  GetUrlOptions,
  MovieDriver,
  Movies,
  StoredMovie,
  StrategyGetAllMovies,
  StrategyGetMovieDetails,
  StrategyGetUrl,
  Url,
} from "@/types/movie";

export class MovieContext implements MovieDriver {
  readonly id: string;
  readonly name: string;
  private strategyGetAllMovies: StrategyGetAllMovies;
  private strategyGetMovieDetails: StrategyGetMovieDetails;
  private strategyGetUrl: StrategyGetUrl;

  constructor(
    strategyGetAllMovies: StrategyGetAllMovies,
    strategyGetMovieDetails: StrategyGetMovieDetails,
    strategyGetUrl: StrategyGetUrl,
    id: string = "default",
    name: string = "Default Provider",
  ) {
    this.strategyGetAllMovies = strategyGetAllMovies;
    this.strategyGetMovieDetails = strategyGetMovieDetails;
    this.strategyGetUrl = strategyGetUrl;
    this.id = id;
    this.name = name;
  }

  async getAll(
    searchOrQuery?: string | DriverQuery,
    slug?: string,
    pageNumber?: number,
  ): Promise<Movies | undefined> {
    if (typeof searchOrQuery === "object" && searchOrQuery !== null) {
      return await this.strategyGetAllMovies.operation(
        searchOrQuery.search,
        searchOrQuery.slug,
        searchOrQuery.pageNumber,
      );
    }
    return await this.strategyGetAllMovies.operation(
      searchOrQuery,
      slug,
      pageNumber,
    );
  }

  async getDetail(
    link: string,
  ): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    return await this.strategyGetMovieDetails.operation(link);
  }

  async getMovieDetails(
    link: string,
  ): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    return await this.getDetail(link);
  }

  async getUrl(path: string, options?: GetUrlOptions): Promise<Url> {
    return await this.strategyGetUrl.operation(path, options);
  }

  setStrategyGetAllMovies(strategy: StrategyGetAllMovies) {
    this.strategyGetAllMovies = strategy;
  }

  setStrategyGetMovieDetails(strategy: StrategyGetMovieDetails) {
    this.strategyGetMovieDetails = strategy;
  }

  setStrategyGetUrl(strategy: StrategyGetUrl) {
    this.strategyGetUrl = strategy;
  }
}
