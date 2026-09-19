import { useEffect, useState } from "react";
import type { Item, Settings, Stats } from "../types";
import { api } from "../api";
import { APP_VERSION } from "../version";
import { Icon } from "../icons";

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
}: Props) {
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
        onNotify("تم نسخ العنصر الأخير إلى الحافظة بنجاح");
      }
      setTimeout(() => setCopiedRecent(false), 1600);
    } catch {
      if (onNotify) {
        onNotify("تعذر نسخ العنصر", true);
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
            <span className="hub-tagline">مدير الحافظة والكتابة الذكية المحلي</span>
          </div>
        </div>

        {/* Clickable Live Monitor Status Badge */}
        <button
          className={`hub-status-pill ${paused ? "paused" : "active"}`}
          onClick={onTogglePause}
          title={paused ? "انقر لاستئناف تسجيل الحافظة" : "انقر لإيقاف التسجيل مؤقتاً"}
        >
          <span className="hub-status-pulse" />
          <span className="hub-status-text">
            {paused ? "المراقب متوقف" : "المراقب نشط"}
          </span>
          <span className="hub-status-action">{paused ? "تشغيل" : "إيقاف"}</span>
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
              <h3 className="card-title">سجل الحافظة</h3>
              <span className="card-shortcut-chip">Enter ↵</span>
            </div>
            <p className="card-desc">
              {loadingStats
                ? "جاري تحميل السجل…"
                : `${stats?.total.toLocaleString("ar-EG") ?? 0} عنصر محفوظ للبحث والنسخ الفوري`}
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
                <h3 className="card-title">الكتابة والتدقيق الذكي</h3>
                <span className="card-shortcut-chip">Ctrl+Shift+X</span>
              </div>
              <p className="card-desc">
                عكس اللغة التلقائي، التدقيق الإملائي الفوري، والإملاء الصوتي
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
                <h3 className="card-title">خزينة كلمات المرور</h3>
                <span className="card-shortcut-chip">Ctrl+3</span>
              </div>
              <p className="card-desc">
                تشفير محلي عسكري ومولد كلمات مرور آمنة 100%
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
              <span>أحدث عنصر في الحافظة</span>
            </div>
            <span className="recent-type-badge">
              {recentItem.image || recentItem.kind === "image"
                ? "صورة"
                : recentItem.kind === "link"
                ? "رابط"
                : recentItem.kind === "files"
                ? "ملفات"
                : "نص"}
            </span>
          </div>

          <div
            className="recent-content-body"
            onClick={onGoToClipboard}
            title="انقر لفتح العنصر في سجل الحافظة"
          >
            <div className="recent-preview-text">
              {recentItem.image || recentItem.kind === "image" ? (
                <span className="recent-img-tag">[لقطة شاشة / صورة محفوظة]</span>
              ) : (
                recentItem.text || recentItem.ocrText || "محتوى محفوظ"
              )}
            </div>

            <button
              className={`recent-copy-btn ${copiedRecent ? "copied" : ""}`}
              onClick={handleCopyRecent}
              title="نسخ فوري إلى الحافظة"
            >
              <Icon name={copiedRecent ? "check" : "copy"} size={13} />
              <span>{copiedRecent ? "تم النسخ!" : "نسخ فوري"}</span>
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
          title="عرض إجمالي السجل"
        >
          <div className="stat-capsule-icon total">
            <Icon name="clipboard" size={13} />
          </div>
          <div className="stat-capsule-meta">
            <span className="stat-capsule-val">
              {loadingStats ? "…" : stats?.total.toLocaleString("ar-EG") ?? 0}
            </span>
            <span className="stat-capsule-lbl">الإجمالي</span>
          </div>
        </div>

        <div className="capsule-divider" />

        <div
          className="stat-capsule-item"
          onClick={onGoToClipboard}
          role="button"
          tabIndex={0}
          title="عرض العناصر المثبتة"
        >
          <div className="stat-capsule-icon pin">
            <Icon name="pin" size={13} filled />
          </div>
          <div className="stat-capsule-meta">
            <span className="stat-capsule-val">
              {loadingStats ? "…" : stats?.pinned.toLocaleString("ar-EG") ?? 0}
            </span>
            <span className="stat-capsule-lbl">المثبتة</span>
          </div>
        </div>

        <div className="capsule-divider" />

        <div
          className="stat-capsule-item"
          onClick={onGoToClipboard}
          role="button"
          tabIndex={0}
          title="عرض المفضلة"
        >
          <div className="stat-capsule-icon star">
            <Icon name="star" size={13} filled />
          </div>
          <div className="stat-capsule-meta">
            <span className="stat-capsule-val">
              {loadingStats ? "…" : stats?.favorites.toLocaleString("ar-EG") ?? 0}
            </span>
            <span className="stat-capsule-lbl">المفضلة</span>
          </div>
        </div>

        <div className="capsule-divider" />

        <div
          className="stat-capsule-item"
          onClick={onGoToClipboard}
          role="button"
          tabIndex={0}
          title="عرض النصوص والروابط"
        >
          <div className="stat-capsule-icon text">
            <Icon name="text" size={13} />
          </div>
          <div className="stat-capsule-meta">
            <span className="stat-capsule-val">
              {loadingStats ? "…" : stats?.texts.toLocaleString("ar-EG") ?? 0}
            </span>
            <span className="stat-capsule-lbl">النصوص</span>
          </div>
        </div>
      </section>

      {/* 5. Tactile 3D Quick Toolbar */}
      <footer className="home-quick-toolbar">
        <button
          className={`hub-tool-btn ${paused ? "btn-warn" : "btn-ok"}`}
          onClick={onTogglePause}
          title={paused ? "استئناف التقاط الحافظة" : "إيقاف الالتقاط مؤقتاً"}
        >
          <Icon name={paused ? "play" : "pause"} size={13} />
          <span>{paused ? "استئناف" : "إيقاف مؤقت"}</span>
        </button>

        <button
          className="hub-tool-btn"
          onClick={onToggleTheme}
          title="تبديل المظهر الداكن / الفاتح"
        >
          <Icon name={isDark ? "sun" : "moon"} size={13} />
          <span>{isDark ? "فاتح" : "داكن"}</span>
        </button>

        <button
          className="hub-tool-btn"
          onClick={onGoToSettings}
          title="إعدادات التطبيق (Ctrl+5)"
        >
          <Icon name="settings" size={13} />
          <span>الإعدادات</span>
        </button>

        <button
          className="hub-tool-btn btn-danger"
          onClick={onClearHistory}
          title="تفريغ سجل الحافظة بالكامل"
        >
          <Icon name="trash" size={13} />
          <span>تفريغ</span>
        </button>
      </footer>

      {/* 6. Compact Shortcuts Ribbon */}
      <div className="home-shortcuts-ribbon">
        <div className="shortcut-badge">
          <kbd>{globalShortcut}</kbd>
          <span>فتح الحافظة</span>
        </div>
        <div className="shortcut-badge">
          <kbd>Ctrl+Shift+X</kbd>
          <span>التدقيق السريع</span>
        </div>
        <div className="shortcut-badge">
          <kbd>Esc</kbd>
          <span>إخفاء</span>
        </div>
      </div>
    </div>
  );
}
