import { MoviePreview, MovieState } from "@/types/movie";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useMovieStore = create<MovieState>()(
  persist(
    (set) => ({
      moviePreview: null,

      // Función para guardar los datos (la usarás antes de navegar a esta página)
      setMovieData: (preview: MoviePreview) => set({ moviePreview: preview }),

      // Función por si quieres limpiar los datos después
      clearMovieData: () => set({ moviePreview: null }),
    }),
    {
      name: "movie-storage",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
