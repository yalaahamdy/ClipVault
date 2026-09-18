use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    pub index: i32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub text: String,
    pub lines: Vec<OcrLine>,
}

#[derive(Deserialize)]
struct RawOcrOutput {
    images: Option<Vec<RawOcrImage>>,
}

#[derive(Deserialize)]
struct RawOcrImage {
    text: Option<String>,
    lines: Option<Vec<RawOcrLine>>,
}

#[derive(Deserialize)]
struct RawOcrLine {
    index: Option<i32>,
    text: Option<String>,
}

/// Locate the OneOcrSuiteProfessional executable across various installation and development layouts.
pub fn find_ocr_executable(app: Option<&AppHandle>) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    // 1. Tauri Resource Directory
    if let Some(app) = app {
        if let Ok(resource_dir) = app.path().resource_dir() {
            candidates.push(resource_dir.join("OneOcrProfessional").join("OneOcrSuiteProfessional.exe"));
            candidates.push(resource_dir.join("OneOcrSuiteProfessional.exe"));
        }
    }

    // 2. Relative to current executing binary
    if let Ok(curr_exe) = std::env::current_exe() {
        if let Some(parent) = curr_exe.parent() {
            candidates.push(parent.join("OneOcrProfessional").join("OneOcrSuiteProfessional.exe"));
            candidates.push(parent.join("OneOcrSuiteProfessional.exe"));
            // If in src-tauri/target/debug
            if let Some(grandparent) = parent.parent().and_then(|p| p.parent()) {
                candidates.push(grandparent.join("OneOcrProfessional").join("OneOcrSuiteProfessional.exe"));
            }
        }
    }

    // 3. Current Working Directory and common project locations
    candidates.push(PathBuf::from("OneOcrProfessional").join("OneOcrSuiteProfessional.exe"));
    candidates.push(PathBuf::from("../OneOcrProfessional").join("OneOcrSuiteProfessional.exe"));
    candidates.push(PathBuf::from(r"D:\Downloads\ClipVault-source\OneOcrProfessional\OneOcrSuiteProfessional.exe"));

    for candidate in candidates {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

/// Execute OneOCR in silent CLI mode on a target image file and return extracted text and lines.
pub fn run_ocr_on_file(image_path: &Path, app: Option<&AppHandle>) -> Result<OcrResult, String> {
    if !image_path.exists() {
        return Err(format!("ملف الصورة غير موجود: {}", image_path.display()));
    }

    let exe_path = find_ocr_executable(app)
        .ok_or_else(|| "لم يتم العثور على محرك OneOCR (OneOcrSuiteProfessional.exe).".to_string())?;

    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "تعذر استنتاج مجلد محرك OneOCR.".to_string())?;

    // Create a unique temporary output JSON file path
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp_out = std::env::temp_dir().join(format!("cv_ocr_{}_{}.json", std::process::id(), timestamp));

    let mut cmd = std::process::Command::new(&exe_path);
    cmd.current_dir(exe_dir);
    cmd.args([
        "--cli",
        "--input",
        image_path.to_str().ok_or("مسار الصورة غير صالح.")?,
        "--output",
        temp_out.to_str().ok_or("مسار الإخراج المؤقت غير صالح.")?,
    ]);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("فشل تشغيل محرك OneOCR: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let _ = std::fs::remove_file(&temp_out);
        return Err(format!(
            "محرك OneOCR أنهى العملية بخطأ: {}\n{}",
            stderr.trim(),
            stdout.trim()
        ));
    }

    if !temp_out.exists() {
        return Err("لم يقم محرك OneOCR بإنشاء ملف المخرجات المحدد.".to_string());
    }

    let json_bytes = std::fs::read(&temp_out)
        .map_err(|e| format!("تعذر قراءة مخرجات التعرف الضوئي: {e}"))?;
    let _ = std::fs::remove_file(&temp_out);

    let clean_bytes = if json_bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &json_bytes[3..]
    } else {
        &json_bytes[..]
    };

    let parsed: RawOcrOutput = serde_json::from_slice(clean_bytes)
        .map_err(|e| format!("فشل تحليل بيانات JSON الناتجة عن محرك OneOCR: {e}"))?;

    let mut full_text = String::new();
    let mut lines_res = Vec::new();

    if let Some(images) = parsed.images {
        if let Some(first_img) = images.into_iter().next() {
            if let Some(t) = first_img.text {
                full_text = t;
            }
            if let Some(lines) = first_img.lines {
                for l in lines {
                    if let Some(lt) = l.text {
                        let trimmed = lt.trim().to_string();
                        if !trimmed.is_empty() {
                            lines_res.push(OcrLine {
                                index: l.index.unwrap_or(0),
                                text: trimmed,
                            });
                        }
                    }
                }
            }
        }
    }

    if full_text.trim().is_empty() && !lines_res.is_empty() {
        full_text = lines_res
            .iter()
            .map(|l| l.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
    }

    Ok(OcrResult {
        text: full_text.trim().to_string(),
        lines: lines_res,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_ocr_executable() {
        let exe = find_ocr_executable(None);
        assert!(exe.is_some(), "يجب أن يعثر على OneOcrSuiteProfessional.exe");
        assert!(exe.unwrap().exists());
    }

    #[test]
    fn test_run_ocr_on_logo() {
        let logo_path = PathBuf::from(r"D:\Downloads\ClipVault-source\OneOcrProfessional\logo.png");
        if logo_path.exists() {
            let res = run_ocr_on_file(&logo_path, None);
            assert!(res.is_ok(), "يجب أن ينجح استخراج النص: {:?}", res.err());
            let ocr = res.unwrap();
            assert!(!ocr.text.is_empty(), "يجب أن يحتوي على نص مستخرج");
            println!("Extracted text: {}", ocr.text);
        }
    }
}

