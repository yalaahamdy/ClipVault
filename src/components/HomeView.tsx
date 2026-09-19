import { useEffect, useState } from "react";
import type { Settings, Stats } from "../types";
import { api } from "../api";
import { Icon } from "../icons";

interface Props {
  settings: Settings | null;
  paused: boolean;
  onGoToClipboard: () => void;
  onGoToTyping?: () => void;
  onGoToSettings: () => void;
  onTogglePause: () => void;
  onToggleTheme: () => void;
  onClearHistory: () => void;
}

export function HomeView({
  settings,
  paused,
  onGoToClipboard,
  onGoToTyping,
  onGoToSettings,
  onTogglePause,
  onToggleTheme,
  onClearHistory,
}: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .getStats()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        if (alive) setLoadingStats(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const shortcut = settings?.globalShortcut || "Ctrl+Shift+V";
  const isDark = settings?.theme !== "light";

  return (
    <div className="home-view">
      {/* Hero Banner */}
      <section className="home-hero">
        <div className="home-brand">
          <div className="home-logo-wrap">
            <div className="home-logo-glow" />
            <img src="/icon.png" alt="ClipVault" className="home-app-icon" />
          </div>
          <div className="home-title-block">
            <div className="home-title-row">
              <h1 className="home-title">ClipVault</h1>
              <span className="home-version-badge">v1.0.0</span>
              <span className={`home-status-badge ${paused ? "paused" : "active"}`}>
                <span className="status-dot" />
                {paused ? "المراقبة متوقفة" : "المراقب نشط"}
              </span>
            </div>
            <p className="home-subtitle">
              مدير حافظة احترافي وفائق السرعة لنظام Windows — خصوصية محلية 100%
            </p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="home-cta-wrap" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button className="home-cta-btn" onClick={onGoToClipboard}>
            <div className="cta-content">
              <div className="cta-icon">
                <img src="/icon.png" alt="" className="cta-app-icon" />
              </div>
              <div className="cta-text">
                <span className="cta-title">سجل الحافظة المنسوخة</span>
                <span className="cta-sub">
                  تصفح والبحث في {stats ? stats.total.toLocaleString("en") : "…"} عنصر
                </span>
              </div>
            </div>
            <div className="cta-arrow">
              <span className="cta-shortcut">Enter ↵</span>
              <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
                <Icon name="chevronRight" size={16} />
              </span>
            </div>
          </button>

          {onGoToTyping && (
            <button
              className="home-cta-btn"
              onClick={onGoToTyping}
              style={{
                background: "linear-gradient(180deg, #9b59b6 0%, #8e44ad 100%)",
                boxShadow: "0 4px 14px rgba(142, 68, 173, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
              }}
            >
              <div className="cta-content">
                <div className="cta-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                  <Icon name="sparkles" size={18} />
                </div>
                <div className="cta-text">
                  <span className="cta-title">الكتابة الذكية والتدقيق</span>
                  <span className="cta-sub">عكس اللغة، الإملاء الصوتي وتصحيح الأخطاء</span>
                </div>
              </div>
              <div className="cta-arrow">
                <span className="cta-shortcut">Ctrl+4</span>
                <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
                  <Icon name="chevronRight" size={16} />
                </span>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* Quick Stats Grid */}
      <section className="home-section">
        <div className="section-header">
          <h3>
            <Icon name="activity" size={15} /> إحصائيات الحافظة
          </h3>
          <span className="section-badge">مباشر</span>
        </div>

        <div className="stats-grid">
          <div className="stat-card" onClick={onGoToClipboard} role="button" tabIndex={0}>
            <div className="stat-icon total">
              <Icon name="clipboard" size={16} />
            </div>
            <div className="stat-data">
              <span className="stat-value">
                {loadingStats ? "…" : stats?.total.toLocaleString("en") ?? 0}
              </span>
              <span className="stat-label">إجمالي السجل</span>
            </div>
          </div>

          <div className="stat-card" onClick={onGoToClipboard} role="button" tabIndex={0}>
            <div className="stat-icon pin">
              <Icon name="pin" size={16} filled />
            </div>
            <div className="stat-data">
              <span className="stat-value">
                {loadingStats ? "…" : stats?.pinned.toLocaleString("en") ?? 0}
              </span>
              <span className="stat-label">عناصر مثبتة</span>
            </div>
          </div>

          <div className="stat-card" onClick={onGoToClipboard} role="button" tabIndex={0}>
            <div className="stat-icon star">
              <Icon name="star" size={16} filled />
            </div>
            <div className="stat-data">
              <span className="stat-value">
                {loadingStats ? "…" : stats?.favorites.toLocaleString("en") ?? 0}
              </span>
              <span className="stat-label">المفضلة</span>
            </div>
          </div>

          <div className="stat-card" onClick={onGoToClipboard} role="button" tabIndex={0}>
            <div className="stat-icon text">
              <Icon name="text" size={16} />
            </div>
            <div className="stat-data">
              <span className="stat-value">
                {loadingStats ? "…" : stats?.texts.toLocaleString("en") ?? 0}
              </span>
              <span className="stat-label">نصوص وأكواد</span>
            </div>
          </div>

          <div className="stat-card" onClick={onGoToClipboard} role="button" tabIndex={0}>
            <div className="stat-icon image">
              <Icon name="image" size={16} />
            </div>
            <div className="stat-data">
              <span className="stat-value">
                {loadingStats ? "…" : stats?.images.toLocaleString("en") ?? 0}
              </span>
              <span className="stat-label">لقطات وصور</span>
            </div>
          </div>

          <div className="stat-card" onClick={onGoToClipboard} role="button" tabIndex={0}>
            <div className="stat-icon link">
              <Icon name="link" size={16} />
            </div>
            <div className="stat-data">
              <span className="stat-value">
                {loadingStats ? "…" : stats?.links.toLocaleString("en") ?? 0}
              </span>
              <span className="stat-label">روابط مسجلة</span>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights & Features */}
      <section className="home-section">
        <div className="section-header">
          <h3>
            <Icon name="sparkles" size={15} /> مميزات ClipVault
          </h3>
        </div>

        <div className="features-list">
          <div className="feature-item">
            <div className="feature-icon zap">
              <Icon name="zap" size={15} />
            </div>
            <div className="feature-text">
              <span className="feature-title">التقاط فوري وتلقائي</span>
              <span className="feature-desc">
                يسجل كل النصوص والروابط والصور والملفات فور نسخها من أي برنامج.
              </span>
            </div>
          </div>

          <div className="feature-item">
            <div className="feature-icon shield">
              <Icon name="shield" size={15} />
            </div>
            <div className="feature-text">
              <span className="feature-title">أمان وخصوصية محلية 100%</span>
              <span className="feature-desc">
                كل البيانات مخزنة محليًا داخل جهازك في قاعدة SQLite بدون أي اتصال بالإنترنت.
              </span>
            </div>
          </div>

          <div className="feature-item">
            <div className="feature-icon tag">
              <Icon name="tag" size={15} />
            </div>
            <div className="feature-text">
              <span className="feature-title">تنظيم متقدم بالوسوم والمجموعات</span>
              <span className="feature-desc">
                أنشئ وسوماً ملونة ومجموعات لتنظيم نصوص العمل والأكواد المهمة.
              </span>
            </div>
          </div>

          <div className="feature-item">
            <div className="feature-icon search">
              <Icon name="search" size={15} />
            </div>
            <div className="feature-text">
              <span className="feature-title">بحث لحظي ذكي وتصفية سريعة</span>
              <span className="feature-desc">
                تصفية فورية حسب نوع المحتوى (نص، رابط، صورة، ملف) مع تمييز نتائج البحث.
              </span>
            </div>
          </div>

          <div className="feature-item">
            <div className="feature-icon zap">
              <Icon name="sparkles" size={15} />
            </div>
            <div className="feature-text">
              <span className="feature-title">الكتابة الذكية وعكس اللغة والإملاء الصوتي</span>
              <span className="feature-desc">
                تصحيح النصوص المكتوبة بلغة مقلوبة في أي تطبيق، تدقيق إملائي فوري، وكتابة بالصوت.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Shortcuts Cheatsheet */}
      <section className="home-section">
        <div className="section-header">
          <h3>
            <Icon name="keyboard" size={15} /> أبرز اختصارات لوحة المفاتيح
          </h3>
        </div>

        <div className="shortcuts-card">
          <div className="shortcut-row">
            <span className="sc-desc">فتح / إخفاء الحافظة من أي مكان</span>
            <kbd className="sc-key">{shortcut}</kbd>
          </div>
          <div className="shortcut-row">
            <span className="sc-desc">الكتابة والتدقيق الذكي</span>
            <kbd className="sc-key">Ctrl+4</kbd>
          </div>
          <div className="shortcut-row">
            <span className="sc-desc">التنقل السريع بين العناصر</span>
            <span className="sc-keys-group">
              <kbd className="sc-key">↑</kbd>
              <kbd className="sc-key">↓</kbd>
            </span>
          </div>
          <div className="shortcut-row">
            <span className="sc-desc">نسخ العنصر المحدد وإغلاق النافذة</span>
            <kbd className="sc-key">Enter</kbd>
          </div>
          <div className="shortcut-row">
            <span className="sc-desc">تبديل المظهر (داكن / فاتح)</span>
            <kbd className="sc-key">Ctrl+T</kbd>
          </div>
          <div className="shortcut-row">
            <span className="sc-desc">الانتقال المباشر للإعدادات</span>
            <kbd className="sc-key">Ctrl+,</kbd>
          </div>
        </div>
      </section>

      {/* Quick Actions Footer Bar */}
      <div className="home-quick-actions">
        <button
          className={`btn ${paused ? "warn" : ""}`}
          onClick={onTogglePause}
          title={paused ? "استئناف التسجيل" : "إيقاف التسجيل مؤقتًا"}
        >
          <Icon name={paused ? "play" : "pause"} size={14} />
          {paused ? "استئناف التسجيل" : "إيقاف مؤقت"}
        </button>

        <button className="btn" onClick={onToggleTheme} title="تبديل المظهر">
          <Icon name={isDark ? "sun" : "moon"} size={14} />
          {isDark ? "المظهر الفاتح" : "المظهر الداكن"}
        </button>

        <button className="btn" onClick={onGoToSettings} title="الإعدادات">
          <Icon name="settings" size={14} />
          الإعدادات
        </button>

        <button className="btn danger" onClick={onClearHistory} title="تفريغ السجل">
          <Icon name="trash" size={14} />
          تفريغ
        </button>
      </div>
    </div>
  );
}
