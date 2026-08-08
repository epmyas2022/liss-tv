"use client";

import { MovieCard } from "@/components/MovieCard";
import { MovieCardSkeleton } from "@/components/MovieCardSkeleton";
import { FloatingNav } from "@/components/FloatingNav";
import { Movie } from '../types/movie';
import { useEffect, useState } from "react";
import  {getAllMovies } from "@/app/actions/movie";

import { useSearchParams } from "next/navigation";


export default  function Home() {

  const searchParams  = useSearchParams();

  const search = searchParams.get("search") || undefined;
  const filter = searchParams.get("filter") || undefined;

  const [movies, setMovies] = useState<Movie[] | undefined>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const fetchMovies = async () => {
      setLoading(true);
      const movies = await getAllMovies(search, filter);
      setLoading(false);
      setMovies(movies);
    };

    fetchMovies();

  }, [search, filter]);


  return (
    <main
      className="min-h-screen pb-24 px-4 pt-6"
      style={{ background: "#070707" }}
      >
      <FloatingNav />
      <div className="mt-20 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {loading ? (
          <MovieCardSkeleton />
        ) : (
          movies?.map((movie, index) => (
            <MovieCard key={index} movie={movie} />
          ))
        )}
      </div>

    </main>
  );
}
