//! Background clipboard monitor — polls the clipboard sequence number and
//! captures new content. Polling the sequence number is effectively free
//! (no clipboard open, no format enumeration) which keeps CPU usage ~0%.

use std::path::Path;
use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::clipboard_io::{self, Captured};
use crate::models::now_ms;

const POLL_MS: u64 = 300;
const SETTLE_MS: u64 = 120;
const MAX_TEXT_CHARS: usize = 200_000;
const MAX_IMAGE_BYTES: usize = 40 * 1024 * 1024;

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || run(app));
}

fn run(app: AppHandle) {
    let mut last_seq = clipboard_io::get_sequence().unwrap_or(0);
    loop {
        std::thread::sleep(Duration::from_millis(POLL_MS));
        let state = app.state::<crate::AppState>();
        if state.paused.load(Ordering::SeqCst) {
            // Keep tracking so we don't capture stale content when resumed.
            if let Some(seq) = clipboard_io::get_sequence() {
                last_seq = seq;
            }
            continue;
        }
        if let Some(seq) = clipboard_io::get_sequence() {
            if seq != last_seq {
                last_seq = seq;
                // Give the writer a moment to place all formats on the clipboard.
                std::thread::sleep(Duration::from_millis(SETTLE_MS));
                capture_and_store(&app);
                if let Some(s2) = clipboard_io::get_sequence() {
                    last_seq = s2;
                }
            }
        }
    }
}

fn read_excluded(state: &crate::AppState) -> Vec<String> {
    let db = state.lock_db();
    db.get_setting("excludedApps")
        .and_then(|v| serde_json::from_str::<Vec<String>>(&v).ok())
        .unwrap_or_default()
}

fn capture_and_store(app: &AppHandle) {
    let state = app.state::<crate::AppState>();
    let excluded = read_excluded(&state);
    let captured = match clipboard_io::read_captured(&excluded) {
        Some(c) => c,
        None => return,
    };
    store(app, captured);
}

fn compute_hash(c: &Captured) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(c.kind.as_bytes());
    h.update([0x1f]);
    match c.kind.as_str() {
        "image" => {
            if let Some(p) = &c.png {
                h.update(p);
            } else {
                h.update(b"no-png");
            }
        }
        "files" => {
            for f in c.files.iter().flatten() {
                h.update(f.as_bytes());
                h.update([0x1e]);
            }
        }
        _ => {
            h.update(c.text.as_deref().unwrap_or("").as_bytes());
        }
    }
    let d = h.finalize();
    d.iter().map(|b| format!("{b:02x}")).collect()
}

fn store(app: &AppHandle, c: Captured) {
    let state = app.state::<crate::AppState>();
    let now = now_ms();

    let text: Option<String> = c.text.as_ref().map(|t| {
        if t.chars().count() > MAX_TEXT_CHARS {
            t.chars().take(MAX_TEXT_CHARS).collect()
        } else {
            t.clone()
        }
    });

    let hash = compute_hash(&c);

    let id: Option<i64> = {
        let db = state.lock_db();
        match db.find_by_hash(&hash) {
            Some(existing) => {
                // Duplicate copy: move to the top instead of duplicating.
                let _ = db.touch_item(existing, now);
                Some(existing)
            }
            None => match db.insert_item(
                &c.kind,
                text.as_deref(),
                c.html.as_deref(),
                c.files.as_ref(),
                c.kind == "image",
                c.source.as_deref(),
                &hash,
                now,
            ) {
                Ok(new_id) => {
                    if let Some(png) = &c.png {
                        save_images(&state.images_dir, new_id, png);
                    }
                    Some(new_id)
                }
                Err(_) => None,
            },
        }
    };

    if let Some(id) = id {
        let db = state.lock_db();
        if let Ok(Some(item)) = db.get_item(id) {
            let _ = app.emit("clipvault:new-item", &item);
        }
    }
}

fn save_images(dir: &Path, id: i64, png: &[u8]) {
    if png.is_empty() || png.len() > MAX_IMAGE_BYTES {
        return;
    }
    let Ok(img) = image::load_from_memory(png) else {
        return;
    };
    let _ = img.save(dir.join(format!("{id}.png")));
    let _ = img
        .thumbnail(320, 320)
        .save(dir.join(format!("{id}_t.png")));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_cap_trims() {
        let long = "أ".repeat(300_000);
        let trimmed: String = long.chars().take(MAX_TEXT_CHARS).collect();
        assert_eq!(trimmed.chars().count(), MAX_TEXT_CHARS);
    }
}
