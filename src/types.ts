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
