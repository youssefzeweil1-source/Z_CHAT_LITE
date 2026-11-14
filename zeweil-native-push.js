/* ZEWEIL Chat - native Capacitor push bridge. No-op on the normal website. */
(function () {
    'use strict';

    const TOKEN_ROOT = 'fcmTokens';
    let nativeToken = '';
    let listenersReady = false;

    function isCapacitorAndroid() {
        const cap = window.Capacitor;
        return !!(cap && cap.isNativePlatform && cap.isNativePlatform() &&
            String(cap.getPlatform ? cap.getPlatform() : '').toLowerCase() === 'android');
    }

    function getPushPlugin() {
        return window.Capacitor?.Plugins?.PushNotifications || null;
    }

    async function saveNativeToken(token) {
        nativeToken = String(token || '').trim();
        const user = window.firebase?.auth?.().currentUser;
        if (!nativeToken || !user || !window.firebase?.database) return false;
        const key = encodeURIComponent(nativeToken).replace(/\./g, '%2E');
        await firebase.database().ref(`users/${user.uid}/${TOKEN_ROOT}/${key}`).set({
            token: nativeToken,
            platform: 'android',
            app: 'capacitor',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        window.localStorage.setItem('zeweil_native_push_enabled', '1');
        return true;
    }

    async function requestNativePushPermission() {
        if (!isCapacitorAndroid()) return false;
        const PushNotifications = getPushPlugin();
        if (!PushNotifications) return false;
        const permission = await PushNotifications.checkPermissions();
        let result = permission;
        if (permission.receive !== 'granted') result = await PushNotifications.requestPermissions();
        if (result.receive !== 'granted') return false;
        await PushNotifications.register();
        return true;
    }

    async function setupNativePush() {
        if (!isCapacitorAndroid() || listenersReady) return false;
        const PushNotifications = getPushPlugin();
        if (!PushNotifications) return false;
        listenersReady = true;
        await PushNotifications.addListener('registration', event => {
            saveNativeToken(event?.value).catch(error => console.warn('Native FCM token save failed', error));
        });
        await PushNotifications.addListener('registrationError', error => {
            console.warn('Native FCM registration failed', error);
        });
        await PushNotifications.addListener('pushNotificationReceived', notification => {
            const data = notification?.data || {};
            if (typeof window.addNotification === 'function') {
                window.addNotification({
                    title: data.title || notification.title || 'إشعار جديد',
                    text: data.body || notification.body || 'لديك إشعار جديد',
                    image: 'friend-chat-notification.svg',
                    timestamp: Number(data.timestamp || Date.now()),
                    senderId: data.senderId || '',
                    category: data.type === 'friend_online' ? 'friends' : 'messages',
                    sourceId: data.eventId ? `native-${data.eventId}` : `native-${Date.now()}`,
                    senderName: data.senderName || ''
                });
            }
        });
        await PushNotifications.addListener('pushNotificationActionPerformed', event => {
            const data = event?.notification?.data || {};
            if (data.url && typeof window.location !== 'undefined') window.location.href = data.url;
            window.dispatchEvent(new CustomEvent('zeweil-native-push-open', { detail: data }));
        });
        if (PushNotifications.createChannel) {
            await PushNotifications.createChannel({
                id: 'zeweil-online',
                name: 'اتصال الأصدقاء',
                description: 'تنبيهات عند اتصال أحد أصدقائك',
                importance: 5,
                visibility: 1,
                sound: 'default'
            }).catch(() => {});
        }
        await requestNativePushPermission();
        if (nativeToken) await saveNativeToken(nativeToken);
        return true;
    }

    window.setupZeweilNativePush = setupNativePush;
    window.requestZeweilNativePushPermission = requestNativePushPermission;

    function boot() {
        if (!isCapacitorAndroid()) return;
        const start = () => setupNativePush().catch(error => console.warn('Native push setup failed', error));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
        else start();
    }

    window.addEventListener('zeweil-auth-ready', boot);
    window.addEventListener('load', boot, { once: true });
    if (window.firebase?.auth) firebase.auth().onAuthStateChanged(user => {
        if (user) setupNativePush().catch(error => console.warn('Native push auth setup failed', error));
    });
})();
