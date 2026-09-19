/** Quick transforms — pure text operations available from the item context menu.
 *  Each transform copies its result to the clipboard and saves it as a new item. */

export interface Transform {
  id: string;
  icon: string;
  /** i18n key under the "tr." namespace */
  key: string;
  /** context-menu group: case | lines | data | clean */
  group: "case" | "lines" | "data" | "clean";
  /** transforms that can throw carry their own error keys via TransformError */
  apply: (text: string) => string;
}

export class TransformError extends Error {
  constructor(public reasonKey: string) {
    super(reasonKey);
  }
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

const titleCase = (s: string) =>
  s.replace(/[\p{L}\p{N}]*/gu, (w) =>
    w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w,
  );

const sentenceCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^\s*|[.!?؟…]\s+)([\p{L}])/gu, (_m, p1, p2: string) => p1 + p2.toUpperCase());

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToUtf8(s: string): string {
  // Strip whitespace/newlines that email-safe base64 often wraps with.
  const clean = s.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new TransformError("tr.invalidBase64");
  }
  const bin = atob(clean);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    throw new TransformError("tr.invalidJson");
  }
}

function minifyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    throw new TransformError("tr.invalidJson");
  }
}

export const TRANSFORMS: Transform[] = [
  { id: "upper", icon: "type", key: "tr.upper", group: "case", apply: (t) => t.toUpperCase() },
  { id: "lower", icon: "text", key: "tr.lower", group: "case", apply: (t) => t.toLowerCase() },
  { id: "title", icon: "type", key: "tr.title", group: "case", apply: titleCase },
  { id: "sentence", icon: "text", key: "tr.sentence", group: "case", apply: sentenceCase },

  {
    id: "trimLines",
    icon: "columns",
    key: "tr.trimLines",
    group: "lines",
    apply: (t) => lines(t).map((l) => l.trim()).join("\n"),
  },
  {
    id: "collapseSpaces",
    icon: "columns",
    key: "tr.collapseSpaces",
    group: "lines",
    apply: (t) => t.replace(/[ \t]{2,}/g, " ").trim(),
  },
  {
    id: "removeEmpty",
    icon: "listChecks",
    key: "tr.removeEmpty",
    group: "lines",
    apply: (t) => lines(t).filter((l) => l.trim().length > 0).join("\n"),
  },
  {
    id: "dedupeLines",
    icon: "listChecks",
    key: "tr.dedupeLines",
    group: "lines",
    apply: (t) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const l of lines(t)) {
        const k = l.trim();
        if (k && seen.has(k)) continue;
        seen.add(k);
        out.push(l);
      }
      return out.join("\n");
    },
  },
  {
    id: "sortAsc",
    icon: "chevronDown",
    key: "tr.sortAsc",
    group: "lines",
    apply: (t) => lines(t).sort((a, b) => a.localeCompare(b, "ar")).join("\n"),
  },
  {
    id: "sortDesc",
    icon: "chevronDown",
    key: "tr.sortDesc",
    group: "lines",
    apply: (t) => lines(t).sort((a, b) => b.localeCompare(a, "ar")).join("\n"),
  },
  {
    id: "removeBreaks",
    icon: "merge",
    key: "tr.removeBreaks",
    group: "lines",
    apply: (t) => t.replace(/\r?\n+/g, " ").replace(/[ \t]{2,}/g, " ").trim(),
  },

  { id: "jsonPretty", icon: "code", key: "tr.jsonPretty", group: "data", apply: prettyJson },
  { id: "jsonMinify", icon: "code", key: "tr.jsonMinify", group: "data", apply: minifyJson },
  {
    id: "urlEncode",
    icon: "link",
    key: "tr.urlEncode",
    group: "data",
    apply: (t) => encodeURIComponent(t),
  },
  {
    id: "urlDecode",
    icon: "link",
    key: "tr.urlDecode",
    group: "data",
    apply: (t) => {
      try {
        return decodeURIComponent(t.replace(/\+/g, " "));
      } catch {
        throw new TransformError("tr.invalidBase64");
      }
    },
  },
  { id: "base64Encode", icon: "key", key: "tr.base64Encode", group: "data", apply: utf8ToBase64 },
  { id: "base64Decode", icon: "key", key: "tr.base64Decode", group: "data", apply: base64ToUtf8 },

  {
    id: "stripHtml",
    icon: "fileText",
    key: "tr.stripHtml",
    group: "clean",
    apply: (t) =>
      t
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
  },
  {
    id: "stripDiacritics",
    icon: "text",
    key: "tr.stripDiacritics",
    group: "clean",
    apply: (t) =>
      t
        .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // harakat + dagger alif + tatweel
        .replace(/\u06E1/g, ""),
  },
];

export function transformById(id: string): Transform | undefined {
  return TRANSFORMS.find((t) => t.id === id);
}

export const TRANSFORM_GROUPS: Array<{ id: Transform["group"]; key: string }> = [
  { id: "case", key: "tr.groupText" },
  { id: "lines", key: "tr.groupLines" },
  { id: "data", key: "tr.groupData" },
  { id: "clean", key: "tr.groupClean" },
];
