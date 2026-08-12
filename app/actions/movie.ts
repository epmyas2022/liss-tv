"use server";

import { getUrl, getAll } from "@/services/movie.service";

import { withTimeout, attempts } from "@/utils/utils";

export async function getMovieUrl(link: string) {

  return await attempts([
    {
      execute: () =>
        withTimeout(
          getUrl(link),
          20000,
          new Error("Error al obtener la URL del video"),
        ),
      attempts: 3,
      delay: 1000,
    },
  ]); 
}

export async function getAllMovies(search?: string, filter?: string) {
  return await getAll(search, filter);
}
