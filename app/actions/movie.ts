"use server";

import { cookies } from "next/headers";
import { withTimeout, attempts, inferProviderFromLink } from "@/utils/utils";
import { DriverRegistry } from "@/drivers/registry";
import type { GetUrlOptions, MovieDriver, Url } from "@/types/movie";
import { get, getAny, findProviderBySlugOrLink } from "@/services/movie.store";

const PROVIDER_COOKIE_NAME = "liss_provider";
const DEFAULT_PROVIDER = "megadede";

export async function getActiveProviderId(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const provider = cookieStore.get(PROVIDER_COOKIE_NAME)?.value;
    return provider || DEFAULT_PROVIDER;
  } catch {
    return DEFAULT_PROVIDER;
  }
}

export async function setActiveProvider(providerId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PROVIDER_COOKIE_NAME, providerId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    httpOnly: true,
  });
}

export async function getAvailableProviders(): Promise<{ id: string; name: string }[]> {
  return DriverRegistry.getAvailableProviders();
}

async function getActiveDriver(explicitProviderId?: string): Promise<MovieDriver> {
  const providerId = explicitProviderId || (await getActiveProviderId());
  return DriverRegistry.resolveDriverForContent(providerId);
}

export async function getAllMovies(
  search?: string,
  filter?: string,
  page?: number,
) {
  const driver = await getActiveDriver();
  return await driver.getAll({ search, slug: filter, pageNumber: page });
}

export async function getDetails(link: string, providerId?: string) {
  const activeCookieProvider = await getActiveProviderId();
  const resolvedProvider =
    providerId ||
    activeCookieProvider ||
    inferProviderFromLink(link) ||
    findProviderBySlugOrLink(link) ||
    DEFAULT_PROVIDER;

  const driver = await getActiveDriver(resolvedProvider);
  return await driver.getDetail(link);
}

export async function getMovieUrl(
  link: string,
  options?: GetUrlOptions
): Promise<Url | { error: string }> {
  try {
    const providerHint =
      (options?.params?.provider as string | undefined) ||
      (options?.detailContext?.provider as string | undefined);
    const stored = providerHint ? get(providerHint, link) : getAny(link);
    const explicitProvider =
      providerHint ||
      stored?.provider ||
      inferProviderFromLink(link, options?.detailContext || options?.params);

    const mergedOptions: GetUrlOptions = {
      ...options,
      detailContext: {
        ...stored?.context,
        ...options?.detailContext,
        provider: explicitProvider,
      },
      params: {
        ...stored?.context,
        ...options?.params,
        provider: explicitProvider,
      },
    };

    const driver = await getActiveDriver(explicitProvider);
    return await attempts([
      {
        execute: () =>
          withTimeout(
            driver.getUrl(link, mergedOptions),
            60000,
            new Error("Error al obtener la URL del video"),
          ),
        attempts: 3,
        delay: 1000,
      },
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[getMovieUrl] Error resolving stream for '${link}':`, err);
    return { error: message };
  }
}
