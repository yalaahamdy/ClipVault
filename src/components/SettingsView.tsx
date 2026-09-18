import { useEffect, useRef, useState } from "react";
import type { Settings } from "../types";
import { api } from "../api";
import { Icon } from "../icons";

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
  const [listening, setListening] = useState(false);
  const [newApp, setNewApp] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const listenRef = useRef<HTMLDivElement>(null);

  const excluded: string[] = (() => {
    try { return JSON.parse(settings.excludedApps || "[]"); } catch { return []; }
  })();

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
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
        notify(`تم تعيين الاختصار: ${combo}`);
      } catch (err) {
        notify(`تعذر تسجيل الاختصار: قد يكون محجوزًا`, true);
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
    patch({ excludedApps: JSON.stringify([...excluded, name]) }, `لن يتم تسجيل المحتوى المنسوخ من ${name}`);
    setNewApp("");
  };

  const retentionLabel = (v: string) =>
    v === "0" ? "غير محدود" : v === "7" ? "أسبوع" : v === "30" ? "30 يومًا" : "90 يومًا";

  return (
    <div className="settings-view">
      <div className="settings-head">
        <button className="icon-btn" onClick={onClose} title="رجوع (Esc)">
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
            <Icon name="chevronRight" size={16} />
          </span>
        </button>
        <h3>الإعدادات</h3>
      </div>

      <div className="settings-body">
        {/* ---------- general ---------- */}
        <div className="settings-group">
          <h4>عام</h4>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">تشغيل مع Windows</div>
              <div className="s-desc">يبدأ ClipVault في الخلفية مع بدء التشغيل</div>
            </div>
            <button
              className={`switch${settings.autostart === "1" ? " on" : ""}`}
              onClick={() => patch({ autostart: settings.autostart === "1" ? "0" : "1" })}
              aria-label="تشغيل مع Windows"
            />
          </div>
          <div className="setting-row">
            <div className="s-label"><div className="s-title">المظهر</div></div>
            <div className="segmented">
              <button className={settings.theme !== "light" ? "on" : ""} onClick={() => patch({ theme: "dark" })}>
                داكن
              </button>
              <button className={settings.theme === "light" ? "on" : ""} onClick={() => patch({ theme: "light" })}>
                فاتح
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">اختصار فتح الحافظة</div>
              <div className="s-desc">يعمل من أي مكان في النظام</div>
            </div>
            <div ref={listenRef} className="shortcut-box">
              <div
                className={`rec${listening ? " listening" : ""}`}
                tabIndex={0}
                onClick={() => setListening(true)}
                role="button"
              >
                {listening ? "اضغط التركيبة الآن…" : settings.globalShortcut}
              </div>
            </div>
          </div>
          <div className="setting-row">
            <div className="s-label"><div className="s-title">دليل الاختصارات</div></div>
            <button className="btn" onClick={() => { onClose(); dispatchHelp(); }}>
              <Icon name="keyboard" size={13} /> عرض
            </button>
          </div>
        </div>

        {/* ---------- privacy ---------- */}
        <div className="settings-group">
          <h4>الخصوصية</h4>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">إيقاف تسجيل الحافظة مؤقتًا</div>
              <div className="s-desc">لن يُسجَّل أي محتوى جديد حتى الاستئناف</div>
            </div>
            <button
              className={`switch${paused ? " on" : ""}`}
              style={paused ? { background: "var(--warn)", borderColor: "var(--warn)" } : undefined}
              onClick={() => onPausedChange(!paused)}
              aria-label="إيقاف التسجيل"
            />
          </div>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">تمويه المحتوى الحساس</div>
              <div className="s-desc">إخفاء العناصر المميزة كحساسة حتى الضغط عليها</div>
            </div>
            <button
              className={`switch${settings.autoMask !== "0" ? " on" : ""}`}
              onClick={() => patch({ autoMask: settings.autoMask === "0" ? "1" : "0" })}
              aria-label="تمويه المحتوى الحساس"
            />
          </div>
          <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="s-label">
              <div className="s-title">تطبيقات مستثناة من التسجيل</div>
              <div className="s-desc">مثال: مدير كلمات المرور — اكتب اسم العملية (keepass.exe)</div>
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
                      title="إزالة"
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
          <h4>التخزين</h4>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">مدة الاحتفاظ بالعناصر</div>
              <div className="s-desc">المثبّت والمفضل لا يُحذفان أبدًا</div>
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
              <div className="s-title">الحد الأقصى لعدد العناصر</div>
              <div className="s-desc">يحافظ على سرعة البحث مع آلاف العناصر</div>
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
              <div className="s-title">حذف السجل</div>
              <div className="s-desc">حذف كل العناصر ما عدا المثبّت والمفضل</div>
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
              {confirmClear ? "متأكد؟ اضغط للتأكيد" : "حذف كل السجل"}
            </button>
          </div>
        </div>

        {/* ---------- about ---------- */}
        <div className="settings-group">
          <h4>حول</h4>
          <div className="setting-row" style={{ justifyContent: "center" }}>
            <div className="about-box">
              <div className="logo-line">
                <img src="/icon.png" alt="ClipVault" className="about-logo-img" />
                ClipVault
              </div>
              <div>الإصدار 1.0.0 — يعمل محليًا بنسبة 100%</div>
              <div style={{ marginTop: 3, color: "var(--text-3)" }}>
                لا يرسل بياناتك إلى الإنترنت — كل شيء يبقى على جهازك
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
