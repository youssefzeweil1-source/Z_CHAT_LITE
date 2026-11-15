/* ZEWEIL Chat - Cloudflare online presence notifications. */
(function () {
    'use strict';

    const RELAY_URL = window.ZEWEIL_ONLINE_PUSH_URL || 'wss://zeweil-online-push.youssefzeweil1.workers.dev/connect';
    let socket = null;
    let reconnectTimer = null;

    function supported() {
        return !!(window.WebSocket && window.firebase && firebase.auth && firebase.database);
    }

    function handleFriendOnline(senderId) {
        const text = 'صديقك متصل الآن';
        if (typeof window.addNotification === 'function') {
            window.addNotification({
                title: text,
                text,
                image: 'friend-chat-notification.svg',
                timestamp: Date.now(),
                senderId,
                category: 'friend_online',
                sourceId: `cloudflare-online-${senderId}-${Date.now()}`
            });
        }
        if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker?.ready) {
            navigator.serviceWorker.ready.then(registration => registration.showNotification(text, {
                body: text,
                icon: 'friend-chat-notification.svg',
                tag: `friend-online-${senderId}`
            })).catch(() => {});
        }
    }

    async function connect() {
        if (!supported() || !RELAY_URL) return;
        const user = firebase.auth().currentUser;
        if (!user) return;
        const snapshot = await firebase.database().ref(`users/${user.uid}/friends`).once('value');
        const friendIds = Object.keys(snapshot.val() || {});
        try { socket?.close(); } catch (_) {}
        socket = new WebSocket(RELAY_URL);
        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ userId: user.uid, friendIds }));
        });
        socket.addEventListener('message', event => {
            try {
                const data = JSON.parse(event.data || '{}');
                if (data.type === 'friend_online' && data.senderId) handleFriendOnline(data.senderId);
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
