# Zeweil Chat Android

هذا مجلد تطبيق Capacitor لتشغيل نفس موقع ZEWEIL CHAT داخل Android. التطبيق يستخدم `com.zeweil.chat` ويرتبط بنفس مشروع Firebase `zeweil-chat`.

## التجهيز المحلي

ضع ملف `google-services.json` داخل `android/app/` بعد إنشاء منصة Android، ولا ترفعه إلى GitHub. من هذا المجلد شغّل `npm install` ثم `npm run cap:sync`. سكربت `sync-web.mjs` ينسخ ملفات الموقع الحالية، بما فيها `Store.html` وملفات العملات، إلى حزمة التطبيق.

## الإشعارات

الإشعارات الأصلية تستخدم Capacitor Push Notifications. عند أول تسجيل دخول سيطلب التطبيق إذن الإشعارات، ثم يحفظ FCM token تحت `users/{uid}/fcmTokens` مع `platform: android`. دالة Firebase `notifyFriendOnline` ترسل إشعارًا عندما ينتقل صديق إلى online.

## APK/AAB

بعد تثبيت Android SDK وJava 17 وGradle wrapper الناتج من Capacitor، استخدم Android Studio أو `./android/gradlew assembleDebug` لنسخة الاختبار، و`./android/gradlew bundleRelease` لنسخة AAB بعد إعداد توقيع إصدار.
