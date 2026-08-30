import { ContinueWatching, MoviePreview, MovieState } from "@/types/movie";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";



export const useMovieStore = create<MovieState>()(
  persist(
    (set) => ({
      moviePreview: null,
      continueWatching: [],

      addToContinueWatching: (movie: ContinueWatching) =>
        set((state) => {
          const existingIndex = state.continueWatching.findIndex(
            (m) => m.link === movie.link,
          );

          if (existingIndex !== -1) {
            const updatedMovies = [...state.continueWatching];
            updatedMovies[existingIndex] = movie;
            return { continueWatching: updatedMovies };
          }

          return { continueWatching: [...state.continueWatching, movie] };
        }),

      syncContinueWatching: (movies: ContinueWatching[]) =>
        set((state) => {
          const newMovies = [...state.continueWatching];
          movies.forEach((m) => {
            const existingIndex = newMovies.findIndex((ex) => ex.link === m.link);
            if (existingIndex !== -1) {
              newMovies[existingIndex] = m;
            } else {
              newMovies.push(m);
            }
          });
          return { continueWatching: newMovies };
        }),

      removeFromContinueWatching: async (link: string) =>
        set((state) => ({
          continueWatching: state.continueWatching.filter(
            (m) => m.link !== link,
          ),

        })),

      // Función para guardar los datos (la usarás antes de navegar a esta página)
      setMovieData: (preview: MoviePreview) => set({ moviePreview: preview }),

      // Función por si quieres limpiar los datos después
      clearMovieData: () => set({ moviePreview: null }),
    }),
    {
      name: "movie-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);



