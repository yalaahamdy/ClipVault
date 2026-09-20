import { useCallback, useEffect, useRef, useState } from "react";
import type { BackupInfo, Settings, UpdateInfo } from "../types";
import { api } from "../api";
import { APP_VERSION } from "../version";
import { Icon } from "../icons";
import { useI18n, fmtNum } from "../i18n";

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

  // ---- v1.6 maintenance state ----------------------------------------------
  const [dupCount, setDupCount] = useState<number | null>(null);
  const [dupBusy, setDupBusy] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportImages, setExportImages] = useState(true);
  const [exportPass, setExportPass] = useState("");

  interface ImportState {
    path: string;
    info: BackupInfo;
    password: string;
    mode: "merge" | "replace";
    busy: boolean;
  }
  const [importState, setImportState] = useState<ImportState | null>(null);

  // ---- v1.6 updates state ---------------------------------------------------
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateAvail, setUpdateAvail] = useState<UpdateInfo | null>(null);
  const [updateChecked, setUpdateChecked] = useState(false);

  const autoUpdateOn = settings.autoUpdate !== "0";

  const excluded: string[] = (() => {
    try { return JSON.parse(settings.excludedApps || "[]"); } catch { return []; }
  })();

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  // Duplicate count (cheap query) whenever settings opens.
  useEffect(() => {
    let alive = true;
    api.countDuplicates().then((r) => {
      if (alive) setDupCount(r.groups);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const runUpdateCheck = useCallback(async (silent: boolean) => {
    setUpdateChecking(true);
    try {
      const info = await api.updateCheck();
      setUpdateAvail(info);
      setUpdateChecked(true);
      if (!silent && !info) notify(t("settings.updateUpToDate", { v: APP_VERSION }));
    } catch (e) {
      if (!silent) notify(t("toast.updateFailedToast", { reason: String(e).replace(/^UPDATE_CHECK_FAILED:\s*/, "") }), true);
    } finally {
      setUpdateChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Auto-check when settings opens (respect the user preference).
  useEffect(() => {
    if (autoUpdateOn) void runUpdateCheck(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installUpdate = async () => {
    setUpdateInstalling(true);
    notify(t("toast.updateInstalledToast"));
    try {
      await api.updateInstall();
    } catch (e) {
      setUpdateInstalling(false);
      notify(String(e), true);
    }
  };

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

  const cleanDupes = async () => {
    setDupBusy(true);
    try {
      const report = await api.cleanupDuplicates();
      setDupCount(report.groups);
      if (report.removed > 0) notify(t("toast.dupesCleaned", { n: report.removed }));
      else notify(t("toast.dupesCleanNone"));
    } catch (e) {
      notify(String(e), true);
    } finally {
      setDupBusy(false);
    }
  };

  const doExport = async () => {
    setExportBusy(true);
    try {
      const res = await api.backupExport(exportImages, exportPass);
      setExportOpen(false);
      setExportPass("");
      notify(t("settings.backupDone", { items: res.items, path: res.path }));
    } catch (e) {
      const msg = String(e);
      if (!msg.includes("CANCELLED")) notify(msg, true);
      else notify(t("settings.backupCancelled"));
    } finally {
      setExportBusy(false);
    }
  };

  const startImport = async () => {
    try {
      const path = await api.backupPickFile();
      if (!path) return;
      const info = await api.backupInspect(path);
      setImportState({ path, info, password: "", mode: "merge", busy: false });
    } catch (e) {
      notify(String(e), true);
    }
  };

  const doImport = async () => {
    if (!importState) return;
    setImportState((s) => (s ? { ...s, busy: true } : s));
    try {
      const r = await api.backupImport(
        importState.path,
        importState.info.encrypted ? importState.password : null,
        importState.mode,
      );
      setImportState(null);
      notify(
        t("settings.importDone", {
          added: r.added,
          skipped: r.skipped,
          images: r.imagesRestored,
        }),
      );
    } catch (e) {
      setImportState((s) => (s ? { ...s, busy: false } : s));
      notify(String(e), true);
    }
  };

  const retentionLabel = (v: string) =>
    v === "0" ? t("settings.retentionUnlimited")
    : v === "7" ? t("settings.retentionWeek")
    : v === "30" ? t("settings.retention30")
    : t("settings.retention90");

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleString(lang === "ar" ? "ar" : "en-US", { dateStyle: "medium", timeStyle: "short" });

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

        {/* ---------- maintenance & backup (v1.6) ---------- */}
        <div className="settings-group">
          <h4>{t("settings.maintenance")}</h4>

          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.dupesTitle")}</div>
              <div className="s-desc">{t("settings.dupesDesc")}</div>
            </div>
            <button
              className="btn"
              onClick={() => void cleanDupes()}
              disabled={dupBusy}
            >
              <Icon name="merge" size={13} />
              {dupBusy ? t("common.loading") : t("settings.dupesBtn")}
            </button>
          </div>
          {dupCount !== null && (
            <div className="settings-note">
              <span className={`dupes-pill${dupCount > 0 ? " warn" : ""}`}>
                {dupCount > 0
                  ? t("settings.dupesCount", { n: fmtNum(dupCount, lang) })
                  : t("settings.dupesNone")}
              </span>
            </div>
          )}

          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.backupExportTitle")}</div>
              <div className="s-desc">{t("settings.backupExportDesc")}</div>
            </div>
            <button className="btn primary" onClick={() => setExportOpen(true)}>
              <Icon name="upload" size={13} /> {t("settings.backupExportBtn")}
            </button>
          </div>

          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.backupImportTitle")}</div>
              <div className="s-desc">{t("settings.backupImportDesc")}</div>
            </div>
            <button className="btn" onClick={() => void startImport()}>
              <Icon name="download" size={13} /> {t("settings.backupImportBtn")}
            </button>
          </div>
        </div>

        {/* ---------- updates (v1.6) ---------- */}
        <div className="settings-group">
          <h4>{t("settings.updates")}</h4>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">{t("settings.updateAutoTitle")}</div>
              <div className="s-desc">{t("settings.updateAutoDesc")}</div>
            </div>
            <button
              className={`switch${autoUpdateOn ? " on" : ""}`}
              onClick={() => patch({ autoUpdate: autoUpdateOn ? "0" : "1" })}
              aria-label={t("settings.updateAutoTitle")}
            />
          </div>
          <div className="setting-row">
            <div className="s-label">
              <div className="s-title">
                {updateAvail
                  ? t("settings.updateAvailable", { v: updateAvail.version })
                  : t("settings.versionLine", { v: APP_VERSION })}
              </div>
              <div className="s-desc">
                {updateAvail
                  ? t("settings.updateCurrent", { v: updateAvail.currentVersion })
                  : updateChecked
                  ? t("settings.updateUpToDate", { v: APP_VERSION })
                  : t("settings.updateRelaunch")}
              </div>
            </div>
            {!updateAvail && (
              <button
                className="btn"
                onClick={() => void runUpdateCheck(false)}
                disabled={updateChecking}
              >
                <Icon name="refresh" size={13} />
                {updateChecking ? t("settings.updateChecking") : t("settings.updateCheckBtn")}
              </button>
            )}
          </div>
          {updateAvail && (
            <div className="update-card animate-in">
              <div className="update-head">
                <span className="update-badge"><Icon name="sparkles" size={12} /> v{updateAvail.version}</span>
                <span className="update-cur">{t("settings.updateCurrent", { v: updateAvail.currentVersion })}</span>
              </div>
              {updateAvail.notes && (
                <div className="update-notes">
                  <div className="update-notes-title">{t("settings.updateNotes")}</div>
                  <p>{updateAvail.notes}</p>
                </div>
              )}
              <button
                className="btn primary block"
                onClick={() => void installUpdate()}
                disabled={updateInstalling}
              >
                <Icon name="download" size={13} />
                {updateInstalling ? t("settings.updateInstalling") : t("settings.updateInstallBtn")}
              </button>
              <div className="update-relaunch">{t("settings.updateRelaunch")}</div>
            </div>
          )}
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

      {/* ---------- export modal (v1.6) ---------- */}
      {exportOpen && (
        <div className="preview-overlay" onClick={() => !exportBusy && setExportOpen(false)}>
          <div className="backup-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("settings.exportTitle")}>
            <header className="qr-head">
              <h3><Icon name="upload" size={15} /> {t("settings.exportTitle")}</h3>
              <button className="icon-btn" onClick={() => !exportBusy && setExportOpen(false)} title={t("common.close")}>
                <Icon name="x" size={14} />
              </button>
            </header>
            <div className="backup-body">
              <label className="backup-row">
                <input
                  type="checkbox"
                  checked={exportImages}
                  onChange={(e) => setExportImages(e.target.checked)}
                />
                <span>
                  <span className="bk-title">{t("settings.backupImagesTitle")}</span>
                  <span className="bk-desc">{t("settings.backupImagesDesc")}</span>
                </span>
              </label>
              <div className="bk-field">
                <label className="bk-title" htmlFor="bk-pass">{t("settings.backupPasswordTitle")}</label>
                <div className="bk-desc">{t("settings.backupPasswordDesc")}</div>
                <input
                  id="bk-pass"
                  type="password"
                  value={exportPass}
                  onChange={(e) => setExportPass(e.target.value)}
                  placeholder={t("settings.backupPasswordPlaceholder")}
                  dir="ltr"
                  autoComplete="new-password"
                />
              </div>
              <button className="btn primary block" onClick={() => void doExport()} disabled={exportBusy}>
                <Icon name="shield" size={13} />
                {exportBusy ? t("common.loading") : t("settings.backupExportBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- import modal (v1.6) ---------- */}
      {importState && (
        <div className="preview-overlay" onClick={() => !importState.busy && setImportState(null)}>
          <div className="backup-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("settings.backupImportTitle")}>
            <header className="qr-head">
              <h3><Icon name="download" size={15} /> {t("settings.backupImportTitle")}</h3>
              <button className="icon-btn" onClick={() => !importState.busy && setImportState(null)} title={t("common.close")}>
                <Icon name="x" size={14} />
              </button>
            </header>
            <div className="backup-body">
              <div className="import-info">
                <Icon name="info" size={14} />
                {t("settings.importInfo", {
                  v: importState.info.meta.appVersion,
                  items: fmtNum(importState.info.meta.items, lang),
                  images: fmtNum(importState.info.meta.images, lang),
                  date: fmtDate(importState.info.meta.exportedAt),
                })}
              </div>

              <div className="bk-field">
                <div className="bk-title">{t("settings.importModeTitle")}</div>
                <label className="backup-row radio">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importState.mode === "merge"}
                    onChange={() => setImportState((s) => (s ? { ...s, mode: "merge" } : s))}
                  />
                  <span className="bk-title">{t("settings.importMerge")}</span>
                </label>
                <label className="backup-row radio">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importState.mode === "replace"}
                    onChange={() => setImportState((s) => (s ? { ...s, mode: "replace" } : s))}
                  />
                  <span className="bk-title">{t("settings.importReplace")}</span>
                </label>
                {importState.mode === "replace" && (
                  <div className="import-warn">
                    <Icon name="alertTriangle" size={13} /> {t("settings.importReplaceWarn")}
                  </div>
                )}
              </div>

              {importState.info.encrypted && (
                <div className="bk-field">
                  <label className="bk-title" htmlFor="bk-imppass">{t("settings.importEncrypted")}</label>
                  <input
                    id="bk-imppass"
                    type="password"
                    value={importState.password}
                    onChange={(e) => setImportState((s) => (s ? { ...s, password: e.target.value } : s))}
                    dir="ltr"
                    autoComplete="off"
                  />
                </div>
              )}

              <button
                className={`btn block ${importState.mode === "replace" ? "danger" : "primary"}`}
                onClick={() => void doImport()}
                disabled={importState.busy || (importState.info.encrypted && !importState.password.trim())}
              >
                <Icon name="merge" size={13} />
                {importState.busy
                  ? t("common.loading")
                  : t("settings.importConfirm", { n: fmtNum(importState.info.meta.items, lang) })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function dispatchHelp() {
  window.dispatchEvent(new CustomEvent("clipvault:help"));
}
