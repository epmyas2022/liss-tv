"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import dynamic from 'next/dynamic'

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-white">
      <p className="text-lg font-semibold">Cargando reproductor...</p>
    </div>
  )
})


export default function PlayerPage() {

  const router = useRouter();
  const moviePreview =
    JSON.parse(sessionStorage.getItem("moviePreview") || "null") || "";
  const movieUrl = sessionStorage.getItem("movieUrl");

   if (!movieUrl || !moviePreview) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-white bg-black">
        <p className="text-lg font-semibold">Cargando datos de la película...</p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-black flex flex-col justify-center px-4 py-2 relative">
      <div className="absolute top-0 left-0 w-full  bg-black opacity-80 z-20 p-5">
        <button onClick={() => router.back()} className="cursor-pointer flex items-center gap-2 text-white font-bold">
          <ArrowLeft />
        </button>
      </div>

   
        <VideoPlayer
          src={movieUrl}
          title={moviePreview.title}
          poster={moviePreview.backgroundImage}
        />
   
    </div>
  );
}
