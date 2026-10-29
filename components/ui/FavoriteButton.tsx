"use client";

import { useFavoritesStore, FavoriteItem } from "@/store/useFavoritesStore";
import FocusElementProvider from "@/components/providers/FocusElementProvider";
import { Bookmark, Check } from "lucide-react";
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

interface FavoriteButtonProps {
  item: FavoriteItem;
  className?: string;
}

export default function FavoriteButton({ item, className = "" }: FavoriteButtonProps) {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const isFav = useFavoritesStore((state) => state.isFavorite(item.link));
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(item);
  };

  const active = isClient && isFav;

  return (
    <FocusElementProvider
      className={`rounded-xl w-full sm:w-auto ${className}`.trim()}
      strokeSize={0}
      styleFocus={{
        outline: "3px solid #ffffff",
        outlineOffset: "2px",
        transform: "scale(1.02)",
      }}
      onEnterPress={() => toggleFavorite(item)}
    >
      <button
        onClick={handleClick}
        className={`cursor-pointer flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl font-bold text-sm sm:text-base transition-all duration-200 active:scale-95 select-none w-full sm:w-auto whitespace-nowrap bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 text-white`}
        title={active ? "Quitar de favoritos" : "Agregar a favoritos"}
        aria-label={active ? "Quitar de favoritos" : "Agregar a favoritos"}
      >
        {active ? (
          <>
            <Check size={18} strokeWidth={2.5} className="text-[#e50914] shrink-0" />
            <span>Favorito</span>
          </>
        ) : (
          <>
            <Bookmark size={18} className="text-gray-300 shrink-0" />
            <span>Agregar a favoritos</span>
          </>
        )}
      </button>
    </FocusElementProvider>
  );
}
