//! All Tauri commands exposed to the frontend.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::clipboard_io::{self, WriteContent};
use crate::db::RawVaultRow;
use crate::models::{
    now_ms, CollectionDto, ItemsPage, ItemsQuery, SourceAppStat, Stats, TagDto, VaultAuditReport,
    VaultItem, VaultItemInput, VaultStatus,
};
use crate::vault;

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
pub fn paste_item(app: AppHandle, state: State<crate::AppState>, id: i64) -> Result<bool, String> {
    copy_item(state.clone(), id)?;
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    std::thread::spawn(|| {
        clipboard_io::simulate_paste();
    });
    Ok(true)
}

#[tauri::command]
pub fn get_sources(state: State<crate::AppState>) -> Result<Vec<SourceAppStat>, String> {
    state.lock_db().get_source_apps()
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
        "lang",
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

// ---------------------------------------------------------------- password vault

#[tauri::command]
pub fn vault_get_status(state: State<crate::AppState>) -> Result<VaultStatus, String> {
    let db = state.lock_db();
    let is_setup = db.vault_is_setup();
    let is_locked = state.vault_key.lock().unwrap().is_none();
    let sec = db.vault_get_security()?;
    let auto_lock_minutes = sec.map(|(_, _, m)| m).unwrap_or(15);
    let total_items = db.vault_count_items().unwrap_or(0);
    Ok(VaultStatus {
        is_setup,
        is_locked,
        auto_lock_minutes,
        total_items,
    })
}

#[tauri::command]
pub fn vault_setup_master(pin: String, state: State<crate::AppState>) -> Result<VaultStatus, String> {
    let clean_pin = pin.trim();
    if clean_pin.len() < 4 {
        return Err("يجب أن يتكون رمز المرور من 4 خانات على الأقل".into());
    }
    let salt = vault::generate_salt();
    let key = vault::derive_key(clean_pin, salt.as_bytes());

    use base64::Engine;
    use sha2::{Digest, Sha256};
    let pin_hash = base64::engine::general_purpose::STANDARD.encode(Sha256::digest(&key));

    state.lock_db().vault_setup(&pin_hash, &salt)?;
    *state.vault_key.lock().unwrap() = Some(key);

    vault_get_status(state)
}

#[tauri::command]
pub fn vault_unlock(pin: String, state: State<crate::AppState>) -> Result<VaultStatus, String> {
    let sec = state
        .lock_db()
        .vault_get_security()?
        .ok_or_else(|| "لم يتم إعداد رمز المرور للقبو بعد".to_string())?;
    let (pin_hash, pin_salt, _) = sec;
    let clean_pin = pin.trim();
    let key = vault::derive_key(clean_pin, pin_salt.as_bytes());

    use base64::Engine;
    use sha2::{Digest, Sha256};
    let test_hash = base64::engine::general_purpose::STANDARD.encode(Sha256::digest(&key));

    if test_hash != pin_hash {
        return Err("رمز الدخول غير صحيح — حاول مرة أخرى".into());
    }

    *state.vault_key.lock().unwrap() = Some(key);
    vault_get_status(state)
}

#[tauri::command]
pub fn vault_lock(state: State<crate::AppState>) -> Result<VaultStatus, String> {
    *state.vault_key.lock().unwrap() = None;
    vault_get_status(state)
}

#[tauri::command]
pub fn vault_change_pin(
    old_pin: String,
    new_pin: String,
    state: State<crate::AppState>,
) -> Result<VaultStatus, String> {
    let new_clean = new_pin.trim();
    if new_clean.len() < 4 {
        return Err("يجب ألا يقل الرمز الجديد عن 4 خانات".into());
    }

    // Verify old pin
    let sec = state
        .lock_db()
        .vault_get_security()?
        .ok_or_else(|| "لم يتم إعداد رمز المرور للقبو بعد".to_string())?;
    let (old_hash, old_salt, _) = sec;
    let old_key = vault::derive_key(old_pin.trim(), old_salt.as_bytes());

    use base64::Engine;
    use sha2::{Digest, Sha256};
    let check_hash = base64::engine::general_purpose::STANDARD.encode(Sha256::digest(&old_key));
    if check_hash != old_hash {
        return Err("رمز المرور الحالي غير صحيح".into());
    }

    // Read and decrypt all rows with old key
    let raw_items = state.lock_db().vault_get_all_raw()?;
    let new_salt = vault::generate_salt();
    let new_key = vault::derive_key(new_clean, new_salt.as_bytes());
    let new_hash = base64::engine::general_purpose::STANDARD.encode(Sha256::digest(&new_key));

    // Re-encrypt each item
    for item in raw_items {
        let dec_pwd = item
            .password_enc
            .as_deref()
            .and_then(|p| vault::decrypt(p, &old_key).ok());
        let dec_notes = item
            .notes_enc
            .as_deref()
            .and_then(|n| vault::decrypt(n, &old_key).ok());
        let dec_card = item
            .card_number_enc
            .as_deref()
            .and_then(|c| vault::decrypt(c, &old_key).ok());
        let dec_cvv = item
            .card_cvv_enc
            .as_deref()
            .and_then(|c| vault::decrypt(c, &old_key).ok());

        let new_pwd_enc = dec_pwd
            .as_deref()
            .map(|p| vault::encrypt(p, &new_key))
            .transpose()?;
        let new_notes_enc = dec_notes
            .as_deref()
            .map(|n| vault::encrypt(n, &new_key))
            .transpose()?;
        let new_card_enc = dec_card
            .as_deref()
            .map(|c| vault::encrypt(c, &new_key))
            .transpose()?;
        let new_cvv_enc = dec_cvv
            .as_deref()
            .map(|c| vault::encrypt(c, &new_key))
            .transpose()?;

        let updated_row = RawVaultRow {
            password_enc: new_pwd_enc,
            notes_enc: new_notes_enc,
            card_number_enc: new_card_enc,
            card_cvv_enc: new_cvv_enc,
            ..item
        };
        state.lock_db().vault_update_item(&updated_row)?;
    }

    // Save new pin settings
    state.lock_db().vault_setup(&new_hash, &new_salt)?;
    *state.vault_key.lock().unwrap() = Some(new_key);

    vault_get_status(state)
}

#[tauri::command]
pub fn vault_get_items(
    category: Option<String>,
    query: Option<String>,
    state: State<crate::AppState>,
) -> Result<Vec<VaultItem>, String> {
    let key_guard = state.vault_key.lock().unwrap();
    let key = key_guard
        .as_ref()
        .ok_or_else(|| "القبو مقفل — يرجى إدخال رمز المرور أولاً".to_string())?;

    let raw_rows = state.lock_db().vault_get_all_raw()?;
    let query_lower = query.as_deref().map(|q| q.to_lowercase());
    let filter_cat = category.as_deref().filter(|c| *c != "all" && *c != "favorite");

    let mut items = Vec::new();

    for row in raw_rows {
        // Category filtering
        if let Some(cat) = filter_cat {
            if row.category != cat {
                continue;
            }
        } else if category.as_deref() == Some("favorite") && !row.favorite {
            continue;
        }

        // Decrypt fields
        let password = row
            .password_enc
            .as_deref()
            .and_then(|p| vault::decrypt(p, key).ok());
        let notes = row
            .notes_enc
            .as_deref()
            .and_then(|n| vault::decrypt(n, key).ok());
        let card_number = row
            .card_number_enc
            .as_deref()
            .and_then(|c| vault::decrypt(c, key).ok());
        let card_cvv = row
            .card_cvv_enc
            .as_deref()
            .and_then(|c| vault::decrypt(c, key).ok());

        // Text query search
        if let Some(ref q) = query_lower {
            let mut matches = row.title.to_lowercase().contains(q);
            if let Some(ref u) = row.username {
                matches = matches || u.to_lowercase().contains(q);
            }
            if let Some(ref w) = row.website {
                matches = matches || w.to_lowercase().contains(q);
            }
            if let Some(ref n) = notes {
                matches = matches || n.to_lowercase().contains(q);
            }
            if !matches {
                continue;
            }
        }

        let strength = password
            .as_deref()
            .map(vault::evaluate_password_strength)
            .unwrap_or(0);

        items.push(VaultItem {
            id: row.id,
            category: row.category,
            title: row.title,
            username: row.username,
            password,
            website: row.website,
            notes,
            card_number,
            card_expiry: row.card_expiry,
            card_cvv,
            favorite: row.favorite,
            strength,
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }

    Ok(items)
}

#[tauri::command]
pub fn vault_save_item(
    item: VaultItemInput,
    state: State<crate::AppState>,
) -> Result<VaultItem, String> {
    let key_guard = state.vault_key.lock().unwrap();
    let key = key_guard
        .as_ref()
        .ok_or_else(|| "القبو مقفل — يرجى إدخال رمز المرور أولاً".to_string())?;

    let now = now_ms();
    let password_enc = item
        .password
        .as_deref()
        .map(|p| vault::encrypt(p, key))
        .transpose()?;
    let notes_enc = item
        .notes
        .as_deref()
        .map(|n| vault::encrypt(n, key))
        .transpose()?;
    let card_number_enc = item
        .card_number
        .as_deref()
        .map(|c| vault::encrypt(c, key))
        .transpose()?;
    let card_cvv_enc = item
        .card_cvv
        .as_deref()
        .map(|c| vault::encrypt(c, key))
        .transpose()?;

    let strength = item
        .password
        .as_deref()
        .map(vault::evaluate_password_strength)
        .unwrap_or(0);

    let id = if let Some(item_id) = item.id {
        let raw = RawVaultRow {
            id: item_id,
            category: item.category.clone(),
            title: item.title.clone(),
            username: item.username.clone(),
            password_enc,
            website: item.website.clone(),
            notes_enc,
            card_number_enc,
            card_expiry: item.card_expiry.clone(),
            card_cvv_enc,
            favorite: item.favorite.unwrap_or(false),
            created_at: now,
            updated_at: now,
        };
        state.lock_db().vault_update_item(&raw)?;
        item_id
    } else {
        let raw = RawVaultRow {
            id: 0,
            category: item.category.clone(),
            title: item.title.clone(),
            username: item.username.clone(),
            password_enc,
            website: item.website.clone(),
            notes_enc,
            card_number_enc,
            card_expiry: item.card_expiry.clone(),
            card_cvv_enc,
            favorite: item.favorite.unwrap_or(false),
            created_at: now,
            updated_at: now,
        };
        state.lock_db().vault_insert_item(&raw)?
    };

    Ok(VaultItem {
        id,
        category: item.category,
        title: item.title,
        username: item.username,
        password: item.password,
        website: item.website,
        notes: item.notes,
        card_number: item.card_number,
        card_expiry: item.card_expiry,
        card_cvv: item.card_cvv,
        favorite: item.favorite.unwrap_or(false),
        strength,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub fn vault_delete_item(id: i64, state: State<crate::AppState>) -> Result<(), String> {
    let key_guard = state.vault_key.lock().unwrap();
    if key_guard.is_none() {
        return Err("القبو مقفل".into());
    }
    state.lock_db().vault_delete_item(id)
}

#[tauri::command]
pub fn vault_toggle_favorite(id: i64, state: State<crate::AppState>) -> Result<bool, String> {
    let key_guard = state.vault_key.lock().unwrap();
    if key_guard.is_none() {
        return Err("القبو مقفل".into());
    }
    state.lock_db().vault_toggle_favorite(id)
}

#[tauri::command]
pub fn vault_audit(state: State<crate::AppState>) -> Result<VaultAuditReport, String> {
    let key_guard = state.vault_key.lock().unwrap();
    let key = key_guard
        .as_ref()
        .ok_or_else(|| "القبو مقفل — يرجى إدخال رمز المرور أولاً".to_string())?;

    let raw_rows = state.lock_db().vault_get_all_raw()?;
    let mut weak_ids = Vec::new();
    let mut reused_ids = Vec::new();
    let mut pass_map: HashMap<String, Vec<i64>> = HashMap::new();
    let mut strong_count = 0;
    let mut total = 0;

    for row in raw_rows {
        if row.category != "login" {
            continue;
        }
        total += 1;
        let password = row
            .password_enc
            .as_deref()
            .and_then(|p| vault::decrypt(p, key).ok())
            .unwrap_or_default();

        if password.is_empty() {
            continue;
        }

        let strength = vault::evaluate_password_strength(&password);
        if strength <= 1 || password.len() < 8 {
            weak_ids.push(row.id);
        } else if strength >= 3 {
            strong_count += 1;
        }

        pass_map.entry(password).or_default().push(row.id);
    }

    for ids in pass_map.values() {
        if ids.len() > 1 {
            for id in ids {
                if !reused_ids.contains(id) {
                    reused_ids.push(*id);
                }
            }
        }
    }

    Ok(VaultAuditReport {
        total,
        weak_count: weak_ids.len() as i64,
        reused_count: reused_ids.len() as i64,
        strong_count,
        weak_item_ids: weak_ids,
        reused_item_ids: reused_ids,
    })
}

#[tauri::command]
pub fn clipboard_clear_secret(expected_text: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use clipboard_win::{formats, get_clipboard, set_clipboard_string};
        if let Ok(current) = get_clipboard(formats::Unicode) {
            let current: String = current;
            if current == expected_text {
                let _ = set_clipboard_string("");
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let opener = app.opener();
    opener.open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn vault_import_csv(
    csv_content: String,
    state: State<crate::AppState>,
) -> Result<usize, String> {
    let key_guard = state.vault_key.lock().unwrap();
    let key = key_guard
        .as_ref()
        .ok_or_else(|| "القبو مقفل — يرجى إدخال رمز المرور أولاً".to_string())?;

    let records = vault::parse_chrome_csv(&csv_content);
    if records.is_empty() {
        return Err("لم يتم العثور على أي حسابات صالحة في ملف CSV".to_string());
    }

    let now = now_ms();
    let mut imported = 0;

    for rec in records {
        let password_enc = if !rec.password.is_empty() {
            Some(vault::encrypt(&rec.password, key)?)
        } else {
            None
        };
        let notes_enc = if !rec.note.is_empty() {
            Some(vault::encrypt(&rec.note, key)?)
        } else {
            None
        };

        let raw = RawVaultRow {
            id: 0,
            category: "login".to_string(),
            title: if !rec.name.is_empty() {
                rec.name
            } else {
                "حساب بدون عنوان".to_string()
            },
            username: if !rec.username.is_empty() {
                Some(rec.username)
            } else {
                None
            },
            password_enc,
            website: if !rec.url.is_empty() {
                Some(rec.url)
            } else {
                None
            },
            notes_enc,
            card_number_enc: None,
            card_expiry: None,
            card_cvv_enc: None,
            favorite: false,
            created_at: now,
            updated_at: now,
        };

        if state.lock_db().vault_insert_item(&raw).is_ok() {
            imported += 1;
        }
    }

    Ok(imported)
}

#[tauri::command]
pub fn vault_import_from_file_path(
    path: String,
    state: State<crate::AppState>,
) -> Result<usize, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("فشل في قراءة ملف CSV: {}", e))?;
    vault_import_csv(content, state)
}

#[tauri::command]
pub fn vault_export_csv(state: State<crate::AppState>) -> Result<String, String> {
    let items = vault_get_items(Some("login".to_string()), None, state)?;
    Ok(vault::generate_chrome_csv(&items))
}

// ---------------------------------------------------------------- ocr

#[tauri::command]
pub fn ocr_status(app: AppHandle) -> Result<bool, String> {
    Ok(crate::ocr::find_ocr_executable(Some(&app)).is_some())
}

#[tauri::command]
pub fn ocr_extract_text(
    app: AppHandle,
    state: State<crate::AppState>,
    id: i64,
    force: Option<bool>,
) -> Result<crate::ocr::OcrResult, String> {
    let item = state
        .lock_db()
        .get_item(id)?
        .ok_or_else(|| format!("العنصر رقم {id} غير موجود."))?;

    // If already extracted and not forced, return cached result
    if force != Some(true) {
        if let Some(ref text) = item.ocr_text {
            if !text.trim().is_empty() {
                let lines = text
                    .lines()
                    .enumerate()
                    .map(|(i, l)| crate::ocr::OcrLine {
                        index: i as i32,
                        text: l.to_string(),
                    })
                    .collect();
                return Ok(crate::ocr::OcrResult {
                    text: text.clone(),
                    lines,
                });
            }
        }
    }

    // Determine target image path
    let image_path = if item.image {
        state.images_dir.join(format!("{id}.png"))
    } else if item.kind == "files" {
        let first_file = item
            .files
            .as_ref()
            .and_then(|files| files.first())
            .ok_or_else(|| "لم يتم العثور على أي ملف مرتبط بهذا العنصر.".to_string())?;
        let p = PathBuf::from(first_file);
        if !p.exists() {
            return Err(format!("الملف غير موجود على القرص: {}", p.display()));
        }
        p
    } else {
        return Err("العنصر المحدد لا يحتوي على صورة صالحة للتعرف الضوئي.".to_string());
    };

    let res = crate::ocr::run_ocr_on_file(&image_path, Some(&app))?;

    // Save to database
    state.lock_db().update_item_ocr_text(id, &res.text)?;

    // Emit updated item so frontend cards and lists refresh immediately
    if let Ok(Some(updated)) = state.lock_db().get_item(id) {
        let _ = app.emit("clipvault:item-updated", &updated);
    }

    Ok(res)
}

#[tauri::command]
pub fn ocr_extract_file(
    app: AppHandle,
    path: String,
) -> Result<crate::ocr::OcrResult, String> {
    let p = PathBuf::from(path);
    crate::ocr::run_ocr_on_file(&p, Some(&app))
}

// ---------------------------------------------------------------- smart typing

#[tauri::command]
pub fn typing_invert_layout(text: String) -> Result<crate::typing::InvertResult, String> {
    Ok(crate::typing::invert_layout(&text))
}

#[tauri::command]
pub fn typing_fix_selected_text() -> Result<String, String> {
    crate::typing::fix_selected_text_in_active_window()
}

#[tauri::command]
pub fn typing_inject_text(text: String) -> Result<bool, String> {
    crate::typing::inject_text_into_active_window(&text)?;
    Ok(true)
}

#[tauri::command]
pub fn typing_get_selected_text() -> Result<String, String> {
    Ok(crate::typing::get_selected_text_from_active_window())
}







// ---------------------------------------------------------------- v1.5: transform results / merged items / QR

/// Store a new text item produced inside ClipVault (transform result, merged
/// multi-select content, …), copy it to the system clipboard, and broadcast it.
#[tauri::command]
pub fn add_text_item(
    app: AppHandle,
    state: State<crate::AppState>,
    text: String,
    source: Option<String>,
) -> Result<crate::models::Item, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("لا يمكن حفظ نص فارغ".into());
    }

    // Copy to the clipboard so the item is immediately pasteable.
    let content = WriteContent {
        kind: "text",
        text: Some(trimmed),
        html: None,
        files: None,
        png: None,
    };
    clipboard_io::write_to_clipboard(&content)?;

    // Same hash scheme as the clipboard monitor.
    let hash = {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(b"text");
        h.update([0x1f]);
        h.update(trimmed.as_bytes());
        h.finalize().iter().map(|b| format!("{b:02x}")).collect::<String>()
    };

    let now = now_ms();
    let id = {
        let db = state.lock_db();
        match db.find_by_hash(&hash) {
            Some(existing) => {
                let _ = db.touch_item(existing, now);
                existing
            }
            None => db.insert_item(
                "text",
                Some(trimmed),
                None,
                None,
                false,
                source.as_deref().or(Some("ClipVault")),
                &hash,
                now,
            )?,
        }
    };

    let item = {
        let db = state.lock_db();
        db.get_item(id)?.ok_or_else(|| "ITEM_MISSING".to_string())?
    };
    let _ = app.emit("clipvault:new-item", &item);
    Ok(item)
}

/// Generate a QR code (PNG data URL) for arbitrary text or a URL.
#[tauri::command]
pub fn qr_generate(text: String) -> Result<String, String> {
    crate::qr::png_data_url(&text)
}
