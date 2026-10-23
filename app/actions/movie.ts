"use server";

import { withTimeout, attempts } from "@/utils/utils";

import { MovieContextFactory } from "@/builder/factory";

const context = MovieContextFactory.driver("solo-latino");

export async function getMovieUrl(link: string) {
  return await attempts([
    {
      execute: () =>
        withTimeout(
          context.getUrl(link),
          30000, //
          new Error("Error al obtener la URL del video"),
        ),
      attempts: 3,
      delay: 1000,
    },
  ]);
}

export async function getAllMovies(
  search?: string,
  filter?: string,
  page?: number,
) {
  return await context.getAll(search, filter, page);
}

export async function getDetails(link: string) {
  return await context.getMovieDetails(link);
}
