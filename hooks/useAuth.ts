"use client";

import { useState } from "react";
import PocketBase, { ClientResponseError } from "pocketbase";
import { redirect } from "next/navigation";
// 1. Inicialización de la instancia de PocketBase
export const pb = new PocketBase(
  process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090",
);

// Deshabilitar la cancelación automática para evitar conflictos de peticiones simultáneas en React
pb.autoCancellation(false);



// 3. Helper unificado para manejar las respuestas y capturar errores de PocketBase de forma segura
export const response = async <T>(callback: () => Promise<T>) => {
  
  try {
    
    // La operación asíncrona se ejecuta de forma segura dentro de este bloque
    const res = await callback();
    return {
      status: 200,
      message: "Success",
      data: res,
    };
  } catch (error) {
    if (error instanceof ClientResponseError) {
      return {
        status: error.status,
        message: error.message,
        data: error.data,
      };
    }
    return {
      status: 500,
      message: error instanceof Error ? error.message : "Unknown error",
      data: {},
    };
  }
};

// 4. Hook personalizado para el estado global y persistente de la autenticación
export function useAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const login = async (email: string, pass: string) => {
    setLoading(true);
    setError(null);
    try {
      const authData = await pb
        .collection("users")
        .authWithPassword(email, pass);
      return authData;
    } catch (error) {
      if (error instanceof ClientResponseError && error.status === 400) {
        setError("Correo o contraseña incorrectos");
        throw error;
      }

      setError("Error de servidor, por favor intente nuevamente más tarde");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    pb.authStore.clear();
  };

  return {
    login,
    logout,
    loading,
    error,
  };
}
