import { ContinueWatching } from "./movie";

export interface User {
  id: string;
  continueWatching?: ContinueWatching[];
}


export type AuthUserType = User | undefined;