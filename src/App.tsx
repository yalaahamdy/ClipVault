import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { api, vaultApi, PAGE_SIZE } from "./api";
import type {
  CollectionWithCount,
  Item,
  Settings,
  SnipCommitResult,
  SortOption,
  SourceAppStat,
  TagWithCount,
} from "./types";
import { APP_VERSION } from "./version";
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
import { QrModal } from "./components/QrModal";
import { MergeModal, SelectionBar } from "./components/Selection";
import { SnipOverlay } from "./components/SnipOverlay";
import { FloatingQuickAccess } from "./components/FloatingQuickAccess";
import { transformById, TransformError } from "./utils/transforms";
import { fmtNum, useI18n, type Lang } from "./i18n";

const FILTERS: Array<{ id: string; labelKey: string; icon: string }> = [
  { id: "all", labelKey: "filters.all", icon: "clipboard" },
  { id: "text", labelKey: "filters.text", icon: "text" },
  { id: "link", labelKey: "filters.link", icon: "link" },
  { id: "image", labelKey: "filters.image", icon: "image" },
  { id: "files", labelKey: "filters.files", icon: "folder" },
  { id: "favorite", labelKey: "filters.favorite", icon: "star" },
  { id: "pinned", labelKey: "filters.pinned", icon: "pin" },
];

const SORT_OPTIONS: Array<{ id: SortOption; labelKey: string; icon: string }> = [
  { id: "time_desc", labelKey: "sort.timeDesc", icon: "clock" },
  { id: "time_asc", labelKey: "sort.timeAsc", icon: "clock" },
  { id: "use_count_desc", labelKey: "sort.useCount", icon: "sparkles" },
  { id: "source_asc", labelKey: "sort.source", icon: "monitor" },
  { id: "alpha_asc", labelKey: "sort.alpha", icon: "text" },
  { id: "length_desc", labelKey: "sort.length", icon: "columns" },
];

const SEQ_PASTE_DELAY_MS = 700;

export default function App() {
  const { t, lang, setLang } = useI18n();

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

  // ---- v1.5: multi-select / merge / QR
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [qrText, setQrText] = useState<string | null>(null);
  const [devSnip, setDevSnip] = useState(false);
  const anchorRef = useRef<number | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);
  const stateRef = useRef({ query, filter, orgFilter, sortBy, sourceFilter });
  stateRef.current = { query, filter, orgFilter, sortBy, sourceFilter };

  const notify = useCallback((msg: string, err?: boolean) => setToast({ msg, err }), []);

  // Floating quick-access bar state for mobile / instant touch
  const [floatingBarEnabled, setFloatingBarEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("clipvault_floating_enabled") !== "false";
    } catch {
      return true;
    }
  });

  const toggleFloatingBar = useCallback(() => {
    setFloatingBarEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("clipvault_floating_enabled", next ? "true" : "false");
      } catch { /* ignore */ }
      notify(next ? (lang === "ar" ? "تم تفعيل شريط الوصول السريع والقائمة الدائرية" : "Quick access orb enabled") : (lang === "ar" ? "تم إخفاء شريط الوصول السريع" : "Quick access orb hidden"));
      return next;
    });
  }, [notify, lang]);

  // ---------------- theme ----------------
  const applyTheme = useCallback((th: string) => {
    document.documentElement.dataset.theme = th === "light" ? "light" : "dark";
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
      const [tg, c] = await Promise.all([api.getTags(), api.getCollections()]);
      setTags(tg);
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
    const timer = setTimeout(() => reload({ silent: items.length > 0 }), query ? 90 : 0);
    return () => clearTimeout(timer);
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
        setTotal((tt) => tt + 1);
        setFreshIds((prev) => new Set(prev).add(incoming.id));
      } else {
        reload({ silent: true });
      }
      setSelectedIdx(0);
    });
    const un2 = listen<boolean>("clipvault:paused-changed", (e) => setPaused(e.payload));
    const un3 = listen("clipvault:items-changed", () => { reload({ silent: true }); loadTags(); });
    const un4 = listen("clipvault:open-settings", () => setView("settings"));
    const un4b = listen("clipvault:help", () => setHelpOpen(true));
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
      setSelectMode(false);
      setSelectedIds(new Set());
      setMergeOpen(false);
      setQrText(null);
    });
    const un6 = listen<Item>("clipvault:item-updated", (e) => {
      setItems((prev) => prev.map((it) => (it.id === e.payload.id ? e.payload : it)));
    });
    const un7 = listen<string>("clipvault:open-spellcheck-with-text", (e) => {
      setView("typing");
      const text = e.payload || "";
      setImportedSpellText(text);
      if (text) {
        const sample = `${text.slice(0, 20)}${text.length > 20 ? "…" : ""}`;
        notify(t("toast.importedText", { sample }));
      } else {
        notify(t("toast.importedEmpty"));
      }
    });
    const un8 = listen<SnipCommitResult>("clipvault:snip-complete", (e) => {
      reload({ silent: true });
      notify(
        e.payload.hasOcrText
          ? t("toast.snipDoneOcr")
          : t("toast.snipDone"),
      );
    });
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
      un4.then((f) => f());
      un4b.then((f) => f());
      un5.then((f) => f());
      un6.then((f) => f());
      un7.then((f) => f());
      un8.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, loadTags, notify, t]);

  // QR modal copy/save confirmations (window-level custom events from QrModal)
  useEffect(() => {
    const onCopied = () => notify(t("toast.qrCopiedImage"));
    const onSaved = () => notify(t("toast.qrSaved"));
    window.addEventListener("clipvault:qr-copied", onCopied);
    window.addEventListener("clipvault:qr-saved", onSaved);
    return () => {
      window.removeEventListener("clipvault:qr-copied", onCopied);
      window.removeEventListener("clipvault:qr-saved", onSaved);
    };
  }, [notify, t]);

  // v1.6: silent update check at boot (respects the autoUpdate setting).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.getSettings();
        if (s.autoUpdate === "0") return;
      } catch { /* proceed anyway */ }
      try {
        const info = await api.updateCheck();
        if (alive && info) notify(t("toast.updateAvailableToast", { v: info.version }));
      } catch { /* offline or no endpoint — stay quiet */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- actions ----------------
  const doCopy = useCallback(async (item: Item) => {
    try {
      await api.copyItem(item.id);
      await api.hideWindow();
      notify(t("toast.copied"));
    } catch (e) {
      notify(String(e), true);
    }
  }, [notify, t]);

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
        notify(item.pinned ? t("toast.pinOff") : t("toast.pinOn"));
      } else if (flag === "favorite") {
        await api.setFavorite(item.id, !item.favorite);
        notify(item.favorite ? t("toast.favOff") : t("toast.favOn"));
      } else {
        await api.setSensitive(item.id, !item.sensitive);
        notify(item.sensitive ? t("toast.sensOff") : t("toast.sensOn"));
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
  }, [notify, reload, t]);

  const doDelete = useCallback(async (item: Item) => {
    try {
      await api.deleteItem(item.id);
      setItems((prev) => prev.filter((p) => p.id !== item.id));
      setTotal((tt) => Math.max(0, tt - 1));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      loadTags();
      loadSources();
      notify(t("toast.deleted"));
    } catch (e) {
      notify(String(e), true);
    }
  }, [loadSources, loadTags, notify, t]);

  const saveEdit = useCallback(async () => {
    if (!editItem) return;
    const text = editText.trim();
    if (!text) { setEditItem(null); return; }
    try {
      await api.editItemText(editItem.id, text);
      setItems((prev) => prev.map((p) => (p.id === editItem.id ? { ...p, text, html: null } : p)));
      notify(t("toast.editSaved"));
    } catch (e) {
      notify(String(e), true);
    }
    setEditItem(null);
  }, [editItem, editText, notify, t]);

  const beginSnip = useCallback(() => {
    // Dev mock: render the overlay inside the main window (no second window in a browser).
    if ((window as unknown as { __CV_DEV_MOCK__?: boolean }).__CV_DEV_MOCK__) {
      setDevSnip(true);
      return;
    }
    api.snipBegin().catch((e) => notify(t("toast.snipFailed", { reason: String(e) }), true));
  }, [notify, t]);

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
        api.saveImage(item.id).then((p) => p && notify(t("toast.imageSaved"))).catch((err) => notify(String(err), true));
        break;
      case "open":
        api.openItem(item.id).catch((err) => notify(String(err), true));
        break;
      case "reveal":
        api.revealItem(item.id).catch((err) => notify(String(err), true));
        break;
      case "ocr":
        notify(t("toast.ocrRunning"));
        api.extractOcr(item.id)
          .then((res: { text: string }) => {
            if (res.text) {
              navigator.clipboard.writeText(res.text).catch(() => {});
              notify(t("toast.ocrDone"));
            } else {
              notify(t("toast.ocrNone"), true);
            }
          })
          .catch((err: unknown) => notify(String(err), true));
        break;
      case "copy-ocr":
        if (item.ocrText) {
          navigator.clipboard.writeText(item.ocrText).catch(() => {});
          notify(t("toast.ocrCopied"));
        }
        break;
    }
  }, [doCopy, doPaste, notify, t, toggleFlag]);

  const applyTransform = useCallback(async (item: Item, transformId: string) => {
    const tr = transformById(transformId);
    if (!tr) return;
    const source = (item.text ?? item.ocrText ?? "").trim();
    if (!source) return;
    try {
      const result = tr.apply(source);
      if (!result.trim()) {
        notify(t("tr.emptyResult"), true);
        return;
      }
      await api.addTextItem(result, "ClipVault ✦");
      notify(t("toast.transformDone", { name: t(tr.key) }));
    } catch (e) {
      if (e instanceof TransformError) {
        notify(t("toast.transformFailed", { reason: t(e.reasonKey) }), true);
      } else {
        notify(String(e), true);
      }
    }
  }, [notify, t]);

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
        api.saveImage(item.id).then((p) => p && notify(t("toast.imageSaved"))).catch((err) => notify(String(err), true));
        break;
      case "open":
        api.openItem(item.id).catch((err) => notify(String(err), true));
        break;
      case "reveal":
        api.revealItem(item.id).catch((err) => notify(String(err), true));
        break;
      case "ocr":
        notify(t("toast.ocrRunning"));
        api.extractOcr(item.id)
          .then((res: { text: string }) => {
            if (res.text) {
              navigator.clipboard.writeText(res.text).catch(() => {});
              notify(t("toast.ocrDone"));
            } else {
              notify(t("toast.ocrNone"), true);
            }
          })
          .catch((err: unknown) => notify(String(err), true));
        break;
      case "copy-ocr":
        if (item.ocrText) {
          navigator.clipboard.writeText(item.ocrText).catch(() => {});
          notify(t("toast.ocrCopied"));
        }
        break;
      case "transform":
        if (a.transformId) await applyTransform(item, a.transformId);
        break;
      case "qr": {
        const text = (item.text || item.ocrText || "").trim();
        if (!text) { notify(t("toast.qrEmpty"), true); return; }
        setQrText(text);
        break;
      }
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
  }, [applyTransform, doCopy, doDelete, loadTags, notify, reload, t, toggleFlag]);

  const applySettingsPatch = useCallback(async (patch: Record<string, string>) => {
    await api.setSettings(patch);
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    if (patch.theme) applyTheme(patch.theme);
    if (patch.lang === "ar" || patch.lang === "en") setLang(patch.lang as Lang);
  }, [applyTheme, setLang]);

  const changePaused = useCallback(async (p: boolean) => {
    try {
      await api.setPaused(p);
      setPaused(p);
      notify(p ? t("toast.pausedOn") : t("toast.pausedOff"));
    } catch (e) {
      notify(String(e), true);
    }
  }, [notify, t]);

  const clearAll = useCallback(async () => {
    try {
      const n = await api.clearHistory();
      notify(n > 0 ? t("toast.cleared", { n }) : t("toast.nothingToClear"));
      reload();
      loadTags();
    } catch (e) {
      notify(String(e), true);
    }
  }, [loadTags, notify, reload, t]);

  // ---------------- v1.5: multi-select ----------------
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setMergeOpen(false);
  }, []);

  const toggleSelect = useCallback((id: number, additive: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set<number>(additive ? prev : []);
      if (prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rangeSelect = useCallback((index: number) => {
    const anchor = anchorRef.current;
    if (anchor == null) {
      const it = items[index];
      if (it) setSelectedIds((prev) => new Set(prev).add(it.id));
      anchorRef.current = index;
      return;
    }
    const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (let i = from; i <= to; i++) {
        const it = items[i];
        if (it) next.add(it.id);
      }
      return next;
    });
  }, [items]);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(items.map((it) => it.id)));
  }, [items]);

  const pasteSequence = useCallback(async () => {
    const ordered = items.filter((it) => selectedIds.has(it.id));
    if (ordered.length === 0) return;
    setMergeOpen(false);
    notify(t("toast.seqPasteStarted", { n: ordered.length }));
    await api.hideWindow().catch(() => {});
    for (const it of ordered) {
      try {
        await api.pasteItem(it.id);
      } catch { /* keep going */ }
      await new Promise((r) => setTimeout(r, SEQ_PASTE_DELAY_MS));
    }
    notify(t("toast.seqPasteDone", { n: ordered.length }));
    exitSelectMode();
  }, [exitSelectMode, items, notify, selectedIds, t]);

  const confirmMerge = useCallback(async (mergedText: string) => {
    try {
      await api.addTextItem(mergedText, "ClipVault ✦");
      notify(t("toast.mergeSaved"));
      setMergeOpen(false);
      exitSelectMode();
    } catch (e) {
      notify(String(e), true);
    }
  }, [exitSelectMode, notify, t]);

  const deleteSelected = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      for (const id of ids) {
        await api.deleteItem(id);
      }
      notify(t("toast.selDeleted", { n: ids.length }));
      exitSelectMode();
      reload({ silent: true });
      loadTags();
      loadSources();
    } catch (e) {
      notify(String(e), true);
    }
  }, [exitSelectMode, loadSources, loadTags, notify, reload, selectedIds, t]);

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
      if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        const next: Lang = lang === "ar" ? "en" : "ar";
        setLang(next);
        return;
      }
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
        if (qrText != null) { setQrText(null); return; }
        if (mergeOpen) { setMergeOpen(false); return; }
        if (selectMode) { exitSelectMode(); return; }
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
        if (!mod && e.key === "Enter" && !selectMode) {
          e.preventDefault();
          const item = items[selectedIdx] ?? items[0];
          if (item) doPaste(item);
          return;
        }
        if (mod && e.key.toLowerCase() === "a" && selectMode) {
          e.preventDefault();
          selectAllVisible();
          return;
        }
      }

      if (!mod && e.key === "Delete" && items[selectedIdx] && !selectMode) {
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
  }, [doDelete, editItem, exitSelectMode, helpOpen, items, lang, mergeOpen, panelOpen, previewItem, query, qrText, selectAllVisible, selectedIdx, selectMode, setLang, view]);

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
  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );

  const chipNode = useMemo(() => {
    if (!orgFilter) return null;
    const label = orgFilter.name;
    const color = orgFilter.type === "tag" ? orgFilter.color : undefined;
    return (
      <button className="chip active" onClick={() => setOrgFilter(null)} title={t("search.filterRemove")}>
        {color && <span className="dot" style={{ background: color }} />}
        {label}
        <span className="chip-x"><Icon name="x" size={12} /></span>
      </button>
    );
  }, [orgFilter, t]);

  return (
    <div id="app">
      {/* Navigation & Header */}
      <header className="app-header" data-tauri-drag-region>
        <div className="top-titlebar" data-tauri-drag-region>
          <div
            className="top-brand"
            onClick={() => setView("home")}
            title={t("nav.brandTitle")}
            role="button"
            tabIndex={0}
          >
            <img src="/icon.png" alt="ClipVault" className="top-brand-icon" />
            <div className="top-brand-text">
              <span className="top-brand-name">ClipVault</span>
              <span className="top-brand-tag">v{APP_VERSION}</span>
            </div>
          </div>

          <div className="top-controls">
            <button
              className={`top-control-btn${paused ? " warn" : ""}`}
              title={paused ? t("nav.pausedTitle") : t("nav.pauseTitle")}
              onClick={() => changePaused(!paused)}
            >
              <Icon name={paused ? "play" : "pause"} size={13} />
              <span className="control-btn-label">{paused ? t("nav.pausedLabel") : t("nav.activeLabel")}</span>
            </button>
            <button
              className="top-control-btn theme-toggle"
              title={t("nav.themeTitle")}
              onClick={() => applySettingsPatch({ theme: (settings?.theme === "light" ? "dark" : "light") })}
            >
              <Icon name={settings?.theme === "light" ? "sun" : "moon"} size={14} />
            </button>
            <button
              className={`top-control-btn settings-toggle${view === "settings" ? " active" : ""}`}
              title={t("nav.settingsBtnTitle")}
              onClick={() => setView((v) => (v === "settings" ? "home" : "settings"))}
            >
              <Icon name="settings" size={14} />
            </button>
          </div>
        </div>

        <nav className="nav-tabs-bar" aria-label={t("nav.sections")}>
          <button
            className={`nav-tab${view === "home" ? " active" : ""}`}
            onClick={() => setView("home")}
            title={t("nav.homeTitle")}
          >
            <Icon name="home" size={13} />
            <span>{t("nav.home")}</span>
          </button>
          <button
            className={`nav-tab${view === "list" ? " active" : ""}`}
            onClick={() => {
              setView("list");
              setTimeout(() => searchRef.current?.focus(), 30);
            }}
            title={t("nav.clipboardTitle")}
          >
            <Icon name="clipboard" size={13} />
            <span>{t("nav.clipboard")}</span>
            {total > 0 && <span className="tab-count">{fmtNum(total, lang)}</span>}
          </button>
          <button
            className={`nav-tab${view === "passwords" ? " active" : ""}`}
            onClick={() => setView("passwords")}
            title={t("nav.passwordsTitle")}
          >
            <Icon name="lock" size={13} />
            <span>{t("nav.passwords")}</span>
            {vaultCount > 0 && <span className="tab-count">{fmtNum(vaultCount, lang)}</span>}
          </button>
          <button
            className={`nav-tab${view === "typing" ? " active" : ""}`}
            onClick={() => setView("typing")}
            title={t("nav.typingTitle")}
          >
            <Icon name="sparkles" size={13} />
            <span>{t("nav.typing")}</span>
          </button>
          <button
            className={`nav-tab${view === "settings" ? " active" : ""}`}
            onClick={() => setView("settings")}
            title={t("nav.settingsTitle")}
          >
            <Icon name="settings" size={13} />
            <span>{t("nav.settings")}</span>
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
                placeholder={t("search.placeholder")}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
                spellCheck={false}
                autoFocus
              />
              {query && (
                <button className="search-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} title={t("search.clear")}>
                  <Icon name="x" size={11} />
                </button>
              )}
              <kbd>↵ {t("search.pasteHint")}</kbd>
            </div>
          </div>
        )}
      </header>

      {/* filter chips: only in list view */}
      {view === "list" && (
        <nav className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`chip${filter === f.id && !orgFilter ? " active" : ""}`}
              onClick={() => { setFilter(f.id); setOrgFilter(null); }}
            >
              <Icon name={f.icon} size={12} />
              {t(f.labelKey)}
            </button>
          ))}
          <span className="chips-spacer" />
          {chipNode}
          <button
            className="icon-btn"
            title={`${t("home.snipTitle")} (Ctrl+Shift+S)`}
            onClick={beginSnip}
          >
            <Icon name="crop" size={14} />
          </button>
          <button
            className={`icon-btn${selectMode ? " active" : ""}`}
            title={t("sel.modeTitle")}
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            <Icon name="listChecks" size={14} />
          </button>
          <button
            className={`icon-btn${panelOpen ? " active" : ""}`}
            title={t("search.tagPanelTitle")}
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
                title={t("sort.title")}
              >
                <Icon name="columns" size={12} />
                <span>{t(SORT_OPTIONS.find((s) => s.id === sortBy)?.labelKey || "sort.newest")}</span>
                <span className="arrow-sym">▾</span>
              </button>

              {sortMenuOpen && (
                <div className="sort-popover animate-in" onClick={(e) => e.stopPropagation()}>
                  <div className="popover-heading">{t("sort.heading")}</div>
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
                      <span className="popover-item-label">{t(opt.labelKey)}</span>
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
                title={t("sourceMenu.title")}
              >
                <Icon name="monitor" size={12} />
                <span>{sourceFilter ? sourceFilter : t("sourceMenu.all")}</span>
                <span className="arrow-sym">▾</span>
              </button>

              {sourceMenuOpen && (
                <div className="sort-popover animate-in" onClick={(e) => e.stopPropagation()}>
                  <div className="popover-heading">{t("sourceMenu.heading")}</div>
                  <button
                    className={`popover-item${!sourceFilter ? " active" : ""}`}
                    onClick={() => {
                      setSourceFilter(null);
                      setSourceMenuOpen(false);
                    }}
                  >
                    <Icon name="clipboard" size={13} />
                    <span className="popover-item-label">{t("sourceMenu.allApps")}</span>
                    {!sourceFilter && <Icon name="check" size={12} />}
                  </button>
                  <div className="popover-divider" />
                  {sources.length === 0 ? (
                    <div className="popover-hint">{t("sourceMenu.empty")}</div>
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
                        <span className="popover-count-pill">{fmtNum(src.count, lang)}</span>
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
              title={t("sourceMenu.chipTitle")}
            >
              <Icon name="monitor" size={11} />
              <span>{sourceFilter}</span>
              <span className="chip-x"><Icon name="x" size={10} /></span>
            </button>
          )}
        </div>
      )}

      {/* v1.5: floating selection action bar */}
      {view === "list" && selectMode && (
        <SelectionBar
          count={selectedIds.size}
          total={items.length}
          onPasteSeq={pasteSequence}
          onMerge={() => setMergeOpen(true)}
          onDelete={deleteSelected}
          onSelectAll={selectAllVisible}
          onClear={() => setSelectedIds(new Set())}
          onExit={exitSelectMode}
        />
      )}

      {paused && (
        <div className="paused-banner" onClick={() => changePaused(false)}>
          <Icon name="pause" size={14} />
          {t("pausedBanner.text")}
          <span className="p-btn">{t("pausedBanner.resume")}</span>
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
          onSnip={beginSnip}
          floatingBarEnabled={floatingBarEnabled}
          onToggleFloatingBar={toggleFloatingBar}
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
                  index={i}
                  selected={i === selectedIdx}
                  animate={freshIds.has(item.id)}
                  query={query}
                  selectMode={selectMode}
                  checked={selectedIds.has(item.id)}
                  onToggleSelect={(mode) => {
                    if (mode === "range") rangeSelect(i);
                    else toggleSelect(item.id, true);
                    anchorRef.current = i;
                  }}
                  onAction={handleCardAction}
                  onSelect={() => setSelectedIdx(i)}
                />
              ))}
              {hasMore && <div ref={sentinelRef} style={{ height: 8 }} />}
              {!hasMore && items.length > 8 && (
                <div className="list-end-note">{t("footer.endNote")}</div>
              )}
            </>
          )}
        </main>
      )}

      {/* footer (only for list) */}
      {view === "list" && (
        <footer className="footer">
          <span>{loading ? "…" : `${fmtNum(total, lang)} ${t("footer.items")}`}</span>
          <div className="hints">
            <kbd>↑↓</kbd><span>{t("footer.navigate")}</span>
            <kbd>Enter</kbd><span>{t("footer.paste")}</span>
            <kbd>Ctrl+/</kbd><span>{t("footer.shortcuts")}</span>
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

      {/* v1.5: dev-mode snip overlay (browser preview only) */}
      {devSnip && (
        <SnipOverlay
          onClose={() => setDevSnip(false)}
          onCommitted={(r) => {
            setDevSnip(false);
            reload({ silent: true });
            notify(r.hasOcrText ? t("toast.snipDoneOcr") : t("toast.snipDone"));
          }}
        />
      )}

      {qrText != null && <QrModal text={qrText} onClose={() => setQrText(null)} />}

      {mergeOpen && selectedItems.length >= 2 && (
        <MergeModal
          items={selectedItems}
          onCancel={() => setMergeOpen(false)}
          onConfirm={confirmMerge}
        />
      )}

      {editItem && (
        <div className="preview-overlay" onClick={() => setEditItem(null)}>
          <div
            className="help-card edit-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3><Icon name="edit" size={15} /> {t("editDialog.title")}</h3>
            <textarea
              className="selectable edit-dialog-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit();
              }}
              autoFocus
            />
            <div className="edit-dialog-actions">
              <button className="btn primary" onClick={saveEdit}>{t("editDialog.save")}</button>
              <button className="btn" onClick={() => setEditItem(null)}>{t("editDialog.cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="help-sheet" onClick={() => setHelpOpen(false)}>
          <div className="help-card" onClick={(e) => e.stopPropagation()}>
            <h3><Icon name="keyboard" size={16} /> {t("help.title")}</h3>
            <div className="settings-group">
              <h4>{t("help.general")}</h4>
              <div className="keys-grid">
                <span className="k-desc">{t("help.openHide")}</span>
                <span className="k-keys"><kbd>{shortcut}</kbd></span>
                <span className="k-desc">{t("help.instantSearch")}</span>
                <span className="k-keys"><span style={{ color: "var(--text-3)" }}>{t("help.typeDirect")}</span></span>
                <span className="k-desc">{t("help.pasteSelected")}</span>
                <span className="k-keys"><kbd>Enter</kbd></span>
                <span className="k-desc">{t("help.navigate")}</span>
                <span className="k-keys"><kbd>↑</kbd><kbd>↓</kbd></span>
                <span className="k-desc">{t("help.quickJump")}</span>
                <span className="k-keys"><kbd>Shift+↑↓</kbd></span>
                <span className="k-desc">{t("help.snip")}</span>
                <span className="k-keys"><kbd>Ctrl+Shift+S</kbd></span>
                <span className="k-desc">{t("help.multiSelect")}</span>
                <span className="k-keys"><kbd>Ctrl+Click</kbd></span>
                <span className="k-desc">{t("help.langSwitch")}</span>
                <span className="k-keys"><kbd>Ctrl+L</kbd></span>
                <span className="k-desc">{t("help.hideWin")}</span>
                <span className="k-keys"><kbd>Esc</kbd></span>
              </div>
            </div>
            <div className="settings-group">
              <h4>{t("help.typing")}</h4>
              <div className="keys-grid">
                <span className="k-desc">{t("help.fixSelected")}</span>
                <span className="k-keys"><kbd>Ctrl+Shift+X</kbd></span>
                <span className="k-desc">{t("help.goTyping")}</span>
                <span className="k-keys"><kbd>Ctrl+4</kbd></span>
                <span className="k-desc">{t("help.switchDir")}</span>
                <span className="k-keys"><kbd>Alt+S</kbd></span>
                <span className="k-desc">{t("help.applyAll")}</span>
                <span className="k-keys"><kbd>Ctrl+Enter</kbd></span>
                <span className="k-desc">{t("help.pasteActive")}</span>
                <span className="k-keys"><kbd>Shift+Enter</kbd></span>
              </div>
            </div>
            <div className="settings-group">
              <h4>{t("help.onItem")}</h4>
              <div className="keys-grid">
                <span className="k-desc">{t("help.delete")}</span>
                <span className="k-keys"><kbd>Delete</kbd></span>
                <span className="k-desc">{t("help.previewImg")}</span>
                <span className="k-keys"><kbd>Space</kbd></span>
                <span className="k-desc">{t("help.quickFilters")}</span>
                <span className="k-keys"><kbd>Ctrl+1…7</kbd></span>
                <span className="k-desc">{t("help.settings")}</span>
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

      {/* Floating Quick-Access Orb & 3D Radial Menu for Mobile & Touch */}
      <FloatingQuickAccess
        enabled={floatingBarEnabled}
        totalItems={total}
        onNavigate={(targetView) => setView(targetView)}
        onTriggerSearch={() => {
          setView("list");
          setTimeout(() => searchRef.current?.focus(), 60);
        }}
        onQuickAdd={async (text) => {
          try {
            await api.addTextItem(text);
            await reload({ silent: true });
            notify(lang === "ar" ? "تمت إضافة النص ونسخه للحافظة بنجاح" : "Text added & copied to clipboard");
          } catch (e: any) {
            notify(String(e), true);
          }
        }}
      />

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
