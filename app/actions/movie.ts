"use server";

import { cookies } from "next/headers";
import { withTimeout, attempts } from "@/utils/utils";
import { DriverRegistry } from "@/drivers/registry";
import { GetUrlOptions, MovieDriver } from "@/types/movie";

const PROVIDER_COOKIE_NAME = "liss_provider";
const DEFAULT_PROVIDER = "solo-latino";

export async function getActiveProviderId(): Promise<string> {
  const cookieStore = await cookies();
  const provider = cookieStore.get(PROVIDER_COOKIE_NAME)?.value;
  return provider || DEFAULT_PROVIDER;
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
  const driver = await getActiveDriver(providerId);
  return await driver.getDetail(link);
}

export async function getMovieUrl(link: string, options?: GetUrlOptions) {
  const explicitProvider =
    (options?.params?.provider as string | undefined) ||
    (options?.detailContext?.provider as string | undefined);

  const driver = await getActiveDriver(explicitProvider);
  return await attempts([
    {
      execute: () =>
        withTimeout(
          driver.getUrl(link, options),
          60000,
          new Error("Error al obtener la URL del video"),
        ),
      attempts: 3,
      delay: 1000,
    },
  ]);
}
