/**
 * Advanced Morphological, Heuristic & Edit-Distance Spell Checker for Arabic & English.
 * Deep coverage of:
 * - Common Typo & Pronoun/Identity Confusions (e.g. "اسمم" -> "اسمي", "إسمي" -> "اسمي", "هاذا" -> "هذا")
 * - Repeated letters in word endings/stems (e.g. "اسمم", "كتااب", "جمييل", "شكرااا")
 * - Hamzat (Qat' vs Wasl) with morphological root patterns
 * - Ta Marbuta (ة) vs Ha (ه) with phonetic patterns & feminine morphological suffixes
 * - Alif Maqsura (ى) vs Ya (ي) for common particles and multi-letter stems
 * - Tanwin (اً / ةً / ءً) vs Nun (ن)
 * - Word spacing (Waw Al-Atf, punctuation marks in Arabic context)
 * - Levenshtein Distance candidate suggestion for Arabic & English vocabulary
 */

export interface SpellIssue {
  id: string;
  word: string;
  start: number;
  end: number;
  suggestions: string[];
  type: "hamza" | "ta_marbuta" | "alif_maqsura" | "tanwin" | "punctuation" | "waw_spacing" | "typo";
  explanation: string;
}

export interface SpellCheckResult {
  original: string;
  corrected: string;
  issues: SpellIssue[];
  wordCount: number;
  score: number; // 0 to 100
  categoriesCount: {
    hamza: number;
    ta_marbuta: number;
    alif_maqsura: number;
    tanwin: number;
    punctuation: number;
    typo: number;
  };
}

// ---------------------------------------------------------------------------
// 1. Phrasal & Compound Arabic Typos (Exact replacements before tokenization)
// ---------------------------------------------------------------------------
const PHRASAL_REPLACEMENTS: Array<{ regex: RegExp; replace: string; explanation: string }> = [
  { regex: /\bان\s*شاء\s*الله\b/g, replace: "إن شاء الله", explanation: "كتابة (إن شاء الله) منفصلة بالهمزة المكسورة" },
  { regex: /\bانشاء\s*الله\b/g, replace: "إن شاء الله", explanation: "كتابة (إن شاء الله) منفصلة بالهمزة المكسورة" },
  { regex: /\bباذن\s*الله\b/g, replace: "بإذن الله", explanation: "همزة قطع مكسورة في (بإذن الله)" },
  { regex: /\bصلي\s+الله\s+عليه\s+وسلم\b/g, replace: "صلى الله عليه وسلم", explanation: "الألف المقصورة في الفعل الماضي (صلى)" },
  { regex: /\bصلوات\s+الله\s+وسلامة\s+علية\b/g, replace: "صلوات الله وسلامه عليه", explanation: "الهاء في سلامة عليه (ضمير غائب)" },
  { regex: /\bجزاك\s+اللة\s+خير\b/g, replace: "جزاك الله خيراً", explanation: "لفظ الجلالة بالهاء وتنوين النصب في خيراً" },
  { regex: /\bلا\s*حول\s*ولا\s*قوة\s*الا\s*بالله\b/g, replace: "لا حول ولا قوة إلا بالله", explanation: "همزة القطع في أداة الاستثناء (إلا)" },
  { regex: /\bبسم\s+اللة\b/g, replace: "بسم الله", explanation: "لفظ الجلالة بالهاء المربوطة (الله)" },
  { regex: /\bالسلام\s+عليكم\s+ورحمة\s+اللة\b/g, replace: "السلام عليكم ورحمة الله", explanation: "لفظ الجلالة بالهاء" },
];

// ---------------------------------------------------------------------------
// 2. Exact Word Mappings & Frequent Typos
// ---------------------------------------------------------------------------
const AR_EXACT_WORDS: Record<string, { fixed: string; type: SpellIssue["type"]; exp: string }> = {
  // Identity & Pronoun typos (including the specific "اسمم" -> "اسمي")
  اسمم: { fixed: "اسمي", type: "typo", exp: "خطأ طباعي في نهاية الكلمة: ياء المتكلم (اسمي)" },
  إسمم: { fixed: "اسمي", type: "typo", exp: "همزة وصل وياء المتكلم (اسمي)" },
  إسمي: { fixed: "اسمي", type: "hamza", exp: "همزة وصل تُكتب دون همزة (اسمي)" },
  إسم: { fixed: "اسم", type: "hamza", exp: "همزة وصل في الأسماء العشرة (اسم)" },
  إسمك: { fixed: "اسمك", type: "hamza", exp: "همزة وصل (اسمك)" },
  إسمه: { fixed: "اسمه", type: "hamza", exp: "همزة وصل (اسمه)" },
  إسمها: { fixed: "اسمها", type: "hamza", exp: "همزة وصل (اسمها)" },
  إبن: { fixed: "ابن", type: "hamza", exp: "همزة وصل في (ابن)" },
  إبنة: { fixed: "ابنة", type: "hamza", exp: "همزة وصل في (ابنة)" },
  إمرأة: { fixed: "امرأة", type: "hamza", exp: "همزة وصل في (امرأة)" },
  إمرؤ: { fixed: "امرؤ", type: "hamza", exp: "همزة وصل في (امرؤ)" },
  إثنان: { fixed: "اثنان", type: "hamza", exp: "همزة وصل في (اثنان)" },
  إثنين: { fixed: "اثنين", type: "hamza", exp: "همزة وصل في (اثنين)" },
  إنت: { fixed: "أنت", type: "hamza", exp: "همزة قطع مفتوحة في الضمير (أنت)" },
  إنتي: { fixed: "أنتِ", type: "hamza", exp: "همزة قطع بالكسرة دون ياء (أنتِ)" },
  انتي: { fixed: "أنتِ", type: "hamza", exp: "الضمير للمخاطبة يكتب بالكسرة دون ياء (أنتِ)" },

  // Tanwin vs Nun
  شكرن: { fixed: "شكراً", type: "tanwin", exp: "تنوين نصب (ـاً) وليس نوناً ساكنة" },
  عفون: { fixed: "عفواً", type: "tanwin", exp: "تنوين نصب (ـاً) وليس نوناً ساكنة" },
  اهلن: { fixed: "أهلاً", type: "tanwin", exp: "همزة قطع وتنوين نصب (أهلاً)" },
  أهلن: { fixed: "أهلاً", type: "tanwin", exp: "تنوين نصب (أهلاً)" },
  سهلن: { fixed: "سهلاً", type: "tanwin", exp: "تنوين نصب (سهلاً)" },
  مرحبن: { fixed: "مرحباً", type: "tanwin", exp: "تنوين نصب (مرحباً)" },
  دائمن: { fixed: "دائماً", type: "tanwin", exp: "تنوين نصب (دائماً)" },
  دايمن: { fixed: "دائماً", type: "tanwin", exp: "همزة على نبرة وتنوين نصب (دائماً)" },
  ايضن: { fixed: "أيضاً", type: "tanwin", exp: "همزة قطع وتنوين نصب (أيضاً)" },
  أيضن: { fixed: "أيضاً", type: "tanwin", exp: "تنوين نصب (أيضاً)" },
  ابدن: { fixed: "أبداً", type: "tanwin", exp: "همزة قطع وتنوين نصب (أبداً)" },
  أبدن: { fixed: "أبداً", type: "tanwin", exp: "تنوين نصب (أبداً)" },
  جدن: { fixed: "جداً", type: "tanwin", exp: "تنوين نصب (جداً)" },
  حقن: { fixed: "حقاً", type: "tanwin", exp: "تنوين نصب (حقاً)" },
  فعلن: { fixed: "فعلاً", type: "tanwin", exp: "تنوين نصب (فعلاً)" },
  حالين: { fixed: "حالياً", type: "tanwin", exp: "تنوين نصب (حالياً)" },
  حاليين: { fixed: "حالياً", type: "tanwin", exp: "تنوين نصب (حالياً)" },
  فورن: { fixed: "فوراً", type: "tanwin", exp: "تنوين نصب (فوراً)" },
  حتمن: { fixed: "حتماً", type: "tanwin", exp: "تنوين نصب (حتماً)" },
  تمامن: { fixed: "تماماً", type: "tanwin", exp: "تنوين نصب (تماماً)" },
  اولن: { fixed: "أولاً", type: "tanwin", exp: "همزة قطع وتنوين نصب (أولاً)" },
  أولن: { fixed: "أولاً", type: "tanwin", exp: "تنوين نصب (أولاً)" },
  ثانين: { fixed: "ثانياً", type: "tanwin", exp: "تنوين نصب (ثانياً)" },
  ثالثن: { fixed: "ثالثاً", type: "tanwin", exp: "تنوين نصب (ثالثاً)" },
  اخيرن: { fixed: "أخيراً", type: "tanwin", exp: "همزة قطع وتنوين نصب (أخيراً)" },
  أخيرن: { fixed: "أخيراً", type: "tanwin", exp: "تنوين نصب (أخيراً)" },
  مسبقن: { fixed: "مسبقاً", type: "tanwin", exp: "تنوين نصب (مسبقاً)" },
  لاحقن: { fixed: "لاحقاً", type: "tanwin", exp: "تنوين نصب (لاحقاً)" },
  نادرن: { fixed: "نادراً", type: "tanwin", exp: "تنوين نصب (نادراً)" },
  عمومن: { fixed: "عموماً", type: "tanwin", exp: "تنوين نصب (عموماً)" },
  خاصتن: { fixed: "خاصةً", type: "tanwin", exp: "تنوين نصب على تاء مربوطة (خاصةً)" },
  صراحتن: { fixed: "صراحةً", type: "tanwin", exp: "تنوين نصب على تاء مربوطة (صراحةً)" },
  قطعن: { fixed: "قطعاً", type: "tanwin", exp: "تنوين نصب (قطعاً)" },
  يقينن: { fixed: "يقيناً", type: "tanwin", exp: "تنوين نصب (يقيناً)" },
  حبن: { fixed: "حباً", type: "tanwin", exp: "تنوين نصب (حباً)" },
  اصلن: { fixed: "أصلاً", type: "tanwin", exp: "همزة قطع وتنوين نصب (أصلاً)" },
  أصلن: { fixed: "أصلاً", type: "tanwin", exp: "تنوين نصب (أصلاً)" },
  سريعن: { fixed: "سريعاً", type: "tanwin", exp: "تنوين نصب (سريعاً)" },
  بطيئن: { fixed: "بطيئاً", type: "tanwin", exp: "تنوين نصب (بطيئاً)" },
  سوين: { fixed: "سوياً", type: "tanwin", exp: "تنوين نصب (سوياً)" },
  معن: { fixed: "معاً", type: "tanwin", exp: "تنوين نصب (معاً)" },
  مبدئين: { fixed: "مبدئياً", type: "tanwin", exp: "تنوين نصب (مبدئياً)" },
  رسمين: { fixed: "رسمياً", type: "tanwin", exp: "تنوين نصب (رسمياً)" },
  عملين: { fixed: "عملياً", type: "tanwin", exp: "تنوين نصب (عملياً)" },
  سلفن: { fixed: "سلفاً", type: "tanwin", exp: "تنوين نصب (سلفاً)" },

  // Common spelling typos & colloquial words
  لاكن: { fixed: "لكن", type: "typo", exp: "تحذف الألف نطقاً ورسماً في (لكن)" },
  لاكنه: { fixed: "لكنه", type: "typo", exp: "تحذف الألف في (لكنه)" },
  لاكنها: { fixed: "لكنها", type: "typo", exp: "تحذف الألف في (لكنها)" },
  لاكنهم: { fixed: "لكنهم", type: "typo", exp: "تحذف الألف في (لكنهم)" },
  هاذا: { fixed: "هذا", type: "typo", exp: "تحذف ألف المد بعد الهاء في اسم الإشارة (هذا)" },
  هاذه: { fixed: "هذه", type: "typo", exp: "تحذف ألف المد وتكتب بالهاء في (هذه)" },
  هاؤلاء: { fixed: "هؤلاء", type: "typo", exp: "تحذف ألف المد بعد الهاء في (هؤلاء)" },
  هاذان: { fixed: "هذان", type: "typo", exp: "تحذف ألف المد في اسم الإشارة (هذان)" },
  ذالك: { fixed: "ذلك", type: "typo", exp: "تحذف الألف في اسم الإشارة (ذلك)" },
  اللذي: { fixed: "الذي", type: "typo", exp: "تكتب بلام واحدة في الاسم الموصول (الذي)" },
  اللتي: { fixed: "التي", type: "typo", exp: "تكتب بلام واحدة في الاسم الموصول (التي)" },
  اللذين: { fixed: "الذين", type: "typo", exp: "تكتب بلام واحدة لجمع المذكر (الذين)" },
  اللة: { fixed: "الله", type: "typo", exp: "لفظ الجلالة ينتهي بهاء (الله)" },
  شئ: { fixed: "شيء", type: "typo", exp: "الهمزة متطرفة على السطر بعد ياء ساكنة (شيء)" },
  مسئول: { fixed: "مسؤول", type: "hamza", exp: "همزة مضمومة بعدها واو مد (مسؤول)" },
  مسئولية: { fixed: "مسؤولية", type: "hamza", exp: "تكتب على واو (مسؤولية)" },
  شئون: { fixed: "شؤون", type: "hamza", exp: "تكتب على واو (شؤون)" },
  دفئ: { fixed: "دفء", type: "hamza", exp: "همزة متطرفة على السطر بعد ساكن (دفء)" },
  بطئ: { fixed: "بطء", type: "hamza", exp: "همزة متطرفة على السطر بعد ساكن (بطء)" },
  كفئ: { fixed: "كفء", type: "hamza", exp: "همزة متطرفة على السطر بعد ساكن (كفء)" },
  خطء: { fixed: "خطأ", type: "hamza", exp: "همزة متطرفة على ألف (خطأ)" },
  خطاء: { fixed: "خطأ", type: "hamza", exp: "تكتب على ألف (خطأ)" },
  مبرووك: { fixed: "مبروك", type: "typo", exp: "تكتب بواو واحدة (مبروك)" },
  مبروووك: { fixed: "مبروك", type: "typo", exp: "تكتب بواو واحدة دون إطالة (مبروك)" },
  مضهر: { fixed: "مظهر", type: "typo", exp: "تكتب بالظاء (مظهر)" },
  ملاحضه: { fixed: "ملاحظة", type: "ta_marbuta", exp: "تكتب بالظاء والتاء المربوطة (ملاحظة)" },
  ملاحظه: { fixed: "ملاحظة", type: "ta_marbuta", exp: "تنتهي بتاء مربوطة (ملاحظة)" },
  حضا: { fixed: "حظاً", type: "typo", exp: "تكتب بالظاء والتنوين (حظاً)" },
  ظغط: { fixed: "ضغط", type: "typo", exp: "تكتب بالضاد (ضغط)" },
  إضهار: { fixed: "إظهار", type: "typo", exp: "تكتب بالظاء (إظهار)" },
  اضهار: { fixed: "إظهار", type: "typo", exp: "همزة قطع وبالظاء (إظهار)" },
};

// ---------------------------------------------------------------------------
// 3. Particles & Prepositions that MUST have Alif Maqsura (ى)
// ---------------------------------------------------------------------------
const ALIF_MAQSURA_WORDS: Record<string, string> = {
  الي: "إلى",
  إلي: "إلى",
  علي: "على",
  حتي: "حتى",
  بلي: "بلى",
  متي: "متى",
  لدي: "لدى",
  مستشفي: "مستشفى",
  منتدي: "منتدى",
  ملتقي: "ملتقى",
  مقهي: "مقهى",
  معني: "معنى",
  مبني: "مبنى",
  ماوي: "مأوى",
  مأوي: "مأوى",
  مرضي: "مرضى",
  جرحي: "جرحى",
  دعوي: "دعوى",
  فتوي: "فتوى",
  صغري: "صغرى",
  كبري: "كبرى",
  اخري: "أخرى",
  أخري: "أخرى",
  اولي: "أولى",
  أولي: "أولى",
  اقصي: "أقصى",
  أقصي: "أقصى",
  ادني: "أدنى",
  أدني: "أدنى",
  اعلي: "أعلى",
  أعلي: "أعلى",
  احلي: "أحلى",
  أحلي: "أحلى",
  ابهي: "أبهى",
  أبهي: "أبهى",
  اعمي: "أعمى",
  أعمي: "أعمى",
  اثري: "أثرى",
  أثري: "أثرى",
  اعفي: "أعفى",
  اعطي: "أعطى",
  القي: "ألقى",
  انتهي: "انتهى",
  اهتدي: "اهتدى",
  ارتقي: "ارتقى",
  اشتري: "اشترى",
  استوي: "استوى",
  استثني: "استثنى",
  استولي: "استولى",
  هدي: "هدى",
  ندي: "ندى",
  فتي: "فتى",
  تقي: "تقى",
  ضحي: "ضحى",
  مني: "منى",
  روي: "رؤى",
  فدوي: "فدوى",
  نجوي: "نجوى",
  موسي: "موسى",
  عيسي: "عيسى",
  كسري: "كسرى",
  بخاري: "بخارى",
  عظمي: "عظمى",
  بشري: "بشرى",
  ذكري: "ذكرى",
  فصحي: "فصحى",
  سلوي: "سلوى",
};

// ---------------------------------------------------------------------------
// 4. Ta Marbuta Rules & Lexicon
// ---------------------------------------------------------------------------
const GENUINE_HA_WORDS = new Set([
  "مياه", "فواكه", "تشابه", "منبه", "توجيه", "تنبيه", "تسفيه", "تشويه", "وجه", "كره",
  "شبه", "إله", "اله", "فقه", "سفيه", "عاه", "تيه", "شفاه", "جباه", "افواه", "أفواه",
  "فقيه", "كريه", "نبيه", "نزيه", "شبيه", "وجيه", "تمويه", "تشبيه", "ترفيه", "نزه",
  "منه", "عنه", "إليه", "اليه", "عليه", "فيه", "لديه", "به", "له", "دونه", "حوله"
]);

// Absolute Hamza Qat' words
const HAMZA_QAT_WORDS: Record<string, string> = {
  // Pronouns / Particles
  الي: "إلى",
  إلي: "إلى",
  اذا: "إذا",
  اذ: "إذ",
  ان: "إن",
  انما: "إنما",
  او: "أو",
  الا: "إلا",
  اما: "أما",
  ايضا: "أيضاً",
  أيضا: "أيضاً",
  ابد: "أبد",
  ابدا: "أبداً",
  أبدا: "أبداً",
  اين: "أين",
  اي: "أي",
  اينما: "أينما",
  اذن: "إذن",
  انا: "أنا",
  انت: "أنت",
  انتم: "أنتم",
  انتن: "أنتن",
  انتما: "أنتما",
  اياك: "إياك",

  // Comparative (أفعل)
  اكبر: "أكبر",
  اصغر: "أصغر",
  افضل: "أفضل",
  احسن: "أحسن",
  اكثر: "أكثر",
  اقل: "أقل",
  اعظم: "أعظم",
  اسرع: "أسرع",
  ابطا: "أبطأ",
  ابطأ: "أبطأ",
  اطول: "أطول",
  اقصر: "أقصر",
  احدث: "أحدث",
  اقدم: "أقدم",
  اسهل: "أسهل",
  اصعب: "أصعب",
  اقوي: "أقوى",
  اقوى: "أقوى",
  اضعف: "أضعف",
  ادق: "أدق",
  اعم: "أعم",
  اخص: "أخص",
  اجمل: "أجمل",
  اكرم: "أكرم",
  انبل: "أنبل",
  اروع: "أروع",
  اسمي: "أسمى",
  اعلي: "أعلى",
  ادني: "أدنى",
  اقصي: "أقصى",
  اولي: "أولى",
  اصدق: "أصدق",
  اوسع: "أوسع",
  اشمل: "أشمل",

  // Plural Patterns (أفعال)
  اعمال: "أعمال",
  اقوال: "أقوال",
  افعال: "أفعال",
  اوقات: "أوقات",
  اهداف: "أهداف",
  اسباب: "أسباب",
  اسماء: "أسماء",
  اشكال: "أشكال",
  اموال: "أموال",
  الوان: "ألوان",
  اولاد: "أولاد",
  اصحاب: "أصحاب",
  اسرار: "أسرار",
  ارقام: "أرقام",
  اقلام: "أقلام",
  احكام: "أحكام",
  افكار: "أفكار",
  اخبار: "أخبار",
  ازهار: "أزهار",
  اسواق: "أسواق",
  ابواب: "أبواب",
  اعباء: "أعباء",
  انحاء: "أنحاء",
  احياء: "أحياء",
  اجزاء: "أجزاء",
  اعضاء: "أعضاء",
  انباء: "أنباء",
  اراء: "آراء",

  // Plural Patterns (أفعلة)
  اجهزة: "أجهزة",
  اسلحة: "أسلحة",
  اطعمة: "أطعمة",
  ادوية: "أدوية",
  اقمشة: "أقمشة",
  امثلة: "أمثلة",
  السنة: "ألسنة",
  اروقة: "أروقة",
  امتعة: "أمتعة",
  اغطية: "أغطية",
  اوعية: "أوعية",
  احذية: "أحذية",

  // Quadrilateral Verbal Nouns (إفعال)
  ارسال: "إرسال",
  انتاج: "إنتاج",
  انجاز: "إنجاز",
  اشعار: "إشعار",
  اطلاق: "إطلاق",
  اصلاح: "إصلاح",
  ادخال: "إدخال",
  اخراج: "إخراج",
  اتمام: "إتمام",
  اعطاء: "إعطاء",
  اعلان: "إعلان",
  اعداد: "إعداد",
  اعلام: "إعلام",
  اضراب: "إضراب",
  افادة: "إفادة",
  اعادة: "إعادة",
  اقامة: "إقامة",
  اعانة: "إعانة",
  اشارة: "إشارة",
  ارادة: "إرادة",
  ادارة: "إدارة",
  اتاحة: "إتاحة",
  ابداء: "إبداء",
  الغاء: "إلغاء",
  انهاء: "إنهاء",
  اخفاء: "إخفاء",
  ابراز: "إبراز",
  اتقان: "إتقان",
  احسان: "إحسان",
  اكرام: "إكرام",
  ايجاز: "إيجاز",
  ايقاف: "إيقاف",
  ايداع: "إيداع",
  انشاء: "إنشاء",
  اصدار: "إصدار",
  ارفاق: "إرفاق",
  ابداع: "إبداع",
  ايجاد: "إيجاد",

  // Names / Geographics
  احمد: "أحمد",
  ايمن: "أيمن",
  امجد: "أمجد",
  اسامة: "أسامة",
  انس: "أنس",
  ابراهيم: "إبراهيم",
  اسماعيل: "إسماعيل",
  اسحاق: "إسحاق",
  ادريس: "إدريس",
  الياس: "إلياس",
  امين: "أمين",
  اميرة: "أميرة",
  ايمان: "إيمان",
  الهام: "إلهام",
  اسلام: "إسلام",
  امل: "أمل",
  انور: "أنور",
  ادهم: "أدهم",
  اشرف: "أشرف",
  امير: "أمير",
  اية: "آية",
  الاء: "آلاء",
  ايناس: "إيناس",
  اياد: "إياد",
  ايهاب: "إيهاب",
  امريكا: "أمريكا",
  اوروبا: "أوروبا",
  المانيا: "ألمانيا",
  ايطاليا: "إيطاليا",
  اسبانيا: "إسبانيا",
  انجلترا: "إنجلترا",
  استراليا: "أستراليا",
  اوكرانيا: "أوكرانيا",
  انقرة: "أنقرة",
  اسطنبول: "إسطنبول",
  اثينا: "أثينا",
  امستردام: "أمستردام",
  اوسلو: "أوسلو",
  الاردن: "الأردن",
  الامارات: "الإمارات",
  اندونيسيا: "إندونيسيا",
  ايران: "إيران",
};

// Hamzat Wasl (Quin/Sextuple roots)
const HAMZA_WASL_ROOTS = [
  "ستخدام", "ستخراج", "ستدعاء", "ستفسار", "ستمرار", "ستبدال", "ستعراض", "ستكمال",
  "ستعلام", "ستقرار", "ستجابة", "ستلام", "ستماع", "ستثناء", "سترخاء", "ستقلال",
  "ستهتار", "ستهلاك", "كتشاف", "ختبار", "ختيار", "ختصار", "جتماع", "عتذار",
  "عتماد", "نتهاء", "بتداء", "شتراك", "نطلاق", "نخفاض", "نضمام", "نقسام",
  "نتباه", "نتصار", "نتقال", "نتخاب", "نتظار", "عتراف", "متياز", "متحان",
  "ستسلام", "بتسام", "حترام", "هتمام", "تساع", "تفاق", "تصال", "تحاد"
];

// Common English Misspellings
const ENGLISH_FIXES: Record<string, string> = {
  teh: "the",
  recieve: "receive",
  seperate: "separate",
  definately: "definitely",
  definatly: "definitely",
  occured: "occurred",
  untill: "until",
  wich: "which",
  goverment: "government",
  beleive: "believe",
  alot: "a lot",
  dont: "don't",
  cant: "can't",
  wont: "won't",
  didnt: "didn't",
  isnt: "isn't",
  arent: "aren't",
  havent: "haven't",
  wouldnt: "wouldn't",
  couldnt: "couldn't",
  shouldnt: "shouldn't",
  im: "I'm",
  youre: "you're",
  theyre: "theyre",
  weve: "we've",
  theres: "there's",
  truely: "truly",
  tommorow: "tomorrow",
  tomorow: "tomorrow",
  fourty: "forty",
  wierd: "weird",
  neccessary: "necessary",
  necesary: "necessary",
  succesful: "successful",
  accomodate: "accommodate",
  embarass: "embarrass",
  enviroment: "environment",
  pronounciation: "pronunciation",
  recommand: "recommend",
  begining: "beginning",
  calender: "calendar",
  collegue: "colleague",
  privilege: "privilege",
  existance: "existence",
  mispell: "misspell",
  noticable: "noticeable",
  posession: "possession",
  publically: "publicly",
  questionaire: "questionnaire",
  refering: "referring",
  suprise: "surprise",
  thier: "their",
  remeber: "remember",
  greatful: "grateful",
  garantee: "guarantee",
  happend: "happened",
  foriegn: "foreign",
  arguement: "argument",
  beleif: "belief",
  acheive: "achieve",
  concious: "conscious",
  disapear: "disappear",
  dissapear: "disappear",
  grammer: "grammar",
  millenium: "millennium",
  occurence: "occurrence",
  peice: "piece",
  religous: "religious",
  rythm: "rhythm",
  tendancy: "tendency",
  threshhold: "threshold",
  twelth: "twelfth",
  vaccum: "vacuum",
  weather: "whether",
};

// ---------------------------------------------------------------------------
// 5. Morphological Affix Processing
// ---------------------------------------------------------------------------
const ARABIC_PREFIXES = [
  "وبال", "فبال", "ولل", "فلل", "وال", "فال", "كال", "بال", "لل", "ال",
  "وس", "فس", "و", "ف", "ب", "ل", "ك", "س"
];

function stripPrefix(word: string): { prefix: string; stem: string } {
  for (const p of ARABIC_PREFIXES) {
    if (word.startsWith(p) && word.length - p.length >= 2) {
      return { prefix: p, stem: word.slice(p.length) };
    }
  }
  return { prefix: "", stem: word };
}

// ---------------------------------------------------------------------------
// 6. Fast Levenshtein Distance & Common Arabic Lexicon
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  if (Math.abs(an - bn) > 2) return 99; // early exit if length difference is too large

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; ++i) matrix[i] = [i];
  for (let j = 0; j <= an; ++j) matrix[0][j] = j;

  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

const COMMON_AR_LEXICON = [
  "أنا", "أنت", "هو", "هي", "نحن", "أنتم", "اسم", "اسمي", "اسمك", "اسمه", "اسمها",
  "كتاب", "قلم", "عمل", "يوم", "وقت", "ساعة", "سنة", "شهر", "مكان", "بيت", "طريق",
  "حل", "مشكلة", "تطبيق", "نظام", "برنامج", "ملف", "صورة", "نص", "حفظ", "نسخ",
  "لصق", "عرض", "بحث", "إضافة", "تعديل", "حذف", "جديد", "قديم", "كبير", "صغير",
  "سريع", "جميل", "واضح", "صحيح", "خطأ", "سلام", "شكراً", "أهلاً", "مرحباً", "جداً",
  "حقاً", "فعلاً", "أيضاً", "الآن", "اليوم", "غداً", "أمس", "هنا", "هناك", "كل",
  "بعض", "غير", "مع", "عند", "قبل", "بعد", "بين", "فوق", "تحت", "من", "إلى",
  "عن", "على", "في", "حتى", "لا", "ما", "لم", "لن", "ليس", "إن", "أن",
  "كان", "صار", "أصبح", "قال", "يقول", "فعل", "يفعل", "جاء", "يجيء", "ذهب", "يذهب",
  "أخذ", "يأخذ", "عمل", "يعمل", "عرف", "يعرف", "علم", "يعلم", "وجد", "يجد", "رأى",
  "يرى", "كتب", "يكتب", "قرأ", "يقرأ", "سمع", "يسمع"
];

// ---------------------------------------------------------------------------
// 7. Main Spell Checker Function
// ---------------------------------------------------------------------------
export function checkSpelling(text: string): SpellCheckResult {
  if (!text || !text.trim()) {
    return {
      original: text,
      corrected: text,
      issues: [],
      wordCount: 0,
      score: 100,
      categoriesCount: { hamza: 0, ta_marbuta: 0, alif_maqsura: 0, tanwin: 0, punctuation: 0, typo: 0 },
    };
  }

  const issues: SpellIssue[] = [];
  const categoriesCount = { hamza: 0, ta_marbuta: 0, alif_maqsura: 0, tanwin: 0, punctuation: 0, typo: 0 };

  const addIssue = (
    word: string,
    start: number,
    end: number,
    suggestion: string,
    type: SpellIssue["type"],
    explanation: string
  ) => {
    issues.push({
      id: `${type}-${start}-${word}`,
      word,
      start,
      end,
      suggestions: [suggestion],
      type,
      explanation,
    });
    if (categoriesCount[type as keyof typeof categoriesCount] !== undefined) {
      categoriesCount[type as keyof typeof categoriesCount]++;
    } else {
      categoriesCount.typo++;
    }
  };

  // Phase 1: Phrasal & Compound Checks
  for (const phrase of PHRASAL_REPLACEMENTS) {
    let match: RegExpExecArray | null;
    while ((match = phrase.regex.exec(text)) !== null) {
      addIssue(match[0], match.index, match.index + match[0].length, phrase.replace, "typo", phrase.explanation);
    }
  }

  // Phase 2: Waw Al-Atf Spacing (\bو\s+([ء-ي]+))
  const wawRegex = /\b(و)\s+([\u0621-\u064A]+)/g;
  let wawMatch: RegExpExecArray | null;
  while ((wawMatch = wawRegex.exec(text)) !== null) {
    const fullMatch = wawMatch[0];
    const nextWord = wawMatch[2];
    const fixed = `و${nextWord}`;
    addIssue(fullMatch, wawMatch.index, wawMatch.index + fullMatch.length, fixed, "waw_spacing", "واو العطف تتصل بالمعطوف دون مسافة");
  }

  // Phase 3: Punctuation in Arabic context
  const isArabic = /[\u0600-\u06FF]/.test(text);
  if (isArabic) {
    const punctRegex = /([،,\?؟;؛])/g;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = punctRegex.exec(text)) !== null) {
      const char = pMatch[0];
      if (char === ",") {
        addIssue(",", pMatch.index, pMatch.index + 1, "،", "punctuation", "الفاصلة العربية (،)");
      } else if (char === "?") {
        addIssue("?", pMatch.index, pMatch.index + 1, "؟", "punctuation", "علامة الاستفهام العربية (؟)");
      } else if (char === ";") {
        addIssue(";", pMatch.index, pMatch.index + 1, "؛", "punctuation", "الفاصلة المنقوطة العربية (؛)");
      }
    }
  }

  // Phase 4: Tokenize Arabic words and apply deep morphological rules
  const arWordRegex = /[\u0621-\u064A\u0671]+/g;
  let arMatch: RegExpExecArray | null;

  while ((arMatch = arWordRegex.exec(text)) !== null) {
    const rawWord = arMatch[0];
    const start = arMatch.index;
    const end = start + rawWord.length;

    // A) Exact Mappings & Identity/Pronoun typos (e.g. اسمم -> اسمي)
    if (AR_EXACT_WORDS[rawWord]) {
      const entry = AR_EXACT_WORDS[rawWord];
      addIssue(rawWord, start, end, entry.fixed, entry.type, entry.exp);
      continue;
    }

    // B) Alif Maqsura direct check
    if (ALIF_MAQSURA_WORDS[rawWord]) {
      addIssue(rawWord, start, end, ALIF_MAQSURA_WORDS[rawWord], "alif_maqsura", "ألف مقصورة (ى)");
      continue;
    }

    // C) Hamzat Qat' direct check
    if (HAMZA_QAT_WORDS[rawWord]) {
      addIssue(rawWord, start, end, HAMZA_QAT_WORDS[rawWord], "hamza", "همزة قطع واجبة (أ / إ)");
      continue;
    }

    // D) Hamzat Wasl (Quin/Sextuple roots)
    let isWasl = false;
    for (const waslRoot of HAMZA_WASL_ROOTS) {
      if (rawWord.includes(`إ${waslRoot}`) || rawWord.includes(`أ${waslRoot}`)) {
        const fixed = rawWord.replace(`إ${waslRoot}`, `ا${waslRoot}`).replace(`أ${waslRoot}`, `ا${waslRoot}`);
        addIssue(rawWord, start, end, fixed, "hamza", "همزة وصل تُكتب ألفاً قائمة دون همزة (ا)");
        isWasl = true;
        break;
      }
    }
    if (isWasl) continue;

    // E) Morphological Affix Stripping Analysis
    const { prefix, stem } = stripPrefix(rawWord);
    if (prefix && stem.length >= 2) {
      if (AR_EXACT_WORDS[stem]) {
        const entry = AR_EXACT_WORDS[stem];
        addIssue(rawWord, start, end, `${prefix}${entry.fixed}`, entry.type, entry.exp);
        continue;
      }
      if (ALIF_MAQSURA_WORDS[stem]) {
        addIssue(rawWord, start, end, `${prefix}${ALIF_MAQSURA_WORDS[stem]}`, "alif_maqsura", "ألف مقصورة (ى)");
        continue;
      }
      if (HAMZA_QAT_WORDS[stem]) {
        addIssue(rawWord, start, end, `${prefix}${HAMZA_QAT_WORDS[stem]}`, "hamza", "همزة قطع بعد السابقة");
        continue;
      }
      // Prefix + Alif Wasl check
      if (prefix === "ال" || prefix === "وال" || prefix === "فال" || prefix === "بال") {
        if (stem.startsWith("إ") || stem.startsWith("أ")) {
          const stemWithoutHamza = stem.slice(1);
          for (const waslRoot of HAMZA_WASL_ROOTS) {
            if (stemWithoutHamza.startsWith(waslRoot.slice(1))) {
              const fixed = `${prefix}ا${stemWithoutHamza}`;
              addIssue(rawWord, start, end, fixed, "hamza", "همزة وصل في الخماسي/السداسي بعد ال التعريف");
              isWasl = true;
              break;
            }
          }
          if (isWasl) continue;
        }
      }
    }

    // F) Repeated Characters Heuristic (e.g. "اسمم" -> "اسمي" or "اسم")
    if (rawWord.length >= 4) {
      const lastTwo = rawWord.slice(-2);
      if (lastTwo[0] === lastTwo[1] && !["ت", "د", "ر", "ز", "س", "ش"].includes(lastTwo[0])) {
        // Repeated letters like مم at end of word
        if (lastTwo === "مم" && (rawWord.startsWith("اسم") || rawWord.startsWith("إسم"))) {
          addIssue(rawWord, start, end, "اسمي", "typo", "خطأ طباعي في نهاية الكلمة: ياء المتكلم (اسمي)");
          continue;
        }
        // General repeated ending character: strip one
        const collapsed = rawWord.slice(0, -1);
        addIssue(rawWord, start, end, collapsed, "typo", `تكرار غير سليم للحرف (${lastTwo[0]}) في نهاية الكلمة`);
        continue;
      }

      // Triple identical characters anywhere (e.g. شكرااا, كتاااب)
      const tripleMatch = /(.)\1{2,}/.exec(rawWord);
      if (tripleMatch) {
        const cleaned = rawWord.replace(/(.)\1{2,}/g, "$1");
        addIssue(rawWord, start, end, cleaned, "typo", `إطالة وتكرار زائد للحرف (${tripleMatch[1]})`);
        continue;
      }
    }

    // G) Levenshtein Candidate Matching for Common Words
    if (rawWord.length >= 4) {
      for (const known of COMMON_AR_LEXICON) {
        if (Math.abs(known.length - rawWord.length) <= 1) {
          const dist = levenshtein(rawWord, known);
          if (dist === 1 && known !== rawWord) {
            // E.g. "اسمم" vs "اسمي"
            addIssue(rawWord, start, end, known, "typo", `كلمة قريبة محتملة: (${known})`);
            break;
          }
        }
      }
    }

    // H) Heuristic Ta Marbuta (ة) vs Ha (ه)
    if (rawWord.endsWith("ه") && !GENUINE_HA_WORDS.has(rawWord)) {
      const stemCheck = prefix ? stem : rawWord;
      // Ends with 'يه' (e.g. تقنيه، شخصيه، ذكيه، اهميه، امنيه، علميه، عمليه، مسؤوليه)
      if (stemCheck.endsWith("يه") && stemCheck.length >= 3 && !GENUINE_HA_WORDS.has(stemCheck)) {
        const fixed = rawWord.slice(0, -1) + "ة";
        addIssue(rawWord, start, end, fixed, "ta_marbuta", "ياء النسبة والأسماء المؤنثة تنتهي بتاء مربوطة (ـية)");
        continue;
      }
      // Ends with 'اه' (حياه، قناه، صلاه، زكاه، فتاه، نجاه، وفاه، مباراه، معاناه، مكافاه)
      if (stemCheck.endsWith("اه") && stemCheck.length >= 3 && !GENUINE_HA_WORDS.has(stemCheck)) {
        const fixed = rawWord.slice(0, -1) + "ة";
        addIssue(rawWord, start, end, fixed, "ta_marbuta", "اسم مؤنث ينتهي بألف وتاء مربوطة (ـاة)");
        continue;
      }
      // Common feminine patterns (فَعيلة: جميله، جديده، كبيره / فاعلة: كامله / مفعولة: معلومه)
      if (stemCheck.length >= 4 && !GENUINE_HA_WORDS.has(stemCheck)) {
        const fixed = rawWord.slice(0, -1) + "ة";
        addIssue(rawWord, start, end, fixed, "ta_marbuta", "اسم أو صفة مؤنثة تنتهي بتاء مربوطة (ة)");
        continue;
      }
    }

    // I) Double Alif Tanwin error (e.g. مساءاً -> مساءً)
    if (rawWord.endsWith("اءاً") || rawWord.endsWith("اءا")) {
      const fixed = rawWord.replace(/اءاً?$/, "اءً");
      addIssue(rawWord, start, end, fixed, "tanwin", "الهمزة المتطرفة بعد ألف لا تلحقها ألف تنوين (ـاءً)");
      continue;
    }
  }

  // Phase 5: Tokenize English words
  const enWordRegex = /\b[a-zA-Z']+\b/g;
  let enMatch: RegExpExecArray | null;
  while ((enMatch = enWordRegex.exec(text)) !== null) {
    const rawWord = enMatch[0];
    const lower = rawWord.toLowerCase();
    if (ENGLISH_FIXES[lower]) {
      const suggestion =
        rawWord[0] === rawWord[0].toUpperCase()
          ? ENGLISH_FIXES[lower].charAt(0).toUpperCase() + ENGLISH_FIXES[lower].slice(1)
          : ENGLISH_FIXES[lower];

      addIssue(
        rawWord,
        enMatch.index,
        enMatch.index + rawWord.length,
        suggestion,
        "typo",
        `تصحيح إملائي إنجليزي: "${suggestion}"`
      );
    }
  }

  // Phase 6: Apply non-overlapping fixes in descending start order
  const sortedIssues = [...issues].sort((a, b) => b.start - a.start);
  let corrected = text;
  const seenIntervals: Array<[number, number]> = [];

  for (const issue of sortedIssues) {
    const overlaps = seenIntervals.some(
      ([s, e]) => Math.max(s, issue.start) < Math.min(e, issue.end)
    );
    if (!overlaps && issue.suggestions.length > 0) {
      seenIntervals.push([issue.start, issue.end]);
      corrected =
        corrected.slice(0, issue.start) +
        issue.suggestions[0] +
        corrected.slice(issue.end);
    }
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const errorRate = wordCount > 0 ? issues.length / wordCount : 0;
  const score = Math.max(0, Math.min(100, Math.round((1 - errorRate * 1.2) * 100)));

  return {
    original: text,
    corrected,
    issues,
    wordCount,
    score,
    categoriesCount,
  };
}

// ---------------------------------------------------------------------------
// 8. Mobile-style Word Prediction Engine
// ---------------------------------------------------------------------------
const AR_PREDICTIONS = [
  "السلام", "عليكم", "ورحمة", "الله", "وبركاته", "شكراً", "جزيلاً", "أهلاً", "وسهلاً",
  "التطبيق", "الحافظة", "المستخدم", "الكلمات", "المرور", "النظام", "اليوم", "العمل",
  "النسخ", "اللصق", "التدقيق", "اللغوي", "التقرير", "الملفات", "الصور", "الروابط", "الإعدادات",
  "تفضيل", "مرحبا", "تحياتي", "بالتأكيد", "ممتاز", "رائع", "جديد", "سريع", "آمن"
];

const EN_PREDICTIONS = [
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
  "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
  "hello", "thanks", "welcome", "clipboard", "vault", "password", "smart", "quick"
];

export function predictWords(input: string, limit = 6): string[] {
  if (!input) return ["السلام", "شكراً", "أهلاً", "Hello", "Thanks", "Welcome"];

  const words = input.trimEnd().split(/\s+/);
  const currentWord = words[words.length - 1]?.trim().toLowerCase() || "";

  if (!currentWord) {
    return /[\u0600-\u06FF]/.test(input)
      ? ["عليكم", "جزيلاً", "وسهلاً", "التطبيق", "اليوم", "الآن"]
      : ["you", "the", "this", "with", "for", "here"];
  }

  const isArabic = /[\u0600-\u06FF]/.test(currentWord);
  const dict = isArabic ? AR_PREDICTIONS : EN_PREDICTIONS;

  const matches = dict
    .filter((w) => w.toLowerCase().startsWith(currentWord) && w.toLowerCase() !== currentWord)
    .slice(0, limit);

  return matches;
}
