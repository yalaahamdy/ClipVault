<div align="center">

  <img src="./icon.png" alt="ClipVault Logo" width="128" height="128" style="border-radius: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);" />

  # ClipVault

  ### مدير الحافظة الأسرع والأكثر أناقة لنظام Windows
  **The Ultra-Fast, Private & Beautiful Local-First Clipboard Manager for Windows**

  [![Release](https://img.shields.io/badge/Release-v1.0.0-38bdf8?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/yalaahamdy/ClipVault/releases)
  [![License: MIT](https://img.shields.io/badge/License-MIT-4ade80?style=for-the-badge)](LICENSE)
  [![Rust](https://img.shields.io/badge/Rust-2021_Edition-f97316?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
  [![Tauri](https://img.shields.io/badge/Tauri-v2.0-24c8db?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
  [![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-a855f7?style=for-the-badge)](CONTRIBUTING.md)

  <p align="center">
    <a href="#-الميزات-الرئيسية">الميزات</a> •
    <a href="#-التحميل-والتثبيت">التحميل والتثبيت</a> •
    <a href="#-الاختصارات-السريعة">الاختصارات</a> •
    <a href="#-معاينة-المحتوى-الاحترافية">المعاينة الفائقة</a> •
    <a href="#-المعمارية-والأداء">المعمارية</a> •
    <a href="#-المساهمة">المساهمة</a>
  </p>

</div>

---

## 📖 نبذة عن المشروع (About ClipVault)

**ClipVault** هو تطبيق سطح مكتب متطور وخفيف للغاية مخصص لإدارة سجل الحافظة على أنظمة Windows 10 و 11. تم بناؤه باستخدام **Tauri v2** و **Rust** مع واجهة تفاعلية حديثة بـ **React 18 + TypeScript** لتقديم سرعة استجابة مذهلة مع استهلاك ذاكرة متواضع جداً (~15 إلى 35 ميجابايت مقارنة بأكثر من 200 ميجابايت في تطبيقات Electron التقليدية).

يعمل ClipVault **محلياً بنسبة 100% (Local-First)**؛ لا يتم إرسال أي بيانات أو نصوص أو صور عبر الإنترنت، مما يضمن أقصى درجات الخصوصية والأمان.

---

## ✨ الميزات الرئيسية (Key Features)

| التصنيف | المزايا والإمكانيات |
| :--- | :--- |
| ⚡ **السرعة والأداء** | مراقبة فورية لتغيرات الحافظة عبر `GetClipboardSequenceNumber` باستهلاك معالج شبه منعدم (<0.1% CPU) وقاعدة بيانات SQLite عالية السرعة بوضع WAL. |
| 🎯 **تعدد الصيغ** | دعم كامل للنصوص العادية، الأكواد البرمجية، الروابط، الصور (PNG, JPEG, WebP, SVG, GIF, BMP, ICO)، الملفات، ومستندات HTML المنسقة. |
| 🎨 **تصميم عصري ثلاثي الأبعاد** | واجهة انسيابية بزجاج شفاف (Windows Acrylic)، دعم كامل للغة العربية (RTL)، أزرار مجسمة ذات تأثير نقر واقعي، ومظهر داكن/فاتح ذكي. |
| 🔍 **البحث والتنظيم** | بحث فوري حي بمجرد البدء بالكتابة، وسوم بألوان مخصصة، مجموعات Collections، مفضلة، وتثبيت دائم للعناصر الهامة. |
| 🛡️ **خصوصية صارمة** | قائمة استثناءات للتطبيقات الحساسة (مثل مديري كلمات المرور)، إيقاف مؤقت للتسجيل، حجب المحتوى الحساس، وعدم وجود أي اتصال بالإنترنت. |
| 🪟 **تكامل تام مع Windows** | اختصار تشغيل عام قابل للتخصيص (`Ctrl+Shift+V`)، قائمة أيقونة صينية النظام (System Tray)، ومثبت NSIS نظيف مدمج بالأيقونة الرسمية. |

---

## 🖥️ معاينة المحتوى الاحترافية (Universal Pro Preview)

يتضمن ClipVault نافذة معاينة شاملة مدمجة تدعم أدوات تفاعلية لكل نوع محتوى:

### 1. 🌐 محرر ومعاين HTML الفائق
- **عرض حي تفاعلي (Live Render)** داخل بيئة معزولة Sandbox مع إمكانية التبديل السريع بين مقاس الحاسوب ومقاس شاشات الهواتف الذكية (375px).
- **أداة التنسيق الذاتي (HTML Beautifier)**: إعادة تنظيم وترتيب الشفرات المتراصة بإزاحات ومسافات هندسية متناسقة.

### 2. 📝 عارض Markdown العصري (Notion & GitHub Inspired)
- دعم كامل لتنبيهات GitHub الملونة:
  - `> [!NOTE]` — ملاحظة هامة ℹ️
  - `> [!TIP]` — نصيحة مفيدة 💡
  - `> [!IMPORTANT]` — تنبيه فائق الأهمية 📌
  - `> [!WARNING]` — تحذير وتنبيه ⚠️
  - `> [!CAUTION]` — خطر 🛑
- جداول ثلاثية الأبعاد بأسلوب Notion مع صفوف متبادلة ومحاذاة خلايا متقنة.
- تلوين الشفرات البرمجية المدمجة مع شارة لغة البرمجة وزر نسخ مستقل.
- قوائم مهام تفاعلية بصناديق اختيار `- [ ]` و `- [x]`.

### 3. 💻 تلوين الأكواد البرمجية (Tokyo Night & One Dark Pro)
- تلوين دقيق لكافة اللغات (HTML, TypeScript, JavaScript, Python, Rust, SQL, CSS, JSON).
- تمييز الألوان: وسوم HTML بالمرجاني الوردي `#f7768e`، الخصائص بالبنفسجي `#bb9af7`، والنصوص بالأخضر الزمردي `#9ece6a`.
- زر تفعيل/إلغاء **التفاف الأسطر الطويلة (Word Wrap)** وشريط ترقيم أسطر أنيق.

### 4. 🖼️ عارض الصور المتقدم
- تكبير وتصغير سلس (Zoom)، تدوير بمقدار 90 درجة، سحب وإزاحة (Pan).
- خلفية شفافة منقطة (Checkerboard Grid) قابلة للتبديل.
- عرض أبعاد الصورة ونسبة العرض إلى الارتفاع وحجم الملف بدقة.

---

## ⌨️ الاختصارات السريعة (Keyboard Shortcuts)

| الاختصار | الإجراء |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> | فتح أو إخفاء الحافظة من أي مكان في النظام |
| <kbd>↑</kbd> <kbd>↓</kbd> / <kbd>Shift</kbd> + <kbd>↑↓</kbd> | التنقل بالأسهم بين العناصر / قفز سريع |
| <kbd>Enter</kbd> | نسخ العنصر المحدد ولصقه وإخفاء النافذة |
| <kbd>Space</kbd> | فتح نافذة المعاينة الشاملة للعنصر المحدد |
| <kbd>Delete</kbd> | حذف العنصر من السجل |
| <kbd>Ctrl</kbd> + <kbd>1…7</kbd> | التصفية السريعة (الكل، نصوص، روابط، صور، ملفات، مفضلة، مثبت) |
| <kbd>Ctrl</kbd> + <kbd>,</kbd> | فتح نافذة الإعدادات |
| <kbd>Ctrl</kbd> + <kbd>T</kbd> | تبديل مظهر الواجهة (داكن / فاتح) |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd> | فتح لوحة إدارة الوسوم والمجموعات |
| <kbd>Esc</kbd> | إغلاق النوافذ المنبثقة أو إخفاء الحافظة |

---

## 🚀 التحميل والتثبيت (Download & Install)

### الطريقة المباشرة (المثبت الرسمي)
يمكنك تحميل أحدث نسخة من مثبت البرنامج لنظام Windows 64-bit مباشرة من صفحة [Releases](https://github.com/yalaahamdy/ClipVault/releases):
- **الملف:** `ClipVault_1.0.0_x64-setup.exe`
- **الحجم:** خفيف جداً (~5MB إلى 10MB)
- **المتطلبات:** Windows 10 أو Windows 11

> **ملاحظة حول Windows SmartScreen:** نظراً لأن الحزمة مفتوحة المصدر ومبنية محلياً دون شهادة توقيع مدفوعة، قد يظهر تحذير أمان خفيف عند أول تشغيل؛ اضغط على *"More info"* ثم *"Run anyway"*. الشفرة مفتوحة ومتاحة بالكامل للمراجعة.

---

## 🏗️ المعمارية والتقنيات (Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Windows 10 / 11 Desktop                         │
│   Global Hotkey (Ctrl+Shift+V)         System Tray (قائمة مخصصة)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Frontend (React 18 + TypeScript)                     │
│  • Acrylic Frameless Window with Auto-hide on Blur                     │
│  • IBM Plex Sans Arabic Typography (Native RTL)                        │
│  • Universal Preview Modal (HTML Live, Tokyo Night Code, Markdown)     │
│  • Instant Search Engine & Virtualized Dynamic List                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Backend (Tauri v2 + Rust)                       │
│  • Windows Clipboard API: Sequence Number Polling (~0% CPU)           │
│  • Native Multi-Format I/O: CF_UNICODETEXT, HDROP, PNG, DIB, HTML      │
│  • SQLite Storage with WAL Mode & SHA-256 Deduplication                │
│  • Fully Sandboxed & Zero Outbound Network Activity                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ البناء من المصدر (Building from Source)

إذا كنت مطوراً وترغب في بناء المشروع بنفسك:

### 1. المتطلبات
- [Node.js](https://nodejs.org/) (v20 أو أحدث)
- [Rust & Cargo](https://rustup.rs/) (Stable toolchain)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/) مع حزمة *Desktop development with C++*.

### 2. خطوات البناء
```bash
# استنساخ المستودع
git clone https://github.com/yalaahamdy/ClipVault.git
cd ClipVault

# تثبيت الحزم البرمجية
npm install

# تشغيل بيئة التطوير مع التحديث الحي
npm run tauri dev

# تجميع مثبت الإنتاج النهائي (NSIS)
npm run tauri build
```
الملف التنفيذي والمثبت سينتج داخل المسار:
`src-tauri/target/release/bundle/nsis/ClipVault_1.0.0_x64-setup.exe`

---

## 🤝 المساهمة (Contributing)

المساهمات مرحب بها للغاية! إذا كان لديك اقتراح لتحسين الأداء، إضافة ميزة جديدة، أو إصلاح مشكلة، يسعدنا مراجعة مساهمتك:
1. راجع [دليل المساهمة (CONTRIBUTING.md)](CONTRIBUTING.md).
2. التزم بـ [ميثاق السلوك (CODE_OF_CONDUCT.md)](CODE_OF_CONDUCT.md).
3. افتح Issue أو Pull Request وسنتفاعل معك بسرعة.

---

## 📄 الترخيص (License)

هذا المشروع مرخص تحت رخصة **MIT** — راجع ملف [LICENSE](LICENSE) لمزيد من التفاصيل.
الأيقونات مستوحاة من مكتبة [Lucide Icons](https://lucide.dev/) المرخصة برخصة ISC.

<div align="center">
  <sub>صُنع بكل حب وإتقان ليكون أسرع وأجمل مدير حافظة على نظام Windows 💙</sub>
</div>
