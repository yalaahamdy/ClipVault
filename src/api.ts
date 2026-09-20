import { invoke } from "@tauri-apps/api/core";
import type {
  BackupExportResult,
  BackupImportResult,
  BackupInfo,
  CleanupReport,
  CollectionWithCount,
  DuplicateStats,
  Item,
  ItemsPage,
  OcrResult,
  Settings,
  SnipCommitResult,
  SnipFrame,
  SnipRect,
  SortOption,
  SourceAppStat,
  Stats,
  Tag,
  TagWithCount,
  UpdateInfo,
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

  // ---- v1.5: screenshot → OCR -------------------------------------------------

  /** Capture the monitor under the cursor and open the region-selection overlay. */
  snipBegin(): Promise<void> {
    return call<void>("snip_begin");
  },

  /** Frozen frame shown as the overlay background. */
  snipGetFrame(): Promise<SnipFrame> {
    return call<SnipFrame>("snip_get_frame");
  },

  /** Crop the frozen frame (CSS px + device pixel ratio), store it, run OCR, copy it. */
  snipCommit(rect: SnipRect): Promise<SnipCommitResult> {
    return call<SnipCommitResult>("snip_commit", { rect });
  },

  /** Cancel the pending snip session. */
  snipCancel(): Promise<void> {
    return call<void>("snip_cancel");
  },

  // ---- v1.5: transforms / QR / merge ------------------------------------------

  /** Generate a QR code PNG data URL for the given text. */
  qrGenerate(text: string): Promise<string> {
    return call<string>("qr_generate", { text });
  },

  /** Store a new text item (transform result / merged text) and copy it to the clipboard. */
  addTextItem(text: string, source?: string): Promise<Item> {
    return call<Item>("add_text_item", { text, source: source ?? null });
  },

  // ---- v1.6: maintenance / backup / updates ----------------------------------

  /** Store an ANNOTATED snip crop (PNG data URL produced by SnipAnnotator). */
  snipCommitAnnotated(dataUrl: string): Promise<SnipCommitResult> {
    return call<SnipCommitResult>("snip_commit_annotated", { dataUrl });
  },

  /** Number of duplicate-content groups (historical duplicates). */
  countDuplicates(): Promise<DuplicateStats> {
    return call<DuplicateStats>("count_duplicates");
  },

  /** Merge historical duplicate rows. Returns the cleanup report. */
  cleanupDuplicates(): Promise<CleanupReport> {
    return call<CleanupReport>("cleanup_duplicates");
  },

  /** Export a full backup (.cvbak), optionally encrypted. Opens a save dialog. */
  backupExport(includeImages: boolean, password?: string): Promise<BackupExportResult> {
    return call<BackupExportResult>("backup_export", {
      includeImages,
      password: password?.trim() ? password.trim() : null,
    });
  },

  /** Open the native file picker and return the chosen backup path (or null). */
  backupPickFile(): Promise<string | null> {
    return call<string | null>("backup_pick_file");
  },

  /** Read a backup envelope header (no decryption needed). */
  backupInspect(path: string): Promise<BackupInfo> {
    return call<BackupInfo>("backup_inspect", { path });
  },

  /** Import a backup (mode: "merge" | "replace"). */
  backupImport(path: string, password: string | null, mode: "merge" | "replace"): Promise<BackupImportResult> {
    return call<BackupImportResult>("backup_import", { path, password, mode });
  },

  /** Check GitHub releases for a newer version (null = up to date). */
  updateCheck(): Promise<UpdateInfo | null> {
    return call<UpdateInfo | null>("update_check");
  },

  /** Download + install the pending update, then relaunch. */
  updateInstall(): Promise<boolean> {
    return call<boolean>("update_install");
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
