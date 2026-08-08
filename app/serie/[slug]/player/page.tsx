"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useMovieStore } from "@/store/useMovieStore";
import { getMovieUrl } from "@/app/actions/movie";
import { useEffect, useState } from "react";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-white">
      <p className="text-lg font-semibold">Cargando reproductor...</p>
    </div>
  ),
});

export default function SeriePlayerPage() {
  const router = useRouter();

  const { moviePreview } = useMovieStore();

  const [movieUrl, setMovieUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(true);

  useEffect(() => {
    const fetchUrl = async () => {
      // Si no hay link de preview, no hacemos nada
      if (!moviePreview?.link) return setIsLoadingUrl(false);
      

      try {
        setIsLoadingUrl(true);
        // Llamamos al Server Action
        const url = await getMovieUrl(moviePreview.link) as string;

        setMovieUrl(url); // Guardamos la respuesta en el estado
      } catch (error) {
        console.error("Error obteniendo la URL del video:", error);
      } finally {
        setIsLoadingUrl(false);
      }
    };

    fetchUrl();
  }, [moviePreview]);

  if (!moviePreview || isLoadingUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white bg-black">
        <p className="text-lg font-semibold">Cargando datos del episodio...</p>
      </div>
    );
  }

  if(!movieUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white bg-black">
        <p className="text-lg font-semibold">No se pudo obtener la URL del video.</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black flex flex-col justify-center px-4 py-2 relative">
      <div className="absolute top-0 left-0 w-full bg-black opacity-80 z-20 p-5">
        <button
          onClick={() => router.back()}
          className="cursor-pointer flex items-center gap-2 text-white font-bold"
        >
          <ArrowLeft />
        </button>
      </div>

      <VideoPlayer
        src={movieUrl}
        title={moviePreview.title}
        poster={moviePreview.image}
      />
    </div>
  );
}
