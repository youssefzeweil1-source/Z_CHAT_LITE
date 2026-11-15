/* ZEWEIL Chat - Cloudflare presence relay + Android FCM delivery channel. */
(function () {
    'use strict';

    const RELAY_URL = window.ZEWEIL_ONLINE_PUSH_URL || 'wss://zeweil-online-push.youssefzeweil1.workers.dev/connect';
    let socket = null;
    let reconnectTimer = null;
    let nativePushReady = false;

    function supported() {
        return !!(window.WebSocket && window.firebase && firebase.auth && firebase.database);
    }

    function pushPlugin() {
        return window.Capacitor?.Plugins?.PushNotifications || null;
    }

    function notifyFriendOnline(senderId, senderName = 'صديقك') {
        const text = `${senderName} متصل الآن`;
        if (typeof window.addNotification === 'function') {
            window.addNotification({
                title: 'صديقك متصل الآن',
                text,
                image: 'friend-chat-notification.svg',
                timestamp: Date.now(),
                senderId,
                category: 'friend_online',
                sourceId: `cloudflare-online-${senderId}-${Date.now()}`
            });
        }
        if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker?.ready) {
            navigator.serviceWorker.ready.then(registration => registration.showNotification('صديقك متصل الآن', {
                body: text,
                icon: 'friend-chat-notification.svg',
                tag: `friend-online-${senderId}`
            })).catch(() => {});
        }
    }

    async function saveNativeToken(token) {
        const user = firebase.auth().currentUser;
        if (!user || !token) return;
        await firebase.database().ref(`users/${user.uid}/fcmTokens/${encodeURIComponent(token)}`).set({
            token,
            platform: 'android',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
    }

    async function registerAndroidPush() {
        const plugin = pushPlugin();
        if (!plugin || nativePushReady) return;
        nativePushReady = true;
        const permission = await plugin.requestPermissions();
        if (permission.receive !== 'granted') return;
        await plugin.register();
        await plugin.addListener('registration', event => saveNativeToken(event.value).catch(error => console.warn('FCM token save failed', error)));
        await plugin.addListener('pushNotificationReceived', event => {
            const data = event?.data || {};
            if (data.type === 'friend_online' && data.senderId) notifyFriendOnline(data.senderId, data.senderName || 'صديقك');
        });
    }

    async function connect() {
        if (!supported() || !RELAY_URL) return;
        const user = firebase.auth().currentUser;
        if (!user) return;
        await registerAndroidPush();
        const profile = await firebase.database().ref(`users/${user.uid}`).once('value');
        const profileData = profile.val() || {};
        const friendsSnapshot = await firebase.database().ref(`users/${user.uid}/friends`).once('value');
        const friendIds = Object.keys(friendsSnapshot.val() || {});
        try { socket?.close(); } catch (_) {}
        socket = new WebSocket(RELAY_URL);
        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ userId: user.uid, senderName: profileData.name || profileData.displayName || 'صديقك', friendIds }));
        });
        socket.addEventListener('message', event => {
            try {
                const data = JSON.parse(event.data || '{}');
                if (data.type === 'friend_online' && data.senderId) notifyFriendOnline(data.senderId, data.senderName || 'صديقك');
            } catch (_) {}
        });
        socket.addEventListener('close', () => {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => connect().catch(() => {}), 5000);
        });
    }

    function initForSignedInUser() {
        if (!supported()) return;
        connect().catch(error => console.warn('Cloudflare online relay failed', error));
        window.enableFriendChatPushNotifications = connect;
    }

    window.initZeweilFCM = initForSignedInUser;
    window.addEventListener('load', initForSignedInUser);
})();
