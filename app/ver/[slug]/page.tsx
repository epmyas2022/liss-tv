import { redirect, notFound } from "next/navigation";
import { getDetails } from "@/app/actions/movie";

export default async function VerCatchAllPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = await params;
  const movie = await getDetails(`ver/${slug}`);

  if (!movie) {
    notFound();
  }

  if (movie.episodes && movie.episodes.length > 0) {
    redirect(`/serie/${slug}`);
  } else {
    redirect(`/pelicula/${slug}`);
  }
}
