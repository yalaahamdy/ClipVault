//! ClipVault — fast & elegant clipboard manager for Windows.
//! App bootstrap: state, tray, global shortcut, popup window management.

mod clipboard_io;
mod commands;
mod db;
mod models;
mod monitor;
mod ocr;
mod typing;
mod vault;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use db::Db;

/// Shared application state.
pub struct AppState {
    pub db: Mutex<Db>,
    pub paused: AtomicBool,
    pub images_dir: PathBuf,
    /// True while a native (blocking) dialog is open — suppresses hide-on-blur.
    pub dialog_open: AtomicBool,
    pub tray_pause_item: Mutex<Option<MenuItem<tauri::Wry>>>,
    pub tray_autostart_item: Mutex<Option<CheckMenuItem<tauri::Wry>>>,
    pub vault_key: Mutex<Option<[u8; 32]>>,
}

impl AppState {
    /// Lock the DB, recovering gracefully from a poisoned mutex.
    pub fn lock_db(&self) -> MutexGuard<'_, Db> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }
}

pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin: focuses the existing window on second launch
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_popup(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state == ShortcutState::Pressed {
                        let sc_str = format!("{shortcut}");
                        if sc_str.to_lowercase().contains("x") {
                            let _ = crate::typing::fix_selected_text_in_active_window();
                        } else {
                            show_popup(app);
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_items,
            commands::get_item_image,
            commands::copy_item,
            commands::paste_item,
            commands::delete_item,
            commands::clear_history,
            commands::set_pin,
            commands::set_favorite,
            commands::set_sensitive,
            commands::edit_item_text,
            commands::get_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::toggle_item_tag,
            commands::get_collections,
            commands::create_collection,
            commands::delete_collection,
            commands::toggle_item_collection,
            commands::get_settings,
            commands::set_settings,
            commands::set_paused,
            commands::toggle_window,
            commands::hide_window,
            commands::frontend_ready,
            commands::open_item,
            commands::reveal_item,
            commands::save_image,
            commands::get_stats,
            commands::get_sources,
            commands::read_file_as_data_url,
            commands::vault_get_status,
            commands::vault_setup_master,
            commands::vault_unlock,
            commands::vault_lock,
            commands::vault_change_pin,
            commands::vault_get_items,
            commands::vault_save_item,
            commands::vault_delete_item,
            commands::vault_toggle_favorite,
            commands::vault_audit,
            commands::clipboard_clear_secret,
            commands::open_external_url,
            commands::vault_import_csv,
            commands::vault_import_from_file_path,
            commands::vault_export_csv,
            commands::ocr_status,
            commands::ocr_extract_text,
            commands::ocr_extract_file,
            commands::typing_invert_layout,
            commands::typing_fix_selected_text,
            commands::typing_inject_text,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let data_dir = handle
                .path()
                .app_data_dir()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            std::fs::create_dir_all(data_dir.join("images"))?;
            let db = Db::open(&data_dir.join("clipvault.db"))
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            let paused = db.get_setting("paused").map(|v| v == "1").unwrap_or(false);
            let shortcut = db
                .get_setting("globalShortcut")
                .unwrap_or_else(|| "Ctrl+Shift+V".into());

            app.manage(AppState {
                db: Mutex::new(db),
                paused: AtomicBool::new(paused),
                images_dir: data_dir.join("images"),
                dialog_open: AtomicBool::new(false),
                tray_pause_item: Mutex::new(None),
                tray_autostart_item: Mutex::new(None),
                vault_key: Mutex::new(None),
            });

            setup_tray(&handle)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            register_shortcut(&handle, &shortcut)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            monitor::spawn(handle.clone());

            // Startup pruning (retention + max items)
            let _ = commands::prune_now(&handle);

            // Hide popup when it loses focus (native dialogs excluded)
            if let Some(win) = handle.get_webview_window("main") {
                let h = handle.clone();
                win.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Focused(false)) {
                        let h = h.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(Duration::from_millis(140));
                            let state = h.state::<AppState>();
                            if state.dialog_open.load(Ordering::SeqCst) {
                                return;
                            }
                            if let Some(w) = h.get_webview_window("main") {
                                if !w.is_focused().unwrap_or(true) {
                                    let _ = w.hide();
                                }
                            }
                        });
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("فشل تشغيل ClipVault");
}

/// Register (or re-register) the global shortcut.
pub fn register_shortcut(app: &AppHandle, shortcut_str: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    gs.register(shortcut_str)
        .map_err(|e| format!("تعذر تسجيل الاختصار {shortcut_str}: {e}"))?;
    // Register global selection typing fixer (Ctrl+Shift+X)
    let _ = gs.register("Ctrl+Shift+X");
    Ok(())
}

/// Show the popup near the mouse cursor, or hide it if already focused.
pub fn show_popup(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let visible = win.is_visible().unwrap_or(false);
        let focused = win.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = win.hide();
            return;
        }
        position_near_cursor(&win);
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("clipvault:window-shown", ());
    }
}

#[cfg(windows)]
fn position_near_cursor(win: &WebviewWindow) {
    use windows::Win32::Foundation::{POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut pt = POINT::default();
        if GetCursorPos(&mut pt).is_err() {
            let _ = win.center();
            return;
        }
        let hmon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        // MONITORINFO has no Default impl in windows 0.58 — construct explicitly
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            rcMonitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
            rcWork: RECT { left: 0, top: 0, right: 0, bottom: 0 },
            dwFlags: 0,
        };
        // GetMonitorInfoW returns BOOL (not Result) in windows 0.58
        if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let _ = win.center();
            return;
        }
        if let Ok(size) = win.outer_size() {
            let w = size.width as i32;
            let h = size.height as i32;
            let margin = 10i32;
            let (wa_l, wa_r) = (mi.rcWork.left, mi.rcWork.right);
            let (wa_t, wa_b) = (mi.rcWork.top, mi.rcWork.bottom);

            let mut x = pt.x + margin;
            let mut y = pt.y + margin;
            if x + w > wa_r - margin {
                x = pt.x - w - margin;
            }
            if y + h > wa_b - margin {
                y = pt.y - h - margin;
            }
            x = x.clamp(wa_l, (wa_r - w).max(wa_l));
            y = y.clamp(wa_t, (wa_b - h).max(wa_t));
            let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }
}

#[cfg(not(windows))]
fn position_near_cursor(win: &WebviewWindow) {
    let _ = win.center();
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "tray-show", "إظهار ClipVault", true, None::<&str>)?;
    let pause_i = MenuItem::with_id(app, "tray-pause", "إيقاف التسجيل مؤقتًا", true, None::<&str>)?;
    let autostart_i = CheckMenuItem::with_id(
        app,
        "tray-autostart",
        "البدء مع تشغيل Windows",
        true,
        false,
        None::<&str>,
    )?;
    let settings_i = MenuItem::with_id(app, "tray-settings", "الإعدادات", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "tray-quit", "إنهاء ClipVault", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&show_i, &sep1, &pause_i, &autostart_i, &sep2, &settings_i, &sep3, &quit_i],
    )?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(tauri::include_image!("icons/32x32.png"))
        .tooltip("ClipVault")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => show_popup(app),
            "tray-pause" => commands::toggle_pause(app),
            "tray-autostart" => commands::toggle_autostart(app),
            "tray-settings" => {
                show_popup(app);
                let _ = app.emit("clipvault:open-settings", ());
            }
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_popup(tray.app_handle());
            }
        })
        .build(app)?;

    // Sync the autostart checkbox with the real OS state
    {
        use tauri_plugin_autostart::ManagerExt;
        let enabled = app.autolaunch().is_enabled().unwrap_or(false);
        let _ = autostart_i.set_checked(enabled);
    }

    let state = app.state::<AppState>();
    *state.tray_pause_item.lock().unwrap_or_else(|e| e.into_inner()) = Some(pause_i);
    *state.tray_autostart_item.lock().unwrap_or_else(|e| e.into_inner()) = Some(autostart_i);

    Ok(())
}
