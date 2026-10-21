import { MovieContext } from "@/strategies/context";
import { SoloLatinoMovieBuilder } from "./solo-latino.build";
import { MovieBuilder } from "@/types/movie";

export class MovieContextFactory {

  private static providers: { [key: string]: MovieBuilder } = {
    "solo-latino": new SoloLatinoMovieBuilder(),
  };
  
  private constructor() {}
  
  static createSoloLatinoContext(): MovieContext {
    const builder = new SoloLatinoMovieBuilder();

    return builder.build();
  }

  static driver(name: "solo-latino" | "other-provider"): MovieContext {
  
    const builder = MovieContextFactory.providers[name];

    if (!builder) {
      throw new Error(`No builder found for provider: ${name}`);
    }

    return builder.build();
  }
}
