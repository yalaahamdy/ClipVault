/** Vault (PasswordVault.tsx) dictionary — flat dotted keys.
 *  Arabic is the source of truth; keys used as t("vault.<key>"). */

export const vaultAr: Record<string, string> = {
  "strength.veryWeak": "ضعيفة جداً",
  "strength.weak": "ضعيفة",
  "strength.medium": "متوسطة",
  "strength.strong": "قوية",
  "strength.super": "خارقة الأمان",
  // Generic
  "loading": "جارٍ تجهيز الخزينة المشفرة...",

  // Setup screen (first run)
  "setup.title": "إنشاء خزينة كلمات المرور",
  "setup.desc1": "قم بتعيين رمز مرور رئيسي (PIN أو كلمة سر). تُشفر بياناتك محلياً 100% بخوارزمية",
  "setup.desc2": "ولا يمكن لأحد فتحها بدون هذا الرمز.",
  "setup.newPin": "رمز المرور الرئيسي الجديد",
  "setup.newPinPh": "أدخل 4 خانات على الأقل...",
  "setup.confirmPin": "تأكيد رمز المرور",
  "setup.confirmPinPh": "أعد إدخال الرمز لتأكيده...",
  "setup.cta": "تأمين وإنشاء الخزينة",

  // Locked screen
  "lock.title": "الخزينة مقفلة بأمان",
  "lock.desc": "أدخل رمز المرور لفك تشفير وعرض حساباتك وكلمات مرورك المحمية.",
  "lock.pinPh": "أدخل رمز المرور...",
  "lock.cta": "فتح الخزينة",
  "lock.stats": "محفوظات مشفرة: {count} عنصر",

  // Toasts & feedback
  "toast.unlocked": "تم فتح خزينة كلمات المرور بأمان",
  "toast.setupDone": "تم إنشاء وتأمين القبو بنجاح!",
  "toast.locked": "تم قفل الخزينة بنجاح",
  "toast.copied": "تم نسخ {label} (سيُمسح من الحافظة بعد 30 ثانية للأمان)",
  "toast.copyFailed": "فشل في نسخ النص",
  "toast.deleted": "تم حذف العنصر بنجاح",
  "toast.titleRequired": "يرجى إدخال عنوان للعنصر",
  "toast.saved": "تم حفظ بيانات الحساب بنجاح",
  "toast.exported": "تم تصدير كلمات المرور بصيغة Chrome CSV بنجاح!",
  "toast.importedChrome": "تم بنجاح استيراد وتشفير {count} حساباً من Chrome Passwords.csv!",
  "toast.importedCsv": "تم بنجاح استيراد وتشفير {count} حساباً من ملف CSV!",
  "toast.generated": "تم توليد كلمة مرور قوية وتعبئتها",

  // Errors & confirms
  "error.pinShort": "يجب أن يتكون رمز المرور من 4 خانات على الأقل",
  "error.pinMismatch": "رمزا المرور غير متطابقين",
  "confirm.delete": "هل أنت متأكد من رغبتك في حذف هذا العنصر نهائياً؟",

  // Copy-secret labels (interpolated into toast.copied)
  "label.username": "اسم المستخدم",
  "label.password": "كلمة المرور",
  "label.cardNumber": "رقم البطاقة",
  "label.generated": "كلمة المرور المولدة",

  // Top search & quick actions
  "action.searchPh": "بحث في الحسابات، المواقع، الملاحظات...",
  "action.clearTitle": "مسح",
  "action.newTitle": "إضافة حساب أو بطاقة جديدة",
  "action.new": "عنصر جديد",
  "action.lockTitle": "قفل الخزينة فوراً",
  "action.lock": "قفل",

  // Category chips
  "cat.allTitle": "عرض كافة العناصر المحفوظة",
  "cat.all": "الكل",
  "cat.loginTitle": "حسابات ومواقع الويب",
  "cat.login": "حسابات",
  "cat.cardTitle": "بطاقات الدفع والائتمان",
  "cat.card": "بطاقات دفع",
  "cat.noteTitle": "ملاحظات سرية وبيانات خاصة",
  "cat.note": "ملاحظات سرية",
  "cat.favTitle": "العناصر المفضلة",
  "cat.fav": "المفضلة",

  // Tool chips
  "tool.genTitle": "مولد كلمات مرور قوية وعبارات سرية",
  "tool.gen": "مولد المرور",
  "tool.auditTitle": "فحص أمان وصحة كلمات المرور وكشف المكرر والضعيف",
  "tool.audit": "فحص الأمان",
  "tool.importTitle": "استيراد كلمات المرور من Chrome أو ملف CSV",
  "tool.import": "استيراد CSV",
  "tool.exportTitle": "تصدير كلمات المرور بصيغة Chrome CSV",
  "tool.export": "تصدير CSV",

  // Empty state
  "empty.noResults": "لا توجد نتائج مطابقة لبحثك",
  "empty.none": "لا توجد عناصر في هذا القسم بعد",
  "empty.noResultsHint": "جرّب كلمات بحث أخرى أو امسح الفلتر",
  "empty.hint": "اضغط على «عنصر جديد» لإضافة وتأمين أول حساب أو بطاقة في الخزينة.",

  // Item cards
  "card.copyUsername": "نسخ اسم المستخدم",
  "card.favorite": "إضافة إلى المفضلة",
  "card.unfavorite": "إزالة من المفضلة",
  "card.openWebsite": "فتح الموقع في المتصفح",
  "card.showPassword": "إظهار كلمة المرور",
  "card.hidePassword": "إخفاء كلمة المرور",
  "card.copyPassword": "نسخ كلمة المرور بأمان",
  "card.expiry": "الانتهاء: {value}",
  "card.show": "إظهار",
  "card.hide": "إخفاء",
  "card.editTitle": "تعديل بيانات الحساب",
  "card.edit": "تعديل",
  "card.deleteTitle": "حذف العنصر",

  // Add / Edit item modal
  "edit.titleEdit": "تعديل العنصر المحمي",
  "edit.titleNew": "إضافة عنصر جديد في الخزينة",
  "edit.type": "نوع العنصر",
  "edit.catLogin": "حساب موقع / تطبيق",
  "edit.catCard": "بطاقة دفع",
  "edit.catNote": "ملاحظة مشفرة",
  "edit.titleLabel": "العنوان / اسم الخدمة *",
  "edit.titlePh": "مثال: Google, GitHub, Netflix...",
  "edit.username": "اسم المستخدم / البريد الإلكتروني",
  "edit.password": "كلمة المرور",
  "edit.generate": "توليد كلمة قوية",
  "edit.passwordPh": "أدخل كلمة المرور أو ولّد واحدة قوية...",
  "edit.website": "رابط الموقع (اختياري)",
  "edit.cardNumber": "رقم البطاقة",
  "edit.cardExpiry": "تاريخ الانتهاء",
  "edit.cardCvv": "رمز الأمان (CVV)",
  "edit.notes": "ملاحظات مشفرة إضافية (اختياري)",
  "edit.notesPh": "أي معلومات حساسة أخرى...",
  "edit.cancel": "إلغاء",
  "edit.save": "حفظ العنصر المشفر",

  // Password generator modal
  "gen.title": "مولد كلمات المرور الاحترافي",
  "gen.regenerate": "إعادة التوليد",
  "gen.copyNow": "نسخ فوري",
  "gen.modeRandom": "أحرف ورموز عشوائية",
  "gen.modePassphrase": "عبارة مرور سهلة الحفظ",
  "gen.length": "الطول: {count} حرفاً",
  "gen.uppercase": "أحرف كبيرة (A-Z)",
  "gen.lowercase": "أحرف صغيرة (a-z)",
  "gen.numbers": "أرقام (0-9)",
  "gen.symbols": "رموز خاصة (!@#$%)",
  "gen.avoidAmbiguous": "تجنب الرموز المتشابهة (0, O, l, 1)",
  "gen.passphraseInfo": "تتكون عبارة المرور من 4 كلمات بالإنجليزية يسهل تذكرها مع فواصل آمنة.",
  "gen.newPassphrase": "توليد عبارة جديدة",
  "gen.copyClose": "نسخ وإغلاق",

  // Security audit modal
  "audit.title": "تقرير فحص أمان كلمات المرور",
  "audit.strong": "كلمات قوية وآمنة",
  "audit.weak": "كلمات ضعيفة",
  "audit.reused": "كلمات مكررة",
  "audit.perfectTitle": "خزينتك بأعلى درجات الأمان!",
  "audit.perfectDesc": "جميع كلمات مرورك قوية، فريدة، وغير مكررة عبر أي حسابات.",
  "audit.weakPre": "لديك",
  "audit.weakPost": "كلمة مرور ضعيفة يُنصح بتغييرها فوراً.",
  "audit.reusePre": "لديك",
  "audit.reusePost": "حساباً يستخدم نفس كلمة المرور!",
  "audit.gotIt": "فهمت ذلك",

  // CSV import modal
  "import.title": "استيراد كلمات المرور من Chrome أو ملف CSV",
  "import.foundTitle": "ملف Chrome Passwords المكتشف",
  "import.foundDesc": "عُثر على ملف \"Chrome Passwords.csv\" في مجلد المشروع.",
  "import.importing": "جارٍ الاستيراد والتشفير...",
  "import.importNow": "استيراد الحسابات الآن",
  "import.divider": "أو اختر ملف CSV من جهازك",
  "import.dropzone": "اضغط لاختيار ملف .csv من المتصفح أو مدير كلمات المرور",
  "import.supports": "يدعم Google Chrome, Brave, Edge, 1Password CSV",
  "import.close": "إغلاق",
};

export const vaultEn: Record<string, string> = {
  "strength.veryWeak": "Very weak",
  "strength.weak": "Weak",
  "strength.medium": "Medium",
  "strength.strong": "Strong",
  "strength.super": "Fortress-grade",
  // Generic
  "loading": "Preparing your encrypted vault…",

  // Setup screen (first run)
  "setup.title": "Create your password vault",
  "setup.desc1": "Set a master PIN or passphrase. Your data is encrypted 100% locally with",
  "setup.desc2": "and cannot be unlocked by anyone without it.",
  "setup.newPin": "New master PIN",
  "setup.newPinPh": "At least 4 characters…",
  "setup.confirmPin": "Confirm PIN",
  "setup.confirmPinPh": "Re-enter your PIN to confirm…",
  "setup.cta": "Create & secure vault",

  // Locked screen
  "lock.title": "Vault locked",
  "lock.desc": "Enter your PIN to decrypt and view your saved accounts and passwords.",
  "lock.pinPh": "Enter your PIN…",
  "lock.cta": "Unlock vault",
  "lock.stats": "Encrypted records: {count} items",

  // Toasts & feedback
  "toast.unlocked": "Password vault unlocked securely",
  "toast.setupDone": "Vault created and secured!",
  "toast.locked": "Vault locked",
  "toast.copied": "{label} copied (auto-clears from clipboard in 30 seconds)",
  "toast.copyFailed": "Failed to copy",
  "toast.deleted": "Item deleted",
  "toast.titleRequired": "Please enter a title for the item",
  "toast.saved": "Account details saved",
  "toast.exported": "Passwords exported as Chrome CSV!",
  "toast.importedChrome": "Imported and encrypted {count} accounts from Chrome Passwords.csv!",
  "toast.importedCsv": "Imported and encrypted {count} accounts from the CSV file!",
  "toast.generated": "Strong password generated and filled in",

  // Errors & confirms
  "error.pinShort": "Your PIN must be at least 4 characters",
  "error.pinMismatch": "PINs do not match",
  "confirm.delete": "Permanently delete this item? This action cannot be undone.",

  // Copy-secret labels (interpolated into toast.copied)
  "label.username": "Username",
  "label.password": "Password",
  "label.cardNumber": "Card number",
  "label.generated": "Generated password",

  // Top search & quick actions
  "action.searchPh": "Search accounts, websites, notes…",
  "action.clearTitle": "Clear",
  "action.newTitle": "Add a new account or card",
  "action.new": "New item",
  "action.lockTitle": "Lock vault now",
  "action.lock": "Lock",

  // Category chips
  "cat.allTitle": "Show all saved items",
  "cat.all": "All",
  "cat.loginTitle": "Website & app accounts",
  "cat.login": "Logins",
  "cat.cardTitle": "Payment & credit cards",
  "cat.card": "Cards",
  "cat.noteTitle": "Secure notes & private data",
  "cat.note": "Secure notes",
  "cat.favTitle": "Favorite items",
  "cat.fav": "Favorites",

  // Tool chips
  "tool.genTitle": "Generate strong passwords & passphrases",
  "tool.gen": "Generator",
  "tool.auditTitle": "Scan for weak or reused passwords",
  "tool.audit": "Security check",
  "tool.importTitle": "Import passwords from Chrome or a CSV file",
  "tool.import": "Import CSV",
  "tool.exportTitle": "Export passwords as Chrome CSV",
  "tool.export": "Export CSV",

  // Empty state
  "empty.noResults": "No matching results",
  "empty.none": "Nothing here yet",
  "empty.noResultsHint": "Try different keywords or clear the filter",
  "empty.hint": "Click “New item” to add and secure your first account or card.",

  // Item cards
  "card.copyUsername": "Copy username",
  "card.favorite": "Add to favorites",
  "card.unfavorite": "Remove from favorites",
  "card.openWebsite": "Open website in browser",
  "card.showPassword": "Show password",
  "card.hidePassword": "Hide password",
  "card.copyPassword": "Copy password securely",
  "card.expiry": "Expires: {value}",
  "card.show": "Show",
  "card.hide": "Hide",
  "card.editTitle": "Edit account details",
  "card.edit": "Edit",
  "card.deleteTitle": "Delete item",

  // Add / Edit item modal
  "edit.titleEdit": "Edit protected item",
  "edit.titleNew": "Add new vault item",
  "edit.type": "Item type",
  "edit.catLogin": "Website / app login",
  "edit.catCard": "Payment card",
  "edit.catNote": "Encrypted note",
  "edit.titleLabel": "Title / service name *",
  "edit.titlePh": "e.g. Google, GitHub, Netflix…",
  "edit.username": "Username or email",
  "edit.password": "Password",
  "edit.generate": "Generate strong",
  "edit.passwordPh": "Enter a password or generate a strong one…",
  "edit.website": "Website URL (optional)",
  "edit.cardNumber": "Card number",
  "edit.cardExpiry": "Expiry date",
  "edit.cardCvv": "Security code (CVV)",
  "edit.notes": "Additional encrypted notes (optional)",
  "edit.notesPh": "Any other sensitive information…",
  "edit.cancel": "Cancel",
  "edit.save": "Save encrypted item",

  // Password generator modal
  "gen.title": "Password generator",
  "gen.regenerate": "Regenerate",
  "gen.copyNow": "Copy now",
  "gen.modeRandom": "Random characters & symbols",
  "gen.modePassphrase": "Memorable passphrase",
  "gen.length": "Length: {count} characters",
  "gen.uppercase": "Uppercase letters (A-Z)",
  "gen.lowercase": "Lowercase letters (a-z)",
  "gen.numbers": "Numbers (0-9)",
  "gen.symbols": "Special characters (!@#$%)",
  "gen.avoidAmbiguous": "Avoid look-alike characters (0, O, l, 1)",
  "gen.passphraseInfo": "A passphrase is 4 easy-to-remember English words joined by safe separators.",
  "gen.newPassphrase": "New passphrase",
  "gen.copyClose": "Copy & close",

  // Security audit modal
  "audit.title": "Password security report",
  "audit.strong": "Strong passwords",
  "audit.weak": "Weak passwords",
  "audit.reused": "Reused passwords",
  "audit.perfectTitle": "Your vault is in great shape!",
  "audit.perfectDesc": "All your passwords are strong, unique, and never reused across accounts.",
  "audit.weakPre": "You have",
  "audit.weakPost": "weak passwords that should be changed immediately.",
  "audit.reusePre": "You have",
  "audit.reusePost": "accounts reusing the same password!",
  "audit.gotIt": "Got it",

  // CSV import modal
  "import.title": "Import passwords from Chrome or a CSV file",
  "import.foundTitle": "Chrome Passwords file detected",
  "import.foundDesc": "Found \"Chrome Passwords.csv\" in the project folder.",
  "import.importing": "Importing & encrypting…",
  "import.importNow": "Import accounts now",
  "import.divider": "or pick a CSV file from your device",
  "import.dropzone": "Click to choose a .csv file from your browser or password manager",
  "import.supports": "Supports Google Chrome, Brave, Edge, 1Password CSV",
  "import.close": "Close",
};
