/**
 * ClipVault i18n — lightweight Arabic/English localization.
 *
 * - Arabic is the primary (default) language and the source of truth.
 * - English is a first-class citizen: full RTL→LTR flip via document.dir,
 *   Segoe UI typography, and localized relative-time/source labels.
 * - Dictionaries are split per module so every surface owns its namespace:
 *   core (shell/list/menu/settings) · vault · typing · preview.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api } from "../api";
import { coreAr, coreEn } from "./dict/core";
import { vaultAr, vaultEn } from "./dict/vault";
import { typingAr, typingEn } from "./dict/typing";
import { previewAr, previewEn } from "./dict/preview";

export type Lang = "ar" | "en";

type Dict = Record<string, unknown>;

/** Recursively flatten a nested dictionary into dotted keys. */
function flatten(dict: Dict, prefix = ""): Dict {
  const out: Dict = {};
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === "object") {
      Object.assign(out, flatten(value as Dict, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

/** Prefix a flat module dictionary (keys without the namespace). */
function flatWithPrefix(obj: Record<string, string>, prefix: string): Dict {
  const out: Dict = {};
  for (const [key, value] of Object.entries(obj)) out[prefix + key] = value;
  return out;
}

const DICTS: Record<Lang, Dict> = {
  ar: {
    ...flatten(coreAr),
    ...flatWithPrefix(vaultAr, "vault."),
    ...flatWithPrefix(typingAr, "typing."),
    ...flatWithPrefix(previewAr, "preview."),
  },
  en: {
    ...flatten(coreEn),
    ...flatWithPrefix(vaultEn, "vault."),
    ...flatWithPrefix(typingEn, "typing."),
    ...flatWithPrefix(previewEn, "preview."),
  },
};

/** Resolve a dotted key into a dictionary — supports both nested objects
 *  and flat maps whose keys are fully-dotted strings. */
function lookup(dict: Dict, key: string): string | undefined {
  const direct = dict[key];
  if (typeof direct === "string") return direct;
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Replace {placeholders} with provided params. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    name in params ? String(params[name]) : m,
  );
}

interface I18nCtx {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

function applyDocumentLang(lang: Lang) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === "ar" ? "rtl" : "ltr";
  html.dataset.lang = lang;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  // Boot: restore the saved language (silent — Tauri or mock).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.getSettings();
        if (alive && s.lang === "en") setLangState("en");
      } catch { /* default Arabic */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => applyDocumentLang(lang), [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    applyDocumentLang(next);
    // Persist (fire-and-forget; works in Tauri, no-op safe in browser mock).
    api.setSettings({ lang: next }).catch(() => { /* ignore */ });
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const primary = lookup(DICTS[lang], key);
      if (primary !== undefined) return interpolate(primary, params);
      // Fall back to the other language, then to the key's last segment.
      const other = lookup(DICTS[lang === "ar" ? "en" : "ar"], key);
      if (other !== undefined) return interpolate(other, params);
      const last = key.split(".").pop() ?? key;
      return interpolate(last.replace(/([A-Z])/g, " $1").toLowerCase(), params);
    },
    [lang],
  );

  const value = useMemo<I18nCtx>(
    () => ({ lang, dir: lang === "ar" ? "rtl" : "ltr", setLang, t }),
    [lang, setLang, t],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Convenience for components that only need the translator. */
export function useT() {
  return useI18n().t;
}

/** Locale-aware digit formatting (Latin digits in both languages, like v1.x). */
export function fmtNum(n: number, lang: Lang): string {
  return n.toLocaleString(lang === "ar" ? "ar-EG" : "en-US");
}
