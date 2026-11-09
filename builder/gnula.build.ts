import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/gnula/get-all.operation";
import { MovieBuilder, StoredMovie, StrategyGetMovieDetails, StrategyGetUrl, Url } from "@/types/movie";

class GetDetail implements StrategyGetMovieDetails {
  async operation(_link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    throw new Error("[Gnula] GetDetail not implemented yet");
  }
}

class GetUrl implements StrategyGetUrl {
  async operation(_path: string): Promise<Url> {
    throw new Error("[Gnula] GetUrl not implemented yet");
  }
}

export class GnulaMovieBuilder implements MovieBuilder {
  name: string = "ww3.gnulahd.nu";

  build(): MovieContext {
    return new MovieContext(new GetAll(), new GetDetail(), new GetUrl());
  }
}
