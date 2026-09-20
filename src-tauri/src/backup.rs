//! Backup export / import (v1.6).
//!
//! Exports the clipboard history (items, tags, collections, settings) into a
//! single `.cvbak` envelope file — optionally encrypted with AES-256-GCM using
//! a user password. The password vault is intentionally NOT part of backups
//! (it already ships its own CSV export and must never leave the machine in
//! plaintext form).
//!
//! Envelope layout (versioned, self-describing):
//! ```json
//! {
//!   "app": "ClipVault", "format": 2,
//!   "enc": "none" | "aes-gcm",
//!   "salt": "<b64, aes-gcm only>",
//!   "meta": { "items": n, "images": n, "exportedAt": ms, "appVersion": "x.y.z" },
//!   "data": "<b64 ciphertext, aes-gcm only>",   // OR
//!   "payload": { ...BackupData }                // plain
//! }
//! ```
//! `meta` lives OUTSIDE the encrypted payload so a file can be inspected
//! (item count, export date, encryption state) without knowing the password.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::models::now_ms;

pub const FORMAT: i64 = 2;

/// Settings keys that travel with a backup (explicit whitelist).
const SETTINGS_KEYS: &[&str] = &[
    "theme",
    "globalShortcut",
    "retentionDays",
    "maxItems",
    "excludedApps",
    "autoMask",
    "lang",
];

// ---------------------------------------------------------------- types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupItem {
    pub kind: String,
    pub text: Option<String>,
    pub html: Option<String>,
    pub files: Option<Vec<String>>,
    pub image: bool,
    pub source_app: Option<String>,
    pub ocr_text: Option<String>,
    pub hash: String,
    pub pinned: bool,
    pub favorite: bool,
    pub sensitive: bool,
    pub created_at: i64,
    pub last_used_at: i64,
    pub use_count: i64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub collections: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_full: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_thumb: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackupData {
    #[serde(default)]
    pub items: Vec<BackupItem>,
    #[serde(default)]
    pub settings: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupMeta {
    pub items: i64,
    pub images: i64,
    pub exported_at: i64,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResult {
    pub path: String,
    pub items: i64,
    pub images: i64,
    pub encrypted: bool,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub encrypted: bool,
    pub meta: BackupMeta,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportResult {
    pub added: i64,
    pub skipped: i64,
    pub images_restored: i64,
    pub tags_added: i64,
    pub collections_added: i64,
    pub settings_applied: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct Envelope {
    app: String,
    format: i64,
    enc: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    salt: Option<String>,
    meta: BackupMeta,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    data: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
}

/// Decode a `.cvbak` file into (envelope, BackupData), handling decryption.
fn open_envelope(bytes: &[u8], password: Option<&str>) -> Result<(Envelope, BackupData), String> {
    let env: Envelope = serde_json::from_slice(bytes)
        .map_err(|_| "الملف ليس نسخة احتياطية صالحة من ClipVault".to_string())?;
    if env.app != "ClipVault" || env.format != FORMAT {
        return Err(format!(
            "صيغة النسخة غير مدعومة (format {} والمدعوم {})",
            env.format, FORMAT
        ));
    }
    let data: BackupData = match env.enc.as_str() {
        "none" => {
            let payload = env
                .payload
                .clone()
                .ok_or("النسخة الاحتياطية تالفة (لا يوجد محتوى)")?;
            serde_json::from_value(payload)
                .map_err(|_| "النسخة الاحتياطية تالفة (محتوى غير صالح)".to_string())?
        }
        "aes-gcm" => {
            let pw = password
                .map(str::trim)
                .filter(|p| !p.is_empty())
                .ok_or("PASSWORD_REQUIRED")?;
            let salt = env
                .salt
                .as_deref()
                .ok_or("النسخة الاحتياطية تالفة (لا يوجد salt)")?;
            let cipher_b64 = env
                .data
                .as_deref()
                .ok_or("النسخة الاحتياطية تالفة (لا يوجد محتوى مشفر)")?;
            let key = crate::vault::derive_key(pw, salt.as_bytes());
            let plain = crate::vault::decrypt(cipher_b64, &key)
                .map_err(|_| "كلمة المرور غير صحيحة أو الملف تالف".to_string())?;
            serde_json::from_str(&plain)
                .map_err(|_| "النسخة الاحتياطية تالفة (محتوى غير صالح)".to_string())?
        }
        other => return Err(format!("طريقة تشفير غير معروفة: {other}")),
    };
    Ok((env, data))
}

// ---------------------------------------------------------------- dump

fn b64_file(path: &PathBuf) -> Option<String> {
    std::fs::read(path)
        .ok()
        .map(|b| base64::engine::general_purpose::STANDARD.encode(b))
}

fn dump_data(
    db: &crate::db::Db,
    images_dir: &PathBuf,
    include_images: bool,
) -> Result<BackupData, String> {
    let mut data = BackupData::default();
    let mut row_ids: Vec<i64> = Vec::new();

    // Items — id order, parallel to row_ids.
    {
        let mut stmt = db
            .conn
            .prepare(
                "SELECT id, kind, text, html, files, image, source_app, ocr_text, hash,
                        pinned, favorite, sensitive, created_at, last_used_at, use_count
                 FROM items ORDER BY id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                let files_json: Option<String> = r.get("files")?;
                let files: Option<Vec<String>> = files_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok());
                Ok((
                    r.get::<_, i64>("id")?,
                    BackupItem {
                        kind: r.get("kind")?,
                        text: r.get("text")?,
                        html: r.get("html")?,
                        files,
                        image: r.get::<_, i64>("image")? != 0,
                        source_app: r.get("source_app")?,
                        ocr_text: r.get("ocr_text")?,
                        hash: r.get("hash")?,
                        pinned: r.get::<_, i64>("pinned")? != 0,
                        favorite: r.get::<_, i64>("favorite")? != 0,
                        sensitive: r.get::<_, i64>("sensitive")? != 0,
                        created_at: r.get("created_at")?,
                        last_used_at: r.get("last_used_at")?,
                        use_count: r.get("use_count")?,
                        tags: Vec::new(),
                        collections: Vec::new(),
                        image_full: None,
                        image_thumb: None,
                    },
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (id, item) = row.map_err(|e| e.to_string())?;
            row_ids.push(id);
            data.items.push(item);
        }
    }

    // Tags per item.
    {
        let mut stmt = db
            .conn
            .prepare("SELECT it.item_id, t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut by_item: HashMap<i64, Vec<String>> = HashMap::new();
        for r in rows {
            let (item_id, name) = r.map_err(|e| e.to_string())?;
            by_item.entry(item_id).or_default().push(name);
        }
        for (idx, item) in data.items.iter_mut().enumerate() {
            if let Some(names) = by_item.get(&row_ids[idx]) {
                item.tags = names.clone();
            }
        }
    }

    // Collections per item.
    {
        let mut stmt = db
            .conn
            .prepare(
                "SELECT ic.item_id, c.name FROM item_collections ic
                 JOIN collections c ON c.id = ic.collection_id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut by_item: HashMap<i64, Vec<String>> = HashMap::new();
        for r in rows {
            let (item_id, name) = r.map_err(|e| e.to_string())?;
            by_item.entry(item_id).or_default().push(name);
        }
        for (idx, item) in data.items.iter_mut().enumerate() {
            if let Some(names) = by_item.get(&row_ids[idx]) {
                item.collections = names.clone();
            }
        }
    }

    // Images (base64), when requested.
    if include_images {
        for (idx, item) in data.items.iter_mut().enumerate() {
            if !item.image {
                continue;
            }
            let id = row_ids[idx];
            item.image_full = b64_file(&images_dir.join(format!("{id}.png")));
            item.image_thumb = b64_file(&images_dir.join(format!("{id}_t.png")));
        }
    }

    // Settings (whitelisted).
    for key in SETTINGS_KEYS {
        if let Some(val) = db.get_setting(key) {
            data.settings.insert(key.to_string(), val);
        }
    }

    Ok(data)
}

// ---------------------------------------------------------------- commands

/// Open a native file picker for .cvbak backups and return the chosen path.
#[tauri::command]
pub fn backup_pick_file(
    app: AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    state.dialog_open.store(true, Ordering::SeqCst);
    let picked = app
        .dialog()
        .file()
        .add_filter("ClipVault Backup", &["cvbak"])
        .add_filter("All files", &["*"])
        .blocking_pick_file();
    state.dialog_open.store(false, Ordering::SeqCst);
    match picked {
        Some(p) => {
            let path: PathBuf = p.into_path().map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn backup_export(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    include_images: bool,
    password: Option<String>,
) -> Result<BackupExportResult, String> {
    // 1) Collect everything BEFORE opening the dialog (fast, in-memory).
    let version = app.package_info().version.to_string();
    let data = {
        let db = state.lock_db();
        dump_data(&db, &state.images_dir, include_images)?
    };
    let meta = BackupMeta {
        items: data.items.len() as i64,
        images: data.items.iter().filter(|i| i.image_full.is_some()).count() as i64,
        exported_at: now_ms(),
        app_version: version.clone(),
    };

    // 2) Native save dialog (blocking — same pattern as save_image).
    use tauri_plugin_dialog::DialogExt;
    state.dialog_open.store(true, Ordering::SeqCst);
    let picked = app
        .dialog()
        .file()
        .set_file_name(format!("ClipVault-Backup-{}.cvbak", stamp()))
        .add_filter("ClipVault Backup", &["cvbak"])
        .blocking_save_file();
    state.dialog_open.store(false, Ordering::SeqCst);
    let picked = match picked {
        Some(p) => p,
        None => return Err("CANCELLED".into()),
    };
    let dest: PathBuf = picked.into_path().map_err(|e| e.to_string())?;

    // 3) Serialize (optionally encrypt) and write.
    let encrypted = password
        .as_deref()
        .map(|p| !p.trim().is_empty())
        .unwrap_or(false);
    let envelope = if encrypted {
        let pw = password.as_deref().unwrap_or("").trim().to_string();
        let salt = crate::vault::generate_salt();
        let key = crate::vault::derive_key(&pw, salt.as_bytes());
        let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
        let cipher = crate::vault::encrypt(&json, &key)?;
        Envelope {
            app: "ClipVault".into(),
            format: FORMAT,
            enc: "aes-gcm".into(),
            salt: Some(salt),
            meta: meta.clone(),
            data: Some(cipher),
            payload: None,
        }
    } else {
        let payload = serde_json::to_value(&data).map_err(|e| e.to_string())?;
        Envelope {
            app: "ClipVault".into(),
            format: FORMAT,
            enc: "none".into(),
            salt: None,
            meta: meta.clone(),
            data: None,
            payload: Some(payload),
        }
    };
    let file_json = serde_json::to_string_pretty(&envelope).map_err(|e| e.to_string())?;
    std::fs::write(&dest, file_json.as_bytes()).map_err(|e| e.to_string())?;
    let size = std::fs::metadata(&dest)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    Ok(BackupExportResult {
        path: dest.to_string_lossy().into_owned(),
        items: meta.items,
        images: meta.images,
        encrypted,
        size_bytes: size,
    })
}

#[tauri::command]
pub fn backup_inspect(path: String) -> Result<BackupInfo, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let env: Envelope = serde_json::from_slice(&bytes)
        .map_err(|_| "الملف ليس نسخة احتياطية صالحة من ClipVault".to_string())?;
    if env.app != "ClipVault" || env.format != FORMAT {
        return Err(format!("صيغة النسخة غير مدعومة (format {})", env.format));
    }
    Ok(BackupInfo {
        encrypted: env.enc == "aes-gcm",
        meta: env.meta,
    })
}

#[tauri::command]
pub fn backup_import(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    path: String,
    password: Option<String>,
    mode: String,
) -> Result<BackupImportResult, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let (_env, data) = open_envelope(&bytes, password.as_deref())?;

    let replace = match mode.as_str() {
        "merge" => false,
        "replace" => true,
        _ => return Err("وضع استيراد غير معروف".into()),
    };

    let images_dir = state.images_dir.clone();
    let mut report = BackupImportResult {
        added: 0,
        skipped: 0,
        images_restored: 0,
        tags_added: 0,
        collections_added: 0,
        settings_applied: 0,
    };

    {
        let db = state.lock_db();

        if replace {
            db.wipe_history()?;
        }

        let mut tag_ids: HashMap<String, i64> = HashMap::new();
        let mut col_ids: HashMap<String, i64> = HashMap::new();

        for item in &data.items {
            if item.hash.trim().is_empty() {
                report.skipped += 1;
                continue;
            }
            if !replace && db.find_by_hash(&item.hash).is_some() {
                report.skipped += 1;
                continue;
            }
            let id = db.insert_full_item(item)?;
            report.added += 1;

            // Restore image files.
            if item.image {
                let mut restored = false;
                if let Some(b64) = item.image_full.as_deref() {
                    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                        if std::fs::write(images_dir.join(format!("{id}.png")), &bytes).is_ok() {
                            restored = true;
                        }
                    }
                }
                if let Some(b64) = item.image_thumb.as_deref() {
                    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                        let _ = std::fs::write(images_dir.join(format!("{id}_t.png")), &bytes);
                        restored = true;
                    }
                }
                if restored {
                    report.images_restored += 1;
                }
            }

            // Tags & collections (create-if-missing, then link).
            for name in &item.tags {
                let name = name.trim();
                if name.is_empty() {
                    continue;
                }
                let tid = match tag_ids.get(name) {
                    Some(v) => *v,
                    None => {
                        let dto = db.create_tag(name, "#3fb6ff")?;
                        tag_ids.insert(name.to_string(), dto.id);
                        report.tags_added += 1;
                        dto.id
                    }
                };
                let _ = db.link_tag(id, tid);
            }
            for name in &item.collections {
                let name = name.trim();
                if name.is_empty() {
                    continue;
                }
                let cid = match col_ids.get(name) {
                    Some(v) => *v,
                    None => {
                        let dto = db.create_collection(name)?;
                        col_ids.insert(name.to_string(), dto.id);
                        report.collections_added += 1;
                        dto.id
                    }
                };
                let _ = db.link_collection(id, cid);
            }
        }

        // Settings (whitelisted only).
        for key in SETTINGS_KEYS {
            if let Some(val) = data.settings.get(*key) {
                if db.set_setting(key, val).is_ok() {
                    report.settings_applied += 1;
                }
            }
        }
    }

    let _ = app.emit("clipvault:items-changed", ());
    let _ = app.emit("clipvault:settings-changed", ());
    Ok(report)
}

/// UTC-based YYYYMMDD-HHMMSS stamp for the default file name.
fn stamp() -> String {
    let secs = now_ms() / 1000;
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Civil-from-days (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mth = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mth <= 2 { y + 1 } else { y };
    format!("{y:04}{mth:02}{d:02}-{h:02}{m:02}{s:02}")
}
