# إشعارات شات الأصدقاء

تمت إضافة ثلاثة أجزاء: `zeweil-fcm.js` لتسجيل المتصفح، و`firebase-messaging-sw.js` للإشعارات أثناء إغلاق الصفحة، و`functions/index.js` لإرسال FCM عند إنشاء رسالة جديدة في `friendChats/{chatId}/messages/{messageId}`.

## التفعيل مرة واحدة

1. من Firebase Console افتح **Project settings → Cloud Messaging → Web configuration** وأنشئ Web Push certificate، ثم انسخ مفتاح **VAPID**.
2. قبل `zeweil-fcm.js` في `Test.html` أضف:

```html
<script>
  window.ZEWEIL_FCM_VAPID_KEY = 'ضع_مفتاح_VAPID_هنا';
</script>
```

3. شغّل `npm install` داخل مجلد `functions` ثم انشر الـ Function من جذر المشروع:

```bash
firebase login
firebase use zeweil-chat
cd functions && npm install && cd ..
firebase deploy --only functions:notifyFriendChatMessage
```

4. يجب فتح الموقع عبر HTTPS أو `localhost`، ثم استدعاء `enableFriendChatPushNotifications()` من زر واضح للمستخدم؛ المتصفح سيطلب إذن الإشعارات. التوكن يُحفظ في `users/{uid}/fcmTokens`.

## ملاحظات

- مفتاح Firebase الظاهر في تطبيق الويب ليس سرًا؛ الحماية الحقيقية يجب أن تكون في Realtime Database Rules وFirebase Authentication.
- لا يمكن إرسال Push حقيقي من `Test.html` وحده؛ الإرسال الآمن يحتاج Cloud Function أو خادمًا موثوقًا، لأن مفتاح Firebase Admin لا يجب وضعه في المتصفح.
- الإشعار لا يُرسل للمرسل نفسه، ويُنظّف التوكنات المنتهية تلقائيًا.
