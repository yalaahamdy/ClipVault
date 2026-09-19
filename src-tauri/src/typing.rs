use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvertResult {
    pub original: String,
    pub converted: String,
    pub source_lang: String,
    pub target_lang: String,
}

/// Convert a single character between QWERTY and Arabic 101 keyboard mapping.
pub fn map_char_qwerty_to_arabic(c: char) -> Option<&'static str> {
    match c {
        'q' => Some("ض"),
        'w' => Some("ص"),
        'e' => Some("ث"),
        'r' => Some("ق"),
        't' => Some("ف"),
        'y' => Some("غ"),
        'u' => Some("ع"),
        'i' => Some("ه"),
        'o' => Some("خ"),
        'p' => Some("ح"),
        '[' => Some("ج"),
        ']' => Some("د"),
        'a' => Some("ش"),
        's' => Some("س"),
        'd' => Some("ي"),
        'f' => Some("ب"),
        'g' => Some("ل"),
        'h' => Some("ا"),
        'j' => Some("ت"),
        'k' => Some("ن"),
        'l' => Some("م"),
        ';' => Some("ك"),
        '\'' => Some("ط"),
        'z' => Some("ئ"),
        'x' => Some("ء"),
        'c' => Some("ؤ"),
        'v' => Some("ر"),
        'b' => Some("لا"),
        'n' => Some("ى"),
        'm' => Some("ة"),
        ',' => Some("و"),
        '.' => Some("ز"),
        '/' => Some("ظ"),
        '`' => Some("ذ"),
        // Shift characters
        'Q' => Some("َ"),
        'W' => Some("ً"),
        'E' => Some("ُ"),
        'R' => Some("ٌ"),
        'T' => Some("لإ"),
        'Y' => Some("إ"),
        'U' => Some("‘"),
        'I' => Some("÷"),
        'O' => Some("×"),
        'P' => Some("؛"),
        '{' => Some("<"),
        '}' => Some(">"),
        'A' => Some("ِ"),
        'S' => Some("ٍ"),
        'D' => Some("]"),
        'F' => Some("["),
        'G' => Some("لأ"),
        'H' => Some("أ"),
        'J' => Some("ـ"),
        'K' => Some("،"),
        'L' => Some("/"),
        ':' => Some(":"),
        '"' => Some("\""),
        'Z' => Some("~"),
        'X' => Some("ْ"),
        'C' => Some("}"),
        'V' => Some("{"),
        'B' => Some("لآ"),
        'N' => Some("آ"),
        'M' => Some("’"),
        '<' => Some(","),
        '>' => Some("."),
        '?' => Some("؟"),
        '~' => Some("ّ"),
        _ => None,
    }
}

pub fn map_char_arabic_to_qwerty(c: char) -> Option<char> {
    match c {
        'ض' => Some('q'),
        'ص' => Some('w'),
        'ث' => Some('e'),
        'ق' => Some('r'),
        'ف' => Some('t'),
        'غ' => Some('y'),
        'ع' => Some('u'),
        'ه' => Some('i'),
        'خ' => Some('o'),
        'ح' => Some('p'),
        'ج' => Some('['),
        'د' => Some(']'),
        'ش' => Some('a'),
        'س' => Some('s'),
        'ي' => Some('d'),
        'ب' => Some('f'),
        'ل' => Some('g'),
        'ا' => Some('h'),
        'ت' => Some('j'),
        'ن' => Some('k'),
        'م' => Some('l'),
        'ك' => Some(';'),
        'ط' => Some('\''),
        'ئ' => Some('z'),
        'ء' => Some('x'),
        'ؤ' => Some('c'),
        'ر' => Some('v'),
        'ى' => Some('n'),
        'ة' => Some('m'),
        'و' => Some(','),
        'ز' => Some('.'),
        'ظ' => Some('/'),
        'ذ' => Some('`'),
        // Diacritics and Shift Arabic
        'َ' => Some('Q'),
        'ً' => Some('W'),
        'ُ' => Some('E'),
        'ٌ' => Some('R'),
        'إ' => Some('Y'),
        'ِ' => Some('A'),
        'ٍ' => Some('S'),
        'أ' => Some('H'),
        'ـ' => Some('J'),
        '،' => Some('K'),
        'ْ' => Some('X'),
        'آ' => Some('N'),
        '؟' => Some('?'),
        '؛' => Some('P'),
        'ّ' => Some('~'),
        _ => None,
    }
}

/// Invert or convert text between English and Arabic layouts automatically.
pub fn invert_layout(text: &str) -> InvertResult {
    let mut arabic_count = 0;
    let mut english_count = 0;

    for c in text.chars() {
        if ('\u{0600}'..='\u{06FF}').contains(&c) {
            arabic_count += 1;
        } else if c.is_ascii_alphabetic() {
            english_count += 1;
        }
    }

    let is_arabic_source = arabic_count >= english_count && arabic_count > 0;
    let mut converted = String::with_capacity(text.len() * 2);

    if is_arabic_source {
        // Arabic -> English
        let chars: Vec<char> = text.chars().collect();
        let mut i = 0;
        while i < chars.len() {
            // Check 2-character ligatures like "لا"
            if i + 1 < chars.len() && chars[i] == 'ل' && chars[i + 1] == 'ا' {
                converted.push('b');
                i += 2;
                continue;
            }
            if i + 1 < chars.len() && chars[i] == 'ل' && chars[i + 1] == 'إ' {
                converted.push('T');
                i += 2;
                continue;
            }
            if i + 1 < chars.len() && chars[i] == 'ل' && chars[i + 1] == 'أ' {
                converted.push('G');
                i += 2;
                continue;
            }
            if i + 1 < chars.len() && chars[i] == 'ل' && chars[i + 1] == 'آ' {
                converted.push('B');
                i += 2;
                continue;
            }

            let c = chars[i];
            if let Some(mapped) = map_char_arabic_to_qwerty(c) {
                converted.push(mapped);
            } else {
                converted.push(c);
            }
            i += 1;
        }

        InvertResult {
            original: text.to_string(),
            converted,
            source_lang: "ar".to_string(),
            target_lang: "en".to_string(),
        }
    } else {
        // English -> Arabic
        for c in text.chars() {
            if let Some(mapped) = map_char_qwerty_to_arabic(c) {
                converted.push_str(mapped);
            } else {
                converted.push(c);
            }
        }

        InvertResult {
            original: text.to_string(),
            converted,
            source_lang: "en".to_string(),
            target_lang: "ar".to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// System-Wide Keyboard Hooks & Selection Manipulation
// ---------------------------------------------------------------------------

#[cfg(windows)]
pub fn simulate_copy() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_CONTROL,
    };
    unsafe {
        keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'C', 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(b'C', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[cfg(windows)]
pub fn get_selected_text_from_active_window() -> String {
    use clipboard_win::{formats, Clipboard, Getter};
    simulate_copy();
    std::thread::sleep(std::time::Duration::from_millis(80));
    let mut current_text = String::new();
    if let Ok(_clip) = Clipboard::new_attempts(10) {
        let _ = formats::Unicode.read_clipboard(&mut current_text);
    }
    current_text
}

#[cfg(not(windows))]
pub fn get_selected_text_from_active_window() -> String {
    String::new()
}

#[cfg(windows)]
pub fn fix_selected_text_in_active_window() -> Result<String, String> {
    use clipboard_win::{formats, Clipboard, Getter, Setter};

    // 1. Simulate Ctrl+C to copy current active selection
    simulate_copy();
    std::thread::sleep(std::time::Duration::from_millis(70));

    // 2. Read selection from clipboard
    let _clip = Clipboard::new_attempts(10).map_err(|e| e.to_string())?;
    let mut current_text = String::new();
    formats::Unicode.read_clipboard(&mut current_text).map_err(|e| e.to_string())?;

    if current_text.trim().is_empty() {
        return Err("لم يتم تحديد أي نص في التطبيق النشط.".to_string());
    }

    // 3. Invert layout
    let result = invert_layout(&current_text);

    // 4. Write converted text to clipboard
    formats::Unicode
        .write_clipboard(&result.converted)
        .map_err(|e| e.to_string())?;
    drop(_clip);

    // 5. Simulate Ctrl+V to replace selection immediately
    crate::clipboard_io::simulate_paste();

    Ok(result.converted)
}

#[cfg(windows)]
pub fn inject_text_into_active_window(text: &str) -> Result<(), String> {
    use clipboard_win::{formats, Clipboard, Setter};

    {
        let _clip = Clipboard::new_attempts(10).map_err(|e| e.to_string())?;
        formats::Unicode
            .write_clipboard(&text)
            .map_err(|e| e.to_string())?;
    }

    crate::clipboard_io::simulate_paste();
    Ok(())
}

#[cfg(not(windows))]
pub fn fix_selected_text_in_active_window() -> Result<String, String> {
    Err("يعمل على Windows فقط".to_string())
}

#[cfg(not(windows))]
pub fn inject_text_into_active_window(_text: &str) -> Result<(), String> {
    Err("يعمل على Windows فقط".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qwerty_to_arabic() {
        // "الاستخدام" on English layout:
        // h=ا, g=ل, h=ا, s=س, j=ت, o=خ, ]=د, h=ا, l=م
        let res = invert_layout("hghsjo]hl");
        assert_eq!(res.converted, "الاستخدام");
        assert_eq!(res.source_lang, "en");
        assert_eq!(res.target_lang, "ar");
    }

    #[test]
    fn test_arabic_to_qwerty() {
        // "www.google.com" on Arabic layout:
        // w=ص, .=ز, g=ل, o=خ, l=م, e=ث, c=ؤ, m=ة
        let res = invert_layout("صصصزلخخلمثزؤخة");
        assert_eq!(res.converted, "www.google.com");
        assert_eq!(res.source_lang, "ar");
        assert_eq!(res.target_lang, "en");
    }

    #[test]
    fn test_ligatures_and_shifts() {
        let res = invert_layout("لا لإ لأ لآ");
        assert_eq!(res.converted, "b T G B");

        let back = invert_layout("b T G B");
        assert_eq!(back.converted, "لا لإ لأ لآ");
    }
}
