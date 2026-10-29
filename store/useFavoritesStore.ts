import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { pb, response } from "@/hooks/useAuth";

export interface FavoriteItem {
  link: string;
  title: string;
  image: string;
  rating?: string;
  year?: string;
  backgroundImage?: string;
  duration?: string;
  caption?: string;
  tags?: string[];
  type?: "movie" | "serie";
}

interface FavoritesState {
  favorites: FavoriteItem[];
  fetchBookmarks: () => Promise<void>;
  addFavorite: (item: FavoriteItem) => Promise<void>;
  removeFavorite: (link: string) => Promise<void>;
  toggleFavorite: (item: FavoriteItem) => Promise<boolean>;
  isFavorite: (link: string) => boolean;
}

const syncBookmarksToPocketBase = async (bookmarks: FavoriteItem[]) => {
  const userId = pb.authStore?.record?.id;
  if (!userId) return;

  await response(async () =>
    pb.collection("users").update(userId, {
      bookmarks,
    }),
  );
};

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],

      fetchBookmarks: async () => {
        const userId = pb.authStore?.record?.id;
        if (!userId) return;

        const res = await response(async () =>
          pb.collection("users").getOne(userId, { fields: "bookmarks" }),
        );

        if (res.status === 200) {
          const data = res.data as { bookmarks?: FavoriteItem[] };
          if (Array.isArray(data.bookmarks)) {
            set({ favorites: data.bookmarks });
          }
        }
      },

      addFavorite: async (item: FavoriteItem) => {
        const current = get().favorites;
        if (current.some((f) => f.link === item.link)) return;
        const updated = [item, ...current];
        set({ favorites: updated });
        await syncBookmarksToPocketBase(updated);
      },

      removeFavorite: async (link: string) => {
        const current = get().favorites;
        const updated = current.filter((f) => f.link !== link);
        set({ favorites: updated });
        await syncBookmarksToPocketBase(updated);
      },

      toggleFavorite: async (item: FavoriteItem): Promise<boolean> => {
        const current = get().favorites;
        const exists = current.some((f) => f.link === item.link);
        if (exists) {
          const updated = current.filter((f) => f.link !== item.link);
          set({ favorites: updated });
          await syncBookmarksToPocketBase(updated);
          return false;
        } else {
          const updated = [item, ...current];
          set({ favorites: updated });
          await syncBookmarksToPocketBase(updated);
          return true;
        }
      },

      isFavorite: (link: string): boolean => {
        return get().favorites.some((f) => f.link === link);
      },
    }),
    {
      name: "liss-tv-favorites",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
