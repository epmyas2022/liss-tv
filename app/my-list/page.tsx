"use client";

import { useEffect, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import FocusContextProvider from "@/components/providers/FocusContextProvider";
import FocusElementProvider from "@/components/providers/FocusElementProvider";
import { useFavoritesStore, FavoriteItem } from "@/store/useFavoritesStore";
import { useAuthentication } from "@/components/providers/context/AuthContext";
import { Trash2, Star, Play } from "lucide-react";

const emptySubscribe = () => () => {};

function FavoriteCard({
  item,
  onRemove,
}: {
  item: FavoriteItem;
  onRemove: (link: string) => void;
}) {
  const router = useRouter();
  const rating = item.rating?.replace(/★/, "").trim();

  return (
    <FocusElementProvider
      strokeSize={0}
      className="rounded-xl group"
      styleFocus={{
        outline: "2px solid #e50914",
        outlineOffset: "2px",
        transform: "scale(1.04)",
      }}
      onEnterPress={() => router.push(item.link)}
    >
      <div className="group/card relative block rounded-xl overflow-hidden bg-[#131519] border border-white/[0.06] hover:border-white/20 transition-all duration-300 hover:shadow-[0_12px_32px_rgba(0,0,0,0.8)] cursor-pointer select-none">
        {/* Poster Container */}
        <Link href={item.link} className="block relative aspect-[2/3] w-full overflow-hidden">
          <Image
            src={item.image || "/logo-with-background.png"}
            alt={item.title || item.link}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
            className="object-cover transition-transform duration-500 ease-out group-hover/card:scale-105"
          />

          {/* Cinematic Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#090a0c] via-[#090a0c]/60 to-transparent opacity-80 group-hover/card:opacity-95 transition-opacity duration-300" />

          {/* Rating badge */}
          {rating && (
            <span className="absolute top-2.5 left-2.5 bg-black/85 border border-white/10 text-amber-400 text-[11px] font-bold px-2 py-0.5 rounded-md shadow-md flex items-center gap-1 z-10">
              <Star size={10} className="fill-amber-400" /> {rating}
            </span>
          )}

          {/* Remove from favorites button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(item.link);
            }}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/80 hover:bg-[#e50914] border border-white/15 text-white/80 hover:text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/card:opacity-100 transition-all duration-200 z-20 cursor-pointer shadow-lg"
            title="Quitar de favoritos"
            aria-label="Quitar de favoritos"
          >
            <Trash2 size={13} />
          </button>

          {/* Info panel */}
          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-3.5 flex flex-col gap-1 z-10">
            <p className="text-white font-semibold text-sm leading-snug line-clamp-2 drop-shadow">
              {item.title || item.link}
            </p>

            {item.year && (
              <span className="text-gray-400 text-xs font-medium">
                {item.year}
              </span>
            )}

            {/* Quick Play CTA on hover */}
            <div className="max-h-0 opacity-0 group-hover/card:max-h-16 group-hover/card:opacity-100 transition-all duration-300 ease-out overflow-hidden">
              <div className="pt-2">
                <div className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-[#e50914] hover:bg-[#b80710] text-white font-bold rounded-xl text-xs sm:text-sm transition-all duration-200 select-none shadow-md">
                  <Play size={14} className="fill-white" />
                  <span>Ver detalles</span>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </FocusElementProvider>
  );
}

export default function MyListPage() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const { user, loading: authLoading } = useAuthentication();
  const favorites = useFavoritesStore((state) => state.favorites);
  const fetchBookmarks = useFavoritesStore((state) => state.fetchBookmarks);
  const removeFavorite = useFavoritesStore((state) => state.removeFavorite);

  useEffect(() => {
    if (!authLoading && user?.id) {
      fetchBookmarks();
    }
  }, [authLoading, user?.id, fetchBookmarks]);

  const items = isClient ? favorites : [];

  return (
    <main className="min-h-screen pb-28 sm:pb-16 bg-[#090a0c] text-white">
      <Navbar />

      {/* Header section */}
      <div className="relative pt-24 sm:pt-28 pb-6 px-4 sm:px-8 lg:px-12 overflow-hidden">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-1.5 h-6 rounded-full bg-[#e50914]" />
              <h1 className="font-poppins text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
                Mi Lista
                {items.length > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/[0.08] text-gray-300 tabular-nums">
                    {items.length}
                  </span>
                )}
              </h1>
            </div>
            <p className="text-sm text-gray-400">
              Películas y series que guardaste en tus favoritos.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-8 lg:px-12 pb-16">
        {isClient && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto py-20 px-4">
         
            <h2 className="font-poppins text-xl font-bold text-white mb-2">
              Tu lista está vacía
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              Aún no agregaste ningún título a tu lista. Explorá el catálogo y guardá tus películas o series preferidas.
            </p>
          
          </div>
        ) : (
          <FocusContextProvider condition={items.length > 0}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
              {items.map((item) => (
                <FavoriteCard
                  key={item.link}
                  item={item}
                  onRemove={(link) => removeFavorite(link)}
                />
              ))}
            </div>
          </FocusContextProvider>
        )}
      </div>
    </main>
  );
}
