import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/gnula/get-all.operation";
import { GetDetail } from "@/strategies/gnula/get-detail.operation";
import { MovieBuilder, StrategyGetUrl, Url } from "@/types/movie";

class GetUrl implements StrategyGetUrl {
  async operation(_path: string): Promise<Url> {
    throw new Error("[Gnula] GetUrl not implemented yet");
  }
}

export class GnulaMovieBuilder implements MovieBuilder<MovieContext> {
  name: string = "Gnula HD";
  id: string = "gnula";

  build(): MovieContext {
    return new MovieContext(
      new GetAll(),
      new GetDetail(),
      new GetUrl(),
      "gnula",
      "Gnula HD",
    );
  }
}
