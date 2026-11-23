import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/cinecalidad/get-all.operation";
import { GetDetail } from "@/strategies/cinecalidad/get-detail.operation";
import { GetUrl } from "@/strategies/cinecalidad/get-url.operation";
import type { MovieBuilder } from "@/types/movie";

export class CinecalidadMovieBuilder implements MovieBuilder<MovieContext> {
  name: string = "Cinecalidad";
  id: string = "cinecalidad";

  build(): MovieContext {
    return new MovieContext(
      new GetAll(),
      new GetDetail(),
      new GetUrl(),
      "cinecalidad",
      "Cinecalidad",
    );
  }
}
