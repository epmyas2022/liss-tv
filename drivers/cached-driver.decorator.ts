import { DriverQuery, GetUrlOptions, MovieDriver, Movies, StoredMovie, Url } from "@/types/movie";
import { get, getAllData, upsert, upsertAll } from "@/services/movie.store";
import { resolveCachedStream } from "@/services/stream-cache.service";

export class CachedDriverDecorator implements MovieDriver {
  constructor(private readonly innerDriver: MovieDriver) {}

  get id(): string {
    return this.innerDriver.id;
  }

  get name(): string {
    return this.innerDriver.name;
  }

  private isPastHours(dateString: string, hours: number): boolean {
    return (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60) > hours;
  }

  private isPastDays(dateString: string, days: number): boolean {
    return (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24) > days;
  }

  private buildCacheKey(query?: DriverQuery): string {
    const page = query?.pageNumber ?? 1;
    if (query?.search) {
      return `${this.id}:search:${query.search.toLowerCase().trim()}:page:${page}`;
    }
    if (!query?.slug || query.slug === "") {
      return `${this.id}:home:page:${page}`;
    }
    return `${this.id}:${query.slug}:page:${page}`;
  }

  async getAll(query?: DriverQuery): Promise<Movies | undefined> {
    const key = this.buildCacheKey(query);
    const cached = getAllData<Movies>(key);
    const maxAgeHours = query?.search ? 1 : 8;

    if (cached && !this.isPastHours(cached.updatedAt, maxAgeHours)) {
      return cached.data;
    }

    const fresh = await this.innerDriver.getAll(query);
    if (fresh) {
      // Ensure all items are stamped with provider id
      const stampedMovies = fresh.movies.map((m) => ({
        ...m,
        provider: m.provider || this.id,
      }));
      const stampedResult: Movies = {
        ...fresh,
        movies: stampedMovies,
      };
      upsertAll<Movies>(key, stampedResult);
      return stampedResult;
    }

    return fresh;
  }

  async getDetail(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    const cached = get(link);
    const isSerie = link.includes("serie");

    if (
      cached?.title &&
      cached?.image &&
      cached?.backgroundImage &&
      !this.isPastDays(cached.updatedAt, 7) &&
      (!isSerie || cached?.episodes?.length)
    ) {
      return cached;
    }

    const fresh = await this.innerDriver.getDetail(link);
    if (fresh) {
      const stamped = {
        ...fresh,
        provider: this.id,
      };
      upsert(link, stamped);
      return stamped;
    }

    return fresh;
  }

  async getUrl(path: string, options?: GetUrlOptions): Promise<Url> {
    const cached = await resolveCachedStream(path);
    if (cached) {
      return cached;
    }
    return await this.innerDriver.getUrl(path, options);
  }
}
