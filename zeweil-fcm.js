/* ZEWEIL Chat - Firebase Cloud Messaging for the small friends chat. */
(function () {
    'use strict';

    // ضع مفتاح Web Push (VAPID) من Firebase Console هنا قبل النشر.
    const ZEWEIL_FCM_VAPID_KEY = window.ZEWEIL_FCM_VAPID_KEY || '';
    const FCM_TOKEN_ROOT = 'fcmTokens';
    let messaging = null;

    function fcmSupported() {
        return 'Notification' in window && 'serviceWorker' in navigator &&
            window.firebase && firebase.messaging && firebase.auth && firebase.database;
    }

    async function registerServiceWorker() {
        return navigator.serviceWorker.register('firebase-messaging-sw.js', { scope: './' });
    }

    async function enableFriendChatPushNotifications() {
        if (!fcmSupported() || !ZEWEIL_FCM_VAPID_KEY) return null;
        const user = firebase.auth().currentUser;
        if (!user) return null;
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return null;
        const registration = await registerServiceWorker();
        messaging = messaging || firebase.messaging();
        const token = await messaging.getToken({
            vapidKey: ZEWEIL_FCM_VAPID_KEY,
            serviceWorkerRegistration: registration
        });
        if (!token) return null;
        await firebase.database().ref(`users/${user.uid}/${FCM_TOKEN_ROOT}/${encodeURIComponent(token)}`).set({
            token,
            platform: 'web',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        window.localStorage.setItem('zeweil_fcm_enabled', '1');
        return token;
    }

    function ensureNotificationButton() {
        if (document.getElementById('zeweil-enable-push-btn')) return;
        const button = document.createElement('button');
        button.id = 'zeweil-enable-push-btn';
        button.type = 'button';
        button.textContent = '🔔 تفعيل إشعارات رسائل الأصدقاء';
        button.style.cssText = 'position:fixed;bottom:18px;left:18px;z-index:4800;padding:10px 12px;border:1px solid #5b8cff;border-radius:10px;background:#17233b;color:#fff;cursor:pointer;font:700 12px Tahoma,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.35)';
        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                const token = await enableFriendChatPushNotifications();
                button.textContent = token ? '✅ إشعارات الأصدقاء مفعّلة' : '⚠️ لم يتم تفعيل الإشعارات';
                if (!token) button.disabled = false;
            } catch (error) {
                console.warn('FCM registration failed', error);
                button.textContent = '⚠️ تعذر تفعيل الإشعارات';
                button.disabled = false;
            }
        });
        document.body.appendChild(button);
    }

    function startForegroundPushListener() {
        if (!fcmSupported()) return;
        messaging = messaging || firebase.messaging();
        messaging.onMessage(payload => {
            const data = payload && payload.data ? payload.data : {};
            if (typeof window.addNotification === 'function') {
                window.addNotification({
                    title: data.title || '💬 رسالة خاصة جديدة',
                    text: data.body || 'لديك رسالة جديدة من صديقك',
                    image: 'friend-chat-notification.svg',
                    timestamp: Number(data.timestamp || Date.now()),
                    senderId: data.senderId || '',
                    category: 'messages',
                    friendChatId: data.chatId || '',
                    sourceId: data.messageId ? `fcm-${data.messageId}` : `fcm-${Date.now()}`,
                    senderName: data.senderName || 'صديقك'
                });
            }
        });
    }

    function initForSignedInUser() {
        if (!fcmSupported()) return;
        startForegroundPushListener();
        ensureNotificationButton();
        // لا نطلب الإذن تلقائياً عند فتح الموقع؛ الطلب يتم من زر الإشعارات.
        window.enableFriendChatPushNotifications = enableFriendChatPushNotifications;
    }

    window.initZeweilFCM = initForSignedInUser;
    window.addEventListener('load', initForSignedInUser);
})();
