/*
 * ============================================================
 *  ZEWEIL CHAT — Firebase Cloud Functions
 *  نظام إشعارات FCM (Firebase Cloud Messaging)
 * ------------------------------------------------------------
 *  الإصدارات:
 *   1st Gen (Spark Plan مجاني) — هذا الملف
 *   يتطلب: firebase-functions + firebase-admin
 * ------------------------------------------------------------
 *  المشغلات:
 *   - notifyOnPrivateMessage : رسالة جديدة في محادثة خاصة
 *   - notifyOnFriendRequest  : طلب صداقة جديد
 *   - notifyOnFriendGift     : هدية عملات/توثيق وصلت
 *   - notifyOnNudge          : نكزة (Nudge) جديدة في غرفة
 * ------------------------------------------------------------
 *  طرق النشر:
 *   firebase deploy --only functions
 * ============================================================
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// تهيئة Firebase Admin (البيانات الحساسة تُدار تلقائيًا في بيئة Cloud Functions)
admin.initializeApp();

const logger = functions.logger;

/* ------------------------------------------------------------------ */
/* أدوات مساعدة                                                         */
/* ------------------------------------------------------------------ */

/**
 * جلب كل رموز FCM المسجلة للمستخدم + إعدادات الإشعارات الخاصة به.
 * المسار المستخدم: users/{uid}/fcmTokens/{token}
 *                 users/{uid}/settings/notifications (اختياري)
 */
async function getFcmTokens(uid) {
    try {
        const snap = await admin.database().ref(`users/${uid}/fcmTokens`).once('value');
        const tokens = snap.val() || {};
        const valid = Object.keys(tokens).filter(t => t && t.length > 10);
        return valid;
    } catch (err) {
        logger.warn('getFcmTokens failed', { uid, error: err.message });
        return [];
    }
}

/**
 * جلب اسم وصورة المستخدم من الملف الشخصي.
 */
async function getUserProfile(uid) {
    try {
        const snap = await admin.database().ref(`users/${uid}`).once('value');
        const data = snap.val() || {};
        return {
            name: data.name || 'مستخدم',
            profileImage: data.profileImage || null,
            online: !!data.online
        };
    } catch (_) {
        return { name: 'مستخدم', profileImage: null, online: false };
    }
}

/**
 * التحقق هل المستلم داخل التطبيق (صفحة مفتوحة أو نافذة مركزة).
 * إذا كان متصلًا أونلاين داخل التطبيق، الإشعار المحلي كافٍ ونوفر push.
 */
async function isReceiverActiveOnline(receiverUid) {
    try {
        const snap = await admin.database().ref(`users/${receiverUid}/online`).once('value');
        return snap.val() === true;
    } catch (_) {
        return false;
    }
}

/**
 * إرسال رسالة FCM واحدة إلى رمز واحد.
 * - notification: العنوان/النص/الأيقونة (تُعرض تلقائيًا على الويب والأندرويد)
 * - data: بيانات مخصصة يقرأها التطبيق
 * - webpush.fcm_options.link: صفحة الفتح عند النقر على الويب
 * - ttl: بقاء الرسالة 24 ساعة (للأجهزة الأندرويد غير المتصلة)
 */
async function sendSingle(token, payload) {
    try {
        const response = await admin.messaging().send({
            token,
            notification: payload.notification,
            android: {
                priority: 'high',
                notification: {
                    icon: payload.notification.image || null,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK',
                    sound: 'default'
                },
                ttl: 86400
            },
            webpush: {
                headers: {
                    TTL: '86400',
                    Urgency: 'high'
                },
                notification: {
                    icon: payload.notification.image || '/verified-badge-profile-icon-png.png',
                    badge: '/z_coin.png',
                    vibrate: [200, 100, 200]
                },
                fcm_options: {
                    link: payload.deepLink || '/'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: payload.badgeCount || 0,
                        'content-available': 1
                    }
                },
                headers: { 'apns-priority': '10' }
            },
            data: payload.data
        });
        logger.info('FCM sent', { tokenPreview: token.slice(0, 10), response });
        return { success: true };
    } catch (err) {
        logger.warn('FCM send failed', { error: err.message, code: err.code });

        // إزالة الرمز التالف/المنتهي
        if (
            err.code === 'messaging/registration-token-not-registered' ||
            err.code === 'messaging/invalid-argument'
        ) {
            functions.logger.info('Removing stale token', { tokenPreview: token.slice(0, 10) });
        }
        return { success: false, code: err.code };
    }
}

/**
 * إزالة الرموز غير الصالحة + إرسال لكل الرموز الصالحة للمستخدم.
 * يتوقف بعد أول إشعار ناجح لكل مستخدم (تجنب الفيضان عند تعدد الأجهزة)
 * مع بقاء الرموز الصالحة لباقي الأجهزة.
 */
async function notifyUser(receiverUid, payload) {
    const tokens = await getFcmTokens(receiverUid);
    if (!tokens.length) return;

    let sent = false;
    const cleanup = [];
    for (const token of tokens) {
        const { success, code } = await sendSingle(token, payload);
        if (!success) {
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
                cleanup.push(token);
            }
        } else if (!sent) {
            sent = true; // إشعار واحد لكل مستخدم حتى لو عنده أجهزة متعددة
        }
    }

    // تنظيف الرموز التالفة
    if (cleanup.length) {
        const updates = {};
        cleanup.forEach(t => { updates[`users/${receiverUid}/fcmTokens/${t}`] = null; });
        await admin.database().ref().update(updates).catch(e => logger.warn('token cleanup failed', e.message));
    }
}

/**
 * فحص إعدادات كتم الإشعارات للمستلم.
 * users/{uid}/settings/notifications/{kind} = false => لا إشعار لهذا النوع
 */
async function isNotificationMuted(receiverUid, kind = 'messages') {
    try {
        const snap = await admin.database()
            .ref(`users/${receiverUid}/settings/notifications/${kind}`)
            .once('value');
        return snap.val() === false;
    } catch (_) {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* 1) إشعار عند رسالة جديدة في المحادثات الخاصة                        */
/*    المسار: friendChats/{chatId}/messages/{msgId}                      */
/* ------------------------------------------------------------------ */
exports.notifyOnPrivateMessage = functions.database.onValueCreated('/friendChats/{chatId}/messages/{msgId}', async (event) => {
        const msg = event.data.val() || {};
        const chatId = event.params.chatId;
        const msgId = event.params.msgId;

        // تجاهل رسائل النظام المؤقتة والوسائط الفاشلة
        if (msg._localPending || msg._localError) return null;

        const senderUid = String(msg.userId || '');

        // المستلم هو الطرف الآخر في المحادثة: المستخدمون المفصولون بـ '_' في chatId
        if (!senderUid || !chatId || !chatId.includes('_')) return null;
        const receiverUid = chatId.split('_').find(u => u && u !== senderUid) || '';
        if (!receiverUid || senderUid === receiverUid) return null;

        // كتم اختياري من إعدادات المستلم
        if (await isNotificationMuted(receiverUid, 'messages')) return null;

        // إذا كان المستلم نشطًا أونلاين، الإشعارات المحلية داخل التطبيق تكفي
        if (await isReceiverActiveOnline(receiverUid)) return null;

        const sender = await getUserProfile(senderUid);

        const text = String(msg.message || '');
        let body = '';
        if (msg.mediaType === 'audio' || msg.audioData) body = '🎤 رسالة صوتية';
        else if (msg.mediaType === 'video') body = '🎥 فيديو جديد';
        else if (msg.imageData || text.startsWith('data:image/')) body = '🖼️ صورة جديدة';
        else if (text.startsWith('http')) body = '🔗 رابط جديد';
        else body = text.slice(0, 120);

        const image = sender.profileImage || null;

        return notifyUser(receiverUid, {
            notification: {
                title: sender.name,
                body: body || 'رسالة جديدة',
                image
            },
            data: {
                type: 'private_message',
                senderUid,
                senderName: sender.name,
                chatId,
                messageKey: msgId,
                image: image || ''
            },
            deepLink: `/index.html?chat=${encodeURIComponent(chatId)}`
        });
    });

/* ------------------------------------------------------------------ */
/* 2) إشعار عند طلب صداقة جديد                                        */
/*    المسار: users/{receiverUid}/friendRequests/{requestId}           */
/* ------------------------------------------------------------------ */
exports.notifyOnFriendRequest = functions.database.onValueCreated('/users/{receiverUid}/friendRequests/{requestId}', async (event) => {
        const receiverUid = event.params.receiverUid;
        const req = event.data.val() || {};
        const senderUid = String(req.fromId || event.params.requestId || '');

        if (!senderUid || senderUid === receiverUid) return null;
        if (await isNotificationMuted(receiverUid, 'friendRequests')) return null;

        const sender = await getUserProfile(senderUid);
        const note = String(req.note || '');

        return notifyUser(receiverUid, {
            notification: {
                title: 'طلب صداقة جديد',
                body: `${sender.name} أرسل لك طلب صداقة${note ? `: ${note.slice(0, 80)}` : ''}`,
                image: sender.profileImage
            },
            data: {
                type: 'friend_request',
                senderUid,
                senderName: sender.name,
                requestId: event.params.requestId
            },
            deepLink: '/'
        });
    });

/* ------------------------------------------------------------------ */
/* 3) إشعار عند هدية تصل (عملات أو توثيق)                              */
/*    المسار: users/{receiverUid}/walletHistory/{key}                  */
/* ------------------------------------------------------------------ */
exports.notifyOnFriendGift = functions.database.onValueCreated('/users/{receiverUid}/walletHistory/{key}', async (event) => {
        const history = event.data.val() || {};

        if (history.type !== 'friend_gift' || history.status !== 'received') return null;
        if (await isNotificationMuted(event.params.receiverUid, 'gifts')) return null;

        const sender = await getUserProfile(String(history.from || ''));
        const coins = Math.max(0, Math.floor(Number(history.coins || 0)));

        return notifyUser(event.params.receiverUid, {
            notification: {
                title: '🎁 هدية وصلت!',
                body: history.giftType === 'coins'
                    ? `وصلك ${coins.toLocaleString()} عملة من ${sender.name}`
                    : `وصلك ${history.itemName || 'هدية'} من ${sender.name}`
            },
            data: {
                type: 'friend_gift',
                giftType: history.giftType,
                from: history.from || '',
                giftId: event.params.key
            },
            deepLink: '/store.html'
        });
    });

/* ------------------------------------------------------------------ */
/* 4) إشعار عند نكزة (Nudge) من صديق                                  */
/*    المسار: users/{receiverUid}/nudges/{nudgeId}                     */
/*    (مطابق لبنية النكزات في index.html: db.ref(`users/${friendId}/nudges`).push) */
/* ------------------------------------------------------------------ */
exports.notifyOnNudge = functions.database.onValueCreated('/users/{receiverUid}/nudges/{nudgeId}', async (event) => {
        const nudge = event.data.val() || {};
        const senderUid = String(nudge.fromUid || nudge.fromId || nudge.userId || '');
        const receiverUid = event.params.receiverUid;

        if (!senderUid || senderUid === receiverUid) return null;
        if (await isNotificationMuted(receiverUid, 'nudge')) return null;
        if (await isReceiverActiveOnline(receiverUid)) return null;

        const sender = await getUserProfile(senderUid);
        return notifyUser(receiverUid, {
            notification: {
                title: '👋 نكزة جديدة',
                body: `${sender.name} نكزك!`,
                image: sender.profileImage
            },
            data: {
                type: 'nudge',
                senderUid,
                senderName: sender.name
            },
            deepLink: '/'
        });
    });

/* ------------------------------------------------------------------ */
/* 5) تنظيف رموز FCM القديمة                                          */
/*    HTTP endpoint يُستدعى يدويًا أو من أي جدول خارجي                 */
/*    (خطة Spark لا تدعم Cloud Scheduler، لذا جعلناها قابلة          */
/*     للاستدعاء المباشر بدلًا من جدول داخلي)                          */
/*    firebase functions:shell ثم cleanupStaleTokens()                 */
/*    أو: curl URL الدالة بعد النشر                                    */
/* ------------------------------------------------------------------ */
exports.cleanupStaleTokens = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(204).send('');

    try {
        const snap = await admin.database().ref('users').once('value');
        const users = snap.val() || {};
        let cleaned = 0;
        const updates = {};

        for (const uid of Object.keys(users)) {
            const tokens = ((users[uid] && users[uid].fcmTokens) || {});
            for (const token of Object.keys(tokens)) {
                const info = tokens[token] || {};
                const ageHours = (Date.now() - (info.savedAt || Date.now())) / 3600000;
                if (ageHours > 720) { // 30 يومًا
                    updates[`users/${uid}/fcmTokens/${token}`] = null;
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) await admin.database().ref().update(updates);
        logger.info('cleanup done', { cleaned });
        return res.json({ ok: true, cleaned });
    } catch (err) {
        logger.error('cleanup failed', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});
