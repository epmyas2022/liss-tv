
import { getMovieDetails } from "@/services/movie.service";
import { FloatingNav } from "@/components/FloatingNav";
import { HeroBackdrop } from "@/components/detail/HeroBackdrop";
import { EpisodeList } from "@/components/detail/EpisodeList";

export default async function SerieDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = await params;
  const movie = await getMovieDetails(`serie/${slug}`);

  if (!movie) {
    return (
      <main style={{ background: "#070707", minHeight: "100vh" }}>
        <FloatingNav />
        <div className="flex flex-col items-center justify-center min-h-screen text-white">
          <h1 className="text-4xl font-bold mb-4">Serie no encontrada</h1>
          <p className="text-lg">
            Lo sentimos, no pudimos encontrar la serie que estás buscando.
          </p>
        </div>
      </main>
    );
  }

  // ponytail: episodes come from the service — shape matches EpisodeList props
  const seasons = movie.episodes ?? [];

  return (
    <main className="pb-16 sm:pb-0" style={{ background: "#070707", minHeight: "100vh" }}>
      <FloatingNav />
      <HeroBackdrop
        backgroundImage={movie.backgroundImage}
        image={movie.image}
        title={movie.title}
        year={movie.year}
        duration={movie.duration}
        rating={movie.rating}
        tags={movie.tags}
        caption={movie.caption}
        link={`serie/${slug}`}
      />
      {seasons.length > 0 && <EpisodeList seasons={seasons} />}
    </main>
  );
}