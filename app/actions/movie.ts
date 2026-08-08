"use server";

import { getUrl, getAll } from "@/services/movie.service";

export async function getMovieUrl(link: string) {
  return await getUrl(link);
}

export async function getAllMovies(search?: string, filter?: string) {
  return await getAll(search, filter);
}