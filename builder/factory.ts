import { MovieContext } from "@/strategies/context";
import { SoloLatinoMovieBuilder } from "./solo-latino.build";
import { GnulaMovieBuilder } from "./gnula.build";
import { MovieBuilder } from "@/types/movie";

export class MovieContextFactory {
  private static providers: { [key: string]: MovieBuilder } = {
    "solo-latino": new SoloLatinoMovieBuilder(),
    gnula: new GnulaMovieBuilder(),
  };

  private constructor() {}

  static createSoloLatinoContext(): MovieContext {
    return new SoloLatinoMovieBuilder().build();
  }

  static createGnulaContext(): MovieContext {
    return new GnulaMovieBuilder().build();
  }

  static driver(name: "solo-latino" | "gnula"): MovieContext {
    const builder = MovieContextFactory.providers[name];

    if (!builder) {
      throw new Error(`No builder found for provider: ${name}`);
    }

    return builder.build();
  }
}
