//! ClipVault — Secure Vault Cryptography & Utilities.
//! Provides AES-256-GCM encryption, key derivation, and password audit.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

/// Derives a 32-byte AES-256 key from a PIN or Master Password and salt
/// using 10,000 iterations of SHA-256 hashing.
pub fn derive_key(password: &str, salt: &[u8]) -> [u8; 32] {
    let mut hash = Sha256::digest([password.as_bytes(), salt].concat());
    for _ in 0..10_000 {
        let mut hasher = Sha256::new();
        hasher.update(&hash);
        hasher.update(password.as_bytes());
        hash = hasher.finalize();
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&hash);
    key
}

/// Generates a cryptographic 16-byte random salt encoded in Base64.
pub fn generate_salt() -> String {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    base64::engine::general_purpose::STANDARD.encode(salt)
}

/// Encrypts plaintext string using AES-256-GCM with a random 12-byte nonce.
/// Returns Base64-encoded [nonce (12 bytes) + ciphertext + tag].
pub fn encrypt(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption error: {}", e))?;

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(base64::engine::general_purpose::STANDARD.encode(&combined))
}

/// Decrypts Base64-encoded [nonce (12 bytes) + ciphertext + tag] using AES-256-GCM.
pub fn decrypt(cipher_b64: &str, key: &[u8; 32]) -> Result<String, String> {
    let combined = base64::engine::general_purpose::STANDARD
        .decode(cipher_b64.trim())
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    if combined.len() < 12 {
        return Err("Encrypted payload too short".to_string());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Failed to decrypt: invalid key or corrupted data".to_string())?;

    String::from_utf8(plaintext_bytes).map_err(|e| format!("Corrupted plaintext UTF-8: {}", e))
}

/// Evaluates password strength from 0 (very weak) to 4 (very strong).
pub fn evaluate_password_strength(password: &str) -> i32 {
    if password.is_empty() {
        return 0;
    }
    let mut score = 0;
    if password.len() >= 8 {
        score += 1;
    }
    if password.len() >= 12 {
        score += 1;
    }
    let has_lower = password.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = password.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    let has_special = password.chars().any(|c| !c.is_ascii_alphanumeric());

    let variety =
        (has_lower as i32) + (has_upper as i32) + (has_digit as i32) + (has_special as i32);
    if variety >= 3 {
        score += 1;
    }
    if variety == 4 && password.len() >= 14 {
        score += 1;
    }

    score.min(4)
}

#[derive(Debug, Clone)]
pub struct ChromeLoginRecord {
    pub name: String,
    pub url: String,
    pub username: String,
    pub password: String,
    pub note: String,
}

/// Robust RFC 4180 compliant CSV parser specifically tuned for Google Chrome Passwords CSV export.
pub fn parse_chrome_csv(csv_content: &str) -> Vec<ChromeLoginRecord> {
    let mut records = Vec::new();
    let chars: Vec<char> = csv_content.chars().collect();
    let len = chars.len();
    let mut i = 0;

    let mut current_record: Vec<String> = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;

    while i < len {
        let c = chars[i];

        if in_quotes {
            if c == '"' {
                if i + 1 < len && chars[i + 1] == '"' {
                    current_field.push('"');
                    i += 1;
                } else {
                    in_quotes = false;
                }
            } else {
                current_field.push(c);
            }
        } else if c == '"' {
            in_quotes = true;
        } else if c == ',' {
            current_record.push(current_field.trim().to_string());
            current_field.clear();
        } else if c == '\n' || c == '\r' {
            if c == '\r' && i + 1 < len && chars[i + 1] == '\n' {
                i += 1;
            }
            current_record.push(current_field.trim().to_string());
            current_field.clear();

            if !current_record.is_empty() && current_record.iter().any(|f| !f.is_empty()) {
                let first_lower = current_record[0].to_lowercase();
                if first_lower != "name" || current_record.len() < 4 {
                    let name = current_record.first().cloned().unwrap_or_default();
                    let url = current_record.get(1).cloned().unwrap_or_default();
                    let username = current_record.get(2).cloned().unwrap_or_default();
                    let password = current_record.get(3).cloned().unwrap_or_default();
                    let note = current_record.get(4).cloned().unwrap_or_default();

                    if !name.is_empty() || !url.is_empty() || !username.is_empty() {
                        records.push(ChromeLoginRecord {
                            name,
                            url,
                            username,
                            password,
                            note,
                        });
                    }
                }
            }
            current_record.clear();
        } else {
            current_field.push(c);
        }
        i += 1;
    }

    if !current_field.is_empty() || !current_record.is_empty() {
        current_record.push(current_field.trim().to_string());
        let first_lower = current_record[0].to_lowercase();
        if first_lower != "name" || current_record.len() < 4 {
            let name = current_record.first().cloned().unwrap_or_default();
            let url = current_record.get(1).cloned().unwrap_or_default();
            let username = current_record.get(2).cloned().unwrap_or_default();
            let password = current_record.get(3).cloned().unwrap_or_default();
            let note = current_record.get(4).cloned().unwrap_or_default();

            if !name.is_empty() || !url.is_empty() || !username.is_empty() {
                records.push(ChromeLoginRecord {
                    name,
                    url,
                    username,
                    password,
                    note,
                });
            }
        }
    }

    records
}

/// Formats a single field according to RFC 4180 CSV standard.
fn escape_csv_field(val: &str) -> String {
    if val.contains(',') || val.contains('"') || val.contains('\n') || val.contains('\r') {
        let escaped = val.replace('"', "\"\"");
        format!("\"{}\"", escaped)
    } else {
        val.to_string()
    }
}

/// Generates a standard Chrome-compatible CSV string from vault login items.
pub fn generate_chrome_csv(items: &[crate::models::VaultItem]) -> String {
    let mut out = String::from("name,url,username,password,note\n");
    for it in items {
        if it.category != "login" {
            continue;
        }
        let name = escape_csv_field(&it.title);
        let url = escape_csv_field(it.website.as_deref().unwrap_or(""));
        let username = escape_csv_field(it.username.as_deref().unwrap_or(""));
        let password = escape_csv_field(it.password.as_deref().unwrap_or(""));
        let note = escape_csv_field(it.notes.as_deref().unwrap_or(""));
        out.push_str(&format!(
            "{},{},{},{},{}\n",
            name, url, username, password, note
        ));
    }
    out
}
