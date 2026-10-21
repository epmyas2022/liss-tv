import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/sololatino/get-all.operation";
import { GetDetail } from "@/strategies/sololatino/get-detail.operation";
import { GetUrl } from "@/strategies/sololatino/get-url.operation";
import { MovieBuilder } from "@/types/movie";

export class SoloLatinoMovieBuilder implements MovieBuilder {
  name: string = "sololatino.net";

  build(): MovieContext {
    return new MovieContext(new GetAll(), new GetDetail(), new GetUrl());
  }
}
