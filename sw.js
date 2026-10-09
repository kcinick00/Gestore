// Service Worker para Gestore PWA v9
const CACHE_NAME = 'gestore-v12.7';
const URLS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './etiqueta.js',
    './manifest.json',
    './tasas-bcv.js',
    './importar-pdf.js',
    './libs/pdf.min.js',
    './libs/pdf.worker.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(URLS_TO_CACHE).catch(err => {
                console.warn('⚠️ Algunos archivos no se cachearon:', err);
            }))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(names => 
            Promise.all(names.map(name => {
                if (name !== CACHE_NAME) return caches.delete(name);
            }))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('supabase.co') || 
        event.request.url.includes('justcarlux.dev') ||
        event.request.url.includes('cdn.jsdelivr.net') ||
        event.request.url.includes('api.deepseek.com') ||
        event.request.url.includes('dolarapi.com') ||
        event.request.url.includes('criptoya.com')) {
        return;
    }

    // Primero la red (así siempre llegan las versiones nuevas); si no hay internet, la caché
    event.respondWith(
        fetch(event.request)
            .then(resp => {
                if (resp && resp.ok && event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
                    const copia = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
                }
                return resp;
            })
            .catch(() => caches.match(event.request))
    );
});
