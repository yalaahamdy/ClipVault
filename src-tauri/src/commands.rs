//! All Tauri commands exposed to the frontend.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::clipboard_io::{self, WriteContent};
use crate::models::{now_ms, CollectionDto, ItemsPage, ItemsQuery, Stats, TagDto};

// ---------------------------------------------------------------- helpers

/// Serialize-able tag with usage count.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagWithCount {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionWithCount {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

pub fn cleanup_images(dir: &PathBuf, id: i64) {
    let _ = std::fs::remove_file(dir.join(format!("{id}.png")));
    let _ = std::fs::remove_file(dir.join(format!("{id}_t.png")));
}

/// Run retention pruning using current settings, notify UI if something went away.
pub fn prune_now(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    let (days, max) = {
        let db = state.lock_db();
        let days = db
            .get_setting("retentionDays")
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(30);
        let max = db
            .get_setting("maxItems")
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(5000);
        (days, max)
    };
    let deleted = state.lock_db().prune(days, max)?;
    if !deleted.is_empty() {
        for id in &deleted {
            cleanup_images(&state.images_dir, *id);
        }
        let _ = app.emit("clipvault:items-changed", ());
    }
    Ok(())
}

pub fn set_paused_internal(app: &AppHandle, paused: bool) {
    let state = app.state::<crate::AppState>();
    state.paused.store(paused, Ordering::SeqCst);
    {
        let db = state.lock_db();
        let _ = db.set_setting("paused", if paused { "1" } else { "0" });
    }
    if let Some(item) = state
        .tray_pause_item
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
    {
        let _ = item.set_text(if paused {
            "استئناف التسجيل"
        } else {
            "إيقاف التسجيل مؤقتًا"
        });
    }
    let _ = app.emit("clipvault:paused-changed", paused);
}

pub fn toggle_pause(app: &AppHandle) {
    let state = app.state::<crate::AppState>();
    let now = !state.paused.load(Ordering::SeqCst);
    set_paused_internal(app, now);
}

pub fn toggle_autostart(app: &AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let auto = app.autolaunch();
    let new_val = match auto.is_enabled() {
        Ok(true) => {
            let _ = auto.disable();
            false
        }
        _ => {
            let _ = auto.enable();
            true
        }
    };
    if let Some(state) = app.try_state::<crate::AppState>() {
        if let Some(item) = state
            .tray_autostart_item
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
        {
            let _ = item.set_checked(new_val);
        }
    }
}

// ---------------------------------------------------------------- items

#[tauri::command]
pub fn get_items(state: State<crate::AppState>, q: ItemsQuery) -> Result<ItemsPage, String> {
    state.lock_db().query_items(&q)
}

#[tauri::command]
pub fn get_item_image(state: State<crate::AppState>, id: i64, thumb: bool) -> Result<String, String> {
    let name = if thumb {
        format!("{id}_t.png")
    } else {
        format!("{id}.png")
    };
    let bytes = std::fs::read(state.images_dir.join(name)).map_err(|_| "NOT_FOUND".to_string())?;
    use base64::Engine;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub fn copy_item(state: State<crate::AppState>, id: i64) -> Result<bool, String> {
    let item = state
        .lock_db()
        .get_item(id)?
        .ok_or("العنصر غير موجود")?;
    let png = if item.image {
        Some(
            std::fs::read(state.images_dir.join(format!("{id}.png")))
                .map_err(|e| e.to_string())?,
        )
    } else {
        None
    };
    let content = WriteContent {
        kind: &item.kind,
        text: item.text.as_deref(),
        html: item.html.as_deref(),
        files: item.files.as_deref(),
        png,
    };
    clipboard_io::write_to_clipboard(&content)?;
    let _ = state.lock_db().touch_item(id, now_ms());
    Ok(true)
}

#[tauri::command]
pub fn delete_item(state: State<crate::AppState>, id: i64) -> Result<(), String> {
    state.lock_db().delete_item(id)?;
    cleanup_images(&state.images_dir, id);
    Ok(())
}

#[tauri::command]
pub fn clear_history(app: AppHandle, state: State<crate::AppState>) -> Result<usize, String> {
    let ids = state.lock_db().clear_history()?;
    for id in &ids {
        cleanup_images(&state.images_dir, *id);
    }
    let _ = app.emit("clipvault:items-changed", ());
    Ok(ids.len())
}

#[tauri::command]
pub fn set_pin(state: State<crate::AppState>, id: i64, val: bool) -> Result<(), String> {
    state.lock_db().set_flag(id, "pinned", val)
}

#[tauri::command]
pub fn set_favorite(state: State<crate::AppState>, id: i64, val: bool) -> Result<(), String> {
    state.lock_db().set_flag(id, "favorite", val)
}

#[tauri::command]
pub fn set_sensitive(state: State<crate::AppState>, id: i64, val: bool) -> Result<(), String> {
    state.lock_db().set_flag(id, "sensitive", val)
}

#[tauri::command]
pub fn edit_item_text(state: State<crate::AppState>, id: i64, text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("لا يمكن حفظ نص فارغ".into());
    }
    state.lock_db().edit_text(id, &text)
}

// ---------------------------------------------------------------- tags & collections

#[tauri::command]
pub fn get_tags(state: State<crate::AppState>) -> Result<Vec<TagWithCount>, String> {
    let rows = state.lock_db().list_tags()?;
    Ok(rows
        .into_iter()
        .map(|(t, c)| TagWithCount {
            id: t.id,
            name: t.name,
            color: t.color,
            count: c,
        })
        .collect())
}

#[tauri::command]
pub fn create_tag(state: State<crate::AppState>, name: String, color: String) -> Result<TagDto, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("اسم الوسم فارغ".into());
    }
    if name.chars().count() > 32 {
        return Err("اسم الوسم طويل جدًا".into());
    }
    state.lock_db().create_tag(&name, &color)
}

#[tauri::command]
pub fn delete_tag(state: State<crate::AppState>, id: i64) -> Result<(), String> {
    state.lock_db().delete_tag(id)
}

#[tauri::command]
pub fn toggle_item_tag(
    state: State<crate::AppState>,
    item_id: i64,
    tag_id: i64,
) -> Result<bool, String> {
    state.lock_db().toggle_item_tag(item_id, tag_id)
}

#[tauri::command]
pub fn get_collections(state: State<crate::AppState>) -> Result<Vec<CollectionWithCount>, String> {
    let rows = state.lock_db().list_collections()?;
    Ok(rows
        .into_iter()
        .map(|(c, n)| CollectionWithCount {
            id: c.id,
            name: c.name,
            count: n,
        })
        .collect())
}

#[tauri::command]
pub fn create_collection(state: State<crate::AppState>, name: String) -> Result<CollectionDto, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("اسم المجموعة فارغ".into());
    }
    if name.chars().count() > 48 {
        return Err("اسم المجموعة طويل جدًا".into());
    }
    state.lock_db().create_collection(&name)
}

#[tauri::command]
pub fn delete_collection(state: State<crate::AppState>, id: i64) -> Result<(), String> {
    state.lock_db().delete_collection(id)
}

#[tauri::command]
pub fn toggle_item_collection(
    state: State<crate::AppState>,
    item_id: i64,
    collection_id: i64,
) -> Result<bool, String> {
    state.lock_db().toggle_item_collection(item_id, collection_id)
}

// ---------------------------------------------------------------- settings

#[tauri::command]
pub fn get_settings(app: AppHandle, state: State<crate::AppState>) -> Result<HashMap<String, String>, String> {
    use tauri_plugin_autostart::ManagerExt;
    let db = state.lock_db();
    let mut map = HashMap::new();
    for key in [
        "theme",
        "globalShortcut",
        "retentionDays",
        "maxItems",
        "excludedApps",
        "autoMask",
        "firstRun",
        "paused",
    ] {
        map.insert(key.to_string(), db.get_setting(key).unwrap_or_default());
    }
    let auto = app.autolaunch().is_enabled().unwrap_or(false);
    map.insert("autostart".into(), if auto { "1" } else { "0" }.into());
    Ok(map)
}

#[tauri::command]
pub fn set_settings(
    app: AppHandle,
    state: State<crate::AppState>,
    settings: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    for (key, value) in &settings {
        let sval = match value {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        {
            let db = state.lock_db();
            db.set_setting(key, &sval)?;
        }
        match key.as_str() {
            "globalShortcut" => {
                crate::register_shortcut(&app, &sval).map_err(|e| {
                    // Roll back to the default so a bad shortcut never breaks the app
                    let _ = crate::register_shortcut(&app, "Ctrl+Shift+V");
                    e
                })?;
            }
            "autostart" => {
                use tauri_plugin_autostart::ManagerExt;
                let auto = app.autolaunch();
                if sval == "1" {
                    auto.enable().map_err(|e| e.to_string())?;
                } else {
                    auto.disable().map_err(|e| e.to_string())?;
                }
            }
            "retentionDays" | "maxItems" => {
                prune_now(&app)?;
            }
            _ => {}
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_paused(app: AppHandle, paused: bool) -> Result<(), String> {
    set_paused_internal(&app, paused);
    Ok(())
}

// ---------------------------------------------------------------- window

#[tauri::command]
pub fn toggle_window(app: AppHandle) -> Result<(), String> {
    crate::show_popup(&app);
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    Ok(())
}

/// Called by the frontend once the UI finished loading (first-run reveal).
#[tauri::command]
pub fn frontend_ready(app: AppHandle, state: State<crate::AppState>) -> Result<(), String> {
    let first = {
        let db = state.lock_db();
        db.get_setting("firstRun")
    };
    if first.as_deref() == Some("1") {
        state.lock_db().set_setting("firstRun", "0")?;
        crate::show_popup(&app);
    }
    Ok(())
}

// ---------------------------------------------------------------- open / save

#[tauri::command]
pub fn open_item(app: AppHandle, state: State<crate::AppState>, id: i64) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let item = state
        .lock_db()
        .get_item(id)?
        .ok_or("العنصر غير موجود")?;
    let opener = app.opener();
    match item.kind.as_str() {
        "link" => {
            let url = item.text.unwrap_or_default();
            opener.open_url(url, None::<&str>).map_err(|e| e.to_string())?;
        }
        "files" => {
            if let Some(first) = item.files.and_then(|f| f.into_iter().next()) {
                opener.open_path(first, None::<&str>).map_err(|e| e.to_string())?;
            }
        }
        "text" => {
            let t = item.text.unwrap_or_default();
            let p = PathBuf::from(t.trim());
            if p.exists() {
                opener.open_path(p.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub fn reveal_item(app: AppHandle, state: State<crate::AppState>, id: i64) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let item = state
        .lock_db()
        .get_item(id)?
        .ok_or("العنصر غير موجود")?;
    let opener = app.opener();
    let target: Option<PathBuf> = match item.kind.as_str() {
        "files" => item.files.and_then(|f| f.into_iter().next()).map(PathBuf::from),
        "image" => Some(state.images_dir.join(format!("{id}.png"))),
        "text" => {
            let t = item.text.unwrap_or_default();
            let p = PathBuf::from(t.trim());
            if p.exists() {
                Some(p)
            } else {
                None
            }
        }
        _ => None,
    };
    if let Some(t) = target {
        if t.exists() {
            opener.reveal_item_in_dir(&t).map_err(|e| e.to_string())?;
            return Ok(());
        }
        return Err("المسار لم يعد موجودًا على القرص".into());
    }
    Err("لا يوجد مسار لعرضه".into())
}

#[tauri::command]
pub fn save_image(app: AppHandle, state: State<crate::AppState>, id: i64) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let src = state.images_dir.join(format!("{id}.png"));
    if !src.exists() {
        return Err("الصورة غير موجودة".into());
    }
    state.dialog_open.store(true, Ordering::SeqCst);
    let picked = app
        .dialog()
        .file()
        .set_file_name(format!("clipvault-{id}.png").as_str())
        .add_filter("صورة PNG", &["png"])
        .blocking_save_file();
    state.dialog_open.store(false, Ordering::SeqCst);
    match picked {
        Some(fp) => {
            let dest: PathBuf = fp.into_path().map_err(|e| e.to_string())?;
            std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
            Ok(Some(dest.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

// ---------------------------------------------------------------- stats

#[tauri::command]
pub fn get_stats(state: State<crate::AppState>) -> Result<Stats, String> {
    state.lock_db().stats()
}

#[tauri::command]
pub fn read_file_as_data_url(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.exists() || !p.is_file() {
        return Err("الملف غير موجود".into());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => return Err("صيغة الملف غير مدعومة كصورة".into()),
    };
    let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

