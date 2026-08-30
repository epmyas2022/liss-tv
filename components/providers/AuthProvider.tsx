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
  };

  useEffect(() => {
    // Suscribirse en tiempo real a los cambios del AuthStore (Login, Logout, tokens expirados)
    const unsubscribe = pb.authStore.onChange((token, record) => {
      // Actualizar la cookie dinámicamente para que sea visible en el Middleware / Server Components de Next.js
      if (typeof document !== "undefined") {
        document.cookie = pb.authStore.exportToCookie({
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
        });
      }
      setIsLoading(false);

      setUser(record);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading: isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
