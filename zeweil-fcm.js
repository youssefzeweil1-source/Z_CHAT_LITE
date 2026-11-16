/* ZEWEIL Chat - Cloudflare presence relay + FCM delivery for Android and web. */
(function () {
    'use strict';

    const RELAY_URL = window.ZEWEIL_ONLINE_PUSH_URL || 'wss://zeweil-online-push.youssefzeweil1.workers.dev/connect';
    const WEB_VAPID_KEY = window.ZEWEIL_FCM_VAPID_KEY || 'BGiwsiyfFT9MtyTjEqa2xQYD5AcV8bsyjNV9Repk2tPP49SwyXj5J-Ssas2HlSwu8U5_WAlqNERvw6GUGf-s1_I';
    let socket = null;
    let reconnectTimer = null;
    let nativePushReady = false;
    let webMessaging = null;

    function supported() {
        return !!(window.WebSocket && window.firebase && firebase.auth && firebase.database);
    }

    function pushPlugin() {
        return window.Capacitor?.Plugins?.PushNotifications ||
            window.Capacitor?.registerPlugin?.('PushNotifications') || null;
    }

    function notifyFriendOnline(senderId, senderName = 'صديقك') {
        const text = `${senderName} متصل الآن`;
        if (typeof window.addNotification === 'function') {
            window.addNotification({ title: 'صديقك متصل الآن', text, image: 'friend-chat-notification.svg', timestamp: Date.now(), senderId, category: 'friend_online', sourceId: `cloudflare-online-${senderId}-${Date.now()}` });
        }
        if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker?.ready) {
            navigator.serviceWorker.ready.then(registration => registration.showNotification('صديقك متصل الآن', { body: text, icon: 'friend-chat-notification.svg', tag: `friend-online-${senderId}` })).catch(() => {});
        }
    }

    async function saveNativeToken(token) {
        const user = firebase.auth().currentUser;
        if (!user || !token) return;
        await firebase.database().ref(`users/${user.uid}/fcmTokens/${encodeURIComponent(token)}`).set({ token, platform: 'android', updatedAt: firebase.database.ServerValue.TIMESTAMP });
    }

    async function registerAndroidPush() {
        const plugin = pushPlugin();
        if (!plugin || nativePushReady) return;
        nativePushReady = true;
        await plugin.addListener('registration', event => saveNativeToken(event.value).catch(error => console.warn('FCM token save failed', error)));
        await plugin.addListener('pushNotificationReceived', event => {
            const data = event?.data || {};
            if (data.type === 'friend_online' && data.senderId) notifyFriendOnline(data.senderId, data.senderName || 'صديقك');
        });
        const permission = await plugin.requestPermissions();
        if (permission.receive !== 'granted') {
            if (typeof window.addNotification === 'function') window.addNotification({ title: 'إشعارات الهاتف غير مفعّلة', text: 'افتح إعدادات التطبيق واسمح بإشعارات ZEWEIL CHAT.', category: 'push_permission' });
            return;
        }
        await plugin.register();
    }

    function webSupported() {
        return !pushPlugin() && !!(window.Notification && navigator.serviceWorker && window.firebase?.messaging);
    }

    async function enableWebPush() {
        if (!webSupported()) return false;
        const user = firebase.auth().currentUser;
        if (!user) return false;
        const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (permission !== 'granted') return false;
        const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js', { scope: './' });
        webMessaging = webMessaging || firebase.messaging();
        const tokenOptions = { serviceWorkerRegistration: registration };
        if (WEB_VAPID_KEY) tokenOptions.vapidKey = WEB_VAPID_KEY;
        const token = await webMessaging.getToken(tokenOptions);
        if (!token) return false;
        await firebase.database().ref(`users/${user.uid}/fcmTokens/${encodeURIComponent(token)}`).set({ token, platform: 'web', updatedAt: firebase.database.ServerValue.TIMESTAMP });
        localStorage.setItem('zeweil_web_push_enabled', '1');
        updateWebPushButton('تم تفعيل إشعارات الموقع بنجاح.');
        return true;
    }

    function updateWebPushButton(status = '') {
        const button = document.getElementById('zeweil-web-push-btn');
        const statusNode = document.getElementById('zeweil-web-push-status');
        if (!button) return;
        const enabled = localStorage.getItem('zeweil_web_push_enabled') === '1' && Notification.permission === 'granted';
        button.textContent = enabled ? '✅ إشعارات الموقع مفعّلة' : '🔔 تفعيل إشعارات الموقع';
        if (statusNode) statusNode.textContent = status || (Notification.permission === 'denied' ? 'الإذن مرفوض؛ اسمح بالإشعارات من إعدادات المتصفح.' : 'اضغط مرة واحدة للسماح بإشعارات الأصدقاء حتى عند إغلاق التبويب.');
    }

    function ensureWebPushButton() {
        if (!webSupported()) return;
        const settings = document.querySelector('#theme-modal-overlay .quick-settings-actions');
        if (!settings || document.getElementById('zeweil-web-push-btn')) return;
        const button = document.createElement('button');
        button.id = 'zeweil-web-push-btn';
        button.type = 'button';
        button.addEventListener('click', async () => {
            button.disabled = true;
            try { await enableWebPush(); } catch (error) { console.warn('Web push registration failed', error); updateWebPushButton('تعذر التفعيل؛ تأكد من HTTPS ثم جرّب مرة أخرى.'); }
            button.disabled = false;
        });
        settings.appendChild(button);
        const status = document.createElement('div');
        status.id = 'zeweil-web-push-status';
        status.style.cssText = 'grid-column:1/-1;color:#bfcbe0;font-size:.78rem;line-height:1.7;margin-top:2px;';
        settings.appendChild(status);
        updateWebPushButton();
    }

    function startWebForegroundListener() {
        if (!webSupported()) return;
        webMessaging = webMessaging || firebase.messaging();
        webMessaging.onMessage(payload => {
            const data = payload?.data || payload?.notification || {};
            if (data.type === 'friend_online' && data.senderId) notifyFriendOnline(data.senderId, data.senderName || 'صديقك');
        });
    }

    async function connect() {
        if (!supported() || !RELAY_URL) return;
        const user = firebase.auth().currentUser;
        if (!user) return;
        await registerAndroidPush();
        startWebForegroundListener();
        ensureWebPushButton();
        if (webSupported() && Notification.permission === 'granted') {
            enableWebPush().catch(error => console.warn('Web push token refresh failed', error));
        }
        const profile = await firebase.database().ref(`users/${user.uid}`).once('value');
        const profileData = profile.val() || {};
        const friendsSnapshot = await firebase.database().ref(`users/${user.uid}/friends`).once('value');
        const friendIdSet = new Set(Object.keys(friendsSnapshot.val() || {}));
        if (typeof window.getZeweilFriendIds === 'function') {
            window.getZeweilFriendIds().forEach(friendId => friendIdSet.add(friendId));
        }
        const friendIds = [...friendIdSet];
        await Promise.all(friendIds.map(friendId => firebase.database().ref(`users/${user.uid}/friends/${friendId}`).set(true)));
        try { socket?.close(); } catch (_) {}
        socket = new WebSocket(RELAY_URL);
        socket.addEventListener('open', () => socket.send(JSON.stringify({ userId: user.uid, senderName: profileData.name || profileData.displayName || 'صديقك', friendIds })));
        socket.addEventListener('message', event => {
            try { const data = JSON.parse(event.data || '{}'); if (data.type === 'friend_online' && data.senderId) notifyFriendOnline(data.senderId, data.senderName || 'صديقك'); } catch (_) {}
        });
        socket.addEventListener('close', () => { if (reconnectTimer) clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => connect().catch(() => {}), 5000); });
    }

    function initForSignedInUser() {
        if (!supported()) return;
        setTimeout(() => connect().catch(error => console.warn('Cloudflare online relay failed', error)), 700);
        window.enableFriendChatPushNotifications = connect;
        window.enableWebPushNotifications = enableWebPush;
    }

    window.initZeweilFCM = initForSignedInUser;
    window.addEventListener('load', initForSignedInUser);
})();
