// Service Worker für GoWalking PWA
const CACHE_NAME = 'gowalking-v1.0.0';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
];

// Install Event - Cache Assets
self.addEventListener('install', (event) => {
  console.log('🔧 GoWalking Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app assets');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker installed successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Service Worker installation failed:', error);
      })
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  console.log('🚀 GoWalking Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated successfully');
      return self.clients.claim();
    })
  );
});

// Fetch Event - Serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== location.origin && 
      !url.hostname.includes('fonts.googleapis.com') &&
      !url.hostname.includes('unpkg.com') &&
      !url.hostname.includes('tile.openstreetmap.org')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }

        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          if (event.request.destination === 'document') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  console.log('📩 Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'Neue GoWalking Aktivität!',
    icon: '/manifest.json',
    badge: '/manifest.json',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Erkunden'
      },
      {
        action: 'close',
        title: 'Schließen'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('GoWalking 🚶‍♂️', options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event.action);
  
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      self.clients.openWindow('/?tab=map')
    );
  } else if (event.action === 'close') {
    // Just close
  } else {
    event.waitUntil(
      self.clients.openWindow('/')
    );
  }
});

// Install prompt handling
self.addEventListener('beforeinstallprompt', (event) => {
  console.log('📱 Install prompt available');
  event.preventDefault();
  
  self.clients.matchAll().then((clientList) => {
    if (clientList.length > 0) {
      clientList[0].postMessage({
        type: 'INSTALL_PROMPT_AVAILABLE',
        event: event
      });
    }
  });
});

// App installed
self.addEventListener('appinstalled', (event) => {
  console.log('🎉 GoWalking PWA installed successfully!');
  
  self.clients.matchAll().then((clientList) => {
    if (clientList.length > 0) {
      clientList[0].postMessage({
        type: 'APP_INSTALLED'
      });
    }
  });
});

console.log('🚶‍♂️ GoWalking Service Worker loaded successfully!');