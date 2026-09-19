/**
 * Pro Spell Checker & Word Predictor Engine for Arabic & English.
 * Implements rule-based correction, phonetic typo fixes, and mobile-style word prediction.
 */

export interface SpellIssue {
  id: string;
  word: string;
  start: number;
  end: number;
  suggestions: string[];
  type: "hamza" | "ta_marbuta" | "alif_maqsura" | "tanwin" | "punctuation" | "grammar" | "typo";
  explanation: string;
}

export interface SpellCheckResult {
  original: string;
  corrected: string;
  issues: SpellIssue[];
  wordCount: number;
  score: number; // 0 to 100
}

// Common Arabic dictionary and heuristic replacements
const ARABIC_FIXES: Array<{ pattern: RegExp; replace: string; type: SpellIssue["type"]; reason: string }> = [
  // Hamza fixes
  { pattern: /\bإست([ء-ي]+)/g, replace: "است$1", type: "hamza", reason: "همزة وصل في مصدر وسداسي (است)" },
  { pattern: /\bأخت([ء-ي]+)/g, replace: "اخت$1", type: "hamza", reason: "همزة وصل في خماسي" },
  { pattern: /\bاحمد\b/g, replace: "أحمد", type: "hamza", reason: "همزة قطع في اسم علم" },
  { pattern: /\bابراهيم\b/g, replace: "إبراهيم", type: "hamza", reason: "همزة قطع في اسم أعجمي" },
  { pattern: /\bاسماعيل\b/g, replace: "إسماعيل", type: "hamza", reason: "همزة قطع في اسم أعجمي" },
  { pattern: /\bاسلام\b/g, replace: "إسلام", type: "hamza", reason: "همزة قطع في مصدر رباعي" },
  { pattern: /\bانسان\b/g, replace: "إنسان", type: "hamza", reason: "همزة قطع مكسورة" },
  { pattern: /\bالي\b/g, replace: "إلى", type: "hamza", reason: "همزة قطع وألف مقصورة في حرف الجر (إلى)" },
  { pattern: /\bاذا\b/g, replace: "إذا", type: "hamza", reason: "همزة قطع مكسورة في أداة الشرط (إذا)" },
  { pattern: /\bايضا\b/g, replace: "أيضاً", type: "hamza", reason: "همزة قطع وتنوين في (أيضاً)" },
  { pattern: /\bاكثر\b/g, replace: "أكثر", type: "hamza", reason: "همزة قطع في اسم التفضيل" },
  { pattern: /\bاكبر\b/g, replace: "أكبر", type: "hamza", reason: "همزة قطع في اسم التفضيل" },
  { pattern: /\bافضل\b/g, replace: "أفضل", type: "hamza", reason: "همزة قطع في اسم التفضيل" },
  { pattern: /\bاصبح\b/g, replace: "أصبح", type: "hamza", reason: "همزة قطع في فعل رباعي" },
  { pattern: /\bاراد\b/g, replace: "أراد", type: "hamza", reason: "همزة قطع في فعل رباعي" },

  // Tanwin vs Nun
  { pattern: /\bشكرن\b/g, replace: "شكراً", type: "tanwin", reason: "تنوين نصب وليس نوناً ساكنة (شكراً)" },
  { pattern: /\bعفون\b/g, replace: "عفواً", type: "tanwin", reason: "تنوين نصب وليس نوناً (عفواً)" },
  { pattern: /\bاهلن\b/g, replace: "أهلاً", type: "tanwin", reason: "تنوين نصب وليس نوناً (أهلاً)" },
  { pattern: /\bسهلن\b/g, replace: "سهلاً", type: "tanwin", reason: "تنوين نصب وليس نوناً (سهلاً)" },
  { pattern: /\bدائمن\b/g, replace: "دائماً", type: "tanwin", reason: "تنوين نصب وليس نوناً (دائماً)" },
  { pattern: /\bجدن\b/g, replace: "جداً", type: "tanwin", reason: "تنوين نصب وليس نوناً (جداً)" },
  { pattern: /\bحاليين\b/g, replace: "حالياً", type: "tanwin", reason: "تنوين نصب في الظرف (حالياً)" },

  // Alif Maqsura vs Ya
  { pattern: /\bحتي\b/g, replace: "حتى", type: "alif_maqsura", reason: "ألف مقصورة في حرف الغاية (حتى)" },
  { pattern: /\bعلي\b/g, replace: "على", type: "alif_maqsura", reason: "ألف مقصورة في حرف الجر (على)" },
  { pattern: /\bمستشفي\b/g, replace: "مستشفى", type: "alif_maqsura", reason: "ألف مقصورة في نهاية الاسم المقصور" },
  { pattern: /\bمنتدي\b/g, replace: "منتدى", type: "alif_maqsura", reason: "ألف مقصورة في نهاية الاسم المقصور" },
  { pattern: /\bمعني\b/g, replace: "معنى", type: "alif_maqsura", reason: "ألف مقصورة في نهاية الاسم المقصور" },
  { pattern: /\bدعوي\b/g, replace: "دعوى", type: "alif_maqsura", reason: "ألف مقصورة" },
  { pattern: /\bاحدي\b/g, replace: "إحدى", type: "alif_maqsura", reason: "همزة قطع وألف مقصورة (إحدى)" },

  // Ta Marbuta vs Ha
  { pattern: /\bمدرسه\b/g, replace: "مدرسة", type: "ta_marbuta", reason: "تاء مربوطة تنطق هاء عند الوقف" },
  { pattern: /\bجامعه\b/g, replace: "جامعة", type: "ta_marbuta", reason: "تاء مربوطة تنطق هاء عند الوقف" },
  { pattern: /\bصوره\b/g, replace: "صورة", type: "ta_marbuta", reason: "تاء مربوطة تنطق هاء عند الوقف" },
  { pattern: /\bحياه\b/g, replace: "حياة", type: "ta_marbuta", reason: "تاء مربوطة تنطق هاء عند الوقف" },
  { pattern: /\bجميله\b/g, replace: "جميلة", type: "ta_marbuta", reason: "تاء مربوطة في الصفة المؤنثة" },
  { pattern: /\bمكتبه\b/g, replace: "مكتبة", type: "ta_marbuta", reason: "تاء مربوطة تنطق هاء عند الوقف" },
  { pattern: /\bطريقه\b/g, replace: "طريقة", type: "ta_marbuta", reason: "تاء مربوطة تنطق هاء عند الوقف" },
  { pattern: /\bحقيقه\b/g, replace: "حقيقة", type: "ta_marbuta", reason: "تاء مربوطة تنطق هاء عند الوقف" },
  { pattern: /\bرساله\b/g, replace: "رسالة", type: "ta_marbuta", reason: "تاء مربوطة تنطق هاء عند الوقف" },
  { pattern: /\bفتره\b/g, replace: "فترة", type: "ta_marbuta", reason: "تاء مربوطة تنطق هاء عند الوقف" },

  // Dhad vs Dhaa
  { pattern: /\bظغط\b/g, replace: "ضغط", type: "typo", reason: "حرف الضاد (ض) وليس الظاء (ظ)" },
  { pattern: /\bحفض\b/g, replace: "حفظ", type: "typo", reason: "حرف الظاء (ظ) وليس الضاد (ض)" },
  { pattern: /\bنضام\b/g, replace: "نظام", type: "typo", reason: "حرف الظاء (ظ) وليس الضاد (ض)" },
  { pattern: /\bمضهر\b/g, replace: "مظهر", type: "typo", reason: "حرف الظاء (ظ) وليس الضاد (ض)" },

  // Conjunction Waw spacing
  { pattern: /\bو ([ء-ي])/g, replace: "و$1", type: "grammar", reason: "واو العطف لا تفصل عن الكلمة التي تليها بمسافة" },

  // Arabic Punctuation
  { pattern: / ,/g, replace: "،", type: "punctuation", reason: "الفاصلة العربية (،) بدون مسافة قبلها" },
  { pattern: / \?/g, replace: "؟", type: "punctuation", reason: "علامة الاستفهام العربية (؟)" },
  { pattern: / ;/g, replace: "؛", type: "punctuation", reason: "الفاصلة المنقوطة العربية (؛)" },
];

// Common English fixes
const ENGLISH_FIXES: Record<string, string> = {
  teh: "the",
  recieve: "receive",
  seperate: "separate",
  definately: "definitely",
  occured: "occurred",
  untill: "until",
  wierd: "weird",
  alot: "a lot",
  dont: "don't",
  cant: "can't",
  wont: "won't",
  shouldnt: "shouldn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  hasnt: "hasn't",
  havent: "haven't",
  hadnt: "hadn't",
  accomodate: "accommodate",
  acheive: "achieve",
  accross: "across",
  agressive: "aggressive",
  apparantly: "apparently",
  appearence: "appearance",
  arguement: "argument",
  beleive: "believe",
  calender: "calendar",
  colleague: "colleague",
  comming: "coming",
  embarass: "embarrass",
  enviroment: "environment",
  goverment: "government",
  independant: "independent",
  knowlege: "knowledge",
  neccessary: "necessary",
  noticable: "noticeable",
  persue: "pursue",
  peice: "piece",
  priviledge: "privilege",
  publically: "publicly",
  realy: "really",
  refered: "referred",
  religous: "religious",
  rember: "remember",
  succesful: "successful",
  tommorow: "tomorrow",
  truely: "truly",
  unfortunatly: "unfortunately",
  wich: "which",
};

// High-frequency prediction dictionary for mobile-style autocomplete
const AR_PREDICTIONS: string[] = [
  "السلام", "عليكم", "ورحمة", "الله", "وبركاته", "شكراً", "جزيلاً", "أهلاً", "وسهلاً",
  "التطبيق", "الحافظة", "المستخدم", "البرنامج", "الرجاء", "التكرم", "التحديث", "التعديل",
  "إضافة", "تعديل", "حفظ", "نسخ", "لصق", "استخراج", "النص", "الصورة", "كلمة", "المرور",
  "البريد", "الإلكتروني", "الموقع", "الرابط", "الملف", "المستند", "التحميل", "التثبيت",
  "مرحباً", "اليوم", "غداً", "أمس", "الآن", "دائماً", "حالياً", "أيضاً", "جداً", "فقط",
  "مع", "على", "إلى", "عن", "من", "في", "هذا", "هذه", "ذلك", "تلك", "التي", "الذي",
  "كيف", "لماذا", "متى", "أين", "كم", "هل", "نعم", "كلا", "حسناً", "بالتأكيد", "ممتاز",
  "رائع", "جميل", "سريع", "دقيق", "احترافي", "جديد", "سابق", "تالي", "أول", "أخير"
];

const EN_PREDICTIONS: string[] = [
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "I", "it", "for", "not",
  "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from",
  "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would",
  "there", "their", "what", "so", "up", "out", "if", "about", "who", "get", "which",
  "go", "me", "when", "make", "can", "like", "time", "no", "just", "him", "know",
  "take", "people", "into", "year", "your", "good", "some", "could", "them", "see",
  "other", "than", "then", "now", "look", "only", "come", "its", "over", "think",
  "also", "back", "after", "use", "two", "how", "our", "work", "first", "well",
  "way", "even", "new", "want", "because", "any", "these", "give", "day", "most",
  "application", "clipboard", "password", "vault", "update", "release", "download"
];

/**
 * Check text and return detailed issues and corrected text.
 */
export function checkSpelling(text: string): SpellCheckResult {
  if (!text || !text.trim()) {
    return { original: text, corrected: text, issues: [], wordCount: 0, score: 100 };
  }

  const issues: SpellIssue[] = [];
  let corrected = text;

  // 1. Run Arabic Regex Rules
  for (const rule of ARABIC_FIXES) {
    let match: RegExpExecArray | null;
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    while ((match = re.exec(text)) !== null) {
      const originalWord = match[0];
      const replacement = originalWord.replace(rule.pattern, rule.replace);
      if (originalWord !== replacement) {
        issues.push({
          id: `ar-${match.index}-${originalWord}`,
          word: originalWord,
          start: match.index,
          end: match.index + originalWord.length,
          suggestions: [replacement],
          type: rule.type,
          explanation: rule.reason,
        });
      }
    }
  }

  // 2. Run English Words Fixes
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

      issues.push({
        id: `en-${enMatch.index}-${rawWord}`,
        word: rawWord,
        start: enMatch.index,
        end: enMatch.index + rawWord.length,
        suggestions: [suggestion],
        type: "typo",
        explanation: `تصحيح إملائي مقترح: "${suggestion}"`,
      });
    }
  }

  // 3. Build corrected text by applying unique non-overlapping fixes
  // Sort issues in descending order by start index so replacements don't offset subsequent indices
  const sortedIssues = [...issues].sort((a, b) => b.start - a.start);
  const seenIndices = new Set<number>();

  for (const issue of sortedIssues) {
    if (!seenIndices.has(issue.start) && issue.suggestions.length > 0) {
      seenIndices.add(issue.start);
      corrected =
        corrected.slice(0, issue.start) +
        issue.suggestions[0] +
        corrected.slice(issue.end);
    }
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const errorRate = wordCount > 0 ? issues.length / wordCount : 0;
  const score = Math.max(0, Math.min(100, Math.round((1 - errorRate * 1.5) * 100)));

  return {
    original: text,
    corrected,
    issues,
    wordCount,
    score,
  };
}

/**
 * Predict next words or complete current word (Mobile keyboard style).
 */
export function predictWords(input: string, limit = 5): string[] {
  if (!input) return ["السلام", "شكراً", "أهلاً", "Hello", "Thanks"];

  const words = input.trimEnd().split(/\s+/);
  const currentWord = words[words.length - 1]?.trim().toLowerCase() || "";

  if (!currentWord) {
    // Return most frequent starting words
    return /[\u0600-\u06FF]/.test(input)
      ? ["عليكم", "جزيلاً", "وسهلاً", "التطبيق", "اليوم"]
      : ["you", "the", "this", "with", "for"];
  }

  const isArabic = /[\u0600-\u06FF]/.test(currentWord);
  const dict = isArabic ? AR_PREDICTIONS : EN_PREDICTIONS;

  const matches = dict
    .filter((w) => w.toLowerCase().startsWith(currentWord) && w.toLowerCase() !== currentWord)
    .slice(0, limit);

  return matches;
}
