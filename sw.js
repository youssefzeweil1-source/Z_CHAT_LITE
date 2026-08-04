const CACHE_NAME = 'z-chat-v3.0';
const ASSETS_TO_CACHE = [
    '/Test.html',
    '/manifest.json',
    '/'
];

// ==================== INSTALLATION ====================
self.addEventListener('install', event => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] Caching app shell');
            return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                console.log('[Service Worker] Cache addAll error:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// ==================== ACTIVATION ====================
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ==================== FETCH HANDLING ====================
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip external URLs
    if (url.origin !== location.origin) {
        return;
    }

    // Network-first strategy for dynamic content
    if (url.pathname.includes('/api/') || url.pathname.includes('/chat')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Cache successful responses
                    if (response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache
                    return caches.match(request).then(response => {
                        return response || new Response('Offline - Content not available', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
                })
        );
        return;
    }

    // Cache-first strategy for static assets
    event.respondWith(
        caches.match(request).then(response => {
            if (response) {
                return response;
            }

            return fetch(request).then(response => {
                // Cache new responses
                if (response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseToCache);
                    });
                }
                return response;
            }).catch(() => {
                // Return offline page
                return new Response('Offline - Page not available', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});

// ==================== PUSH NOTIFICATIONS ====================
self.addEventListener('push', event => {
    console.log('[Service Worker] Push notification received');
    
    const options = {
        body: event.data ? event.data.text() : 'رسالة جديدة',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%235b8cff" width="192" height="192"/><text x="50%" y="50%" font-size="120" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">Z</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%235b8cff" width="192" height="192"/></svg>',
        tag: 'z-chat-notification',
        requireInteraction: false,
        actions: [
            {
                action: 'open',
                title: 'فتح'
            },
            {
                action: 'close',
                title: 'إغلاق'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('ℤ𝔼𝕎𝔼𝕀𝕃 ℂℍ𝔸𝕋', options)
    );
});

// ==================== NOTIFICATION CLICK ====================
self.addEventListener('notificationclick', event => {
    console.log('[Service Worker] Notification clicked:', event.action);
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            // Check if app is already open
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window if not already open
            if (clients.openWindow) {
                return clients.openWindow('/Test.html');
            }
        })
    );
});

// ==================== BACKGROUND SYNC ====================
self.addEventListener('sync', event => {
    console.log('[Service Worker] Background sync:', event.tag);
    
    if (event.tag === 'sync-messages') {
        event.waitUntil(
            // Sync messages with server
            fetch('/api/sync-messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).catch(err => console.log('[Service Worker] Sync error:', err))
        );
    }
});

// ==================== MESSAGE HANDLING ====================
self.addEventListener('message', event => {
    console.log('[Service Worker] Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, options } = event.data;
        self.registration.showNotification(title, options);
    }
});

console.log('[Service Worker] Loaded successfully');
