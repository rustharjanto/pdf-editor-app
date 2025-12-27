const CACHE_NAME = 'pdf-editor-v4';
const BASE_PATH = '/pdf-editor-app/';
const OFFLINE_URL = BASE_PATH + 'offline.html';

// Aset yang akan di-cache saat install
const PRECACHE_ASSETS = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'src/js/main.js',
  BASE_PATH + 'src/js/pdfViewer.js',
  BASE_PATH + 'src/js/pdfEditor.js',
  BASE_PATH + 'src/css/style.css',
  BASE_PATH + 'icons/icon-192x192.png',
  BASE_PATH + 'icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// Install event - Cache aset penting
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - Hapus cache lama
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - Serve dari cache jika offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip chrome-extension requests
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  // Skip PDF.js worker requests
  if (event.request.url.includes('pdf.worker')) return;
  
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Jika ada di cache, return dari cache
        if (cachedResponse) {
          console.log('Service Worker: Serving from cache:', event.request.url);
          return cachedResponse;
        }
        
        // Jika tidak ada, fetch dari network
        return fetch(event.request)
          .then((networkResponse) => {
            // Jika berhasil, cache response untuk future use
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          })
          .catch((error) => {
            // Jika offline dan request HTML, tampilkan offline page
            if (event.request.destination === 'document' || 
                event.request.headers.get('accept').includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
            
            // Untuk aset lain, return error
            console.log('Service Worker: Fetch failed:', error);
            return new Response('Network error happened', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' },
            });
          });
      })
  );
});

// Background sync untuk save PDF saat online kembali
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pdf-saves') {
    console.log('Service Worker: Background sync triggered');
    event.waitUntil(syncPDFSaves());
  }
});

async function syncPDFSaves() {
  // Implementasi sync untuk saved PDFs
  console.log('Syncing PDF saves...');
}