/*
 * ============================================================
 *  zeweil-fcm.js — ZEWEIL CHAT
 * ------------------------------------------------------------
 *  وحدة جانب العميل لإشعارات FCM:
 *   - طلب إذن الإشعارات وحفظ رمز FCM لكل جهاز في قاعدة البيانات
 *   - استقبال الرسائل الأمامية (onMessage) وعرضها كإشعار محلي
 *   - زر تفعيل/إلغاء الإشعارات في الإعدادات
 * ------------------------------------------------------------
 *  خطوات التركيب:
 *   1) انسخ هذا الملف بجانب index.html
 *   2) أضف في index.html قبل إغلاق </body>:
 *        <script src="zeweil-fcm.js"></script>
 *   3) استبدل Firebase config أدناه ببيانات مشروعك
 * ============================================================
 */

(function () {
    'use strict';

    /* ---------- Firebase config — استبدلها ببيانات مشروعك ---------- */
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
    const ICON_URL = '/verified-badge-profile-icon-png.png';

    /* ---------- دعم المتصفح ---------- */
    const isFCMSupported = 'serviceWorker' in navigator && 'PushManager' in window;

    if (!isFCMSupported) {
        console.warn('[ZEWEIL FCM] المتصفح لا يدعم الإشعارات. نكمل دونها.');
        return;
    }

    /* ---------- تهيئة Firebase ---------- */
    /*
     * ملاحظة التركيب:
     * index.html يحمل Firebase compat SDK مسبقًا (firebase.initializeApp
     * مع firebaseConfig موجود في الصفحة)، لذلك نكتفي بإعادة استخدام
     * firebase.messaging() دون تحميل SDK إضافي.
     */
    let app, messaging;
    try {
        if (typeof firebase === 'undefined') {
            console.error('[ZEWEIL FCM] Firebase SDK غير موجود في الصفحة — تأكد من تحميله قبل هذا السكربت');
            return;
        }
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        initFirebase();
    } catch (err) {
        console.warn('[ZEWEIL FCM] تعذر التهيئة', err);
    }

    function initFirebase() {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        messaging = firebase.messaging();
        registerServiceWorkerAndFCM();
    }

    /* ---------- Service Worker + رمز FCM ---------- */
    let fcmTokenSentRef = null;
    let lastSentToken = '';
    const TOKEN_STORAGE_KEY = 'zeweil_fcm_last_token';

    async function registerServiceWorkerAndFCM() {
        try {
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
            await navigator.serviceWorker.ready;

            /* اطلب إذن الإشعارات (بشكل سلس بعد أول تسجيل دخول فعلي) */
            if (Notification.permission === 'default' && shouldAskPermission()) {
                requestPermissionSoftly();
            }

            await getTokenAndSave(registration);

            /* مراقبة التغيير: لو الجهاز غيّر اشتراكه نعيد التسجيل */
            messaging.onTokenRefresh(() => {
                console.log('[ZEWEIL FCM] رمز جديد متاح — إعادة الحفظ');
                getTokenAndSave(registration);
            });

            console.log('[ZEWEIL FCM] جاهز');
        } catch (err) {
            console.warn('[ZEWEIL FCM] تعذر التسجيل', err);
        }
    }

    function shouldAskPermission() {
        // نسأل فقط لو المستخدم سجّل دخول فعلًا (ليس ضيفًا)
        try {
            const uid = localStorage.getItem('zeweil_chat_uid') || window.userId || '';
            return !!uid;
        } catch (_) {
            return false;
        }
    }

    function requestPermissionSoftly() {
        // لا نزعج المستخدم فورًا — العرض داخل تطبيق الشات يظهر زرًا واضحًا
        const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (stored) return; // عنده رمز بالفعل
    }

    async function getTokenAndSave(registration) {
        if (!messaging) return;
        try {
            const currentToken = await messaging.getToken({
                vapidKey: VAPID_PUBLIC_KEY,
                serviceWorkerRegistration: registration
            });
            if (!currentToken) {
                console.log('[ZEWEIL FCM] لا يوجد رمز — المستخدم لم يمنح الإذن');
                return;
            }
            localStorage.setItem(TOKEN_STORAGE_KEY, currentToken);
            await saveTokenToDatabase(currentToken);
        } catch (err) {
            console.warn('[ZEWEIL FCM] getToken failed', err);
        }
    }

    async function saveTokenToDatabase(token) {
        if (!firebase || !firebase.database) return;
        const uid = getUid();
        if (!uid) return;

        const ref = firebase.database().ref(`users/${uid}/fcmTokens/${token}`);
        ref.set({
            savedAt: firebase.database.ServerValue.TIMESTAMP,
            platform: 'web',
            userAgent: navigator.userAgent.slice(0, 120)
        }).then(() => {
            console.log('[ZEWEIL FCM] الرمز محفوظ', token.slice(0, 12));
        }).catch(err => console.warn('[ZEWEIL FCM] حفظ الرمز فشل', err));
    }

    function getUid() {
        // يطابق index.html حيث userId متغير عام يُملأ من uid المستخدم بعد تسجيل الدخول
        try {
            const candidate = (typeof window.userId !== 'undefined' && window.userId) ||
                (firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.uid) ||
                '';
            return String(candidate).trim();
        } catch (_) {
            return '';
        }
    }

    /* ---------- الرسائل الأمامية (التطبيق مفتوح) ---------- */
    function attachForegroundListener() {
        if (!messaging) return;
        messaging.onMessage(payload => {
            console.log('[ZEWEIL FCM] رسالة أمامية', payload);

            const notification = payload.notification || {};
            const data = payload.data || {};

            // لو المستخدم يشوف المحادثة نفسها، لا حاجة لإشعار — الإشعارات المحلية تعمل
            const activeChatId = getActiveChatId();
            if (data.type === 'private_message' && data.chatId === activeChatId) return;

            if (Notification.permission === 'granted') {
                new Notification(notification.title || 'ZEWEIL CHAT', {
                    body: notification.body || '',
                    icon: data.image || ICON_URL,
                    badge: '/z_coin.png',
                    tag: `zeweil-fg-${data.type || 'msg'}`,
                    silent: false
                }).onclick = () => {
                    window.focus();
                    if (data.chatId) openChatByData(data);
                };
            }
        });
    }

    function getActiveChatId() {
        try {
            return String(window.currentFriendChatId || '').trim();
        } catch (_) {
            return '';
        }
    }

    function openChatByData(data) {
        try {
            if (typeof window.openFriendSimpleChat === 'function' && data.senderUid) {
                window.openFriendSimpleChat(data.senderUid);
            }
        } catch (_) {}
    }

    /* ---------- واجهة الإعدادات: زر تفعيل الإشعارات ---------- */
    window.ZeweilFCM = {
        enable: async () => {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('تم رفض إذن الإشعارات. فعّلها من إعدادات المتصفح.');
                return false;
            }
            const registration = await navigator.serviceWorker.ready;
            await getTokenAndSave(registration);
            attachForegroundListener();
            return true;
        },
        disable: () => {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            const uid = getUid();
            if (uid && firebase && firebase.database) {
                const token = localStorage.getItem(TOKEN_STORAGE_KEY + '_cached') || '';
                if (token) firebase.database().ref(`users/${uid}/fcmTokens/${token}`).remove();
            }
            return true;
        }
    };

    attachForegroundListener();
})();
