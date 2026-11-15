# Zeweil Chat Android

هذا مجلد تطبيق Capacitor لتشغيل نفس موقع ZEWEIL CHAT داخل Android. التطبيق يستخدم `com.zeweil.chat` ويرتبط بنفس مشروع Firebase `zeweil-chat`.

## التجهيز المحلي

ضع ملف `google-services.json` داخل `android/app/` بعد إنشاء منصة Android، ولا ترفعه إلى GitHub. من هذا المجلد شغّل `npm install` ثم `npm run cap:sync`. سكربت `sync-web.mjs` ينسخ ملفات الموقع الحالية، بما فيها `Store.html` وملفات العملات، إلى حزمة التطبيق.

## الإشعارات

إشعارات اتصال الأصدقاء تعتمد على Cloudflare Worker عبر WebSocket، مثل نسخة الويب. عند فتح التطبيق يتصل `zeweil-fcm.js` بـ `zeweil-online-push` ويرسل معرّف المستخدم وقائمة الأصدقاء؛ لا يتم تسجيل FCM token ولا استخدام Firebase Messaging.

## APK/AAB

بعد تثبيت Android SDK وJava 17 وGradle wrapper الناتج من Capacitor، استخدم Android Studio أو `./android/gradlew assembleDebug` لنسخة الاختبار، و`./android/gradlew bundleRelease` لنسخة AAB بعد إعداد توقيع إصدار.
