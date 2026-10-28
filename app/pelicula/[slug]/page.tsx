import { Navbar } from "@/components/layout/Navbar";
import { HeroBackdrop } from "@/components/detail/HeroBackdrop";
import FocusContextProvider from "@/components/providers/FocusContextProvider";
import { getDetails } from "@/app/actions/movie";

export default async function MovieDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = await params;
  const movie = await getDetails(`pelicula/${slug}`);

  if (!movie) {
    return (
      <main className="min-h-screen bg-[#090a0c] text-white">
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 font-poppins">
            Película no encontrada
          </h1>
          <p className="text-gray-400 max-w-md">
            Lo sentimos, no pudimos encontrar el título que estás buscando.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090a0c] text-white pb-20">
      <Navbar />

      <FocusContextProvider condition={movie !== null}>
        <HeroBackdrop
          backgroundImage={movie.backgroundImage || ""}
          image={movie.image || "/logo.png"}
          title={movie.title || ""}
          year={movie.year || ""}
          duration={movie.duration || ""}
          rating={movie.rating || ""}
          tags={movie.tags || []}
          caption={movie.caption || ""}
          link={`pelicula/${slug}`}
        />
      </FocusContextProvider>
    </main>
  );
}
