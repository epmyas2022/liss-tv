"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const registerSW = async () => {
        try {
          await navigator.serviceWorker.register("/service-worker.js", {
            scope: "/",
            updateViaCache: "none",
          });
          console.log("Service Worker registrado con éxito.");
        } catch (error) {
          console.error("Error al registrar el Service Worker:", error);
        }
      };

      registerSW();
    }
  }, []);

  return null;
}
