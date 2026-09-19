import { useEffect, useRef, useState } from "react";
import type { Settings } from "../types";
import { api } from "../api";
import { APP_VERSION } from "../version";
import { Icon } from "../icons";
import { useI18n } from "../i18n";

interface Props {
  settings: Settings;
  paused: boolean;
  onSettingsChange: (s: Record<string, string>) => Promise<void>;
  onPausedChange: (p: boolean) => void;
  onClose: () => void;
  onClearHistory: () => void;
  notify: (msg: string, err?: boolean) => void;
}

/** Convert a KeyboardEvent into a Tauri-compatible shortcut string. */
function comboFromEvent(e: KeyboardEvent): string | null {
  const k = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(k)) return null;
  let key: string | null = null;
  if (/^[a-zA-Z]$/.test(k)) key = k.toUpperCase();
  else if (/^[0-9]$/.test(k)) key = k;
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) key = k;
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null;
  return [...parts, key].join("+");
}

export function SettingsView({
  settings, paused, onSettingsChange, onPausedChange, onClose, onClearHistory, notify,
}: Props) {
  const { t, lang } = useI18n();
  const [listening, setListening] = useState(false);
  const [newApp, setNewApp] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const listenRef = useRef<HTMLDivElement>(null);

  const excluded: string[] = (() => {
    try { return JSON.parse(settings.excludedApps || "[]"); } catch { return []; }
  })();

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  // global shortcut recorder
  useEffect(() => {
    if (!listening) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const combo = comboFromEvent(e);
      if (!combo) return; // ignore bare modifiers
      setListening(false);
      if (combo === settings.globalShortcut) return;
      try {
        await onSettingsChange({ globalShortcut: combo });
        notify(t("settings.shortcutSet", { combo }));
      } catch {
        notify(t("settings.shortcutFail"), true);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, settings.globalShortcut]);

  const patch = async (s: Record<string, string>, okMsg?: string) => {
    try {
      await onSettingsChange(s);
      if (okMsg) notify(okMsg);
    } catch (e) {
      notify(String(e), true);
    }
  };

  const addApp = () => {
    let name = newApp.trim().toLowerCase();
    if (!name) return;
    if (!name.endsWith(".exe")) name += ".exe";
    if (excluded.includes(name)) { setNewApp(""); return; }
    patch({ excludedApps: JSON.stringify([...excluded, name]) }, t("settings.excludedNote", { app: name }));
    setNewApp("");
  };

  const retentionLabel = (v: string) =>
    v === "0" ? t("settings.retentionUnlimited")
    : v === "7" ? t("settings.retentionWeek")
    : v === "30" ? t("settings.retention30")
    : t("settings.retention90");

  return (
    <div className="settings-view">
      <div className="settings-head">
        <button className="icon-btn" onClick={onClose} title={t("settings.backTitle")}>
          <Icon name="chevronRight" size={16} />
        </button>
        <h3><Icon name="settings" size={15} /> {t("settings.title")}</h3>
      </div>

      <div className="settings-body">
        {/* ---------- general ---------- */}
        <div className="settings-group">
          <h4>{t("settings.general")}</h4>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.autostartTitle")}</div>
              <div className="s-desc">{t("settings.autostartDesc")}</div>
            </div>
            <button
              className={`switch${settings.autostart === "1" ? " on" : ""}`}
              onClick={() => patch({ autostart: settings.autostart === "1" ? "0" : "1" })}
              aria-label={t("settings.autostartTitle")}
            />
          </div>
          <div className="setting-row">
            <div className="s-label"><div className="s-title">{t("settings.themeTitle")}</div></div>
            <div className="segmented">
              <button className={settings.theme !== "light" ? "on" : ""} onClick={() => patch({ theme: "dark" })}>
                {t("settings.dark")}
              </button>
              <button className={settings.theme === "light" ? "on" : ""} onClick={() => patch({ theme: "light" })}>
                {t("settings.light")}
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.languageTitle")}</div>
              <div className="s-desc">{t("settings.languageDesc")}</div>
            </div>
            <div className="segmented">
              <button
                className={lang === "ar" ? "on" : ""}
                onClick={() => patch({ lang: "ar" })}
              >
                {t("settings.langAr")}
              </button>
              <button
                className={lang === "en" ? "on" : ""}
                onClick={() => patch({ lang: "en" })}
              >
                {t("settings.langEn")}
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.shortcutTitle")}</div>
              <div className="s-desc">{t("settings.shortcutDesc")}</div>
            </div>
            <div ref={listenRef} className="shortcut-box">
              <div
                className={`rec${listening ? " listening" : ""}`}
                tabIndex={0}
                onClick={() => setListening(true)}
                role="button"
              >
                {listening ? t("settings.recording") : settings.globalShortcut}
              </div>
            </div>
          </div>
          <div className="setting-row">
            <div className="s-label"><div className="s-title">{t("settings.keysGuide")}</div></div>
            <button className="btn" onClick={() => { onClose(); dispatchHelp(); }}>
              <Icon name="keyboard" size={13} /> {t("settings.show")}
            </button>
          </div>
        </div>

        {/* ---------- privacy ---------- */}
        <div className="settings-group">
          <h4>{t("settings.privacy")}</h4>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.pauseTitle")}</div>
              <div className="s-desc">{t("settings.pauseDesc")}</div>
            </div>
            <button
              className={`switch${paused ? " on warn" : ""}`}
              onClick={() => onPausedChange(!paused)}
              aria-label={t("settings.pauseAria")}
            />
          </div>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.maskTitle")}</div>
              <div className="s-desc">{t("settings.maskDesc")}</div>
            </div>
            <button
              className={`switch${settings.autoMask !== "0" ? " on" : ""}`}
              onClick={() => patch({ autoMask: settings.autoMask === "0" ? "1" : "0" })}
              aria-label={t("settings.maskAria")}
            />
          </div>
          <div className="setting-row stack">
            <div className="s-label">
              <div className="s-title">{t("settings.excludedTitle")}</div>
              <div className="s-desc">{t("settings.excludedDesc")}</div>
            </div>
            <div className="add-app-row">
              <input
                value={newApp}
                onChange={(e) => setNewApp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addApp()}
                placeholder="app.exe"
                dir="ltr"
              />
              <button className="btn primary icon-only" onClick={addApp}><Icon name="plus" size={14} /></button>
            </div>
            {excluded.length > 0 && (
              <div className="app-chips">
                {excluded.map((a) => (
                  <span className="app-chip" key={a}>
                    {a}
                    <button
                      title={t("settings.remove")}
                      onClick={() =>
                        patch({ excludedApps: JSON.stringify(excluded.filter((x) => x !== a)) })
                      }
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---------- storage ---------- */}
        <div className="settings-group">
          <h4>{t("settings.storage")}</h4>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.retentionTitle")}</div>
              <div className="s-desc">{t("settings.retentionDesc")}</div>
            </div>
            <select
              className="select"
              value={settings.retentionDays || "30"}
              onChange={(e) => patch({ retentionDays: e.target.value })}
            >
              {["7", "30", "90", "0"].map((v) => (
                <option key={v} value={v}>{retentionLabel(v)}</option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.maxTitle")}</div>
              <div className="s-desc">{t("settings.maxDesc")}</div>
            </div>
            <select
              className="select"
              value={settings.maxItems || "5000"}
              onChange={(e) => patch({ maxItems: e.target.value })}
            >
              {["1000", "5000", "20000"].map((v) => (
                <option key={v} value={v}>{Number(v).toLocaleString("en")}</option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.clearTitle")}</div>
              <div className="s-desc">{t("settings.clearDesc")}</div>
            </div>
            <button
              className="btn danger"
              onClick={() => {
                if (!confirmClear) { setConfirmClear(true); return; }
                setConfirmClear(false);
                onClearHistory();
              }}
            >
              <Icon name="trash" size={13} />
              {confirmClear ? t("settings.confirmClear") : t("settings.clearBtn")}
            </button>
          </div>
        </div>

        {/* ---------- about ---------- */}
        <div className="settings-group">
          <h4>{t("settings.about")}</h4>
          <div className="setting-row center">
            <div className="about-box">
              <div className="logo-line">
                <img src="/icon.png" alt="ClipVault" className="about-logo-img" />
                ClipVault
              </div>
              <div>{t("settings.versionLine", { v: APP_VERSION })}</div>
              <div className="about-privacy">
                {t("settings.privacyNote")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function dispatchHelp() {
  window.dispatchEvent(new CustomEvent("clipvault:help"));
}
