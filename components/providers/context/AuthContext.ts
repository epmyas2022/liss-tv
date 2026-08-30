import { RecordModel } from "pocketbase";
import { createContext, useContext } from "react";

export type AuthContextType = {
  user: RecordModel | null;
  loading: boolean;
  logout: () => void;
};
export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
});

export const useAuthentication = () => useContext(AuthContext);
