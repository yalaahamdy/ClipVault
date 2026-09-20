//! Region screenshot capture → OCR (v1.5).
//!
//! One snip session at a time:
//! 1. `snip_begin` hides the popup, captures the monitor under the cursor into a
//!    frozen RGBA buffer (GDI), and opens a frameless overlay window over it.
//! 2. The overlay (`SnipOverlay.tsx`, running in the "snip" webview window) fetches
//!    the frozen frame via `snip_get_frame` and lets the user drag a region.
//! 3. `snip_commit` crops the buffer, stores the shot in the history, runs OneOCR
//!    on it, copies it to the system clipboard, and notifies the main window.
//! 4. `snip_cancel` (or Esc in the overlay) aborts the session.

use std::sync::Mutex;

use base64::Engine;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

use crate::models::now_ms;

/// Frozen capture of one monitor (RGBA, top-down, 4 bytes per pixel).
pub struct SnipSession {
    pub rgba: Vec<u8>,
    pub width: i32,
    pub height: i32,
    /// Monitor origin in virtual-screen physical coordinates.
    pub monitor_x: i32,
    pub monitor_y: i32,
}

/// Shared snip slot stored in `AppState`.
pub type SharedSession = Mutex<Option<SnipSession>>;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnipFrame {
    pub data_url: String,
    pub width: i32,
    pub height: i32,
    pub monitor_x: i32,
    pub monitor_y: i32,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnipCommitResult {
    pub id: i64,
    pub has_ocr_text: bool,
    pub ocr_text: Option<String>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnipRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// window.devicePixelRatio of the snip window (CSS px → physical px).
    pub dpr: f64,
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub fn snip_begin(app: AppHandle) -> Result<(), String> {
    begin_snip(&app)
}

#[tauri::command]
pub fn snip_get_frame(state: tauri::State<'_, crate::AppState>) -> Result<SnipFrame, String> {
    let guard = state.snip.lock().unwrap_or_else(|e| e.into_inner());
    let s = guard.as_ref().ok_or_else(|| "NO_SESSION".to_string())?;
    Ok(SnipFrame {
        data_url: rgba_to_png_data_url(&s.rgba, s.width, s.height)?,
        width: s.width,
        height: s.height,
        monitor_x: s.monitor_x,
        monitor_y: s.monitor_y,
    })
}

#[tauri::command]
pub fn snip_commit(
    app: AppHandle,
    state: tauri::State<'_, crate::AppState>,
    rect: SnipRect,
) -> Result<SnipCommitResult, String> {
    commit(&app, &state, rect)
}

#[tauri::command]
pub fn snip_cancel(app: AppHandle, state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    {
        let mut guard = state.snip.lock().unwrap_or_else(|e| e.into_inner());
        *guard = None;
    }
    close_snip_window(&app);
    Ok(())
}

/// Commit an ANNOTATED crop: the webview (SnipAnnotator) renders the edited
/// crop to a PNG data URL; we decode it and run the exact same store → OCR →
/// clipboard → notify pipeline as a plain snip (v1.6).
#[tauri::command]
pub fn snip_commit_annotated(
    app: AppHandle,
    state: tauri::State<'_, crate::AppState>,
    data_url: String,
) -> Result<SnipCommitResult, String> {
    const PREFIX: &str = "data:image/png;base64,";
    let b64 = data_url
        .strip_prefix(PREFIX)
        .ok_or_else(|| "BAD_DATA_URL".to_string())?;
    let png = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    if png.len() < 64 {
        return Err("BAD_DATA_URL".into());
    }
    store_shot(&app, &state, png)
}

// ---------------------------------------------------------------- flow

pub fn begin_snip(app: &AppHandle) -> Result<(), String> {
    // Hide the popup so it does not appear inside the capture.
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    // Let the window disappear before grabbing the screen.
    std::thread::sleep(std::time::Duration::from_millis(220));

    let session = capture_monitor_under_cursor().ok_or_else(|| "CAPTURE_FAILED".to_string())?;

    let state = app.state::<crate::AppState>();
    {
        let mut guard = state.snip.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(session);
    }
    open_snip_window(app)
}

fn open_snip_window(app: &AppHandle) -> Result<(), String> {
    // Reuse an existing overlay window (a fresh frame was stored).
    if let Some(win) = app.get_webview_window("snip") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit_to("snip", "clipvault:snip-frame", ());
        return Ok(());
    }

    let state = app.state::<crate::AppState>();
    let (mx, my, mw, mh) = {
        let guard = state.snip.lock().unwrap_or_else(|e| e.into_inner());
        let s = guard.as_ref().ok_or_else(|| "NO_SESSION".to_string())?;
        (s.monitor_x, s.monitor_y, s.width, s.height)
    };

    let win = WebviewWindowBuilder::new(app, "snip", WebviewUrl::App("index.html".into()))
        .title("ClipVault Snip")
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    let _ = win.set_position(PhysicalPosition::new(mx, my));
    let _ = win.set_size(PhysicalSize::new(mw.max(1) as u32, mh.max(1) as u32));
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

pub fn close_snip_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("snip") {
        let _ = win.hide();
        let _ = win.close();
    }
}

fn commit(
    app: &AppHandle,
    state: &tauri::State<'_, crate::AppState>,
    rect: SnipRect,
) -> Result<SnipCommitResult, String> {
    let dpr = if rect.dpr.is_finite() && rect.dpr > 0.0 {
        rect.dpr
    } else {
        1.0
    };
    let (rgba, w, h) = {
        let guard = state.snip.lock().unwrap_or_else(|e| e.into_inner());
        let s = guard.as_ref().ok_or_else(|| "NO_SESSION".to_string())?;
        (s.rgba.clone(), s.width, s.height)
    };

    // CSS px → physical px on the captured buffer (clamped to the frame).
    let px = |v: f64| -> i32 { (v * dpr).round() as i32 };
    let x = px(rect.x).clamp(0, (w - 1).max(0));
    let y = px(rect.y).clamp(0, (h - 1).max(0));
    let cw = px(rect.w).clamp(1, w - x);
    let ch = px(rect.h).clamp(1, h - y);
    if cw < 2 || ch < 2 {
        return Err("REGION_TOO_SMALL".into());
    }

    let png = crop_rgba_to_png(
        &rgba,
        w.max(1) as u32,
        h.max(1) as u32,
        x as u32,
        y as u32,
        cw as u32,
        ch as u32,
    )?;

    store_shot(app, state, png)
}

/// Store a captured (raw or annotated) shot: dedupe → save → OCR → clipboard →
/// close the overlay → notify the main window. Shared by `snip_commit` and
/// `snip_commit_annotated`.
fn store_shot(
    app: &AppHandle,
    state: &tauri::State<'_, crate::AppState>,
    png: Vec<u8>,
) -> Result<SnipCommitResult, String> {
    // Same hash scheme as the clipboard monitor (dedupes identical shots).
    let hash = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"image");
        hasher.update([0x1f]);
        hasher.update(&png);
        hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    };

    let now = now_ms();
    let id = {
        let db = state.lock_db();
        match db.find_by_hash(&hash) {
            Some(existing) => {
                db.touch_item(existing, now)?;
                existing
            }
            None => {
                let new_id = db.insert_item(
                    "image",
                    None,
                    None,
                    None,
                    true,
                    Some("ClipVault ✂"),
                    &hash,
                    now,
                )?;
                save_png_files(&state.images_dir, new_id, &png)?;
                new_id
            }
        }
    };

    // OCR — best effort; a hiccup never fails the snip itself.
    let mut ocr_text: Option<String> = None;
    let image_path = state.images_dir.join(format!("{id}.png"));
    if image_path.exists() {
        if let Ok(res) = crate::ocr::run_ocr_on_file(&image_path, Some(app)) {
            let trimmed = res.text.trim().to_string();
            if !trimmed.is_empty() {
                let db = state.lock_db();
                let _ = db.update_item_ocr_text(id, &trimmed);
                ocr_text = Some(trimmed);
            }
        }
    }

    // Put the shot on the system clipboard, ready to paste anywhere.
    let content = crate::clipboard_io::WriteContent {
        kind: "image",
        text: None,
        html: None,
        files: None,
        png: Some(png),
    };
    let _ = crate::clipboard_io::write_to_clipboard(&content);

    close_snip_window(app);
    {
        let mut guard = state.snip.lock().unwrap_or_else(|e| e.into_inner());
        *guard = None;
    }

    let has_ocr = ocr_text.is_some();
    let _ = app.emit_to(
        "main",
        "clipvault:snip-complete",
        SnipCommitResult {
            id,
            has_ocr_text: has_ocr,
            ocr_text: ocr_text.clone(),
        },
    );

    Ok(SnipCommitResult {
        id,
        has_ocr_text: has_ocr,
        ocr_text,
    })
}

// ---------------------------------------------------------------- imaging

type RgbaImage = image::ImageBuffer<image::Rgba<u8>, Vec<u8>>;

fn encode_png(img: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(img.clone())
        .write_to(&mut out, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(out.into_inner())
}

fn crop_rgba_to_png(
    rgba: &[u8],
    full_w: u32,
    full_h: u32,
    x: u32,
    y: u32,
    cw: u32,
    ch: u32,
) -> Result<Vec<u8>, String> {
    let buf = image::RgbaImage::from_raw(full_w, full_h, rgba.to_vec()).ok_or("BAD_BUFFER")?;
    let cropped = image::imageops::crop_imm(&buf, x, y, cw, ch).to_image();
    encode_png(&cropped)
}

fn rgba_to_png_data_url(rgba: &[u8], w: i32, h: i32) -> Result<String, String> {
    let img = image::RgbaImage::from_raw(w.max(1) as u32, h.max(1) as u32, rgba.to_vec())
        .ok_or("BAD_BUFFER")?;
    let bytes = encode_png(&img)?;
    use base64::Engine;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn save_png_files(dir: &std::path::Path, id: i64, png: &[u8]) -> Result<(), String> {
    let img = image::load_from_memory(png).map_err(|e| e.to_string())?;
    img.save(dir.join(format!("{id}.png")))
        .map_err(|e| e.to_string())?;
    img.thumbnail(320, 320)
        .save(dir.join(format!("{id}_t.png")))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------- capture

/// Capture the monitor under the cursor via GDI (physical pixels, top-down RGBA).
#[cfg(windows)]
fn capture_monitor_under_cursor() -> Option<SnipSession> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, GetMonitorInfoW, MonitorFromPoint, ReleaseDC, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, DIB_RGB_COLORS, MONITORINFO, MONITOR_DEFAULTTONEAREST, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut pt = POINT::default();
        if GetCursorPos(&mut pt).is_err() {
            return None;
        }
        let hmon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        // MONITORINFO has no Default impl in windows 0.58 — construct explicitly.
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            rcMonitor: windows::Win32::Foundation::RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            rcWork: windows::Win32::Foundation::RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            dwFlags: 0,
        };
        // GetMonitorInfoW returns BOOL (not Result) in windows 0.58.
        if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
            return None;
        }
        let (mx, my) = (mi.rcMonitor.left, mi.rcMonitor.top);
        let (w, h) = (
            mi.rcMonitor.right - mi.rcMonitor.left,
            mi.rcMonitor.bottom - mi.rcMonitor.top,
        );
        if w <= 0 || h <= 0 {
            return None;
        }

        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return None;
        }
        let mem_dc = CreateCompatibleDC(screen_dc);
        if mem_dc.is_invalid() {
            let _ = ReleaseDC(None, screen_dc);
            return None;
        }
        let hbmp = CreateCompatibleBitmap(screen_dc, w, h);
        if hbmp.is_invalid() {
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return None;
        }
        let old = SelectObject(mem_dc, hbmp);
        let blit = BitBlt(mem_dc, 0, 0, w, h, screen_dc, mx, my, SRCCOPY).is_ok();

        // Deselect before GetDIBits (the bitmap must not be selected into a DC).
        SelectObject(mem_dc, old);

        let mut pixels: Vec<u8> = vec![0u8; (w as usize) * (h as usize) * 4];
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0u32, // BI_RGB
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [Default::default(); 1],
        };
        let got = GetDIBits(
            mem_dc,
            hbmp,
            0,
            h as u32,
            Some(pixels.as_mut_ptr().cast()),
            &mut bi,
            DIB_RGB_COLORS,
        );

        let _ = DeleteObject(hbmp);
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);

        if got == 0 || !blit {
            return None;
        }

        // GDI yields BGRA (BGRX with alpha=0) — normalize to opaque RGBA.
        for chunk in pixels.chunks_exact_mut(4) {
            let b = chunk[0];
            chunk[0] = chunk[2];
            chunk[2] = b;
            chunk[3] = 255;
        }

        Some(SnipSession {
            rgba: pixels,
            width: w,
            height: h,
            monitor_x: mx,
            monitor_y: my,
        })
    }
}

#[cfg(not(windows))]
fn capture_monitor_under_cursor() -> Option<SnipSession> {
    None
}
