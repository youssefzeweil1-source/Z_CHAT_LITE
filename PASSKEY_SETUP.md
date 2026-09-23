# إعداد قفل الغرف بالبصمة / Face ID

الميزة تستخدم **WebAuthn (Passkeys)**. المتصفح أو نظام الجهاز يتحقق من البصمة أو Face ID؛ لا تُرسل أي بيانات حيوية إلى التطبيق أو Firebase.

## قبل النشر

1. ثبّت اعتماد Cloud Functions الجديد من مجلد `functions`:

   ```bash
   npm install
   ```

2. انسخ `functions/.env.example` إلى `functions/.env` واضبط القيم على نطاق Hosting الفعلي. يجب أن يكون `PASSKEY_RP_ID` اسم المضيف فقط، بينما يجب أن يطابق `PASSKEY_ORIGIN` العنوان الكامل الذي يفتح منه المستخدم التطبيق.

3. انشر الدوال والاستضافة:

   ```bash
   firebase deploy --only functions,hosting
   ```

4. طبّق قواعد Realtime Database تمنع العملاء من الكتابة إلى `roomPasskeys` ومن تغيير `rooms/{room}/settings/biometricLock` مباشرة؛ هذه المسارات يجب أن تعدّلها Cloud Functions فقط.

## السلوك

* منشئ الغرفة يفعّل القفل من **إعدادات الغرفة ← الأمان** ويسجّل Passkey لجهازه.
* عند الدخول، يحاول التطبيق التحقق بالبصمة/Face ID أولاً. إذا لم يكن لهذا الحساب Passkey مسجّل، تظل كلمة مرور الغرفة وسيلة الدخول الاحتياطية.
* لا يعمل WebAuthn إلا عبر HTTPS وعلى متصفح وجهاز يدعمان Passkeys.
