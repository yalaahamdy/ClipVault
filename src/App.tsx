import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { api, vaultApi, PAGE_SIZE } from "./api";
import type { CollectionWithCount, Item, Settings, SortOption, SourceAppStat, TagWithCount } from "./types";
import { Icon } from "./icons";
import { ItemCard, type CardActionEvt } from "./components/ItemCard";
import { ContextMenu, type MenuAction } from "./components/ContextMenu";
import { TagPanel, type OrgFilter } from "./components/TagPanel";
import { Preview } from "./components/Preview";
import { SettingsView } from "./components/SettingsView";
import { HomeView } from "./components/HomeView";
import { PasswordVault } from "./components/PasswordVault";
import { SmartTypingSuite } from "./components/SmartTypingSuite";
import { EmptyFiltered, EmptyFirstRun, EmptyResults, Skeletons } from "./components/EmptyState";
import { Toast } from "./components/Toast";

const FILTERS: Array<{ id: string; label: string; icon: string }> = [
  { id: "all", label: "الكل", icon: "clipboard" },
  { id: "text", label: "نصوص", icon: "text" },
  { id: "link", label: "روابط", icon: "link" },
  { id: "image", label: "صور", icon: "image" },
  { id: "files", label: "ملفات", icon: "folder" },
  { id: "favorite", label: "المفضلة", icon: "star" },
  { id: "pinned", label: "المثبت", icon: "pin" },
];

const SORT_OPTIONS: Array<{ id: SortOption; label: string; icon: string }> = [
  { id: "time_desc", label: "الأحدث أولاً (الوقت)", icon: "clock" },
  { id: "time_asc", label: "الأقدم أولاً", icon: "clock" },
  { id: "use_count_desc", label: "الأكثر تكراراً", icon: "sparkles" },
  { id: "source_asc", label: "حسب التطبيق المصدر", icon: "monitor" },
  { id: "alpha_asc", label: "أبجدياً (النصوص)", icon: "text" },
  { id: "length_desc", label: "الأطول محتوى", icon: "columns" },
];

export default function App() {
  // ---------------- state ----------------
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState<OrgFilter | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("time_desc");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceAppStat[]>([]);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());

  const [paused, setPaused] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<"home" | "list" | "passwords" | "typing" | "settings">("home");
  const [vaultCount, setVaultCount] = useState<number>(0);
  const [importedSpellText, setImportedSpellText] = useState<string>("");

  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [collections, setCollections] = useState<CollectionWithCount[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  const [menu, setMenu] = useState<{ x: number; y: number; item: Item } | null>(null);
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editText, setEditText] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);
  const stateRef = useRef({ query, filter, orgFilter, sortBy, sourceFilter });
  stateRef.current = { query, filter, orgFilter, sortBy, sourceFilter };

  const notify = useCallback((msg: string, err?: boolean) => setToast({ msg, err }), []);

  // ---------------- theme ----------------
  const applyTheme = useCallback((t: string) => {
    document.documentElement.dataset.theme = t === "light" ? "light" : "dark";
  }, []);

  // ---------------- data loading ----------------
  const loadSources = useCallback(async () => {
    try {
      const s = await api.getSources();
      setSources(s);
    } catch { /* silent */ }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([api.getTags(), api.getCollections()]);
      setTags(t);
      setCollections(c);
    } catch { /* silent */ }
  }, []);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const showSkeletons = firstLoad.current;
    if (showSkeletons) setLoading(true);
    const { query: q, filter: f, orgFilter: o, sortBy: sb, sourceFilter: sf } = stateRef.current;
    try {
      const page = await api.getItems(
        f,
        q,
        PAGE_SIZE,
        0,
        o?.type === "tag" ? o.id : null,
        o?.type === "collection" ? o.id : null,
        sb,
        sf,
      );
      setItems(page.items);
      setTotal(page.total);
      setHasMore(page.hasMore);
      setSelectedIdx(0);
    } catch (e) {
      if (!opts?.silent) notify(String(e), true);
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [notify]);

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    const { query: q, filter: f, orgFilter: o, sortBy: sb, sourceFilter: sf } = stateRef.current;
    try {
      const page = await api.getItems(
        f,
        q,
        PAGE_SIZE,
        items.length,
        o?.type === "tag" ? o.id : null,
        o?.type === "collection" ? o.id : null,
        sb,
        sf,
      );
      setItems((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
    } catch { /* silent */ }
  }, [hasMore, items.length]);

  // ---------------- initial load ----------------
  useEffect(() => {
    (async () => {
      try {
        const s = await api.getSettings();
        setSettings(s);
        applyTheme(s.theme || "dark");
        setPaused(s.paused === "1");
      } catch { /* default dark */ }
      await Promise.all([reload(), loadTags(), loadSources()]);
      try {
        const vs = await vaultApi.getStatus();
        setVaultCount(vs.totalItems);
      } catch { /* ignore */ }
      try { await api.frontendReady(); } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounced search & sort/filter change
  useEffect(() => {
    const t = setTimeout(() => reload({ silent: items.length > 0 }), query ? 90 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter, orgFilter, sortBy, sourceFilter]);

  // infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // ---------------- backend events ----------------
  useEffect(() => {
    const un1 = listen<Item>("clipvault:new-item", (e) => {
      const incoming = e.payload;
      const { query: q, filter: f, orgFilter: o } = stateRef.current;
      const matches =
        !q &&
        !o &&
        (f === "all" ||
          (f === "pinned" && incoming.pinned) ||
          (f === "favorite" && incoming.favorite));
      if (matches) {
        setItems((prev) => {
          const without = prev.filter((p) => p.id !== incoming.id);
          return [incoming, ...without];
        });
        setTotal((t) => t + 1);
        setFreshIds((prev) => new Set(prev).add(incoming.id));
      } else {
        reload({ silent: true });
      }
      setSelectedIdx(0);
    });
    const un2 = listen<boolean>("clipvault:paused-changed", (e) => setPaused(e.payload));
    const un3 = listen("clipvault:items-changed", () => { reload({ silent: true }); loadTags(); });
    const un4 = listen("clipvault:open-settings", () => setView("settings"));
    const un5 = listen("clipvault:window-shown", () => {
      // reset overlays and popups on open
      setMenu(null);
      setPreviewItem(null);
      setEditItem(null);
      setHelpOpen(false);
      setPanelOpen(false);
      setQuery("");
      setFilter("all");
      setOrgFilter(null);
    });
    const un6 = listen<Item>("clipvault:item-updated", (e) => {
      setItems((prev) => prev.map((it) => (it.id === e.payload.id ? e.payload : it)));
    });
    const un7 = listen<string>("clipvault:open-spellcheck-with-text", (e) => {
      setView("typing");
      const text = e.payload || "";
      setImportedSpellText(text);
      if (text) {
        notify(`تم استيراد النص المحدد (${text.slice(0, 20)}${text.length > 20 ? "..." : ""}) للتدقيق`);
      } else {
        notify("تم فتح التدقيق الإملائي — الصق أو اكتب النص لفحصه");
      }
    });
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
      un4.then((f) => f());
      un5.then((f) => f());
      un6.then((f) => f());
      un7.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, loadTags]);

  // ---------------- actions ----------------
  const doCopy = useCallback(async (item: Item) => {
    try {
      await api.copyItem(item.id);
      await api.hideWindow();
      notify("تم النسخ للمحفظة");
    } catch (e) {
      notify(String(e), true);
    }
  }, [notify]);

  const doPaste = useCallback(async (item: Item) => {
    try {
      await api.pasteItem(item.id);
    } catch (e) {
      notify(String(e), true);
    }
  }, [notify]);

  const toggleFlag = useCallback(async (item: Item, flag: "pin" | "favorite" | "sensitive") => {
    try {
      if (flag === "pin") {
        await api.setPin(item.id, !item.pinned);
        notify(item.pinned ? "تم إلغاء التثبيت" : "تم التثبيت");
      } else if (flag === "favorite") {
        await api.setFavorite(item.id, !item.favorite);
        notify(item.favorite ? "أُزيل من المفضلة" : "أُضيف للمفضلة");
      } else {
        await api.setSensitive(item.id, !item.sensitive);
        notify(item.sensitive ? "أُلغي التمييز كحساس" : "تم التمييز كحساس");
      }
      setItems((prev) =>
        prev.map((p) => {
          if (p.id !== item.id) return p;
          const next = { ...p };
          if (flag === "pin") next.pinned = !p.pinned;
          if (flag === "favorite") next.favorite = !p.favorite;
          if (flag === "sensitive") next.sensitive = !p.sensitive;
          return next;
        }),
      );
      reload({ silent: true });
    } catch (e) {
      notify(String(e), true);
    }
  }, [notify, reload]);

  const doDelete = useCallback(async (item: Item) => {
    try {
      await api.deleteItem(item.id);
      setItems((prev) => prev.filter((p) => p.id !== item.id));
      setTotal((t) => Math.max(0, t - 1));
      loadTags();
      loadSources();
      notify("تم الحذف");
    } catch (e) {
      notify(String(e), true);
    }
  }, [loadSources, loadTags, notify]);

  const saveEdit = useCallback(async () => {
    if (!editItem) return;
    const text = editText.trim();
    if (!text) { setEditItem(null); return; }
    try {
      await api.editItemText(editItem.id, text);
      setItems((prev) => prev.map((p) => (p.id === editItem.id ? { ...p, text, html: null } : p)));
      notify("تم حفظ التعديل");
    } catch (e) {
      notify(String(e), true);
    }
    setEditItem(null);
  }, [editItem, editText, notify]);

  const handleCardAction = useCallback((e: CardActionEvt) => {
    const { item, action } = e;
    switch (action) {
      case "paste": doPaste(item); break;
      case "copy": doCopy(item); break;
      case "pin": case "favorite": case "sensitive": toggleFlag(item, action); break;
      case "menu": setMenu({ x: e.x ?? 40, y: e.y ?? 40, item }); break;
      case "preview": setPreviewItem(item); break;
      case "edit": setEditItem(item); setEditText(item.text || ""); break;
      case "save":
        api.saveImage(item.id).then((p) => p && notify("تم حفظ الصورة")).catch((err) => notify(String(err), true));
        break;
      case "open":
        api.openItem(item.id).catch((err) => notify(String(err), true));
        break;
      case "reveal":
        api.revealItem(item.id).catch((err) => notify(String(err), true));
        break;
      case "ocr":
        notify("جارٍ استخراج النص بتقنية OneOCR...");
        api.extractOcr(item.id)
          .then((res: { text: string }) => {
            if (res.text) {
              navigator.clipboard.writeText(res.text).catch(() => {});
              notify("تم استخراج النص ونسخه للحافظة بنجاح!");
            } else {
              notify("لم يتم العثور على أي نصوص واضحة في الصورة.", true);
            }
          })
          .catch((err: unknown) => notify(String(err), true));
        break;
      case "copy-ocr":
        if (item.ocrText) {
          navigator.clipboard.writeText(item.ocrText).catch(() => {});
          notify("تم نسخ النص المستخرج!");
        }
        break;
    }
  }, [doCopy, doPaste, notify, toggleFlag]);

  const handleMenuAction = useCallback(async (a: MenuAction, item: Item) => {
    setMenu(null);
    switch (a.action) {
      case "copy": doCopy(item); break;
      case "pin": case "favorite": case "sensitive": toggleFlag(item, a.action); break;
      case "delete": doDelete(item); break;
      case "edit": setEditItem(item); setEditText(item.text || ""); break;
      case "preview": setPreviewItem(item); break;
      case "panel": setPanelOpen(true); break;
      case "save":
        api.saveImage(item.id).then((p) => p && notify("تم حفظ الصورة")).catch((err) => notify(String(err), true));
        break;
      case "open":
        api.openItem(item.id).catch((err) => notify(String(err), true));
        break;
      case "reveal":
        api.revealItem(item.id).catch((err) => notify(String(err), true));
        break;
      case "ocr":
        notify("جارٍ استخراج النص بتقنية OneOCR...");
        api.extractOcr(item.id)
          .then((res: { text: string }) => {
            if (res.text) {
              navigator.clipboard.writeText(res.text).catch(() => {});
              notify("تم استخراج النص ونسخه للحافظة بنجاح!");
            } else {
              notify("لم يتم العثور على أي نصوص واضحة في الصورة.", true);
            }
          })
          .catch((err: unknown) => notify(String(err), true));
        break;
      case "copy-ocr":
        if (item.ocrText) {
          navigator.clipboard.writeText(item.ocrText).catch(() => {});
          notify("تم نسخ النص المستخرج!");
        }
        break;
      case "toggle-tag":
        if (a.tagId != null) {
          try {
            await api.toggleItemTag(item.id, a.tagId);
            reload({ silent: true });
            loadTags();
          } catch (e) { notify(String(e), true); }
        }
        break;
      case "toggle-collection":
        if (a.collectionId != null) {
          try {
            await api.toggleItemCollection(item.id, a.collectionId);
            reload({ silent: true });
            loadTags();
          } catch (e) { notify(String(e), true); }
        }
        break;
    }
  }, [doCopy, doDelete, loadTags, notify, reload, toggleFlag]);

  const applySettingsPatch = useCallback(async (patch: Record<string, string>) => {
    await api.setSettings(patch);
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    if (patch.theme) applyTheme(patch.theme);
  }, [applyTheme]);

  const changePaused = useCallback(async (p: boolean) => {
    try {
      await api.setPaused(p);
      setPaused(p);
      notify(p ? "أُوقف التسجيل مؤقتًا" : "استؤنف التسجيل");
    } catch (e) {
      notify(String(e), true);
    }
  }, [notify]);

  const clearAll = useCallback(async () => {
    try {
      const n = await api.clearHistory();
      notify(n > 0 ? `حُذفت ${n} عنصر` : "لا يوجد ما يُحذف");
      reload();
      loadTags();
    } catch (e) {
      notify(String(e), true);
    }
  }, [loadTags, notify, reload]);

  // ---------------- keyboard ----------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "1") { e.preventDefault(); setView("home"); return; }
      if (mod && e.key === "2") {
        e.preventDefault();
        setView("list");
        setTimeout(() => searchRef.current?.focus(), 30);
        return;
      }
      if (mod && e.key === "3") { e.preventDefault(); setView("passwords"); return; }
      if (mod && e.key === "4") { e.preventDefault(); setView("typing"); return; }
      if (mod && e.key === "5") { e.preventDefault(); setView("settings"); return; }
      if (mod && e.key === ",") { e.preventDefault(); setView((v) => (v === "settings" ? "home" : "settings")); return; }
      if (mod && (e.key === "/" || e.key === "?")) { e.preventDefault(); setHelpOpen((v) => !v); return; }
      if (helpOpen && e.key === "Escape") { setHelpOpen(false); return; }
      if (view === "settings") { if (e.key === "Escape") setView("home"); return; }
      if (view === "home") {
        if (!mod && e.key === "Enter") {
          e.preventDefault();
          setView("list");
          setTimeout(() => searchRef.current?.focus(), 30);
          return;
        }
        if (!mod && e.key === "Escape") {
          e.preventDefault();
          api.hideWindow();
          return;
        }
      }
      if (!mod && e.key === "Escape") {
        e.preventDefault();
        if (editItem) { setEditItem(null); return; }
        if (previewItem) { setPreviewItem(null); return; }
        if (panelOpen) { setPanelOpen(false); return; }
        if (query) { setQuery(""); return; }
        api.hideWindow();
        return;
      }

      // List navigation: works whether search input or card or list is focused
      if (view === "list" && !editItem && !helpOpen && !previewItem) {
        if (!mod && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          const delta = e.key === "ArrowDown" ? 1 : -1;
          const jump = e.shiftKey ? 8 : 1;
          setSelectedIdx((i) => {
            if (items.length === 0) return 0;
            return Math.min(items.length - 1, Math.max(0, i + delta * jump));
          });
          return;
        }
        if (!mod && (e.key === "PageDown" || e.key === "PageUp")) {
          e.preventDefault();
          const delta = e.key === "PageDown" ? 6 : -6;
          setSelectedIdx((i) => {
            if (items.length === 0) return 0;
            return Math.min(items.length - 1, Math.max(0, i + delta));
          });
          return;
        }
        if (!mod && e.key === "Enter") {
          e.preventDefault();
          const item = items[selectedIdx] ?? items[0];
          if (item) doPaste(item);
          return;
        }
      }

      if (!mod && e.key === "Delete" && items[selectedIdx]) {
        e.preventDefault();
        doDelete(items[selectedIdx]);
        return;
      }
      if (!mod && e.key === " ") {
        const isTyping =
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement;
        if (!isTyping) {
          e.preventDefault();
          if (previewItem) {
            setPreviewItem(null);
          } else if (items[selectedIdx]) {
            setPreviewItem(items[selectedIdx]);
          }
          return;
        }
      }
      if (mod && e.key.toLowerCase() === "n" && e.shiftKey) { setPanelOpen(true); return; }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [doDelete, editItem, helpOpen, items, panelOpen, previewItem, query, selectedIdx, view]);

  // Keep selectedIdx within bounds when items change
  useEffect(() => {
    if (selectedIdx >= items.length && items.length > 0) {
      setSelectedIdx(items.length - 1);
    }
  }, [items.length, selectedIdx]);

  // ---------------- render ----------------
  const shortcut = settings?.globalShortcut || "Ctrl+Shift+V";
  const selected = items[selectedIdx] ?? null;
  const isEmpty = !loading && items.length === 0;

  const chipNode = useMemo(() => {
    if (!orgFilter) return null;
    const label = orgFilter.name;
    const color = orgFilter.type === "tag" ? orgFilter.color : undefined;
    return (
      <button className="chip active" onClick={() => setOrgFilter(null)} title="إزالة التصفية">
        {color && <span className="dot" style={{ background: color }} />}
        {label}
        <span className="chip-x"><Icon name="x" size={12} /></span>
      </button>
    );
  }, [orgFilter]);

  return (
    <div id="app">
      {/* Navigation & Header */}
      <header className="app-header" data-tauri-drag-region>
        <div className="top-titlebar" data-tauri-drag-region>
          <div
            className="top-brand"
            onClick={() => setView("home")}
            title="ClipVault — الرئيسية"
            role="button"
            tabIndex={0}
          >
            <img src="/icon.png" alt="ClipVault" className="top-brand-icon" />
            <div className="top-brand-text">
              <span className="top-brand-name">ClipVault</span>
              <span className="top-brand-tag">v1.0</span>
            </div>
          </div>

          <div className="top-controls">
            <button
              className={`top-control-btn${paused ? " warn" : ""}`}
              title={paused ? "التسجيل متوقف — انقر للاستئناف" : "إيقاف التسجيل مؤقتًا"}
              onClick={() => changePaused(!paused)}
            >
              <Icon name={paused ? "play" : "pause"} size={13} />
              <span className="control-btn-label">{paused ? "متوقف" : "نشط"}</span>
            </button>
            <button
              className="top-control-btn theme-toggle"
              title="تبديل المظهر (Ctrl+T)"
              onClick={() => applySettingsPatch({ theme: (settings?.theme === "light" ? "dark" : "light") })}
            >
              <Icon name={settings?.theme === "light" ? "sun" : "moon"} size={14} />
            </button>
            <button
              className={`top-control-btn settings-toggle${view === "settings" ? " active" : ""}`}
              title="الإعدادات (Ctrl+5)"
              onClick={() => setView((v) => (v === "settings" ? "home" : "settings"))}
            >
              <Icon name="settings" size={14} />
            </button>
          </div>
        </div>

        <nav className="nav-tabs-bar" aria-label="أقسام التطبيق">
          <button
            className={`nav-tab${view === "home" ? " active" : ""}`}
            onClick={() => setView("home")}
            title="الرئيسية (Ctrl+1)"
          >
            <Icon name="home" size={13} />
            <span>الرئيسية</span>
          </button>
          <button
            className={`nav-tab${view === "list" ? " active" : ""}`}
            onClick={() => {
              setView("list");
              setTimeout(() => searchRef.current?.focus(), 30);
            }}
            title="الحافظة (Ctrl+2)"
          >
            <Icon name="clipboard" size={13} />
            <span>الحافظة</span>
            {total > 0 && <span className="tab-count">{total}</span>}
          </button>
          <button
            className={`nav-tab${view === "passwords" ? " active" : ""}`}
            onClick={() => setView("passwords")}
            title="كلمات المرور (Ctrl+3)"
          >
            <Icon name="lock" size={13} />
            <span>كلمات المرور</span>
            {vaultCount > 0 && <span className="tab-count">{vaultCount}</span>}
          </button>
          <button
            className={`nav-tab${view === "typing" ? " active" : ""}`}
            onClick={() => setView("typing")}
            title="الكتابة والتدقيق الذكي (Ctrl+4)"
          >
            <Icon name="sparkles" size={13} />
            <span>الكتابة الذكية</span>
          </button>
          <button
            className={`nav-tab${view === "settings" ? " active" : ""}`}
            onClick={() => setView("settings")}
            title="الإعدادات (Ctrl+5)"
          >
            <Icon name="settings" size={13} />
            <span>الإعدادات</span>
          </button>
        </nav>

        {/* search bar row: only in list view */}
        {view === "list" && (
          <div className="search-bar-row">
            <div className="search-wrap">
              <span className="search-icon"><Icon name="search" size={15} /></span>
              <input
                ref={searchRef}
                className="search-input"
                placeholder="ابحث في الحافظة…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
                spellCheck={false}
                autoFocus
              />
              {query && (
                <button className="search-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} title="مسح">
                  <Icon name="x" size={11} />
                </button>
              )}
              <kbd>↵ نسخ</kbd>
            </div>
          </div>
        )}
      </header>

      {/* filter chips: only in list view */}
      {view === "list" && (
        <nav className="chips">
          {FILTERS.map((f, i) => (
            <button
              key={f.id}
              className={`chip${filter === f.id && !orgFilter ? " active" : ""}`}
              onClick={() => { setFilter(f.id); setOrgFilter(null); }}
              title={`Ctrl+${i + 1}`}
            >
              <Icon name={f.icon} size={12} />
              {f.label}
            </button>
          ))}
          <span className="chips-spacer" />
          {chipNode}
          <button
            className={`icon-btn${panelOpen ? " active" : ""}`}
            title="الوسوم والمجموعات (Ctrl+Shift+N)"
            onClick={() => setPanelOpen((v) => !v)}
          >
            <Icon name="tag" size={14} />
          </button>
        </nav>
      )}

      {/* Sort & Source App Advanced Toolbar */}
      {view === "list" && (
        <div className="sort-toolbar-row">
          <div className="sort-toolbar-left">
            {/* Sort Dropdown */}
            <div className="sort-dropdown-wrap">
              <button
                className={`sort-pill-btn${sortBy !== "time_desc" ? " active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSortMenuOpen((v) => !v);
                  setSourceMenuOpen(false);
                }}
                title="تغيير طريقة فرز وترتيب العناصر"
              >
                <Icon name="columns" size={12} />
                <span>{SORT_OPTIONS.find((s) => s.id === sortBy)?.label || "الأحدث"}</span>
                <span className="arrow-sym">▾</span>
              </button>

              {sortMenuOpen && (
                <div className="sort-popover animate-in" onClick={(e) => e.stopPropagation()}>
                  <div className="popover-heading">ترتيب وفرز السجل</div>
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      className={`popover-item${sortBy === opt.id ? " active" : ""}`}
                      onClick={() => {
                        setSortBy(opt.id);
                        setSortMenuOpen(false);
                      }}
                    >
                      <Icon name={opt.icon} size={13} />
                      <span className="popover-item-label">{opt.label}</span>
                      {sortBy === opt.id && <Icon name="check" size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Source App Filter */}
            <div className="sort-dropdown-wrap">
              <button
                className={`sort-pill-btn${sourceFilter ? " active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSourceMenuOpen((v) => !v);
                  setSortMenuOpen(false);
                  loadSources();
                }}
                title="تصفية حسب مصدر النسخ (التطبيق)"
              >
                <Icon name="monitor" size={12} />
                <span>{sourceFilter ? sourceFilter : "كل التطبيقات"}</span>
                <span className="arrow-sym">▾</span>
              </button>

              {sourceMenuOpen && (
                <div className="sort-popover animate-in" onClick={(e) => e.stopPropagation()}>
                  <div className="popover-heading">تصفية حسب مصدر النسخ</div>
                  <button
                    className={`popover-item${!sourceFilter ? " active" : ""}`}
                    onClick={() => {
                      setSourceFilter(null);
                      setSourceMenuOpen(false);
                    }}
                  >
                    <Icon name="clipboard" size={13} />
                    <span className="popover-item-label">جميع التطبيقات</span>
                    {!sourceFilter && <Icon name="check" size={12} />}
                  </button>
                  <div className="popover-divider" />
                  {sources.length === 0 ? (
                    <div className="popover-hint">لا توجد تطبيقات مسجلة بعد</div>
                  ) : (
                    sources.map((src) => (
                      <button
                        key={src.name}
                        className={`popover-item${sourceFilter === src.name ? " active" : ""}`}
                        onClick={() => {
                          setSourceFilter(src.name);
                          setSourceMenuOpen(false);
                        }}
                      >
                        <Icon name="monitor" size={13} />
                        <span className="popover-item-label">{src.name}</span>
                        <span className="popover-count-pill">{src.count}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Active Source Filter Chip */}
          {sourceFilter && (
            <button
              className="chip active source-active-chip"
              onClick={() => setSourceFilter(null)}
              title="إلغاء تصفية المصدر"
            >
              <Icon name="monitor" size={11} />
              <span>{sourceFilter}</span>
              <span className="chip-x"><Icon name="x" size={10} /></span>
            </button>
          )}
        </div>
      )}

      {paused && (
        <div className="paused-banner" onClick={() => changePaused(false)}>
          <Icon name="pause" size={14} />
          التسجيل متوقف مؤقتًا — لن يُسجَّل أي محتوى جديد
          <span className="p-btn">استئناف</span>
        </div>
      )}

      {/* Home View */}
      {view === "home" && (
        <HomeView
          settings={settings}
          paused={paused}
          onGoToClipboard={() => {
            setView("list");
            setTimeout(() => searchRef.current?.focus(), 30);
          }}
          onGoToTyping={() => setView("typing")}
          onGoToVault={() => setView("passwords")}
          onGoToSettings={() => setView("settings")}
          onTogglePause={() => changePaused(!paused)}
          onToggleTheme={() => applySettingsPatch({ theme: settings?.theme === "light" ? "dark" : "light" })}
          onClearHistory={clearAll}
          onNotify={notify}
        />
      )}

      {/* Password Vault View */}
      {view === "passwords" && (
        <PasswordVault onNotify={notify} onItemCountChange={setVaultCount} />
      )}

      {/* Smart Typing & Writing Suite View */}
      {view === "typing" && (
        <SmartTypingSuite
          onNotify={notify}
          initialSpellText={importedSpellText}
          onClearInitialSpellText={() => setImportedSpellText("")}
        />
      )}

      {/* list */}
      {view === "list" && (
        <main className="list">
          {loading ? (
            <Skeletons />
          ) : isEmpty ? (
            query || orgFilter ? (
              <EmptyResults />
            ) : filter === "all" ? (
              <EmptyFirstRun shortcut={shortcut} />
            ) : (
              <EmptyFiltered />
            )
          ) : (
            <>
              {items.map((item, i) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  selected={i === selectedIdx}
                  animate={freshIds.has(item.id)}
                  query={query}
                  onAction={handleCardAction}
                  onSelect={() => setSelectedIdx(i)}
                />
              ))}
              {hasMore && <div ref={sentinelRef} style={{ height: 8 }} />}
              {!hasMore && items.length > 8 && (
                <div style={{ textAlign: "center", padding: "8px 0 4px", color: "var(--text-3)", fontSize: 11 }}>
                  نهاية القائمة — استخدم البحث للوصول السريع لأي عنصر
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* footer (only for list) */}
      {view === "list" && (
        <footer className="footer">
          <span>{loading ? "…" : `${total.toLocaleString("en")} عنصر`}</span>
          <div className="hints">
            <kbd>↑↓</kbd><span>تنقل</span>
            <kbd>Enter</kbd><span>نسخ</span>
            <kbd>Ctrl+/</kbd><span>الاختصارات</span>
          </div>
        </footer>
      )}

      {/* overlays */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          item={menu.item}
          tags={tags}
          collections={collections}
          onAction={handleMenuAction}
          onClose={() => setMenu(null)}
        />
      )}

      <TagPanel
        open={panelOpen}
        active={orgFilter}
        tags={tags}
        collections={collections}
        onChanged={() => { loadTags(); reload({ silent: true }); }}
        onFilter={(f) => { setOrgFilter(f); if (f) setPanelOpen(false); }}
        onClose={() => setPanelOpen(false)}
      />

      {previewItem && <Preview item={previewItem} onClose={() => setPreviewItem(null)} />}

      {editItem && (
        <div className="preview-overlay" onClick={() => setEditItem(null)}>
          <div
            className="help-card"
            style={{ width: 340 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3><Icon name="edit" size={15} /> تعديل النص</h3>
            <textarea
              className="selectable"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit();
              }}
              style={{
                width: "100%", minHeight: 120, resize: "vertical",
                background: "var(--bg-solid)", border: "1px solid var(--border-strong)",
                borderRadius: 8, color: "var(--text-1)", padding: 10,
                fontSize: 13, outline: "none", fontFamily: "inherit",
              }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-start", marginTop: 10 }}>
              <button className="btn primary" onClick={saveEdit}>حفظ (Ctrl+Enter)</button>
              <button className="btn" onClick={() => setEditItem(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="help-sheet" onClick={() => setHelpOpen(false)}>
          <div className="help-card" onClick={(e) => e.stopPropagation()}>
            <h3><Icon name="keyboard" size={16} /> اختصارات لوحة المفاتيح</h3>
            <div className="settings-group">
              <h4>عام</h4>
              <div className="keys-grid">
                <span className="k-desc">فتح / إخفاء الحافظة</span>
                <span className="k-keys"><kbd>{shortcut}</kbd></span>
                <span className="k-desc">البحث الفوري</span>
                <span className="k-keys"><span style={{ color: "var(--text-3)" }}>اكتب مباشرة</span></span>
                <span className="k-desc">نسخ العنصر المحدد</span>
                <span className="k-keys"><kbd>Enter</kbd></span>
                <span className="k-desc">التنقل بين العناصر</span>
                <span className="k-keys"><kbd>↑</kbd><kbd>↓</kbd></span>
                <span className="k-desc">قفزة سريعة</span>
                <span className="k-keys"><kbd>Shift+↑↓</kbd></span>
                <span className="k-desc">إخفاء النافذة</span>
                <span className="k-keys"><kbd>Esc</kbd></span>
              </div>
            </div>
            <div className="settings-group">
              <h4>الكتابة والتدقيق الذكي</h4>
              <div className="keys-grid">
                <span className="k-desc">تصحيح النص المحدد بأي تطبيق</span>
                <span className="k-keys"><kbd>Ctrl+Shift+X</kbd></span>
                <span className="k-desc">الانتقال للكتابة الذكية</span>
                <span className="k-keys"><kbd>Ctrl+4</kbd></span>
                <span className="k-desc">تبديل الاتجاه (عربي ↔ إنجليزي)</span>
                <span className="k-keys"><kbd>Alt+S</kbd></span>
                <span className="k-desc">تطبيق الكل / نسخ النتيجة</span>
                <span className="k-keys"><kbd>Ctrl+Enter</kbd></span>
                <span className="k-desc">لصق بالتطبيق النشط</span>
                <span className="k-keys"><kbd>Shift+Enter</kbd></span>
              </div>
            </div>
            <div className="settings-group">
              <h4>على العنصر المحدد</h4>
              <div className="keys-grid">
                <span className="k-desc">حذف</span>
                <span className="k-keys"><kbd>Delete</kbd></span>
                <span className="k-desc">معاينة الصورة</span>
                <span className="k-keys"><kbd>Space</kbd></span>
                <span className="k-desc">تصفيات سريعة</span>
                <span className="k-keys"><kbd>Ctrl+1…7</kbd></span>
                <span className="k-desc">الإعدادات</span>
                <span className="k-keys"><kbd>Ctrl+,</kbd></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "settings" && settings && (
        <SettingsView
          settings={settings}
          paused={paused}
          onSettingsChange={applySettingsPatch}
          onPausedChange={changePaused}
          onClose={() => setView("home")}
          onClearHistory={clearAll}
          notify={notify}
        />
      )}

      {toast && <Toast msg={toast.msg} error={toast.err} onDone={() => setToast(null)} />}

      {/* Ctrl+T theme shortcut */}
      <HotKeyT onToggle={() => applySettingsPatch({ theme: settings?.theme === "light" ? "dark" : "light" })} />
    </div>
  );
}

/** Ctrl+T global theme toggle */
function HotKeyT({ onToggle }: { onToggle: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        onToggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onToggle]);
  return null;
}
