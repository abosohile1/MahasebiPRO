# محاسبي PRO V6 — بناء APK من الهاتف عبر GitHub

هذه الحزمة مجهزة بحيث يقوم GitHub Actions ببناء APK على خوادم GitHub، دون AndroidIDE أو Android Studio على الهاتف.

## الخطوات السهلة

1. أنشئ حسابًا مجانيًا في GitHub.
2. أنشئ Repository جديدًا، ويفضل أن يكون Private.
3. فك ضغط هذه الحزمة.
4. ارفع **محتويات** مجلد `mahasebi_phone_build` إلى الـRepository، بما فيها مجلد `.github`.
5. افتح تبويب **Actions** في Repository.
6. اختر **Build Mahasebi PRO APK**.
7. اضغط **Run workflow** ثم **Run workflow** مرة أخرى.
8. انتظر حتى تظهر علامة النجاح الخضراء.
9. افتح عملية البناء الناجحة.
10. في أسفل الصفحة ستجد **Artifacts** ثم `mahasebi-pro-v6-debug-apk`.
11. نزّل ملف الـZIP، فك ضغطه، وستجد `app-debug.apk`.
12. افتح APK على الهاتف وثبته.

## إذا لم يظهر Actions

اذهب إلى:
Settings → Actions → General
وتأكد من السماح بتشغيل Actions.

## ملاحظات

- ملف APK الناتج Debug وليس نسخة Google Play النهائية.
- لا تضع كلمات مرور أو مفاتيح الخادم داخل Repository عام.
- يظل إعداد Phone Server + Client منفصلًا عن عملية بناء APK.
