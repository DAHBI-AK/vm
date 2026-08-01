# 🚀 دليل رفع ونشر التطبيق على Google Play Store (Step-by-step Publishing Guide)

هذا الدليل يوضح خطوات استخراج ملف الـ **Android App Bundle (.aab)** وملف الـ **APK** لنشر التطبيق في متجر Google Play.

---

## 🛠️ الخطوة 1: استخراج ملف الـ APK و AAB مجاناً بنقرة واحدة (PWABuilder)

1. اذهب لموقع **[PWABuilder.com](https://www.pwabuilder.com)** (المنصة الرسمية المعتمدة من مايكروسوفت لنشر التطبيقات على جوجل بلاي).
2. ضع رابط التطبيق المرفوع سحابياً (مثال: `https://vm-downloader.onrender.com`).
3. اضغط **Start** ثم **Package for Store**.
4. اختر **Android** واضغط **Options**.
5. أدخل البيانات التكميلية:
   - **Package ID:** `com.vm.downloader.mobile`
   - **App Name:** `VM Mobile`
   - **App Version:** `1.0.0` (Code: 1)
6. اضغط **Download Package**.
7. ستحصل فوراً على ملف مضغوط يحتوي على:
   - `app-release-signed.aab` (الملف الرسمي للرفع على متجر جوجل بلاي).
   - `app-debug.apk` (الملف للتثبيت المباشر على الهاتف).

---

## 📱 الخطوة 2: النشر على حساب Google Play Console

1. اذهب إلى [Google Play Console](https://play.google.com/console).
2. اضغط **Create App** (إنشاء تطبيق جديد).
3. أدخل اسم التطبيق: `VM Mobile — HD Video Downloader`.
4. املأ بيانات النشر من ملف `STORE_LISTING.md` (العنوان والوصف بالعربية والإنجليزية والفرنسية).
5. في قسم **App Releases** ➔ اضغط **Create New Release**.
6. ارفع ملف `app-release-signed.aab` الذي قمت بتنزيله من PWABuilder.
7. اضغط **Save & Review Release** ثم **Start Rollout to Production**.

🎉 **مبروك! سيتم مراجعة تطبيقك ونشره رسمياً على متجر Google Play خلال ساعات!**
