//! QR generation (v1.5) — renders text/URLs into PNG data URLs.
//! Pure-Rust `qrcode` crate, no network, runs fully offline.

/// Generate a QR code for `text` and return it as a PNG data URL.
pub fn png_data_url(text: &str) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("EMPTY_TEXT".into());
    }
    let code = qrcode::QrCode::with_error_correction_level(text.as_bytes(), qrcode::EcLevel::M)
        .map_err(|e| e.to_string())?;
    let img = code
        .render::<image::Luma<u8>>()
        .quiet_zone(true)
        .min_dimensions(320, 320)
        .build();

    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageLuma8(img)
        .write_to(&mut out, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    use base64::Engine;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(out.into_inner())
    ))
}

#[cfg(test)]
mod tests {
    #[test]
    fn generates_png_data_url() {
        let url = super::png_data_url("https://github.com/yalaahamdy/ClipVault").unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
        assert!(url.len() > 500);
    }

    #[test]
    fn rejects_empty() {
        assert!(super::png_data_url("   ").is_err());
    }
}
