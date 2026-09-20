/**
 * ClipVault — Browser preview mock (DEV ONLY)
 * -------------------------------------------------------------
 * Allows the React UI to run in a plain browser (npm run dev)
 * without the Tauri shell, by installing a fake
 * window.__TAURI_INTERNALS__ bridge backed by in-memory data.
 *
 * In a real Tauri build `__TAURI_INTERNALS__` already exists,
 * so this module is a no-op there. It is only imported behind a
 * runtime check in main.tsx.
 */

type CmdHandler = (args: Record<string, unknown> | undefined) => unknown;

/* ------------------------------------------------------------------ */
/* Sample data                                                         */
/* ------------------------------------------------------------------ */

const HOUR = 3600_000;
const now = Date.now();

let tagIdSeq = 100;
let colIdSeq = 100;
let itemIdSeq = 0;

const tags: Array<{ id: number; name: string; color: string; count: number }> = [
  { id: ++tagIdSeq, name: "أعمال", color: "#3fb6ff", count: 2 },
  { id: ++tagIdSeq, name: "أكواد", color: "#c084fc", count: 1 },
  { id: ++tagIdSeq, name: "شخصي", color: "#4ade80", count: 1 },
];

const collections: Array<{ id: number; name: string; count: number }> = [
  { id: ++colIdSeq, name: "مشروع التخرج", count: 2 },
  { id: ++colIdSeq, name: "روابط سريعة", count: 1 },
];

function svgImage(label: string, c1: string, c2: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="640" height="400" fill="url(#g)"/>
  <circle cx="530" cy="90" r="120" fill="rgba(255,255,255,0.14)"/>
  <circle cx="90" cy="330" r="90" fill="rgba(0,0,0,0.10)"/>
  <text x="50%" y="52%" text-anchor="middle" font-family="Segoe UI, sans-serif"
    font-size="34" font-weight="700" fill="rgba(255,255,255,0.92)">${label}</text>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/** Fake desktop screenshot for the dev snip overlay. */
function fakeScreenshot(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1e293b"/><stop offset="1" stop-color="#0b1220"/>
  </linearGradient></defs>
  <rect width="1280" height="800" fill="url(#bg)"/>
  <rect x="60" y="60" width="560" height="340" rx="12" fill="#f8fafc"/>
  <text x="90" y="130" font-family="Segoe UI, sans-serif" font-size="30" font-weight="700" fill="#0f172a">تقرير المبيعات — الربع الثالث</text>
  <text x="90" y="180" font-family="Segoe UI, sans-serif" font-size="22" fill="#334155">إجمالي الإيرادات: 1,240,500 جنيه</text>
  <text x="90" y="220" font-family="Segoe UI, sans-serif" font-size="22" fill="#334155">نسبة النمو: 18.4%</text>
  <text x="90" y="260" font-family="Segoe UI, sans-serif" font-size="22" fill="#334155"> Quarterly growth is steady.</text>
  <rect x="680" y="60" width="540" height="480" rx="12" fill="#0ea5e9" opacity="0.9"/>
  <circle cx="1180" cy="700" r="150" fill="rgba(255,255,255,0.08)"/>
  <text x="640" y="720" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="26" fill="#64748b">Snap — dev preview frame</text>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/** Deterministic pseudo-QR grid (visual placeholder for browser QA). */
function qrDataUrl(text: string): string {
  const size = 25;
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed >>> 16) % 2 === 0;
  };
  let cells = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const finder =
        (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
      const on = finder
        ? (x % (size - 7) === 0 || y % (size - 7) === 0 ||
           (x % (size - 7) === 6 || y % (size - 7) === 6) ||
           (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
           (x >= size - 5 && x <= size - 3 && y >= 2 && y <= 4) ||
           (x >= 2 && x <= 4 && y >= size - 5 && y <= size - 3))
        : rand();
      if (on) {
        cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#0b0e13">${cells}</g></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

interface MockItem {
  id: number;
  kind: "text" | "link" | "image" | "files";
  text: string | null;
  html: string | null;
  files: string[] | null;
  image: boolean;
  imageData?: string;
  sourceApp: string | null;
  ocrText?: string | null;
  pinned: boolean;
  favorite: boolean;
  sensitive: boolean;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  tags: Array<{ id: number; name: string; color: string }>;
}

function mk(
  kind: MockItem["kind"],
  text: string | null,
  sourceApp: string | null,
  opts: Partial<MockItem> = {},
): MockItem {
  const id = ++itemIdSeq;
  return {
    id,
    kind,
    text,
    html: null,
    files: null,
    image: kind === "image",
    sourceApp,
    pinned: false,
    favorite: false,
    sensitive: false,
    createdAt: now - id * HOUR,
    lastUsedAt: now - id * HOUR,
    useCount: 1,
    tags: [],
    ...opts,
  };
}

const items: MockItem[] = [
  mk("text", "شكراً جزيلاً على التعاون — الفريق القادم سيبدأ العمل يوم الأحد القادم إن شاء الله", "Teams", { tags: [tags[0]] }),
  mk("link", "https://github.com/yalaahamdy/ClipVault", "Chrome", { favorite: true, tags: [tags[1]], useCount: 4 }),
  mk("text", "export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 250) {\n  let t: ReturnType<typeof setTimeout>;\n  return (...args: Parameters<T>) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), ms);\n  };\n}", "VS Code", { tags: [tags[1]] }),
  mk("image", null, "Snipping Tool", {
    imageData: svgImage("لقطة شاشة — تقرير المبيعات", "#2563eb", "#7c3aed"),
    ocrText: "تقرير المبيعات الربع الثالث\nإجمالي الإيرادات: 1,240,500 جنيه\nنسبة النمو: 18.4%",
  }),
  mk("text", "الموعد النهائي لتسليم المشروع: 15 أكتوبر — يرجى مراجعة التقرير المرفق قبل الاجتماع.", "Word", { pinned: true, useCount: 3 }),
  mk("link", "https://developer.mozilla.org/en-US/docs/Web/API/Clipboard", "Edge", {}),
  mk("text", "RE: طلب إجازة سنوية — تمت الموافقة على طلبك لمدة أسبوعين اعتباراً من الأول من الشهر القادم.", "Outlook"),
  mk("files", null, "Explorer", { files: ["D:\\مشاريع\\ClipVault\\src\\App.tsx", "D:\\مشاريع\\ClipVault\\package.json"] }),
  mk("text", "sudo apt update && sudo apt upgrade -y", "Windows Terminal", { useCount: 7 }),
  mk("text", "+20 100 123 4567", "WhatsApp", { sensitive: true }),
  mk("image", null, "Snipping Tool", { imageData: svgImage("UI Mockup — Dashboard", "#0ea5e9", "#22d3ee") }),
  mk("text", "4242 4242 4242 4242", "Chrome", { sensitive: true }),
  mk("text", "السلام عليكم ورحمة الله وبركاته،\nأرجو الموافقة على الفاتورة المرفقة رقم 2026-114.\nوشكراً لحسن تعاونكم.", "Gmail"),
  mk("link", "https://www.aljazeera.net/news", "Chrome", {}),
  mk("text", "const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);", "VS Code", { favorite: true }),
  mk("text", "خطة الاجتماع الأسبوعي:\n1. مراجعة مؤشرات الأداء\n2. مناقشة عقبات الفريق\n3. توزيع مهام الأسبوع", "Notion", { tags: [tags[0]] }),
  mk("image", null, "Paint", { imageData: svgImage("Logo Draft v2", "#059669", "#84cc16") }),
  mk("text", "https://meet.google.com/abc-defg-hij", "Chrome", { useCount: 12 }),
  mk("text", "درجة حرارة اليوم 32° — الجو مشمس مع نواحي رطوبة 45%", "Weather"),
  mk("text", "SELECT id, title, kind FROM items WHERE pinned = 1 ORDER BY last_used_at DESC LIMIT 20;", "DBeaver"),
  mk("text", "أمر التحويل رقم 8842 — مبلغ 15,000 جنيه — بنك مصر — فرع المعادي", "Acrobat", { sensitive: true }),
  mk("text", "npm run build && npm run preview", "Windows Terminal", { useCount: 5 }),
  mk("link", "https://fonts.google.com/specimen/IBM+Plex+Sans+Arabic", "Chrome", {}),
  mk("text", "تذكير: تجديد الاشتراك السنوي للاستضافة قبل 20 سبتمبر", "Chrome"),
];

// Assign tags to a few more items for realistic chips
items[4].tags = [tags[0]];
items[10].tags = [tags[2]];

const itemsById = new Map(items.map((i) => [i.id, i]));

/* ------------------------------------------------------------------ */
/* Settings / stats / vault                                            */
/* ------------------------------------------------------------------ */

const settings: Record<string, string> = {
  theme: "dark",
  globalShortcut: "Ctrl+Shift+V",
  retentionDays: "30",
  maxItems: "5000",
  excludedApps: JSON.stringify(["keepass.exe"]),
  autoMask: "1",
  firstRun: "0",
  autostart: "0",
  paused: "0",
  lang: "ar",
  autoUpdate: "1",
};

const stats = { total: 1248, pinned: 6, favorites: 14, texts: 980, images: 92, links: 140, files: 36 };

const sources = [
  { name: "Chrome", count: 412 },
  { name: "VS Code", count: 307 },
  { name: "Teams", count: 189 },
  { name: "Notion", count: 120 },
  { name: "Windows Terminal", count: 88 },
  { name: "WhatsApp", count: 61 },
  { name: "Outlook", count: 44 },
];

let vaultUnlocked = false;
const vaultItems: Array<{
  id: number;
  category: "login" | "card" | "note";
  title: string;
  username?: string | null;
  password?: string | null;
  website?: string | null;
  notes?: string | null;
  cardNumber?: string | null;
  cardExpiry?: string | null;
  cardCvv?: string | null;
  favorite: boolean;
  strength: number;
  createdAt: number;
  updatedAt: number;
}> = [
  { id: 1, category: "login", title: "Google", username: "ayahamdy@gmail.com", password: "Xk9#mQ2$vLp8@wZn", website: "https://accounts.google.com", notes: null, cardNumber: null, cardExpiry: null, cardCvv: null, favorite: true, strength: 4, createdAt: now - 40 * 864e5, updatedAt: now - 2 * 864e5 },
  { id: 2, category: "login", title: "GitHub", username: "yalaahamdy", password: "gh_2026!S3cure", website: "https://github.com", notes: null, cardNumber: null, cardExpiry: null, cardCvv: null, favorite: true, strength: 3, createdAt: now - 90 * 864e5, updatedAt: now - 10 * 864e5 },
  { id: 3, category: "card", title: "بطاقة بنك مصر", username: null, password: null, website: null, notes: "بطاقة الصرف الرئيسية", cardNumber: "4242 4242 4242 4242", cardExpiry: "09/28", cardCvv: "731", favorite: false, strength: 3, createdAt: now - 60 * 864e5, updatedAt: now - 60 * 864e5 },
  { id: 4, category: "login", title: "Facebook", username: "ayahamdy", password: "pass123", website: "https://facebook.com", notes: null, cardNumber: null, cardExpiry: null, cardCvv: null, favorite: false, strength: 0, createdAt: now - 400 * 864e5, updatedAt: now - 400 * 864e5 },
  { id: 5, category: "note", title: "كود WiFi المكتب", username: null, password: null, website: null, notes: "SSID: OFFICE-5G\nكلمة المرور: 0ff1ce!2026", cardNumber: null, cardExpiry: null, cardCvv: null, favorite: false, strength: 2, createdAt: now - 20 * 864e5, updatedAt: now - 5 * 864e5 },
  { id: 6, category: "login", title: "Netflix", username: "family@clipvault.app", password: "Nf#Watch2026", website: "https://netflix.com", notes: null, cardNumber: null, cardExpiry: null, cardCvv: null, favorite: false, strength: 2, createdAt: now - 200 * 864e5, updatedAt: now - 30 * 864e5 },
];

/* ------------------------------------------------------------------ */
/* Command routing                                                     */
/* ------------------------------------------------------------------ */

const ocrSample = {
  text: "تقرير المبيعات الربع الثالث\nإجمالي الإيرادات: 1,240,500 جنيه\nنسبة النمو: 18.4%",
  lines: [
    { index: 0, text: "تقرير المبيعات الربع الثالث" },
    { index: 1, text: "إجمالي الإيرادات: 1,240,500 جنيه" },
    { index: 2, text: "نسبة النمو: 18.4%" },
  ],
};

function delay<T>(val: T, ms = 40): Promise<T> {
  return new Promise((r) => setTimeout(() => r(val), ms));
}

const handlers: Record<string, CmdHandler> = {
  // clipboard
  get_items: (a) => {
    const q = (a?.q ?? {}) as Record<string, unknown>;
    let list = [...items];
    const filter = String(q.filter ?? "all");
    if (filter === "favorite") list = list.filter((i) => i.favorite);
    else if (filter === "pinned") list = list.filter((i) => i.pinned);
    else if (filter !== "all") list = list.filter((i) => i.kind === filter);
    const query = q.query ? String(q.query).toLowerCase() : "";
    if (query) {
      list = list.filter((i) =>
        (i.text ?? "").toLowerCase().includes(query) ||
        (i.ocrText ?? "").toLowerCase().includes(query) ||
        (i.files ?? []).some((f) => f.toLowerCase().includes(query)));
    }
    const tagId = q.tagId as number | null;
    if (tagId) list = list.filter((i) => i.tags.some((t) => t.id === tagId));
    const orderBy = q.orderBy as string | null;
    if (orderBy === "time_asc") list.reverse();
    if (orderBy === "use_count_desc") list.sort((x, y) => y.useCount - x.useCount);
    if (orderBy === "alpha_asc") list.sort((x, y) => (x.text ?? "").localeCompare(y.text ?? "", "ar"));
    if (orderBy === "length_desc") list.sort((x, y) => (y.text ?? "").length - (x.text ?? "").length);
    if (orderBy === "source_asc") list.sort((x, y) => (x.sourceApp ?? "").localeCompare(y.sourceApp ?? ""));
    const offset = Number(q.offset ?? 0);
    const limit = Number(q.limit ?? 60);
    return { items: list.slice(offset, offset + limit), total: list.length, hasMore: offset + limit < list.length };
  },
  get_item_image: (a) => {
    const it = itemsById.get(Number(a?.id));
    return delay(it?.imageData ?? svgImage("صورة", "#334155", "#0ea5e9"));
  },
  copy_item: (a) => {
    const it = itemsById.get(Number(a?.id));
    if (it?.text) navigator.clipboard?.writeText(it.text).catch(() => {});
    return true;
  },
  paste_item: () => true,
  get_sources: () => sources,
  delete_item: (a) => {
    const id = Number(a?.id);
    const idx = items.findIndex((i) => i.id === id);
    if (idx >= 0) items.splice(idx, 1);
  },
  clear_history: () => { items.length = 0; return 0; },
  set_pin: (a) => { const it = itemsById.get(Number(a?.id)); if (it) it.pinned = Boolean(a?.val); },
  set_favorite: (a) => { const it = itemsById.get(Number(a?.id)); if (it) it.favorite = Boolean(a?.val); },
  set_sensitive: (a) => { const it = itemsById.get(Number(a?.id)); if (it) it.sensitive = Boolean(a?.val); },
  edit_item_text: (a) => { const it = itemsById.get(Number(a?.id)); if (it) it.text = String(a?.text); },
  get_tags: () => tags,
  create_tag: (a) => {
    const t = { id: ++tagIdSeq, name: String(a?.name), color: String(a?.color), count: 0 };
    tags.push(t); return t;
  },
  delete_tag: (a) => { const idx = tags.findIndex((t) => t.id === Number(a?.id)); if (idx >= 0) tags.splice(idx, 1); },
  toggle_item_tag: () => true,
  get_collections: () => collections,
  create_collection: (a) => { const c = { id: ++colIdSeq, name: String(a?.name), count: 0 }; collections.push(c); return c; },
  delete_collection: (a) => { const idx = collections.findIndex((c) => c.id === Number(a?.id)); if (idx >= 0) collections.splice(idx, 1); },
  toggle_item_collection: () => true,
  get_settings: () => ({ ...settings }),
  set_settings: (a) => { Object.assign(settings, a?.settings ?? {}); },
  set_paused: (a) => { settings.paused = a?.paused ? "1" : "0"; },
  hide_window: () => {},
  open_item: () => {},
  reveal_item: () => {},
  save_image: () => null,
  get_stats: () => ({ ...stats }),
  read_file_as_data_url: () => "",
  frontend_ready: () => {},
  open_external_url: () => {},
  ocr_status: () => true,
  ocr_extract_text: () => ocrSample,
  ocr_extract_file: () => ocrSample,
  // typing
  typing_invert_layout: (a) => {
    const text = String(a?.text ?? "");
    const isArabic = /[\u0600-\u06FF]/.test(text);
    return { original: text, converted: text, sourceLang: isArabic ? "ar" : "en", targetLang: isArabic ? "en" : "ar" };
  },
  typing_fix_selected_text: () => "تم تصحيح النص",
  typing_inject_text: () => {},
  typing_get_selected_text: () => "",
  // v1.5: snip / transforms / QR (browser-simulated)
  snip_begin: () => {
    // In the browser the overlay is rendered inside the main window by App's
    // dev-mode path; the frame is fetched via snip_get_frame below.
  },
  snip_get_frame: () => ({
    dataUrl: fakeScreenshot(),
    width: 1280,
    height: 800,
    monitorX: 0,
    monitorY: 0,
  }),
  snip_commit: (a) => {
    const rect = (a?.rect ?? {}) as Record<string, number>;
    const w = Math.max(60, Math.round((rect.w ?? 320) * (rect.dpr ?? 1)));
    const h = Math.max(40, Math.round((rect.h ?? 200) * (rect.dpr ?? 1)));
    const item: MockItem = {
      id: ++itemIdSeq,
      kind: "image",
      text: null,
      html: null,
      files: null,
      image: true,
      imageData: svgImage(`${w}×${h}`, "#0f766e", "#22d3ee"),
      sourceApp: "ClipVault ✂",
      ocrText: ocrSample.text,
      pinned: false,
      favorite: false,
      sensitive: false,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 1,
      tags: [],
    };
    items.unshift(item);
    itemsById.set(item.id, item);
    return { id: item.id, hasOcrText: true, ocrText: ocrSample.text };
  },
  snip_cancel: () => {},
  snip_commit_annotated: () => {
    const item: MockItem = {
      id: ++itemIdSeq,
      kind: "image",
      text: null,
      html: null,
      files: null,
      image: true,
      imageData: svgImage("لقطة معلَّقة", "#0f766e", "#22d3ee"),
      sourceApp: "ClipVault ✂",
      ocrText: ocrSample.text,
      pinned: false,
      favorite: false,
      sensitive: false,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 1,
      tags: [],
    };
    items.unshift(item);
    itemsById.set(item.id, item);
    return { id: item.id, hasOcrText: true, ocrText: ocrSample.text };
  },
  qr_generate: (a) => qrDataUrl(String(a?.text ?? "")),
  add_text_item: (a) => {
    const text = String(a?.text ?? "").trim();
    const item: MockItem = {
      id: ++itemIdSeq,
      kind: "text",
      text,
      html: null,
      files: null,
      image: false,
      sourceApp: String(a?.source ?? "ClipVault ✦"),
      ocrText: null,
      pinned: false,
      favorite: false,
      sensitive: false,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 1,
      tags: [],
    };
    items.unshift(item);
    itemsById.set(item.id, item);
    return item;
  },
  // vault
  vault_get_status: () => ({ isSetup: true, isLocked: !vaultUnlocked, autoLockMinutes: 15, totalItems: vaultItems.length }),
  vault_setup_master: () => { vaultUnlocked = true; return { isSetup: true, isLocked: false, autoLockMinutes: 15, totalItems: vaultItems.length }; },
  vault_unlock: () => { vaultUnlocked = true; return { isSetup: true, isLocked: false, autoLockMinutes: 15, totalItems: vaultItems.length }; },
  vault_lock: () => { vaultUnlocked = false; return { isSetup: true, isLocked: true, autoLockMinutes: 15, totalItems: vaultItems.length }; },
  vault_change_pin: () => ({ isSetup: true, isLocked: false, autoLockMinutes: 15, totalItems: vaultItems.length }),
  vault_get_items: (a) => {
    let list = [...vaultItems];
    const cat = a?.category as string | null;
    if (cat && cat !== "all" && cat !== "favorite") list = list.filter((i) => i.category === cat);
    if (cat === "favorite") list = list.filter((i) => i.favorite);
    const query = a?.query ? String(a.query).toLowerCase() : "";
    if (query) {
      list = list.filter((i) =>
        i.title.toLowerCase().includes(query) ||
        (i.username ?? "").toLowerCase().includes(query) ||
        (i.website ?? "").toLowerCase().includes(query) ||
        (i.notes ?? "").toLowerCase().includes(query));
    }
    return delay(list, 120);
  },
  vault_save_item: (a) => {
    const input = a?.item as Record<string, unknown>;
    const id = input.id ? Number(input.id) : vaultItems.length + 1;
    const existing = vaultItems.findIndex((i) => i.id === id);
    const item = { strength: 70, createdAt: now, updatedAt: now, ...(input as object), id, favorite: Boolean(input.favorite) } as (typeof vaultItems)[number];
    if (existing >= 0) vaultItems[existing] = item; else vaultItems.push(item);
    return delay(item, 150);
  },
  vault_delete_item: (a) => { const idx = vaultItems.findIndex((i) => i.id === Number(a?.id)); if (idx >= 0) vaultItems.splice(idx, 1); return delay(undefined, 150); },
  vault_toggle_favorite: (a) => {
    const it = vaultItems.find((i) => i.id === Number(a?.id));
    if (it) it.favorite = !it.favorite;
    return Boolean(it?.favorite);
  },
  vault_audit: () => ({ total: vaultItems.length, weakCount: 1, reusedCount: 1, strongCount: vaultItems.length - 2, weakItemIds: [4], reusedItemIds: [6] }),
  clipboard_clear_secret: () => {},
  vault_import_csv: () => 12,
  vault_import_from_file_path: () => 12,
  vault_export_csv: () => "name,url,username,password\nGoogle,https://google.com,user,pass",
  // v1.6: maintenance / backup / updates (browser-simulated)
  count_duplicates: () => ({ groups: 3 }),
  cleanup_duplicates: () => {
    // Fold use_count of duplicate-text rows to look real in QA.
    const seen = new Set<string>();
    let removed = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const key = `${items[i].kind}:${items[i].text ?? ""}`;
      if (seen.has(key)) { items.splice(i, 1); removed++; }
      else seen.add(key);
    }
    return { groups: 0, removed };
  },
  backup_export: () => {
    const path = `C:\\Users\\Demo\\Documents\\ClipVault-Backup-mock.cvbak`;
    return { path, items: items.length, images: items.filter((i) => i.image).length, encrypted: true, sizeBytes: 482_113 };
  },
  backup_pick_file: () => "C:\\Users\\Demo\\Documents\\ClipVault-Backup-mock.cvbak",
  backup_inspect: () => ({
    encrypted: true,
    meta: { items: items.length, images: items.filter((i) => i.image).length, exportedAt: now - 3 * 864e5, appVersion: "1.5.0" },
  }),
  backup_import: (a) => {
    const mode = String(a?.mode ?? "merge");
    if (mode === "replace") { items.length = 0; itemsById.clear(); }
    return { added: 42, skipped: mode === "merge" ? 7 : 0, imagesRestored: 5, tagsAdded: 3, collectionsAdded: 1, settingsApplied: 7 };
  },
  update_check: () => null,
  update_install: () => true,
};

/* ------------------------------------------------------------------ */
/* Tauri internals shim                                                */
/* ------------------------------------------------------------------ */

let callbackId = 0;
let eventId = 0;

export function installBrowserMock(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__TAURI_INTERNALS__) return; // real Tauri shell — do nothing

  console.info(
    "%c[ClipVault] Browser preview mode%c — backend calls are served by the dev mock. Tauri-only features (auto-paste, global hotkeys) are simulated.",
    "background:#3fb6ff;color:#0b0e13;padding:2px 6px;border-radius:4px;font-weight:700",
    "color:#8a909d",
  );

  w.__TAURI_INTERNALS__ = {
    transformCallback(callback: (...args: unknown[]) => void, once?: boolean) {
      const id = ++callbackId;
      const prop = `_${id}`;
      Object.defineProperty(w, prop, {
        value: (result?: unknown) => {
          if (once) delete w[prop];
          callback(result);
        },
        writable: false,
        configurable: true,
      });
      return id;
    },
    invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
      if (cmd === "plugin:event|listen" || cmd === "plugin:event|unlisten") {
        return Promise.resolve(++eventId);
      }
      const handler = handlers[cmd];
      if (!handler) {
        console.warn(`[mock] no handler for command: ${cmd}`);
        return Promise.reject(`mock: unknown command ${cmd}`);
      }
      try {
        return Promise.resolve(handler(args));
      } catch (e) {
        return Promise.reject(e);
      }
    },
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main", windowLabel: "main" },
    },
    plugins: {},
  };

  // Marker for App's dev-only snip overlay path.
  (w as { __CV_DEV_MOCK__?: boolean }).__CV_DEV_MOCK__ = true;
}
