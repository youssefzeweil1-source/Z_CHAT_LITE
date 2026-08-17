# إشعارات الدفع (FCM) — دليل التشغيل السريع

هذا الفرع يحتوي على كل شيء جاهز لإشعارات الدفع الحقيقية في ZEWEIL CHAT.

## ما تم إنجازه

1. **firebaseConfig** في `index.html` تم تحديثه بإضافة `messagingSenderId` و `appId` و `storageBucket` (مطلوبة لعمل FCM).
2. **VAPID Key** تم توليده من Firebase Console > Settings > Cloud Messaging (تحت Web Push certificates).
3. **`firebase-messaging-sw.js`** — Service Worker جديد لإشعارات الخلفية (عندما يكون الموقع مقفولًا).
4. **`zeweil-fcm.js`** — يسجل المتصفح، يحصل على رمز FCM، ويحفظه في قاعدة البيانات تحت `users/{uid}/fcmTokens/`.
5. **`firebase_functions_deploy/`** — يحتوي Cloud Functions الجاهزة للنشر:
   - `functions/index.js` — 4 مشغلات: رسالة خاصة، طلب صداقة، هدية عملات، نكزة
   - `package.json` + `firebase.json` — التهيئة كاملة

## الخطوات المتبقية (3 خطوات فقط)

### 1. دمج الفرع في main
```bash
git merge fcm-notifications-integration
git push origin main
```
أو عبر GitHub: افتح Pull Request من فرع `fcm-notifications-integration` إلى `main`.

### 2. رفع الملفات على الاستضافة
تأكد أن هذه الملفات موجودة في جذر الموقع (نفس مكان index.html):
- `index.html` (المحدّث)
- `firebase-messaging-sw.js`
- `zeweil-fcm.js`
- `sw.js` (موجود بالفعل — لا تلمسه)

### 3. نشر Cloud Functions
```bash
cd firebase_functions_deploy
npm install
firebase use zeweil-chat   # أو: firebase init (اختر المشروع zeweil-chat)
firebase deploy --only functions
```

## بعد التشغيل
- عند دخول المستخدم ومنحه إذن الإشعارات، يُسجل رمزه تلقائيًا.
- الإشعارات تصل تلقائيًا: رسالة خاصة جديدة، طلب صداقة، هدية عملات، نكزة.
- المستخدم يستطيع التحكم من خلال `ZeweilFCM.enable()` / `ZeweilFCM.disable()`.

## ملاحظات
- كل شيء يعمل على خطة Firebase المجانية (Spark).
- Cloud Functions تُشغَّل عبر `firebase deploy --only functions` من أي جهاز به Firebase CLI.
