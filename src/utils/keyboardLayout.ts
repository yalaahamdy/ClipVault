/**
 * Comprehensive bidirectional mapping between US QWERTY and Arabic 101/102 keyboard layouts.
 * Covers normal characters, shift characters, diacritics, and punctuation.
 */

// Mapping from English QWERTY characters to Arabic equivalents
const EN_TO_AR: Record<string, string> = {
  // Lowercase letters
  q: "ض",
  w: "ص",
  e: "ث",
  r: "ق",
  t: "ف",
  y: "غ",
  u: "ع",
  i: "ه",
  o: "خ",
  p: "ح",
  "[": "ج",
  "]": "د",
  a: "ش",
  s: "س",
  d: "ي",
  f: "ب",
  g: "ل",
  h: "ا",
  j: "ت",
  k: "ن",
  l: "م",
  ";": "ك",
  "'": "ط",
  z: "ئ",
  x: "ء",
  c: "ؤ",
  v: "ر",
  b: "لا",
  n: "ى",
  m: "ة",
  ",": "و",
  ".": "ز",
  "/": "ظ",
  "`": "ذ",

  // Uppercase / Shift letters
  Q: "َ", // Fatha
  W: "ً", // Tanwin Fath
  E: "ُ", // Damma
  R: "ٌ", // Tanwin Damm
  T: "لإ",
  Y: "إ",
  U: "‘",
  I: "÷",
  O: "×",
  P: "؛",
  "{": "<",
  "}": ">",
  A: "ِ", // Kasra
  S: "ٍ", // Tanwin Kasr
  D: "]",
  F: "[",
  G: "لأ",
  H: "أ",
  J: "ـ", // Tatweel
  K: "،",
  L: "/",
  ":": ":",
  '"': '"',
  Z: "~",
  X: "ْ", // Sukun
  C: "}",
  V: "{",
  B: "لآ",
  N: "آ",
  M: "’",
  "<": ",",
  ">": ".",
  "?": "؟",
  "~": "ّ", // Shadda
};

// Reverse mapping from Arabic to English
const AR_TO_EN: Record<string, string> = {};

// Populate reverse mapping dynamically
for (const [en, ar] of Object.entries(EN_TO_AR)) {
  AR_TO_EN[ar] = en;
}

// Special ligatures and compound characters in Arabic
const AR_LIGATURES: Record<string, string> = {
  "لا": "b",
  "لإ": "T",
  "لأ": "G",
  "لآ": "B",
};

/**
 * Invert or convert text between English and Arabic keyboard layouts.
 * If targetLanguage is specified, forces conversion to that language.
 * Otherwise, auto-detects the predominant language and inverts it.
 */
export function convertKeyboardLayout(text: string, forceTarget?: "ar" | "en"): {
  converted: string;
  sourceLang: "ar" | "en";
  targetLang: "ar" | "en";
} {
  if (!text) {
    return { converted: "", sourceLang: "en", targetLang: "ar" };
  }

  // Count character types to determine language direction
  let arabicCount = 0;
  let englishCount = 0;

  for (const char of text) {
    if (/[\u0600-\u06FF]/.test(char)) {
      arabicCount++;
    } else if (/[a-zA-Z]/.test(char)) {
      englishCount++;
    }
  }

  const detectedSource: "ar" | "en" =
    forceTarget === "ar" ? "en"
    : forceTarget === "en" ? "ar"
    : arabicCount >= englishCount && arabicCount > 0 ? "ar"
    : "en";

  const targetLang: "ar" | "en" = detectedSource === "ar" ? "en" : "ar";

  if (detectedSource === "en") {
    // English -> Arabic
    let result = "";
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (EN_TO_AR[char] !== undefined) {
        result += EN_TO_AR[char];
      } else {
        result += char;
      }
    }
    return { converted: result, sourceLang: "en", targetLang: "ar" };
  } else {
    // Arabic -> English
    let result = "";
    let i = 0;
    while (i < text.length) {
      // Check for 2-char ligatures first (لا, لإ, لأ, لآ)
      const twoChars = text.slice(i, i + 2);
      if (AR_LIGATURES[twoChars]) {
        result += AR_LIGATURES[twoChars];
        i += 2;
        continue;
      }

      const char = text[i];
      if (AR_TO_EN[char] !== undefined) {
        result += AR_TO_EN[char];
      } else {
        result += char;
      }
      i++;
    }
    return { converted: result, sourceLang: "ar", targetLang: "en" };
  }
}

/**
 * Checks if a piece of text looks like an accidental layout mismatch.
 * e.g., "hghsjoqhl" -> true, "hello" -> false.
 */
export function looksLikeLayoutMismatch(text: string): boolean {
  if (!text || text.length < 3) return false;

  const trimmed = text.trim();
  // If text contains English characters with common Arabic typos like semicolons, commas in word bodies
  if (/^[a-zA-Z;,./'[\]`]{3,}$/.test(trimmed)) {
    // Check if inverted form produces valid-looking Arabic letter combinations
    const { converted } = convertKeyboardLayout(trimmed, "ar");
    const hasArabicWords = /[\u0621-\u064A]{3,}/.test(converted);
    return hasArabicWords;
  }

  // If text is Arabic characters like "صصصزيثلاثزؤخئ" (www.google.com)
  if (/^[\u0600-\u06FFزئءؤطةىة]{3,}$/.test(trimmed)) {
    const { converted } = convertKeyboardLayout(trimmed, "en");
    const hasEnglishWords = /[a-zA-Z0-9]{3,}/.test(converted);
    return hasEnglishWords;
  }

  return false;
}
