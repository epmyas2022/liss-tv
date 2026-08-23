import { getMovieDetails } from "@/services/movie.service";
import { FloatingNav } from "@/components/FloatingNav";
import { HeroBackdrop } from "@/components/detail/HeroBackdrop";
import FocusContextProvider from "@/components/providers/FocusContextProvider";

export default async function MovieDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = await params;
  const movie = await getMovieDetails(`pelicula/${slug}`);

  if (!movie) {
    return (
      <main style={{ background: "#070707", minHeight: "100vh" }}>
        <FloatingNav />
        <div className="flex flex-col items-center justify-center min-h-screen text-white">
          <h1 className="text-4xl font-bold mb-4">Película no encontrada</h1>
          <p className="text-lg">
            Lo sentimos, no pudimos encontrar la película que estás buscando.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="pb-16 sm:pb-0"
      style={{ background: "#070707", minHeight: "100vh" }}
    >
      <FloatingNav />

      <FocusContextProvider condition={movie !== null}>
        <HeroBackdrop
          backgroundImage={movie.backgroundImage}
          image={movie.image}
          title={movie.title}
          year={movie.year}
          duration={movie.duration}
          rating={movie.rating}
          tags={movie.tags}
          caption={movie.caption}
          link={`pelicula/${slug}`}
        />
      </FocusContextProvider>
    </main>
  );
}
