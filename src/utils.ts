const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const EN_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const REL: Record<"ar" | "en", Record<string, string>> = {
  ar: { now: "الآن", min: "منذ دقيقة", hour: "منذ ساعة", day: "منذ يوم" },
  en: { now: "Just now", min: "A minute ago", hour: "An hour ago", day: "A day ago" },
};

export type UiLang = "ar" | "en";

/** Locale-aware relative time with Latin digits, e.g. "منذ 5 دقائق" / "5 minutes ago". */
export function relTime(ts: number, lang: UiLang = "ar"): string {
  const diff = Date.now() - ts;
  const min = 60_000, hour = 3_600_000, day = 86_400_000;
  const r = REL[lang];
  const mins = (n: number) =>
    lang === "ar" ? `منذ ${n} دقائق` : `${n} minute${n === 1 ? "" : "s"} ago`;
  const hours = (n: number) =>
    lang === "ar" ? `منذ ${n} ساعات` : `${n} hour${n === 1 ? "" : "s"} ago`;
  const days = (n: number) =>
    lang === "ar" ? `منذ ${n} أيام` : `${n} day${n === 1 ? "" : "s"} ago`;

  if (diff < 45_000) return r.now;
  if (diff < 2 * min) return r.min;
  if (diff < 55 * min) return mins(Math.round(diff / min));
  if (diff < 2 * hour) return r.hour;
  if (diff < 22 * hour) return hours(Math.round(diff / hour));
  if (diff < 2 * day) return r.day;
  if (diff < 25 * day) return days(Math.round(diff / day));

  const d = new Date(ts);
  const months = lang === "ar" ? AR_MONTHS : EN_MONTHS;
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function fullTime(ts: number, lang: UiLang = "ar"): string {
  const d = new Date(ts);
  const months = lang === "ar" ? AR_MONTHS : EN_MONTHS;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${months[d.getMonth()]} — ${hh}:${mm}`;
}

export function isUrl(s: string): boolean {
  const t = s.trim();
  if (t.length > 2048 || t.includes("\n") || t.includes(" ")) return false;
  const l = t.toLowerCase();
  return l.startsWith("http://") || l.startsWith("https://") || l.startsWith("www.");
}

export function domainOf(url: string): string {
  try {
    const u = new URL(url.startsWith("www.") ? `https://${url}` : url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

/** Light heuristic: does this text look like source code? */
export function looksLikeCode(s: string): boolean {
  if (s.length < 24 || !s.includes("\n")) return false;
  const patterns = [
    /(^|\n)\s*(function|const |let |var |class |def |import |export |from |public |private |struct |impl |fn |use |#include|SELECT\s|INSERT\s|UPDATE\s)/,
    /[{;]\s*$/m,
    /=>|::|!==|===|<\/?\w+>/,
    /^\s*[{[\-(]/,
  ];
  let score = 0;
  for (const p of patterns) if (p.test(s)) score++;
  // natural-language guard: many spaces-per-line + no symbols => probably prose
  const lines = s.split("\n").filter(Boolean).length;
  const symbols = (s.match(/[{}();=<>[\]]/g) || []).length;
  if (lines > 1 && symbols / Math.max(s.length, 1) < 0.01) score = Math.min(score, 1);
  return score >= 2;
}

/** Credit-card-like pattern for sensitive auto-detection hints (backend also flags). */
export function looksSensitive(s: string): boolean {
  const t = s.replace(/\s+/g, " ").trim();
  return /^(?:\d[ -]?){13,19}$/.test(t);
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const APP_NAMES: Record<string, string> = {
  chrome: "Google Chrome",
  msedge: "Microsoft Edge",
  firefox: "Firefox",
  brave: "Brave",
  opera: "Opera",
  code: "VS Code",
  devenv: "Visual Studio",
  notepad: "المفكرة",
  "notepad++": "Notepad++",
  explorer: "المستكشف",
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  whatsapp: "WhatsApp",
  spotify: "Spotify",
  winword: "Word",
  excel: "Excel",
  powerpnt: "PowerPoint",
  cmd: "موجه الأوامر",
  powershell: "PowerShell",
  windowsterminal: "Terminal",
  wt: "Terminal",
};

const APP_NAMES_EN: Record<string, string> = {
  notepad: "Notepad",
  explorer: "File Explorer",
  cmd: "Command Prompt",
};

/** Display name for the source app (friendly name or stripped .exe). */
export function sourceLabel(src: string | null, lang: UiLang = "ar"): string {
  if (!src) return "";
  const clean = src.replace(/\.exe$/i, "").toLowerCase();
  const ar = APP_NAMES[clean];
  const en = APP_NAMES_EN[clean];
  if (lang === "en") {
    if (en) return en;
    if (ar && /^[A-Za-z0-9 +&./-]+$/.test(ar)) return ar;
    return src.replace(/\.exe$/i, "");
  }
  return ar || src.replace(/\.exe$/i, "");
}

/** Short human label for a file path. */
export function fileNameOf(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() || p;
}

/** Suggested accent color for a domain avatar. */
export function colorFor(str: string): string {
  const palette = [
    "#3fb6ff", "#8b7cff", "#ff8b6b", "#4ade80",
    "#fbbf24", "#f472b6", "#38bdf8", "#a3e635",
  ];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export const TAG_COLORS = [
  "#3fb6ff", "#8b7cff", "#ff8b6b", "#4ade80",
  "#fbbf24", "#f472b6", "#2dd4bf", "#a3a3a3",
];
