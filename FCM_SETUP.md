# إشعارات الاتصال عبر Cloudflare

تم إلغاء Firebase Cloud Messaging من مسار الإشعارات. Firebase ما زال مستخدمًا للهوية وRealtime Database والحضور، لكن إشعار اتصال الصديق يمر الآن عبر Worker `zeweil-online-push` في Cloudflare باستخدام WebSocket وDurable Object.

## التشغيل

يجب أن يكون الموقع على HTTPS. عند تسجيل الدخول، يفتح `zeweil-fcm.js` اتصال WebSocket مع Cloudflare ويرسل معرّف المستخدم وقائمة أصدقائه. عندما يفتح صديق الموقع، يرسل Worker حدثًا للمستخدمين المتصلين المهتمين به، وتعرض الواجهة إشعارًا داخل التطبيق، كما تستخدم `showNotification()` إذا كانت الصفحة في الخلفية.

لا توجد مفاتيح VAPID أو FCM tokens أو Firebase Messaging Service Worker في هذا المسار.
