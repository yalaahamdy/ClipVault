import { invoke } from "@tauri-apps/api/core";
import type {
  CollectionWithCount,
  Item,
  ItemsPage,
  OcrResult,
  Settings,
  SortOption,
  SourceAppStat,
  Stats,
  Tag,
  TagWithCount,
  VaultAuditReport,
  VaultCategory,
  VaultItem,
  VaultItemInput,
  VaultStatus,
} from "./types";

export const PAGE_SIZE = 60;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(cmd, args);
}

export const api = {
  getItems(
    filter: string,
    query: string,
    limit: number,
    offset: number,
    tagId?: number | null,
    collectionId?: number | null,
    orderBy?: SortOption | null,
    sourceApp?: string | null,
  ): Promise<ItemsPage> {
    return call<ItemsPage>("get_items", {
      q: {
        filter,
        query: query.trim() ? query.trim() : null,
        limit,
        offset,
        tagId: tagId ?? null,
        collectionId: collectionId ?? null,
        orderBy: orderBy ?? null,
        sourceApp: sourceApp ?? null,
      },
    });
  },

  getItemImage(id: number, thumb: boolean): Promise<string> {
    return call<string>("get_item_image", { id, thumb });
  },

  copyItem(id: number): Promise<boolean> {
    return call<boolean>("copy_item", { id });
  },

  pasteItem(id: number): Promise<boolean> {
    return call<boolean>("paste_item", { id });
  },

  getSources(): Promise<SourceAppStat[]> {
    return call<SourceAppStat[]>("get_sources");
  },

  deleteItem(id: number): Promise<void> {
    return call<void>("delete_item", { id });
  },

  clearHistory(): Promise<number> {
    return call<number>("clear_history");
  },

  setPin(id: number, val: boolean): Promise<void> {
    return call<void>("set_pin", { id, val });
  },

  setFavorite(id: number, val: boolean): Promise<void> {
    return call<void>("set_favorite", { id, val });
  },

  setSensitive(id: number, val: boolean): Promise<void> {
    return call<void>("set_sensitive", { id, val });
  },

  editItemText(id: number, text: string): Promise<void> {
    return call<void>("edit_item_text", { id, text });
  },

  getTags(): Promise<TagWithCount[]> {
    return call<TagWithCount[]>("get_tags");
  },

  createTag(name: string, color: string): Promise<Tag> {
    return call<Tag>("create_tag", { name, color });
  },

  deleteTag(id: number): Promise<void> {
    return call<void>("delete_tag", { id });
  },

  toggleItemTag(itemId: number, tagId: number): Promise<boolean> {
    return call<boolean>("toggle_item_tag", { itemId, tagId });
  },

  getCollections(): Promise<CollectionWithCount[]> {
    return call<CollectionWithCount[]>("get_collections");
  },

  createCollection(name: string): Promise<{ id: number; name: string }> {
    return call<{ id: number; name: string }>("create_collection", { name });
  },

  deleteCollection(id: number): Promise<void> {
    return call<void>("delete_collection", { id });
  },

  toggleItemCollection(itemId: number, collectionId: number): Promise<boolean> {
    return call<boolean>("toggle_item_collection", { itemId, collectionId });
  },

  getSettings(): Promise<Settings> {
    return call<Settings>("get_settings");
  },

  setSettings(settings: Record<string, string>): Promise<void> {
    return call<void>("set_settings", {
      settings: settings as unknown as Record<string, unknown>,
    });
  },

  setPaused(paused: boolean): Promise<void> {
    return call<void>("set_paused", { paused });
  },

  hideWindow(): Promise<void> {
    return call<void>("hide_window");
  },

  openItem(id: number): Promise<void> {
    return call<void>("open_item", { id });
  },

  revealItem(id: number): Promise<void> {
    return call<void>("reveal_item", { id });
  },

  saveImage(id: number): Promise<string | null> {
    return call<string | null>("save_image", { id });
  },

  getStats(): Promise<Stats> {
    return call<Stats>("get_stats");
  },

  readFileDataUrl(path: string): Promise<string> {
    return call<string>("read_file_as_data_url", { path });
  },

  frontendReady(): Promise<void> {
    return call<void>("frontend_ready");
  },

  openExternalUrl(url: string): Promise<void> {
    return call<void>("open_external_url", { url });
  },

  extractOcr(itemId: number, force = false): Promise<OcrResult> {
    return call<OcrResult>("ocr_extract_text", { id: itemId, force });
  },

  getOcrStatus(): Promise<boolean> {
    return call<boolean>("ocr_status");
  },

  extractOcrFile(path: string): Promise<OcrResult> {
    return call<OcrResult>("ocr_extract_file", { path });
  },
};

export const vaultApi = {
  getStatus(): Promise<VaultStatus> {
    return call<VaultStatus>("vault_get_status");
  },

  setupMaster(pin: string): Promise<VaultStatus> {
    return call<VaultStatus>("vault_setup_master", { pin });
  },

  unlock(pin: string): Promise<VaultStatus> {
    return call<VaultStatus>("vault_unlock", { pin });
  },

  lock(): Promise<VaultStatus> {
    return call<VaultStatus>("vault_lock");
  },

  changePin(oldPin: string, newPin: string): Promise<VaultStatus> {
    return call<VaultStatus>("vault_change_pin", { oldPin, newPin });
  },

  getItems(category?: VaultCategory | "all" | "favorite", query?: string): Promise<VaultItem[]> {
    return call<VaultItem[]>("vault_get_items", { category: category ?? null, query: query ?? null });
  },

  saveItem(item: VaultItemInput): Promise<VaultItem> {
    return call<VaultItem>("vault_save_item", { item });
  },

  deleteItem(id: number): Promise<void> {
    return call<void>("vault_delete_item", { id });
  },

  toggleFavorite(id: number): Promise<boolean> {
    return call<boolean>("vault_toggle_favorite", { id });
  },

  audit(): Promise<VaultAuditReport> {
    return call<VaultAuditReport>("vault_audit");
  },

  clearSecretFromClipboard(expectedText: string): Promise<void> {
    return call<void>("clipboard_clear_secret", { expectedText });
  },

  importCsv(csvContent: string): Promise<number> {
    return call<number>("vault_import_csv", { csvContent });
  },

  importFromFile(path: string): Promise<number> {
    return call<number>("vault_import_from_file_path", { path });
  },

  exportCsv(): Promise<string> {
    return call<string>("vault_export_csv");
  },
};

export const typingApi = {
  invertLayout(text: string): Promise<{ original: string; converted: string; sourceLang: string; targetLang: string }> {
    return call("typing_invert_layout", { text });
  },

  fixSelectedText(): Promise<string> {
    return call<string>("typing_fix_selected_text");
  },

  injectText(text: string): Promise<void> {
    return call<void>("typing_inject_text", { text });
  },

  getSelectedText(): Promise<string> {
    return call<string>("typing_get_selected_text");
  },
};
