"use client";

import { MovieCard } from "@/components/MovieCard";
import { MovieCardSkeleton } from "@/components/MovieCardSkeleton";
import { FloatingNav } from "@/components/FloatingNav";
import { Movie } from "../types/movie";
import { useEffect, useState, useRef, useCallback } from "react";
import { getAllMovies } from "@/app/actions/movie";

import { useSearchParams } from "next/navigation";
import FocusContextProvider from "@/components/providers/FocusContextProvider";

export default function Home() {
  const searchParams = useSearchParams();

  const search = searchParams.get("search") || undefined;
  const filter = searchParams.get("filter") || undefined;

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [prevSearch, setPrevSearch] = useState(search);
  const [prevFilter, setPrevFilter] = useState(filter);

  if (search !== prevSearch || filter !== prevFilter) {
    setPrevSearch(search);
    setPrevFilter(filter);
    setMovies([]);
    setPage(1);
    setHasMore(true);
  }

  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      const response = await getAllMovies(search, filter, page);

      const newMovies = response?.movies || [];
      const lastPageNumber = response?.lastPageNumber || 1;

      setMovies((prev) => (page === 1 ? newMovies : [...prev, ...newMovies]));
      setHasMore(page < lastPageNumber);
      setLoading(false);
    };
    fetchMovies();
  }, [search, filter, page]);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de cargar la siguiente página
          setPage((prevPage) => prevPage + 1);
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, hasMore],
  );

  return (
    <main
      className="min-h-screen pb-24 px-4 pt-6"
      style={{ background: "#070707" }}
    >
      <FloatingNav />
      <FocusContextProvider
        condition={page === 1 && !loading && movies && movies.length > 0}
      >
        <div className="mt-20 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {movies.map((movie, index) => (
            <MovieCard key={index} movie={movie} />
          ))}
          {loading && <MovieCardSkeleton />}
        </div>
        <div ref={lastElementRef} style={{ height: "1px" }} />
      </FocusContextProvider>
    </main>
  );
}
