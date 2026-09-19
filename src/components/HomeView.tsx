import { useEffect, useState } from "react";
import type { Item, Settings, Stats } from "../types";
import { api } from "../api";
import { APP_VERSION } from "../version";
import { Icon } from "../icons";
import { fmtNum, useT } from "../i18n";

interface Props {
  settings: Settings | null;
  paused: boolean;
  onGoToClipboard: () => void;
  onGoToTyping?: () => void;
  onGoToVault?: () => void;
  onGoToSettings: () => void;
  onTogglePause: () => void;
  onToggleTheme: () => void;
  onClearHistory: () => void;
  onNotify?: (msg: string, err?: boolean) => void;
  onSnip?: () => void;
}

export function HomeView({
  settings,
  paused,
  onGoToClipboard,
  onGoToTyping,
  onGoToVault,
  onGoToSettings,
  onTogglePause,
  onToggleTheme,
  onClearHistory,
  onNotify,
  onSnip,
}: Props) {
  const t = useT();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [recentItem, setRecentItem] = useState<Item | null>(null);
  const [copiedRecent, setCopiedRecent] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Load stats and latest item
  useEffect(() => {
    let alive = true;
    setLoadingStats(true);
    setLoadingRecent(true);

    api
      .getStats()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingStats(false);
      });

    api
      .getItems("all", "", 1, 0)
      .then((page) => {
        if (alive && page.items && page.items.length > 0) {
          setRecentItem(page.items[0]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingRecent(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const handleCopyRecent = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!recentItem) return;
    try {
      await api.copyItem(recentItem.id);
      setCopiedRecent(true);
      if (onNotify) {
        onNotify(t("home.copyOk"));
      }
      setTimeout(() => setCopiedRecent(false), 1600);
    } catch {
      if (onNotify) {
        onNotify(t("home.copyFail"), true);
      }
    }
  };

  const isDark = settings?.theme !== "light";
  const globalShortcut = settings?.globalShortcut || "Ctrl+Shift+V";

  return (
    <div className="home-view-compact">
      {/* 1. Header: Compact 3D Brand & Live Status Hub */}
      <header className="home-hub-header">
        <div className="hub-brand">
          <div className="hub-logo-box">
            <img src="/icon.png" alt="ClipVault" className="hub-logo-img" />
            <div className="hub-logo-glow" />
          </div>
          <div className="hub-identity">
            <div className="hub-title-line">
              <span className="hub-title">ClipVault</span>
              <span className="hub-badge-v">v{APP_VERSION}</span>
            </div>
            <span className="hub-tagline">{t("home.tagline")}</span>
          </div>
        </div>

        {/* Clickable Live Monitor Status Badge */}
        <button
          className={`hub-status-pill ${paused ? "paused" : "active"}`}
          onClick={onTogglePause}
          title={paused ? t("home.statusResume") : t("home.statusPause")}
        >
          <span className="hub-status-pulse" />
          <span className="hub-status-text">
            {paused ? t("home.monitorPaused") : t("home.monitorActive")}
          </span>
          <span className="hub-status-action">{paused ? t("home.start") : t("home.stop")}</span>
        </button>
      </header>

      {/* 2. Core Launchpad: 3D High-Contrast Navigation Hub */}
      <section className="home-launchpad">
        {/* Card 1: Clipboard Records */}
        <div
          className="launchpad-card clipboard"
          onClick={onGoToClipboard}
          role="button"
          tabIndex={0}
        >
          <div className="card-accent-bar" />
          <div className="card-icon-wrap clipboard">
            <Icon name="clipboard" size={20} />
          </div>
          <div className="card-info">
            <div className="card-heading-row">
              <h3 className="card-title">{t("home.clipboardTitle")}</h3>
              <span className="card-shortcut-chip">Enter ↵</span>
            </div>
            <p className="card-desc">
              {loadingStats
                ? t("home.clipboardLoading")
                : t("home.clipboardDesc", { n: stats ? fmtNum(stats.total, "ar") : "0" })}
            </p>
          </div>
          <div className="card-arrow">
            <Icon name="chevronRight" size={16} />
          </div>
        </div>

        {/* Card 2: Smart Typing & Writing Suite */}
        {onGoToTyping && (
          <div
            className="launchpad-card typing"
            onClick={onGoToTyping}
            role="button"
            tabIndex={0}
          >
            <div className="card-accent-bar" />
            <div className="card-icon-wrap typing">
              <Icon name="sparkles" size={20} />
            </div>
            <div className="card-info">
              <div className="card-heading-row">
                <h3 className="card-title">{t("home.typingTitle")}</h3>
                <span className="card-shortcut-chip">Ctrl+Shift+X</span>
              </div>
              <p className="card-desc">
                {t("home.typingDesc")}
              </p>
            </div>
            <div className="card-arrow">
              <Icon name="chevronRight" size={16} />
            </div>
          </div>
        )}

        {/* Card 3: Password Vault */}
        {onGoToVault && (
          <div
            className="launchpad-card vault"
            onClick={onGoToVault}
            role="button"
            tabIndex={0}
          >
            <div className="card-accent-bar" />
            <div className="card-icon-wrap vault">
              <Icon name="lock" size={20} />
            </div>
            <div className="card-info">
              <div className="card-heading-row">
                <h3 className="card-title">{t("home.vaultTitle")}</h3>
                <span className="card-shortcut-chip">Ctrl+3</span>
              </div>
              <p className="card-desc">
                {t("home.vaultDesc")}
              </p>
            </div>
            <div className="card-arrow">
              <Icon name="chevronRight" size={16} />
            </div>
          </div>
        )}

        {/* Card 4 (v1.5): Region screenshot → OCR text */}
        {onSnip && (
          <div
            className="launchpad-card snip"
            onClick={onSnip}
            role="button"
            tabIndex={0}
          >
            <div className="card-accent-bar" />
            <div className="card-icon-wrap snip">
              <Icon name="crop" size={20} />
            </div>
            <div className="card-info">
              <div className="card-heading-row">
                <h3 className="card-title">{t("home.snipTitle")}</h3>
                <span className="card-shortcut-chip">Ctrl+Shift+S</span>
              </div>
              <p className="card-desc">
                {t("home.snipDesc")}
              </p>
            </div>
            <div className="card-arrow">
              <Icon name="chevronRight" size={16} />
            </div>
          </div>
        )}
      </section>

      {/* 3. Instant Recent Snippet Card */}
      {recentItem && (
        <section className="home-recent-box">
          <div className="recent-top-row">
            <div className="recent-lbl">
              <Icon name="zap" size={13} />
              <span>{t("home.recentLabel")}</span>
            </div>
            <span className="recent-type-badge">
              {recentItem.image || recentItem.kind === "image"
                ? t("home.typeImage")
                : recentItem.kind === "link"
                ? t("home.typeLink")
                : recentItem.kind === "files"
                ? t("home.typeFiles")
                : t("home.typeText")}
            </span>
          </div>

          <div
            className="recent-content-body"
            onClick={onGoToClipboard}
            title={t("home.recentClick")}
          >
            <div className="recent-preview-text">
              {recentItem.image || recentItem.kind === "image" ? (
                <span className="recent-img-tag">{t("home.recentImageTag")}</span>
              ) : (
                recentItem.text || recentItem.ocrText || t("home.recentSavedContent")
              )}
            </div>

            <button
              className={`recent-copy-btn ${copiedRecent ? "copied" : ""}`}
              onClick={handleCopyRecent}
              title={t("home.copyNowTitle")}
            >
              <Icon name={copiedRecent ? "check" : "copy"} size={13} />
              <span>{copiedRecent ? t("home.copiedBtn") : t("home.copyNow")}</span>
            </button>
          </div>
        </section>
      )}

      {/* 4. Compact 3D Stats Capsule (Single Horizontal Row) */}
      <section className="home-stats-capsule">
        <div
          className="stat-capsule-item"
          onClick={onGoToClipboard}
          role="button"
          tabIndex={0}
          title={t("home.statTotalTitle")}
        >
          <div className="stat-capsule-icon total">
            <Icon name="clipboard" size={13} />
          </div>
          <div className="stat-capsule-meta">
            <span className="stat-capsule-val">
              {loadingStats ? "…" : stats ? fmtNum(stats.total, "ar") : "0"}
            </span>
            <span className="stat-capsule-lbl">{t("home.statTotal")}</span>
          </div>
        </div>

        <div className="capsule-divider" />

        <div
          className="stat-capsule-item"
          onClick={onGoToClipboard}
          role="button"
          tabIndex={0}
          title={t("home.statPinnedTitle")}
        >
          <div className="stat-capsule-icon pin">
            <Icon name="pin" size={13} filled />
          </div>
          <div className="stat-capsule-meta">
            <span className="stat-capsule-val">
              {loadingStats ? "…" : stats ? fmtNum(stats.pinned, "ar") : "0"}
            </span>
            <span className="stat-capsule-lbl">{t("home.statPinned")}</span>
          </div>
        </div>

        <div className="capsule-divider" />

        <div
          className="stat-capsule-item"
          onClick={onGoToClipboard}
          role="button"
          tabIndex={0}
          title={t("home.statFavTitle")}
        >
          <div className="stat-capsule-icon star">
            <Icon name="star" size={13} filled />
          </div>
          <div className="stat-capsule-meta">
            <span className="stat-capsule-val">
              {loadingStats ? "…" : stats ? fmtNum(stats.favorites, "ar") : "0"}
            </span>
            <span className="stat-capsule-lbl">{t("home.statFavorites")}</span>
          </div>
        </div>

        <div className="capsule-divider" />

        <div
          className="stat-capsule-item"
          onClick={onGoToClipboard}
          role="button"
          tabIndex={0}
          title={t("home.statTextTitle")}
        >
          <div className="stat-capsule-icon text">
            <Icon name="text" size={13} />
          </div>
          <div className="stat-capsule-meta">
            <span className="stat-capsule-val">
              {loadingStats ? "…" : stats ? fmtNum(stats.texts, "ar") : "0"}
            </span>
            <span className="stat-capsule-lbl">{t("home.statTexts")}</span>
          </div>
        </div>
      </section>

      {/* 5. Tactile 3D Quick Toolbar */}
      <footer className="home-quick-toolbar">
        <button
          className={`hub-tool-btn ${paused ? "btn-warn" : "btn-ok"}`}
          onClick={onTogglePause}
          title={paused ? t("home.btnResumeTitle") : t("home.btnPauseTitle")}
        >
          <Icon name={paused ? "play" : "pause"} size={13} />
          <span>{paused ? t("home.btnResume") : t("home.btnPause")}</span>
        </button>

        {onSnip && (
          <button className="hub-tool-btn" onClick={onSnip} title={`${t("home.snipTitle")} (Ctrl+Shift+S)`}>
            <Icon name="crop" size={13} />
            <span>{t("home.scSnip")}</span>
          </button>
        )}

        <button
          className="hub-tool-btn"
          onClick={onToggleTheme}
          title={t("home.themeBtnTitle")}
        >
          <Icon name={isDark ? "sun" : "moon"} size={13} />
          <span>{isDark ? t("home.btnLight") : t("home.btnDark")}</span>
        </button>

        <button
          className="hub-tool-btn"
          onClick={onGoToSettings}
          title={t("home.btnSettingsTitle")}
        >
          <Icon name="settings" size={13} />
          <span>{t("home.btnSettings")}</span>
        </button>

        <button
          className="hub-tool-btn btn-danger"
          onClick={onClearHistory}
          title={t("home.btnClearTitle")}
        >
          <Icon name="trash" size={13} />
          <span>{t("home.btnClear")}</span>
        </button>
      </footer>

      {/* 6. Compact Shortcuts Ribbon */}
      <div className="home-shortcuts-ribbon">
        <div className="shortcut-badge">
          <kbd>{globalShortcut}</kbd>
          <span>{t("home.scOpen")}</span>
        </div>
        <div className="shortcut-badge">
          <kbd>Ctrl+Shift+X</kbd>
          <span>{t("home.scFixer")}</span>
        </div>
        <div className="shortcut-badge">
          <kbd>Esc</kbd>
          <span>{t("home.scHide")}</span>
        </div>
      </div>
    </div>
  );
}
