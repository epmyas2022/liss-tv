"use client";

import { MovieCard } from "@/components/MovieCard";
import { MovieCardSkeleton } from "@/components/MovieCardSkeleton";
import { Navbar } from "@/components/layout/Navbar";
import { HomeHero, HomeHeroMovie } from "@/components/home/HomeHero";
import { HomeHeroSkeleton } from "@/components/home/HomeHeroSkeleton";
import { Movie, StoredMovie } from "../types/movie";
import { useEffect, useState, useRef, useCallback } from "react";
import { getAllMovies, getDetails } from "@/app/actions/movie";
import { useSearchParams, useRouter } from "next/navigation";
import FocusContextProvider from "@/components/providers/FocusContextProvider";
import { Search } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") || undefined;
  const filter = searchParams.get("filter") || undefined;

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [heroDetails, setHeroDetails] = useState<Omit<
    StoredMovie,
    "link" | "updatedAt"
  > | null>(null);

  const [prevSearch, setPrevSearch] = useState(search);
  const [prevFilter, setPrevFilter] = useState(filter);

  if (search !== prevSearch || filter !== prevFilter) {
    setPrevSearch(search);
    setPrevFilter(filter);
    setMovies([]);
    setHeroDetails(null);
    setPage(1);
    setHasMore(true);
  }

  useEffect(() => {
    let isMounted = true;
    const fetchMovies = async () => {
      setLoading(true);
      const response = await getAllMovies(search, filter, page);

      const newMovies = response?.movies || [];
      const lastPageNumber = response?.lastPageNumber || 1;

      if (!isMounted) return;

      setMovies((prev) => (page === 1 ? newMovies : [...prev, ...newMovies]));
      setHasMore(page < lastPageNumber);
      setLoading(false);
    };

    fetchMovies();
    return () => {
      isMounted = false;
    };
  }, [search, filter, page]);

  // Load hero details asynchronously for high-res backdrop & synopsis
  useEffect(() => {
    if (search || movies.length === 0) return;

    let isMounted = true;
    const firstMovie = movies[0];

    const fetchHeroDetails = async () => {
      try {
        const details = await getDetails(firstMovie.link);
        if (isMounted && details) {
          setHeroDetails(details);
        }
      } catch (err) {
        console.error("Error fetching hero details:", err);
      }
    };

    fetchHeroDetails();
    return () => {
      isMounted = false;
    };
  }, [movies, search]);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          setPage((prevPage) => prevPage + 1);
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, hasMore],
  );

  const featuredMovie: HomeHeroMovie | null =
    movies.length > 0
      ? {
          link: movies[0].link,
          title: heroDetails?.title || movies[0].title,
          image: movies[0].image,
          rating: heroDetails?.rating || movies[0].rating,
          year: heroDetails?.year || movies[0].year,
          backgroundImage: heroDetails?.backgroundImage,
          caption: heroDetails?.caption,
          tags: heroDetails?.tags,
          duration: heroDetails?.duration,
        }
      : null;

  return (
    <main className="min-h-screen pb-28 bg-[#090a0c] text-white">
      <Navbar />

      {/* ── Featured Hero (Only on Home without search query) ── */}
      {!search && (
        <div className="relative">
          {featuredMovie ? (
            <HomeHero movie={featuredMovie} />
          ) : (
            loading && <HomeHeroSkeleton />
          )}
        </div>
      )}

      {/* ── Catalog Section ── */}
      <section
        className={`max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 ${
          search ? "pt-24 sm:pt-28" : "pt-6 sm:pt-8"
        }`}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-poppins text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            {search ? (
              <>
                Resultados para <span className="text-[#e50914]">&ldquo;{search}&rdquo;</span>
              </>
            ) : filter === "peliculas" ? (
              "Películas destacadas"
            ) : filter === "series" ? (
              "Series destacadas"
            ) : (
              "Explorar catálogo"
            )}
          </h2>
          <span className="text-xs sm:text-sm text-gray-400 font-medium">
            {movies.length} títulos
          </span>
        </div>

        {!loading && movies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-[#131519]/50 border border-white/[0.06] rounded-2xl my-4">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4 text-[#e50914]">
              <Search size={32} />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold font-poppins text-white mb-2">
              No encontramos resultados para &ldquo;{search}&rdquo;
            </h3>
            <p className="text-gray-400 max-w-md text-sm mb-6">
              Revisá que las palabras estén bien escritas o probá con otros términos más generales.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-6 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white font-semibold text-sm transition-all duration-200 cursor-pointer"
            >
              Ver todo el catálogo
            </button>
          </div>
        ) : (
          <FocusContextProvider
            condition={page === 1 && !loading && movies && movies.length > 0}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
              {movies.map((movie, index) => (
                <MovieCard key={`${movie.link}-${index}`} movie={movie} />
              ))}
              {loading && <MovieCardSkeleton />}
            </div>
            <div ref={lastElementRef} style={{ height: "1px" }} />
          </FocusContextProvider>
        )}
      </section>
    </main>
  );
}
