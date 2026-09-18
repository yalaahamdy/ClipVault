use serde::{Deserialize, Serialize};

/// A saved clipboard entry.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: i64,
    /// "text" | "link" | "image" | "files"
    pub kind: String,
    pub text: Option<String>,
    pub html: Option<String>,
    pub files: Option<Vec<String>>,
    pub image: bool,
    pub source_app: Option<String>,
    pub ocr_text: Option<String>,
    pub pinned: bool,
    pub favorite: bool,
    pub sensitive: bool,
    pub created_at: i64,
    pub last_used_at: i64,
    pub use_count: i64,
    pub tags: Vec<TagDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagDto {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionDto {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemsPage {
    pub items: Vec<Item>,
    pub total: i64,
    pub has_more: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemsQuery {
    pub filter: String,
    pub query: Option<String>,
    pub limit: i64,
    pub offset: i64,
    pub tag_id: Option<i64>,
    pub collection_id: Option<i64>,
    pub order_by: Option<String>,
    pub source_app: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAppStat {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub total: i64,
    pub pinned: i64,
    pub favorites: i64,
    pub texts: i64,
    pub images: i64,
    pub links: i64,
    pub files: i64,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultItem {
    pub id: i64,
    pub category: String, // "login" | "card" | "note"
    pub title: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub website: Option<String>,
    pub notes: Option<String>,
    pub card_number: Option<String>,
    pub card_expiry: Option<String>,
    pub card_cvv: Option<String>,
    pub favorite: bool,
    pub strength: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultItemInput {
    pub id: Option<i64>,
    pub category: String,
    pub title: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub website: Option<String>,
    pub notes: Option<String>,
    pub card_number: Option<String>,
    pub card_expiry: Option<String>,
    pub card_cvv: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub is_setup: bool,
    pub is_locked: bool,
    pub auto_lock_minutes: i64,
    pub total_items: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultAuditReport {
    pub total: i64,
    pub weak_count: i64,
    pub reused_count: i64,
    pub strong_count: i64,
    pub weak_item_ids: Vec<i64>,
    pub reused_item_ids: Vec<i64>,
}

