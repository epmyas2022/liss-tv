"use client";

import { pb } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { AuthContext } from "./context/AuthContext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState(() => {
    if (typeof window !== "undefined" && pb.authStore.isValid) {
      const refresh = async () => {
        await pb.collection("users").authRefresh();
      };

      refresh();
      return pb.authStore.record;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window !== "undefined") {
      return !pb.authStore.isValid;
    }
    return true;
  });

  const logout = () => {
    pb.authStore.clear();
    document.cookie = "pb_auth=; Max-Age=0; path=/";
    setUser(null);
  };

  useEffect(() => {
    // Suscribirse en tiempo real a los cambios del AuthStore (Login, Logout, tokens expirados)
    const syncCookie = () => {
      document.cookie = pb.authStore.exportToCookie({
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    };

    const initialize = async () => {
      try {
        if (pb.authStore.isValid) {
          await pb.collection("users").authRefresh();
        }
      } catch (error) {
        console.error("Error refreshing auth:", error);
        pb.authStore.clear();
      }

      syncCookie();
      setUser(pb.authStore.record);
      setIsLoading(false);
    };

    const unsubscribe = pb.authStore.onChange(() => {
      syncCookie();
      setUser(pb.authStore.record);
    });

    initialize();

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading: isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
