# إشعارات شات الأصدقاء

تمت إضافة أجزاء FCM للويب وAndroid: `zeweil-fcm.js` لتسجيل المتصفح، و`zeweil-native-push.js` لتسجيل FCM native داخل تطبيق Capacitor، و`firebase-messaging-sw.js` للإشعارات أثناء إغلاق الصفحة، و`functions/index.js` لإرسال FCM عند إنشاء رسالة جديدة أو عند انتقال صديق إلى online.

## التفعيل مرة واحدة

1. من Firebase Console افتح **Project settings → Cloud Messaging → Web configuration** وأنشئ Web Push certificate، ثم انسخ مفتاح **VAPID**.
2. في `index.html` تأكد أن مفتاح VAPID مضبوط قبل تحميل `zeweil-fcm.js` (المفتاح موجود بالفعل في النسخة الحالية). تطبيق Android لا يحتاج VAPID؛ يستخدم ملف `google-services.json` الموجود محليًا داخل `android-app/android/app/`:

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
firebase deploy --only functions:notifyFriendChatMessage,functions:notifyFriendOnline
```

4. يجب فتح الموقع عبر HTTPS أو `localhost`، ثم افتح الإعدادات ⚙️ واضغط زر إشعارات رسائل الأصدقاء مرة واحدة واسمح بالإشعارات. في تطبيق Android سيظهر طلب الإذن داخل التطبيق، ثم يُسجّل التوكن تلقائيًا. سيُحفظ كل توكن في `users/{uid}/fcmTokens` مع `platform: web` أو `platform: android`، وتُرسل دالة `notifyFriendOnline` رسالة باسم الصديق عند انتقاله إلى online.

## ملاحظات

- مفتاح Firebase الظاهر في تطبيق الويب ليس سرًا؛ الحماية الحقيقية يجب أن تكون في Realtime Database Rules وFirebase Authentication.
- لا يمكن إرسال Push حقيقي من `Test.html` وحده؛ الإرسال الآمن يحتاج Cloud Function أو خادمًا موثوقًا، لأن مفتاح Firebase Admin لا يجب وضعه في المتصفح.
- الإشعار لا يُرسل للمرسل نفسه، ويُنظّف التوكنات المنتهية تلقائيًا.
