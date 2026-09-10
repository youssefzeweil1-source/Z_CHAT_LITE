/* ZEWEIL Chat - Firebase Messaging service worker. */
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyAlim9FOvDcMqTJWINoBCHk3k6DNXS-jTo',
    authDomain: 'zeweil-chat.firebaseapp.com',
    databaseURL: 'https://zeweil-chat-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'zeweil-chat',
    storageBucket: 'zeweil-chat.firebasestorage.app',
    messagingSenderId: '79843372176',
    appId: '1:79843372176:web:ea511efffae60c2a6cfc15'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
    const data = payload && payload.data ? payload.data : {};
    const title = data.title || '💬 رسالة خاصة جديدة';
    const options = {
        body: data.body || 'لديك رسالة جديدة من صديقك',
        icon: data.icon || 'friend-chat-notification.svg',
        badge: data.badge || 'friend-chat-notification.svg',
        tag: data.chatId ? `friend-chat-${data.chatId}` : 'friend-chat-message',
        data: { url: data.url || './Test.html' }
    };
    return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data?.url || './Test.html', self.location.origin).href;
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        const existing = list.find(client => 'focus' in client);
        if (existing) {
            existing.navigate(targetUrl);
            return existing.focus();
        }
        return clients.openWindow(targetUrl);
    }));
});
