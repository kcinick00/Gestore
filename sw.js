// =========================================================
// sw.js - Service Worker de Ricodélico
// =========================================================
// ⚠️ Cada vez que subas cambios a index.html, app.js, vacio.js, etc.
//    sube también este número (v3.11 -> v3.11 ...) para que los clientes
//    reciban la versión nueva enseguida.

const CACHE_NAME = "sandwich-app-v3.37";

// Archivos que se cachean al instalar el SW (app shell)
const FILES_TO_CACHE = [
  "index.html",
  "app.js",
  "vacio.js",
  "combos.js",
  "ingredients.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "fondo-sandwich.jpg",
  "images/aguacate.jpg",
  "images/baguette.jpg",
  "images/bbq.jpg",
  "images/cebolla.jpg",
  "images/salsatomate.jpg",
  "images/huevo.jpg",
  "images/jamon.jpg",
  "images/tomate.jpg",
  "images/lechuga.jpg",
  "images/mayonesa.jpg",
  "images/mostaza.jpg",
  "images/pan-blanco.jpg",
  "images/pan-integral.jpg",
  "images/pavo.jpg",
  "images/pollo.jpg",
  "images/queso.jpg",
  "images/res.jpg",
  "images/salami.jpg",
  "images/telera.jpg",
  "images/tocino.jpg"
];

// =========================================================
// INSTALL: precachear el app shell
// =========================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falla si UNO falla, así que hacemos uno por uno.
      // cache: "reload" evita copiar una versión vieja guardada por el navegador.
      return Promise.all(
        FILES_TO_CACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch((err) => {
            console.warn("[SW] No se pudo cachear:", url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// =========================================================
// ACTIVATE: limpiar cachés viejos
// =========================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log("[SW] Eliminando caché viejo:", k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// =========================================================
// FETCH: estrategia cache-first con cacheo dinámico
// =========================================================
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // 1) No cachear Google Sheets (siempre fresco)
  //    Aquí entran el menú de sándwiches y la pestaña "vacio".
  if (url.includes("docs.google.com/spreadsheets")) {
    return; // dejar que el navegador lo maneje normal
  }

  // 2) No cachear requests que no sean GET
  if (event.request.method !== "GET") {
    return;
  }

  // 3) No cachear extensiones de Chrome ni otros esquemas raros
  if (!url.startsWith("http")) {
    return;
  }

  // 4) Ignorar los iframes de impresión (no son requests reales)
  if (url.includes("print-iframe")) {
    return;
  }

  // Código (html/js/css/json y navegaciones): primero red, caché solo si no hay conexión.
  // Así los cambios publicados llegan siempre a los clientes.
  const u = new URL(event.request.url);
  const esCodigo = event.request.mode === "navigate" ||
    (u.origin === self.location.origin && /\.(html|js|css|json)$/.test(u.pathname)) ||
    (u.origin === self.location.origin && u.pathname.endsWith("/"));
  if (esCodigo) {
    event.respondWith(
      fetch(event.request, { cache: "no-cache" })
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copia = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copia));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((c) => c || caches.match("index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Si está en caché, devolverlo
      if (cached) {
        // Refrescar en background (opcional, tipo "stale-while-revalidate")
        fetch(event.request)
          .then((response) => {
            if (response && response.status === 200 && response.type === "basic") {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, response.clone());
              });
            }
          })
          .catch(() => { /* offline, ignorar */ });
        return cached;
      }

      // Si no está en caché, ir a la red
      return fetch(event.request)
        .then((response) => {
          // Solo cachear respuestas válidas de mismo origen
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch((err) => {
          console.warn("[SW] Falló fetch y no está en caché:", event.request.url);
          // Si es una navegación, devolver el index cacheado
          if (event.request.mode === "navigate") {
            return caches.match("index.html");
          }
          throw err;
        });
    })
  );
});
