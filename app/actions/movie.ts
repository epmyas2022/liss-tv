"use server";

import { getUrl } from "@/services/movie.service";

export async function getMovieUrl(link: string) {
  return await getUrl(link);
}