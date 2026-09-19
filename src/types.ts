export type ItemKind = "text" | "link" | "image" | "files";

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Item {
  id: number;
  kind: ItemKind;
  text: string | null;
  html: string | null;
  files: string[] | null;
  image: boolean;
  sourceApp: string | null;
  ocrText?: string | null;
  pinned: boolean;
  favorite: boolean;
  sensitive: boolean;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  tags: Tag[];
}

export interface ItemsPage {
  items: Item[];
  total: number;
  hasMore: boolean;
}

export type SortOption =
  | "time_desc"
  | "time_asc"
  | "use_count_desc"
  | "source_asc"
  | "length_desc"
  | "alpha_asc";

export interface SourceAppStat {
  name: string;
  count: number;
}

export interface ItemsQueryArgs {
  filter: string;
  query?: string;
  limit: number;
  offset: number;
  tagId?: number | null;
  collectionId?: number | null;
  orderBy?: SortOption | null;
  sourceApp?: string | null;
}

export interface TagWithCount {
  id: number;
  name: string;
  color: string;
  count: number;
}

export interface CollectionWithCount {
  id: number;
  name: string;
  count: number;
}

export interface Settings {
  theme: string;
  globalShortcut: string;
  retentionDays: string;
  maxItems: string;
  excludedApps: string;
  autoMask: string;
  firstRun: string;
  autostart: string;
  paused: string;
}

export type Filter =
  | "all"
  | "text"
  | "link"
  | "image"
  | "files"
  | "favorite"
  | "pinned";

export interface Stats {
  total: number;
  pinned: number;
  favorites: number;
  texts: number;
  images: number;
  links: number;
  files: number;
}

export type VaultCategory = "login" | "card" | "note";

export interface VaultItem {
  id: number;
  category: VaultCategory;
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
}

export interface VaultItemInput {
  id?: number | null;
  category: VaultCategory;
  title: string;
  username?: string | null;
  password?: string | null;
  website?: string | null;
  notes?: string | null;
  cardNumber?: string | null;
  cardExpiry?: string | null;
  cardCvv?: string | null;
  favorite?: boolean;
}

export interface VaultStatus {
  isSetup: boolean;
  isLocked: boolean;
  autoLockMinutes: number;
  totalItems: number;
}

export interface VaultAuditReport {
  total: number;
  weakCount: number;
  reusedCount: number;
  strongCount: number;
  weakItemIds: number[];
  reusedItemIds: number[];
}

export interface PasswordGeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export interface OcrLine {
  index: number;
  text: string;
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
}

// ---- v1.5: screenshot snip ----------------------------------------------------

/** Frozen monitor frame shown behind the region-selection overlay. */
export interface SnipFrame {
  /** PNG data URL of the full monitor capture */
  dataUrl: string;
  /** Physical pixel size of the captured buffer */
  width: number;
  height: number;
  /** Monitor origin in virtual-screen physical coordinates */
  monitorX: number;
  monitorY: number;
}

/** Region selected by the user, in CSS pixels relative to the snip window. */
export interface SnipRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** window.devicePixelRatio of the snip window (maps CSS px → physical px) */
  dpr: number;
}

export interface SnipCommitResult {
  id: number;
  hasOcrText: boolean;
  ocrText: string | null;
}

export interface Settings {
  theme: string;
  globalShortcut: string;
  retentionDays: string;
  maxItems: string;
  excludedApps: string;
  autoMask: string;
  firstRun: string;
  autostart: string;
  paused: string;
  /** v1.5 — UI language: "ar" (default) | "en" */
  lang?: string;
}


