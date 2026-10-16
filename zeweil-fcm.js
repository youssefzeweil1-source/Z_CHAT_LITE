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
        let permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
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

    function updateNotificationSettingsButton(status = '') {
        const button = document.getElementById('zeweil-enable-push-btn');
        const statusNode = document.getElementById('zeweil-push-status');
        if (!button) return;
        const enabled = localStorage.getItem('zeweil_fcm_enabled') === '1' &&
            'Notification' in window && Notification.permission === 'granted';
        button.textContent = enabled ? '✅ إشعارات رسائل الأصدقاء مفعّلة' : '🔔 تفعيل إشعارات رسائل الأصدقاء';
        button.disabled = false;
        if (statusNode) {
            statusNode.textContent = status || (enabled
                ? 'تم الحفظ على هذا المتصفح، وسيتم تجديد تسجيل الإشعارات تلقائياً عند فتح الموقع.'
                : (Notification.permission === 'denied'
                    ? 'الإشعارات محظورة من إعدادات المتصفح؛ اسمح بها للموقع من علامة القفل بجوار الرابط.'
                    : 'فعّلها مرة واحدة فقط، وسيتم تذكّر اختيارك على هذا المتصفح.'));
        }
    }

    function ensureNotificationButton() {
        const settings = document.querySelector('#theme-modal-overlay .quick-settings-actions');
        if (!settings) return;
        let button = document.getElementById('zeweil-enable-push-btn');
        if (!button) {
            button = document.createElement('button');
            button.id = 'zeweil-enable-push-btn';
            button.type = 'button';
            button.addEventListener('click', async () => {
                button.disabled = true;
                const statusNode = document.getElementById('zeweil-push-status');
                if (statusNode) statusNode.textContent = 'جارٍ تفعيل إشعارات الرسائل...';
                try {
                    const token = await enableFriendChatPushNotifications();
                    updateNotificationSettingsButton(token
                        ? 'تم تفعيل الإشعارات وحفظ اختيارك على هذا المتصفح.'
                        : 'لم يتم التفعيل. تأكد أنك مسجل الدخول وأن إذن الإشعارات مسموح ومفتاح VAPID مضبوط.');
                } catch (error) {
                    console.warn('FCM registration failed', error);
                    updateNotificationSettingsButton('تعذر تفعيل الإشعارات. افتح وحدة التحكم لمعرفة التفاصيل أو جرّب مرة أخرى.');
                }
            });
            settings.appendChild(button);
            const status = document.createElement('div');
            status.id = 'zeweil-push-status';
            status.style.cssText = 'grid-column:1/-1;color:#bfcbe0;font-size:.78rem;line-height:1.7;margin-top:2px;';
            settings.appendChild(status);
        }
        updateNotificationSettingsButton();
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

    function showZeweilBrowserNotification({ title = '💬 رسالة خاصة جديدة', body = 'لديك رسالة جديدة من صديقك', tag = '' } = {}) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return false;
        const dedupeKey = `zeweil-notification-${tag || `${title}-${body}`}`;
        if (window.sessionStorage.getItem(dedupeKey)) return false;
        window.sessionStorage.setItem(dedupeKey, '1');
        const options = { body, icon: 'friend-chat-notification.svg', tag: tag || 'friend-chat-message' };
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(registration => registration.showNotification(title, options)).catch(() => {
                try { new Notification(title, options); } catch (_) {}
            });
        } else {
            try { new Notification(title, options); } catch (_) {}
        }
        return true;
    }

    function initForSignedInUser() {
        if (!fcmSupported()) return;
        startForegroundPushListener();
        ensureNotificationButton();
        // بعد موافقة المستخدم مرة واحدة، نجدد/نسترجع FCM token تلقائياً عند تسجيل الدخول.
        if (localStorage.getItem('zeweil_fcm_enabled') === '1' &&
            'Notification' in window && Notification.permission === 'granted') {
            enableFriendChatPushNotifications().then(() => updateNotificationSettingsButton())
                .catch(error => console.warn('FCM auto-registration failed', error));
        }
        window.enableFriendChatPushNotifications = enableFriendChatPushNotifications;
        window.showZeweilBrowserNotification = showZeweilBrowserNotification;
    }

    window.initZeweilFCM = initForSignedInUser;
    window.addEventListener('load', initForSignedInUser);
})();
