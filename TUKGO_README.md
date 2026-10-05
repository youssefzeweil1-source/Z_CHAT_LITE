# TukGo Pages

أضيفت صفحات TukGo إلى هذا المستودع بدون استبدال تطبيق Zeweil Chat الحالي:

- [TukGo للعملاء والسائقين](./tukgo.html)
- [TukGo Admin](./tukgo-admin.html)
- الصفحة الأصلية للمستودع: [index.html](./index.html)

## Firebase

الصفحتان تستخدمان Firebase Web SDK لمشروع `tukgo-c906b`.
فعّل من Firebase Authentication:

- Google
- Phone
- Anonymous (لدخول الزائر)

ولصفحة الإدارة، غيّر قائمة `ADMIN_EMAILS` داخل `tukgo-admin.html` أو انقل التحقق لاحقًا إلى Custom Claims / Cloud Functions. قائمة البريد داخل الواجهة ليست حماية نهائية وحدها.
