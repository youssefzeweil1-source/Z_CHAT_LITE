/*
 * ============================================================
 *  firebase-messaging-sw.js — ZEWEIL CHAT
 * ------------------------------------------------------------
 *  Service Worker مسؤول عن استقبال إشعارات FCM في الخلفية
 *  (عندما يكون الموقع مقفولًا أو خلف تبويب آخر).
 * ------------------------------------------------------------
 *  خطوات التثبيت:
 *   1) انسخ الملف إلى جذر الموقع (نفس مستوى index.html)
 *   2) Firebase config تم تجهيزها ببيانات مشروع zeweil-chat الحقيقية
 *   3) VAPID key تم توليده بالفعل من Firebase Console (مولَّد في 17 Aug 2026)
 * ============================================================
 */

/* ---------- Firebase config — بيانات مشروع zeweil-chat الحقيقية (من Firebase Console) ---------- */
const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAlim9FOvDcMqTJWINoBCHk3k6DNXS-jTo',
    authDomain: 'zeweil-chat.firebaseapp.com',
    databaseURL: 'https://zeweil-chat-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'zeweil-chat',
    storageBucket: 'zeweil-chat.firebasestorage.app',
    messagingSenderId: '79843372176',
    appId: '1:79843372176:web:ea511efffae60c2a6cfc15'
};

/* VAPID public key — تم توليده من Firebase Console > Settings > Cloud Messaging (Web Push certificates) */
const VAPID_PUBLIC_KEY = 'BGiwsiyfFT9MtyTjEqa2xQYD5AcV8bsyjNV9Repk2tPP49SwyXj5J-Ssas2HlSwu8U5_WAlqNERvw6GUGf-s1_I';

/* ---------- تحميل Firebase Messaging (compat من CDN) ---------- */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}
const messaging = firebase.messaging();

/* ---------- أيقونة افتراضية (استبدلها برابط شعارك الفعلي) ---------- */
const DEFAULT_ICON = '/verified-badge-profile-icon-png.png';

/* ==================================================================
   إشعارات الخلفية: تصل هنا عندما يكون الموقع مقفولًا/خلف تبويب آخر
   ================================================================== */
messaging.onBackgroundMessage(payload => {
    console.log('[ZEWEIL SW] خلفية: إشعار وارد', payload);

    const data = (payload.data && typeof payload.data === 'object') ? payload.data : {};
    const notification = payload.notification || {};

    // أيقونة المُرسل إن كانت موجودة، وإلا الشعار الافتراضي
    const icon = data.image || notification.image || DEFAULT_ICON;

    const options = {
        body: notification.body || 'رسالة جديدة',
        icon,
        badge: '/z_coin.png',
        tag: `zeweil-${data.type || 'msg'}-${data.senderUid || 'system'}`,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: {
            url: payload.fcmOptions && payload.fcmOptions.link ? payload.fcmOptions.link : '/',
            type: data.type,
            senderUid: data.senderUid,
            chatId: data.chatId,
            room: data.room
        },
        actions: [
            { action: 'open', title: 'فتح' },
            { action: 'close', title: 'إغلاق' }
        ]
    };

    eventShowNotification(notification.title || 'ZEWEIL CHAT', options);
});

function eventShowNotification(title, options) {
    self.registration.showNotification(title, options);
}

/* ==================================================================
   النقر على الإشعار: فتح التطبيق والانتقال للمحادثة المناسبة
   ================================================================== */
self.addEventListener('notificationclick', event => {
    event.notification.close();

    const targetUrl = (event.notification.data && event.notification.data.url) || '/index.html';

    if (event.action === 'close') return;

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            // لو التطبيق مفتوح في أي تبويب، ركز عليه
            if (clientList.length > 0) {
                const client = clientList[0];
                if ('navigate' in client) {
                    return client.navigate(targetUrl).then(() => client.focus());
                }
                return 'focus' in client ? client.focus() : null;
            }
            // غير مفتوح: افتح تبويب جديد
            if (clients.openWindow) return clients.openWindow(targetUrl);
            return null;
        })
    );
});

/* ==================================================================
   تغيير الاشتراك (يحدث عند تجديد المتصفح للرموز)
   ================================================================== */
self.addEventListener('pushsubscriptionchange', event => {
    console.log('[ZEWEIL SW] تجديد الاشتراك');
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        }).then(subscription => {
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'FCM_RESUBSCRIBED', subscription });
                });
            });
        })
    );
});

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const buffer = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) buffer[i] = rawData.charCodeAt(i);
    return buffer;
}
