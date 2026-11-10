import { MovieDriver } from "@/types/movie";
import { MovieContextFactory } from "@/builder/factory";
import { CachedDriverDecorator } from "./cached-driver.decorator";

export class DriverRegistry {
  private static drivers: Map<string, MovieDriver> = new Map();
  private static defaultProviderId: string = "solo-latino";
  private static isInitialized: boolean = false;

  private static initialize(): void {
    if (this.isInitialized) return;

    // Register built-in drivers wrapped in cache decorator
    try {
      const gnulaContext = MovieContextFactory.driver("gnula");
      this.register(new CachedDriverDecorator(gnulaContext));

      const soloLatinoContext = MovieContextFactory.driver("solo-latino");
      this.register(new CachedDriverDecorator(soloLatinoContext));
    } catch (err) {
      console.warn("[DriverRegistry] Warning initializing built-in drivers:", err);
    }

    this.isInitialized = true;
  }

  static register(driver: MovieDriver): void {
    this.drivers.set(driver.id, driver);
  }

  static getDriver(providerId?: string): MovieDriver {
    this.initialize();

    const targetId = providerId || this.defaultProviderId;
    const driver = this.drivers.get(targetId);

    if (!driver) {
      const fallback =
        this.drivers.get(this.defaultProviderId) ||
        this.drivers.values().next().value;
      if (fallback) return fallback;
      throw new Error(`[DriverRegistry] No driver found for provider: "${targetId}"`);
    }

    return driver;
  }

  static getAvailableProviders(): { id: string; name: string }[] {
    this.initialize();
    return Array.from(this.drivers.values()).map((d) => ({
      id: d.id,
      name: d.name,
    }));
  }

  static setDefaultProvider(providerId: string): void {
    if (this.drivers.has(providerId)) {
      this.defaultProviderId = providerId;
    }
  }

  /**
   * Resolves the driver directly from the item's provider metadata.
   * If providerId is provided and matches a registered driver, returns that driver;
   * otherwise falls back to the user's active / default driver.
   */
  static resolveDriverForContent(providerId?: string): MovieDriver {
    this.initialize();

    if (providerId && this.drivers.has(providerId)) {
      return this.drivers.get(providerId)!;
    }

    return this.getDriver();
  }
}
