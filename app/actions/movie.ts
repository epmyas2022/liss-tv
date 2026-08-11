"use server";

import { getUrl, getAll } from "@/services/movie.service";

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallbackValue: T,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`⏳ Server Action cancelado tras ${ms}ms.`);
      resolve(fallbackValue);
    }, ms);
  });

  const result = await Promise.race([promise, timeoutPromise]);

  clearTimeout(timeoutId!);

  return result;
}

export async function getMovieUrl(link: string) {
  return await withTimeout(getUrl(link), 15000, {
    error: true,
    message: "El video tardó demasiado en cargar. Intenta de nuevo.",
  });
}

export async function getAllMovies(search?: string, filter?: string) {
  return await getAll(search, filter);
}
