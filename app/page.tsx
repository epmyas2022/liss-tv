import { getAll } from "@/services/movie.service";
import { MovieCard } from "@/components/MovieCard";
import { FloatingNav } from "@/components/FloatingNav";

export default async function Home({ searchParams }: { searchParams: { search?: string; filter?: string } }) {

  const { search, filter } = await  searchParams;

  const movies = await getAll(search, filter);


  return (
    <main
      className="min-h-screen pb-24 px-4 pt-6"
      style={{ background: "#070707" }}
      >
      <FloatingNav />
      <div className="mt-20 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {movies?.map((movie, index) => (
          <MovieCard key={index} movie={movie} />
        ))}
      </div>

    </main>
  );
}
