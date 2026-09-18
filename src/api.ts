import { invoke } from "@tauri-apps/api/core";
import type {
  CollectionWithCount,
  Item,
  ItemsPage,
  Settings,
  Stats,
  Tag,
  TagWithCount,
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
  ): Promise<ItemsPage> {
    return call<ItemsPage>("get_items", {
      q: {
        filter,
        query: query.trim() ? query.trim() : null,
        limit,
        offset,
        tagId: tagId ?? null,
        collectionId: collectionId ?? null,
      },
    });
  },

  getItemImage(id: number, thumb: boolean): Promise<string> {
    return call<string>("get_item_image", { id, thumb });
  },

  copyItem(id: number): Promise<boolean> {
    return call<boolean>("copy_item", { id });
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
};

