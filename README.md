# 🚀 VM — Video Manager Pro (Portable & Multi-Platform)

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Electron](https://img.shields.io/badge/Electron-30.0.0-47848F.svg)
![Node](https://img.shields.io/badge/Node.js-24.x-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)

تطبيق احترافي متكامل لتحميل وتعديل الفيديوهات من أكثر من 100 منصة عالمية (YouTube, TikTok, Instagram, Facebook, Twitter/X, Pinterest, Twitch, LinkedIn, Threads, Rumble, VK, Telegram, Bilibili, Vimeo, Dailymotion, Reddit) بسرعات فائقة وجودات تصل إلى 4K / 1080p Full HD.

---

## 🌟 الميزات الرئيسية (Core Features)

- **⚡ وضع التوربو الفائق (Turbo Mode):** تسريع التنزيل باستخدام اتصالات متعددة الخيوط وفصل خوادم البث.
- **🎧 محسن الصوت الاحترافي (Audio Enhancer HD):** معالجة تلقائية لصوت الفيديو وترشيح الضوضاء وزيادة النقاء.
- **✂️ استوديو قص المقاطع (Clip Studio):** قص أي جزء زمني محدد من الفيديو بدقة ملي-ثانية مع التصدير المباشر.
- **🖼️ استوديو استخراج الصور (Frame & Thumbnail Extractor):** استخراج الغلاف الأصلي أو أخذ لقطة إطار عالية الجودة (JPG, PNG, WEBP).
- **📋 سلسلة روابط بدون قيود (Unlimited Batch Queue):** لصق قائمة روابط متعددة وتنزيلها تلقائياً بالترتيب.
- **🌐 دعم أكثر من 100 منصة:** دعم شامل لكافة المنصات العالمية والعربية مع التكيف التلقائي.
- **🌍 دعم 3 لغات:** العربية (افتراضي مع واجهة RTL كاملة)، الفرنسية (Français)، والإنجليزية (English).
- **📁 زر الحافظة والمسار وتنقّل سريع:** زر اختيار مسار التنزيل وفتح مجلد آخر فيديو تم تحميله فوراً.

---

## 🤖 استوديو الترجمة والدبلجة بالذكاء الاصطناعي (AI Dubbing & Subtitling Engine)

- **دبلجة ذكية (AI Smart Dubbing):** توليد صوت آلي مدبلج بالذكاء الاصطناعي باللغة العربية والإنجليزية والفرنسية ومزامنته مع الفيديو.
- **ترجمة نصية مدمجة (Burned-in Subtitles):** جلب ونقل أو ترجمة التسميات التوضيحية طباعياً على الفيديو.
- **دبلجة وترجمة معاً (Dubbing + Subtitles Combined):** دمج الصوت المدبلج مع الترجمة المطبوعة خطياً وتنعيم الصوت دون تداخل.

---

## 📁 هيكلية النسخ والتوزيعات (Project Versions)

يحتوي المستودع على **4 توزيعات مخصصة بجميع الملفات**:

1. **`VM-Portable` (النسخة الأصلية الشاملة - الجذر):** النسخة المحمولة الكاملة المحتوية على استوديو الترجمة والدبلجة بالذكاء الاصطناعي وكافة أدوات الإنتاج.
2. **[`versions/VM-PC`](./versions/VM-PC) (نسخة الكمبيوتر المجهزة):** نسخة حواسيب سريعة ومصممة بأداء عالٍ (بدون تبويب الدبلجة).
3. **[`versions/VM-Mobile`](./versions/VM-Mobile) (نسخة الجوال اللمسية):** نسخة متجاوبة للمس مع واجهة مرنة للهواتف الذكية والأجهزة اللوحية.
4. **[`versions/VM-Web`](./versions/VM-Web) (نسخة الويب — VIPD.SHOP):** تطبيق ويب مستقل يستند لـ Node.js Server ويدعم التحميل المباشر من المتصفح.

---

## 🛠️ التثبيت والتشغيل (Setup & Run)

### 1. المتطلبات الأساسية
- Node.js (v18+)
- Electron (v30+)
- `yt-dlp` (مدمج في `bin/yt-dlp.exe`)
- `ffmpeg` (مدمج عبر `ffmpeg-static`)

### 2. التشغيل المباشر
```bash
# تشغيل التطبيق في بيئة التطوير
npm start

# أو استخدام النص المحمول
VM.bat
```

### 3. تشغيل نسخة الويب VIPD.SHOP (`B:\VM-Web`)
```bash
cd B:\VM-Web
npm start
# أو الضغط على START_WEB.bat
```

---

## 🔒 حماية الأخطاء والاستقرار (Stability & Security)

- معالجة تلقائية لخطأ `HTTP Error 403: Forbidden` عبر ممر الأوامر `youtube:player_client=android,web`.
- معالجة نصوص VTT/SRT لمنع التكرار التراكمي للجمل (Rolling Captions Filter).
- ذاكرة مؤقتة فائقة السرعة لمنع إعادة جلب بيادق الفيديو المكررة.

---

## 📝 الترخيص (License)

تطبيق **VIPD.SHOP / VM Pro** مرخص تحت رخصة MIT. جميع الحقوق محفوظة © 2026.
