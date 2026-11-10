import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/sololatino/get-all.operation";
import { GetDetail } from "@/strategies/sololatino/get-detail.operation";
import { GetUrl } from "@/strategies/sololatino/get-url.operation";
import { MovieBuilder } from "@/types/movie";

export class SoloLatinoMovieBuilder implements MovieBuilder<MovieContext> {
  name: string = "Solo Latino";
  id: string = "solo-latino";

  build(): MovieContext {
    return new MovieContext(
      new GetAll(),
      new GetDetail(),
      new GetUrl(),
      "solo-latino",
      "Solo Latino",
    );
  }
}
