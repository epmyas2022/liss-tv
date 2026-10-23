import { StrategyGetAllMovies, StrategyGetMovieDetails, StrategyGetUrl } from "@/types/movie";

export class MovieContext {
  private strategyGetAllMovies: StrategyGetAllMovies;
  private strategyGetMovieDetails: StrategyGetMovieDetails;
  private strategyGetUrl: StrategyGetUrl;

  constructor(
    strategyGetAllMovies: StrategyGetAllMovies,
    strategyGetMovieDetails: StrategyGetMovieDetails,
    strategyGetUrl: StrategyGetUrl,
  ) {
    this.strategyGetAllMovies = strategyGetAllMovies;
    this.strategyGetMovieDetails = strategyGetMovieDetails;
    this.strategyGetUrl = strategyGetUrl;
  }

  async getAll(search?: string, slug?: string, pageNumber?: number) {
    return await this.strategyGetAllMovies.operation(search, slug, pageNumber);
  }

  async getMovieDetails(link: string) {
    return await this.strategyGetMovieDetails.operation(link);
  }

  async getUrl(path: string) {
    return await this.strategyGetUrl.operation(path);
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
