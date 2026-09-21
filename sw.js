// Service Worker para Gestore PWA v8.0
const CACHE_NAME = 'gestore-v8.0';
const URLS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
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

    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
