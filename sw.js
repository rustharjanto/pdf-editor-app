const CACHE_NAME = 'pdf-editor-v5';
const BASE_PATH = '/pdf-editor-app/';
const OFFLINE_URL = BASE_PATH + 'offline.html';
const FILE_HANDLER_ROUTE = BASE_PATH + 'share/';

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
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.tailwindcss.com'
];

// Install event - Cache aset penting
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[Service Worker] Caching app shell');
      await cache.addAll(PRECACHE_ASSETS);
      console.log('[Service Worker] Skip waiting');
      await self.skipWaiting();
    })()
  );
});

// Activate event - Hapus cache lama
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    (async () => {
      // Hapus cache lama
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
      
      console.log('[Service Worker] Claiming clients');
      await self.clients.claim();
    })()
  );
});

// Database IndexedDB untuk file yang dibagikan
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PDFEditorFiles', 2);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Buat object store jika belum ada
      if (!db.objectStoreNames.contains('sharedFiles')) {
        const store = db.createObjectStore('sharedFiles', { keyPath: 'id' });
        store.createIndex('by_date', 'date');
      }
    };
    
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Simpan file yang di-share
async function saveSharedFile(file, title) {
  try {
    const db = await openDatabase();
    const tx = db.transaction('sharedFiles', 'readwrite');
    const store = tx.objectStore('sharedFiles');
    
    // Convert File ke ArrayBuffer untuk disimpan
    const arrayBuffer = await file.arrayBuffer();
    
    await store.put({
      id: Date.now(),
      name: file.name,
      type: file.type,
      size: file.size,
      data: arrayBuffer,
      title: title || file.name,
      date: new Date().toISOString()
    });
    
    await tx.done;
    console.log('[Service Worker] File saved to IndexedDB:', file.name);
    return true;
  } catch (error) {
    console.error('[Service Worker] Error saving file:', error);
    return false;
  }
}

// Fetch event - Handle semua request
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Handle file upload dari share target
  if (url.pathname === FILE_HANDLER_ROUTE && event.request.method === 'POST') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const file = formData.get('file');
          const title = formData.get('title') || 'Shared PDF';
          
          if (!file || file.type !== 'application/pdf') {
            return new Response('Invalid file type', { status: 400 });
          }
          
          // Simpan file ke IndexedDB
          const saved = await saveSharedFile(file, title);
          
          if (saved) {
            // Redirect ke halaman utama dengan parameter
            return Response.redirect(BASE_PATH + '?shared=true&source=share', 303);
          } else {
            return new Response('Failed to save file', { status: 500 });
          }
        } catch (error) {
          console.error('[Service Worker] Share target error:', error);
          return new Response('Internal server error', { status: 500 });
        }
      })()
    );
    return;
  }
  
  // Skip non-GET requests (kecuali POST untuk share)
  if (event.request.method !== 'GET') return;
  
  // Skip chrome-extension requests
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  // Skip PDF.js worker requests
  if (event.request.url.includes('pdf.worker')) return;
  
  event.respondWith(
    (async () => {
      // Coba dulu dari cache
      const cachedResponse = await caches.match(event.request);
      
      if (cachedResponse) {
        console.log('[Service Worker] Serving from cache:', event.request.url);
        return cachedResponse;
      }
      
      try {
        // Jika tidak ada di cache, fetch dari network
        const networkResponse = await fetch(event.request);
        
        // Cache response untuk future use (kecuali untuk data besar)
        if (networkResponse.ok && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          
          // Jangan cache file yang terlalu besar
          const contentLength = networkResponse.headers.get('content-length');
          if (!contentLength || parseInt(contentLength) < 10 * 1024 * 1024) { // 10MB limit
            await cache.put(event.request, responseToCache);
          }
        }
        
        return networkResponse;
      } catch (error) {
        console.log('[Service Worker] Fetch failed:', error);
        
        // Jika offline dan request HTML, tampilkan offline page
        if (event.request.destination === 'document' || 
            event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match(OFFLINE_URL) || 
                 new Response('Offline - no cached page available', { 
                   status: 503, 
                   headers: { 'Content-Type': 'text/plain' } 
                 });
        }
        
        return new Response('Network error', {
          status: 408,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })()
  );
});

// Background sync untuk operasi yang tertunda
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pdf-saves') {
    console.log('[Service Worker] Background sync triggered');
    event.waitUntil(syncPDFSaves());
  }
});

async function syncPDFSaves() {
  // Implementasi sync untuk saved PDFs
  console.log('[Service Worker] Syncing PDF saves...');
  
  // Di sini Anda bisa menambahkan logika untuk sync data ke server
  // Contoh: kirim PDF yang sudah diedit ke server saat online kembali
  
  return Promise.resolve();
}

// Message event untuk komunikasi dengan client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Periodic sync (jika didukung)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-cache') {
      console.log('[Service Worker] Periodic sync for cache updates');
      event.waitUntil(updateCache());
    }
  });
}

async function updateCache() {
  // Update cache dengan versi terbaru dari aset
  const cache = await caches.open(CACHE_NAME);
  
  for (const asset of PRECACHE_ASSETS) {
    try {
      const response = await fetch(asset);
      if (response.ok) {
        await cache.put(asset, response);
        console.log('[Service Worker] Updated cache for:', asset);
      }
    } catch (error) {
      console.log('[Service Worker] Failed to update:', asset, error);
    }
  }
}