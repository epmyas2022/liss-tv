import { ContinueWatching } from "./movie";
import type { FavoriteItem } from "@/store/useFavoritesStore";

export interface User {
  id: string;
  continueWatching?: ContinueWatching[];
  bookmarks?: FavoriteItem[];
}

export type AuthUserType = User | undefined;
