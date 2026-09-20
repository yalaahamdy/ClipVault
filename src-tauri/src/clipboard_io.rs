//! Platform clipboard IO: capture new clipboard content and write items back.
//! Real implementation for Windows, harmless stub elsewhere.
//!
//! Windows APIs verified against `windows 0.58.0` and `clipboard-win 5.4.1` sources.

/// Raw captured clipboard content, before storage.
pub struct Captured {
    pub kind: String,
    pub text: Option<String>,
    pub html: Option<String>,
    pub files: Option<Vec<String>>,
    pub png: Option<Vec<u8>>,
    pub source: Option<String>,
}

/// Content used to restore an item into the clipboard.
pub struct WriteContent<'a> {
    pub kind: &'a str,
    pub text: Option<&'a str>,
    pub html: Option<&'a str>,
    pub files: Option<&'a [String]>,
    pub png: Option<Vec<u8>>,
}

/// Clipboard sequence number, used for cheap change detection.
pub fn get_sequence() -> Option<u32> {
    imp::get_sequence()
}

/// Read the clipboard and build a `Captured`, honoring the excluded-apps list.
pub fn read_captured(excluded: &[String]) -> Option<Captured> {
    imp::read_captured(excluded)
}

/// Write a stored item back into the clipboard.
pub fn write_to_clipboard(c: &WriteContent) -> Result<(), String> {
    imp::write_to_clipboard(c)
}

/// Simulate a Ctrl+V key combination to paste into the active foreground window.
pub fn simulate_paste() {
    imp::simulate_paste();
}

// ---------------------------------------------------------------------------
// Windows implementation
// ---------------------------------------------------------------------------
#[cfg(windows)]
mod imp {
    use super::{Captured, WriteContent};
    use clipboard_win::{empty, formats, register_format, seq_num, Clipboard, Getter, Setter};
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{GlobalFree, HANDLE};
    use windows::Win32::System::DataExchange::{GetClipboardOwner, SetClipboardData};
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    const CF_DIB: u32 = 8;
    const CF_HDROP: u32 = 15;
    const MAX_IMAGE_BYTES: usize = 40 * 1024 * 1024;
    const MAX_TEXT_BYTES: usize = 2_000_000;

    pub fn get_sequence() -> Option<u32> {
        seq_num().map(|n| n.get())
    }

    pub fn read_captured(excluded: &[String]) -> Option<Captured> {
        let source = query_source_app();
        if let Some(src) = &source {
            if excluded.iter().any(|e| e.eq_ignore_ascii_case(src)) {
                return None;
            }
        }
        let (text, html, files, png) = read_formats()?;

        // 1) Files (also covers cut operations)
        if let Some(f) = &files {
            if !f.is_empty() {
                let names = f
                    .iter()
                    .map(|p| p.rsplit(['\\', '/']).next().unwrap_or(p).to_string())
                    .collect::<Vec<_>>()
                    .join("، ");
                return Some(Captured {
                    kind: "files".into(),
                    text: Some(names),
                    html: None,
                    files: Some(f.clone()),
                    png: None,
                    source,
                });
            }
        }

        // 2) Images — prefer image when there is no meaningful plain text,
        //    or when rich HTML is present (browser/Office behavior).
        if let Some(p) = &png {
            let text_noise = text.as_deref().map(|t| t.trim().is_empty()).unwrap_or(true);
            if text_noise || html.is_some() {
                return Some(Captured {
                    kind: "image".into(),
                    text: None,
                    html: None,
                    files: None,
                    png: Some(p.clone()),
                    source,
                });
            }
        }

        // 3) Text / links
        if let Some(t) = text {
            let trimmed = t.trim();
            if trimmed.is_empty() {
                return None;
            }
            if is_url(trimmed) {
                return Some(Captured {
                    kind: "link".into(),
                    text: Some(trimmed.to_string()),
                    html,
                    files: None,
                    png: None,
                    source,
                });
            }
            return Some(Captured {
                kind: "text".into(),
                text: Some(t),
                html,
                files: None,
                png: None,
                source,
            });
        }
        None
    }

    type Formats = (
        Option<String>,
        Option<String>,
        Option<Vec<String>>,
        Option<Vec<u8>>,
    );

    fn read_formats() -> Option<Formats> {
        let _clip = Clipboard::new_attempts(10).ok()?;
        let mut text: Option<String> = None;
        let mut html: Option<String> = None;
        let mut files: Option<Vec<String>> = None;
        let mut png: Option<Vec<u8>> = None;

        let mut s = String::new();
        if formats::Unicode.read_clipboard(&mut s).is_ok()
            && !s.is_empty()
            && s.len() < MAX_TEXT_BYTES
        {
            text = Some(s);
        }
        let mut f: Vec<String> = Vec::new();
        if formats::FileList.read_clipboard(&mut f).is_ok() && !f.is_empty() {
            files = Some(f);
        }
        // clipboard-win parses the CF_HTML header and returns the fragment only
        let mut h = String::new();
        if formats::Html::new()
            .and_then(|hf| hf.read_clipboard(&mut h).ok())
            .is_some()
            && !h.trim().is_empty()
        {
            html = Some(h);
        }

        if let Some(fmt) = register_format("PNG") {
            let mut buf: Vec<u8> = Vec::new();
            if formats::RawData(fmt.get()).read_clipboard(&mut buf).is_ok()
                && !buf.is_empty()
                && buf.len() <= MAX_IMAGE_BYTES
            {
                png = Some(buf);
            }
        }
        if png.is_none() {
            let mut dib: Vec<u8> = Vec::new();
            if formats::Bitmap.read_clipboard(&mut dib).is_ok()
                && !dib.is_empty()
                && dib.len() <= MAX_IMAGE_BYTES
            {
                png = dib_to_png(&dib);
            }
        }
        Some((text, html, files, png))
    }

    fn is_url(s: &str) -> bool {
        if s.len() > 2048 || s.contains('\n') || s.contains(' ') {
            return false;
        }
        let lower = s.to_lowercase();
        lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("www.")
    }

    /// Wrap a Windows DIB inside a BMP file header so `image` can decode it.
    fn dib_to_png(dib: &[u8]) -> Option<Vec<u8>> {
        if dib.len() < 40 {
            return None;
        }
        let header_size = u32::from_le_bytes(dib[0..4].try_into().ok()?) as usize;
        let bit_count = u16::from_le_bytes(dib[14..16].try_into().ok()?) as usize;
        let clr_used = u32::from_le_bytes(dib[32..36].try_into().ok()?) as usize;
        let palette = if clr_used > 0 {
            clr_used * 4
        } else if bit_count <= 8 {
            (1usize << bit_count) * 4
        } else {
            0
        };
        let offset = 14 + header_size + palette;
        let mut bmp = Vec::with_capacity(offset + dib.len());
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&((offset + dib.len()) as u32).to_le_bytes());
        bmp.extend_from_slice(&0u32.to_le_bytes());
        bmp.extend_from_slice(&(offset as u32).to_le_bytes());
        bmp.extend_from_slice(dib);
        let img = image::load_from_memory(&bmp).ok()?;
        let mut out = Vec::new();
        image::DynamicImage::ImageRgba8(img.to_rgba8())
            .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
            .ok()?;
        Some(out)
    }

    /// Encode a PNG into a BMP, then strip the 14-byte file header => DIB.
    fn png_to_dib(png: &[u8]) -> Option<Vec<u8>> {
        let img = image::load_from_memory(png).ok()?;
        let rgba = img.to_rgba8();
        let mut bmp: Vec<u8> = Vec::new();
        {
            let mut cursor = std::io::Cursor::new(&mut bmp);
            let mut encoder = image::codecs::bmp::BmpEncoder::new(&mut cursor);
            encoder
                .encode(
                    rgba.as_raw(),
                    rgba.width(),
                    rgba.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .ok()?;
        }
        if bmp.len() < 14 {
            return None;
        }
        Some(bmp[14..].to_vec())
    }

    unsafe fn set_raw(format: u32, data: &[u8]) -> Result<(), String> {
        if data.is_empty() {
            return Err("بيانات فارغة".into());
        }
        let h = GlobalAlloc(GMEM_MOVEABLE, data.len()).map_err(|e| e.to_string())?;
        let ptr = GlobalLock(h);
        if ptr.is_null() {
            let _ = GlobalFree(h);
            return Err("GlobalLock فشل".into());
        }
        std::ptr::copy_nonoverlapping(data.as_ptr(), ptr as *mut u8, data.len());
        let _ = GlobalUnlock(h);
        // SetClipboardData takes ownership of `h` on success
        if let Err(e) = SetClipboardData(format, HANDLE(h.0)) {
            let _ = GlobalFree(h);
            return Err(format!("SetClipboardData فشل: {e}"));
        }
        Ok(())
    }

    unsafe fn write_hdrop(paths: &[String]) -> Result<(), String> {
        let mut list: Vec<u16> = Vec::new();
        for p in paths {
            let mut units: Vec<u16> = p.encode_utf16().collect();
            units.push(0);
            list.extend_from_slice(&units);
        }
        list.push(0);

        const HDR: usize = 24; // sizeof(DROPFILES) on x64
        let mut buf: Vec<u8> = Vec::with_capacity(HDR + list.len() * 2);
        buf.extend_from_slice(&(HDR as usize).to_le_bytes()); // pFiles
        buf.extend_from_slice(&0i32.to_le_bytes()); // pt.x
        buf.extend_from_slice(&0i32.to_le_bytes()); // pt.y
        buf.extend_from_slice(&0i32.to_le_bytes()); // fNC
        buf.extend_from_slice(&1i32.to_le_bytes()); // fWide = true
        for u in &list {
            buf.extend_from_slice(&u.to_le_bytes());
        }
        set_raw(CF_HDROP, &buf)
    }

    pub fn write_to_clipboard(c: &WriteContent) -> Result<(), String> {
        let _clip = Clipboard::new_attempts(10).map_err(|e| format!("تعذر فتح الحافظة: {e}"))?;
        empty().map_err(|e| e.to_string())?;
        match c.kind {
            "image" => {
                let png = c.png.as_ref().ok_or("لا توجد صورة محفوظة")?;
                let mut any = false;
                if let Some(fmt) = register_format("PNG") {
                    if formats::RawData(fmt.get()).write_clipboard(png).is_ok() {
                        any = true;
                    }
                }
                // DIB guarantees compatibility with Paint/Office/older apps
                if let Some(dib) = png_to_dib(png) {
                    if unsafe { set_raw(CF_DIB, &dib) }.is_ok() {
                        any = true;
                    }
                }
                if any {
                    Ok(())
                } else {
                    Err("تعذر وضع الصورة في الحافظة".into())
                }
            }
            "files" => {
                let files = c.files.ok_or("لا توجد ملفات")?;
                if files.is_empty() {
                    return Err("لا توجد ملفات".into());
                }
                unsafe { write_hdrop(files) }
            }
            _ => {
                let text = c.text.ok_or("لا يوجد نص")?;
                formats::Unicode
                    .write_clipboard(&text)
                    .map_err(|e| e.to_string())?;
                if let Some(html) = c.html {
                    // clipboard-win builds the CF_HTML header around the fragment
                    if let Some(hf) = formats::Html::new() {
                        let _ = hf.write_clipboard(&html);
                    }
                }
                Ok(())
            }
        }
    }

    /// Name of the executable that owns the clipboard, lowercased.
    pub fn query_source_app() -> Option<String> {
        unsafe {
            let hwnd = GetClipboardOwner().ok()?;
            if hwnd.is_invalid() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .ok()?;
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            Some(
                path.rsplit(['\\', '/'])
                    .next()
                    .unwrap_or(&path)
                    .to_lowercase(),
            )
        }
    }

    pub fn simulate_paste() {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_CONTROL,
        };
        std::thread::sleep(std::time::Duration::from_millis(45));
        unsafe {
            keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(b'V', 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(b'V', 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}

// ---------------------------------------------------------------------------
// Stub for non-Windows builds (keeps the crate compile-checkable on Linux CI)
// ---------------------------------------------------------------------------
#[cfg(not(windows))]
mod imp {
    use super::{Captured, WriteContent};

    pub fn get_sequence() -> Option<u32> {
        None
    }

    pub fn read_captured(_excluded: &[String]) -> Option<Captured> {
        None
    }

    pub fn write_to_clipboard(_c: &WriteContent) -> Result<(), String> {
        Err("ClipVault يعمل على Windows فقط".into())
    }

    pub fn simulate_paste() {}
}
