const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** Arabic relative time with Latin digits, e.g. "منذ 5 دقائق". */
export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000, hour = 3_600_000, day = 86_400_000;

  if (diff < 45_000) return "الآن";
  if (diff < 2 * min) return "منذ دقيقة";
  if (diff < 55 * min) return `منذ ${Math.round(diff / min)} دقائق`;
  if (diff < 2 * hour) return "منذ ساعة";
  if (diff < 22 * hour) return `منذ ${Math.round(diff / hour)} ساعات`;
  if (diff < 2 * day) return "منذ يوم";
  if (diff < 25 * day) return `منذ ${Math.round(diff / day)} أيام`;

  const d = new Date(ts);
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
}

export function fullTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} — ${hh}:${mm}`;
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

/** Display name for the source app (friendly name or stripped .exe). */
export function sourceLabel(src: string | null): string {
  if (!src) return "";
  const clean = src.replace(/\.exe$/i, "").toLowerCase();
  return APP_NAMES[clean] || (src.replace(/\.exe$/i, ""));
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
