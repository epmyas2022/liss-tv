// lib/service-worker.js
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Opcional: Manejo básico de eventos fetch si deseas agregar caché más adelante
self.addEventListener("fetch", (event) => {
  // Aquí puedes interceptar peticiones de red si lo necesitas
});
