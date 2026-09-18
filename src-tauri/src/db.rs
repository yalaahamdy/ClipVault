use rusqlite::types::Value;
use rusqlite::{params, Connection};
use std::path::Path;

use crate::models::{CollectionDto, Item, ItemsPage, ItemsQuery, SourceAppStat, TagDto};

pub struct Db {
    pub conn: Connection,
}

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<(Item, String)> {
    let files_json: Option<String> = row.get("files")?;
    let files: Option<Vec<String>> = files_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok());
    Ok((
        Item {
            id: row.get("id")?,
            kind: row.get("kind")?,
            text: row.get("text")?,
            html: row.get("html")?,
            files,
            image: row.get::<_, i64>("image")? != 0,
            source_app: row.get("source_app")?,
            pinned: row.get::<_, i64>("pinned")? != 0,
            favorite: row.get::<_, i64>("favorite")? != 0,
            sensitive: row.get::<_, i64>("sensitive")? != 0,
            created_at: row.get("created_at")?,
            last_used_at: row.get("last_used_at")?,
            use_count: row.get("use_count")?,
            tags: Vec::new(),
        },
        files_json.unwrap_or_default(),
    ))
}

impl Db {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;",
        )
        .map_err(|e| e.to_string())?;
        Self::migrate(&conn)?;
        Ok(Self { conn })
    }

    fn migrate(conn: &Connection) -> Result<(), String> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS items (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                kind          TEXT NOT NULL,
                text          TEXT,
                html          TEXT,
                files         TEXT,
                image         INTEGER NOT NULL DEFAULT 0,
                source_app    TEXT,
                hash          TEXT NOT NULL,
                pinned        INTEGER NOT NULL DEFAULT 0,
                favorite      INTEGER NOT NULL DEFAULT 0,
                sensitive     INTEGER NOT NULL DEFAULT 0,
                created_at    INTEGER NOT NULL,
                last_used_at  INTEGER NOT NULL,
                use_count     INTEGER NOT NULL DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS idx_items_last_used ON items(last_used_at DESC);
            CREATE INDEX IF NOT EXISTS idx_items_hash      ON items(hash);
            CREATE INDEX IF NOT EXISTS idx_items_kind      ON items(kind);

            CREATE TABLE IF NOT EXISTS tags (
                id     INTEGER PRIMARY KEY AUTOINCREMENT,
                name   TEXT NOT NULL UNIQUE,
                color  TEXT NOT NULL DEFAULT '#3fb6ff'
            );
            CREATE TABLE IF NOT EXISTS item_tags (
                item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
                PRIMARY KEY (item_id, tag_id)
            );

            CREATE TABLE IF NOT EXISTS collections (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                name  TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS item_collections (
                item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                PRIMARY KEY (item_id, collection_id)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS vault_settings (
                id                INTEGER PRIMARY KEY CHECK (id = 1),
                pin_hash          TEXT NOT NULL,
                pin_salt          TEXT NOT NULL,
                auto_lock_minutes INTEGER NOT NULL DEFAULT 15
            );

            CREATE TABLE IF NOT EXISTS vault_items (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                category        TEXT NOT NULL,
                title           TEXT NOT NULL,
                username        TEXT,
                password_enc    TEXT,
                website         TEXT,
                notes_enc       TEXT,
                card_number_enc TEXT,
                card_expiry     TEXT,
                card_cvv_enc    TEXT,
                favorite        INTEGER NOT NULL DEFAULT 0,
                created_at      INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_vault_category ON vault_items(category);
            CREATE INDEX IF NOT EXISTS idx_vault_fav ON vault_items(favorite);
            "#,
        )
        .map_err(|e| e.to_string())
    }

    // ---------- settings ----------

    pub fn get_setting(&self, key: &str) -> Option<String> {
        self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO settings(key, value) VALUES(?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ---------- items ----------

    /// Returns existing item id for a content hash (most recent match).
    pub fn find_by_hash(&self, hash: &str) -> Option<i64> {
        self.conn
            .query_row(
                "SELECT id FROM items WHERE hash = ?1 ORDER BY last_used_at DESC LIMIT 1",
                params![hash],
                |r| r.get(0),
            )
            .ok()
    }

    pub fn touch_item(&self, id: i64, now: i64) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE items SET last_used_at = ?1, use_count = use_count + 1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn insert_item(
        &self,
        kind: &str,
        text: Option<&str>,
        html: Option<&str>,
        files: Option<&Vec<String>>,
        image: bool,
        source_app: Option<&str>,
        hash: &str,
        now: i64,
    ) -> Result<i64, String> {
        let files_json = files.map(|f| serde_json::to_string(f).unwrap_or_default());
        self.conn
            .execute(
                "INSERT INTO items(kind, text, html, files, image, source_app, hash, created_at, last_used_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                params![
                    kind,
                    text,
                    html,
                    files_json,
                    image as i64,
                    source_app,
                    hash,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Build WHERE fragments + bind values for filter/query/tag/collection.
    fn build_where(q: &ItemsQuery) -> (String, Vec<Value>) {
        let mut where_sql = String::from("1=1");
        let mut vals: Vec<Value> = Vec::new();
        match q.filter.as_str() {
            "text" => where_sql.push_str(" AND kind IN ('text','link') AND kind = 'text'"),
            "image" => where_sql.push_str(" AND kind = 'image'"),
            "link" => where_sql.push_str(" AND kind = 'link'"),
            "files" => where_sql.push_str(" AND kind = 'files'"),
            "favorite" => where_sql.push_str(" AND favorite = 1"),
            "pinned" => where_sql.push_str(" AND pinned = 1"),
            _ => {}
        }
        if let Some(tag_id) = q.tag_id {
            where_sql
                .push_str(" AND id IN (SELECT item_id FROM item_tags WHERE tag_id = ?)");
            vals.push(Value::Integer(tag_id));
        }
        if let Some(col_id) = q.collection_id {
            where_sql.push_str(
                " AND id IN (SELECT item_id FROM item_collections WHERE collection_id = ?)",
            );
            vals.push(Value::Integer(col_id));
        }
        if let Some(ref app) = q.source_app {
            if !app.trim().is_empty() {
                where_sql.push_str(" AND LOWER(COALESCE(source_app, '')) = LOWER(?)");
                vals.push(Value::Text(app.trim().to_string()));
            }
        }
        if let Some(query) = q.query.as_deref() {
            for token in query.split_whitespace().take(8) {
                let escaped = token
                    .replace('\\', "\\\\")
                    .replace('%', "\\%")
                    .replace('_', "\\_");
                let pat = format!("%{}%", escaped.to_lowercase());
                where_sql.push_str(
                    " AND (LOWER(COALESCE(text, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(source_app, '')) LIKE ? ESCAPE '\\')",
                );
                vals.push(Value::Text(pat.clone()));
                vals.push(Value::Text(pat));
            }
        }
        (where_sql, vals)
    }

    pub fn query_items(&self, q: &ItemsQuery) -> Result<ItemsPage, String> {
        let (where_sql, vals) = Self::build_where(q);
        let limit = q.limit.clamp(1, 500);
        let offset = q.offset.max(0);

        let total: i64 = {
            let sql = format!("SELECT COUNT(*) FROM items WHERE {}", where_sql);
            let mut stmt = self.conn.prepare(&sql).map_err(|e| e.to_string())?;
            stmt.query_row(rusqlite::params_from_iter(vals.iter()), |r| r.get(0))
                .map_err(|e| e.to_string())?
        };

        let order_sql = match q.order_by.as_deref() {
            Some("time_asc") => "pinned DESC, last_used_at ASC, id ASC",
            Some("use_count_desc") => "pinned DESC, use_count DESC, last_used_at DESC",
            Some("source_asc") => "pinned DESC, LOWER(COALESCE(source_app, 'zzz')) ASC, last_used_at DESC",
            Some("source_desc") => "pinned DESC, LOWER(COALESCE(source_app, '')) DESC, last_used_at DESC",
            Some("length_desc") => "pinned DESC, LENGTH(COALESCE(text, '')) DESC, last_used_at DESC",
            Some("alpha_asc") => "pinned DESC, LOWER(COALESCE(text, '')) ASC, last_used_at DESC",
            _ => "pinned DESC, last_used_at DESC, id DESC",
        };

        let mut items: Vec<Item> = Vec::new();
        {
            let sql = format!(
                "SELECT id, kind, text, html, files, image, source_app, pinned, favorite,
                        sensitive, created_at, last_used_at, use_count
                 FROM items WHERE {}
                 ORDER BY {}
                 LIMIT {} OFFSET {}",
                where_sql, order_sql, limit, offset
            );
            let mut stmt = self.conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params_from_iter(vals.iter()), map_row)
                .map_err(|e| e.to_string())?;
            for row in rows {
                let (item, _fj) = row.map_err(|e| e.to_string())?;
                items.push(item);
            }
        }

        self.attach_tags(&mut items)?;
        let has_more = (offset + items.len() as i64) < total;
        Ok(ItemsPage {
            items,
            total,
            has_more,
        })
    }

    pub fn get_source_apps(&self) -> Result<Vec<SourceAppStat>, String> {
        let sql = "SELECT COALESCE(source_app, 'أخرى') as app, COUNT(*) as cnt
                   FROM items
                   WHERE source_app IS NOT NULL AND TRIM(source_app) != ''
                   GROUP BY LOWER(source_app)
                   ORDER BY cnt DESC, app ASC";
        let mut stmt = self.conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(SourceAppStat {
                    name: r.get(0)?,
                    count: r.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut res = Vec::new();
        for row in rows {
            res.push(row.map_err(|e| e.to_string())?);
        }
        Ok(res)
    }

    pub fn get_item(&self, id: i64) -> Result<Option<Item>, String> {
        let sql = "SELECT id, kind, text, html, files, image, source_app, pinned, favorite,
                          sensitive, created_at, last_used_at, use_count
                   FROM items WHERE id = ?1";
        let mut stmt = self.conn.prepare(sql).map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![id], map_row)
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(row) => {
                let (mut item, _) = row.map_err(|e| e.to_string())?;
                self.attach_tags(&mut std::slice::from_mut(&mut item))?;
                Ok(Some(item))
            }
            None => Ok(None),
        }
    }

    fn attach_tags(&self, items: &mut [Item]) -> Result<(), String> {
        if items.is_empty() {
            return Ok(());
        }
        let ids: Vec<String> = items.iter().map(|i| i.id.to_string()).collect();
        let sql = format!(
            "SELECT it.item_id, t.id, t.name, t.color
             FROM item_tags it JOIN tags t ON t.id = it.tag_id
             WHERE it.item_id IN ({})",
            ids.join(",")
        );
        let mut stmt = self.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get::<_, i64>(0)?, TagDto {
                    id: r.get(1)?,
                    name: r.get(2)?,
                    color: r.get(3)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (item_id, tag) = row.map_err(|e| e.to_string())?;
            if let Some(item) = items.iter_mut().find(|i| i.id == item_id) {
                item.tags.push(tag.clone());
            }
        }
        Ok(())
    }

    pub fn delete_item(&self, id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM items WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Deletes everything except pinned & favorite items. Returns their ids.
    pub fn clear_history(&self) -> Result<Vec<i64>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM items WHERE pinned = 0 AND favorite = 0")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let mut ids = Vec::new();
        for r in rows {
            ids.push(r.map_err(|e| e.to_string())?);
        }
        self.conn
            .execute("DELETE FROM items WHERE pinned = 0 AND favorite = 0", [])
            .map_err(|e| e.to_string())?;
        Ok(ids)
    }

    pub fn set_flag(&self, id: i64, field: &str, val: bool) -> Result<(), String> {
        // field is only ever one of the whitelisted names below
        let allowed = ["pinned", "favorite", "sensitive"];
        if !allowed.contains(&field) {
            return Err("invalid field".into());
        }
        let sql = format!("UPDATE items SET {} = ?1 WHERE id = ?2", field);
        self.conn
            .execute(&sql, params![val as i64, id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn edit_text(&self, id: i64, text: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE items SET text = ?1, html = NULL WHERE id = ?2",
                params![text, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Deletes non-pinned, non-favorite items older than retention days,
    /// then enforces max item count. Returns number of deleted ids.
    pub fn prune(&self, retention_days: i64, max_items: i64) -> Result<Vec<i64>, String> {
        let mut deleted: Vec<i64> = Vec::new();
        if retention_days > 0 {
            let cutoff = crate::models::now_ms() - retention_days * 86_400_000;
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT id FROM items
                     WHERE pinned = 0 AND favorite = 0 AND last_used_at < ?1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![cutoff], |r| r.get(0)).map_err(|e| e.to_string())?;
            for r in rows {
                deleted.push(r.map_err(|e| e.to_string())?);
            }
        }
        if max_items > 0 {
            let mut stmt = self
                .conn
                .prepare(
                    "SELECT id FROM items
                     WHERE pinned = 0 AND favorite = 0
                     ORDER BY last_used_at DESC, id DESC
                     LIMIT -1 OFFSET ?1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![max_items], |r| r.get(0)).map_err(|e| e.to_string())?;
            for r in rows {
                deleted.push(r.map_err(|e| e.to_string())?);
            }
        }
        for &id in &deleted {
            self.conn
                .execute("DELETE FROM items WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        Ok(deleted)
    }

    pub fn count_all(&self) -> Result<i64, String> {
        self.conn
            .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
            .map_err(|e| e.to_string())
    }

    pub fn all_ids(&self) -> Result<Vec<i64>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM items")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r.map_err(|e| e.to_string())?);
        }
        Ok(v)
    }

    // ---------- tags ----------

    pub fn list_tags(&self) -> Result<Vec<(TagDto, i64)>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT t.id, t.name, t.color, COUNT(it.item_id) AS cnt
                 FROM tags t LEFT JOIN item_tags it ON it.tag_id = t.id
                 GROUP BY t.id ORDER BY t.name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    TagDto {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        color: r.get(2)?,
                    },
                    r.get(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r.map_err(|e| e.to_string())?);
        }
        Ok(v)
    }

    pub fn create_tag(&self, name: &str, color: &str) -> Result<TagDto, String> {
        self.conn
            .execute(
                "INSERT OR IGNORE INTO tags(name, color) VALUES(?1, ?2)",
                params![name, color],
            )
            .map_err(|e| e.to_string())?;
        let id: i64 = self
            .conn
            .query_row("SELECT id FROM tags WHERE name = ?1", params![name], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        Ok(TagDto {
            id,
            name: name.to_string(),
            color: color.to_string(),
        })
    }

    pub fn delete_tag(&self, id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM tags WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn toggle_item_tag(&self, item_id: i64, tag_id: i64) -> Result<bool, String> {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
                params![item_id, tag_id],
                |r| r.get::<_, i64>(0).map(|c| c > 0),
            )
            .map_err(|e| e.to_string())?;
        if exists {
            self.conn
                .execute(
                    "DELETE FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
                    params![item_id, tag_id],
                )
                .map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            self.conn
                .execute(
                    "INSERT OR IGNORE INTO item_tags(item_id, tag_id) VALUES(?1, ?2)",
                    params![item_id, tag_id],
                )
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }

    // ---------- collections ----------

    pub fn list_collections(&self) -> Result<Vec<(CollectionDto, i64)>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT c.id, c.name, COUNT(ic.item_id) AS cnt
                 FROM collections c LEFT JOIN item_collections ic ON ic.collection_id = c.id
                 GROUP BY c.id ORDER BY c.name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    CollectionDto {
                        id: r.get(0)?,
                        name: r.get(1)?,
                    },
                    r.get(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r.map_err(|e| e.to_string())?);
        }
        Ok(v)
    }

    pub fn create_collection(&self, name: &str) -> Result<CollectionDto, String> {
        self.conn
            .execute("INSERT OR IGNORE INTO collections(name) VALUES(?1)", params![name])
            .map_err(|e| e.to_string())?;
        let id: i64 = self
            .conn
            .query_row("SELECT id FROM collections WHERE name = ?1", params![name], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        Ok(CollectionDto {
            id,
            name: name.to_string(),
        })
    }

    pub fn delete_collection(&self, id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM collections WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn toggle_item_collection(&self, item_id: i64, col_id: i64) -> Result<bool, String> {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM item_collections WHERE item_id = ?1 AND collection_id = ?2",
                params![item_id, col_id],
                |r| r.get::<_, i64>(0).map(|c| c > 0),
            )
            .map_err(|e| e.to_string())?;
        if exists {
            self.conn
                .execute(
                    "DELETE FROM item_collections WHERE item_id = ?1 AND collection_id = ?2",
                    params![item_id, col_id],
                )
                .map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            self.conn
                .execute(
                    "INSERT OR IGNORE INTO item_collections(item_id, collection_id) VALUES(?1, ?2)",
                    params![item_id, col_id],
                )
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }

    // ---------- stats ----------

    pub fn stats(&self) -> Result<crate::models::Stats, String> {
        let q = |sql: &str| -> Result<i64, String> {
            self.conn
                .query_row(sql, [], |r| r.get(0))
                .map_err(|e| e.to_string())
        };
        Ok(crate::models::Stats {
            total: q("SELECT COUNT(*) FROM items")?,
            pinned: q("SELECT COUNT(*) FROM items WHERE pinned = 1")?,
            favorites: q("SELECT COUNT(*) FROM items WHERE favorite = 1")?,
            texts: q("SELECT COUNT(*) FROM items WHERE kind = 'text'")?,
            images: q("SELECT COUNT(*) FROM items WHERE kind = 'image'")?,
            links: q("SELECT COUNT(*) FROM items WHERE kind = 'link'")?,
            files: q("SELECT COUNT(*) FROM items WHERE kind = 'files'")?,
        })
    }

    // ---------- password vault ----------

    pub fn vault_is_setup(&self) -> bool {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM vault_settings WHERE id = 1",
                [],
                |r| r.get::<_, i64>(0).map(|c| c > 0),
            )
            .unwrap_or(false)
    }

    pub fn vault_get_security(&self) -> Result<Option<(String, String, i64)>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT pin_hash, pin_salt, auto_lock_minutes FROM vault_settings WHERE id = 1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        if let Some(row) = rows.next() {
            row.map(Some).map_err(|e| e.to_string())
        } else {
            Ok(None)
        }
    }

    pub fn vault_setup(&self, pin_hash: &str, pin_salt: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO vault_settings(id, pin_hash, pin_salt, auto_lock_minutes)
                 VALUES(1, ?1, ?2, 15)
                 ON CONFLICT(id) DO UPDATE SET pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt",
                params![pin_hash, pin_salt],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn vault_count_items(&self) -> Result<i64, String> {
        self.conn
            .query_row("SELECT COUNT(*) FROM vault_items", [], |r| r.get(0))
            .map_err(|e| e.to_string())
    }

    pub fn vault_get_all_raw(&self) -> Result<Vec<RawVaultRow>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, category, title, username, password_enc, website,
                        notes_enc, card_number_enc, card_expiry, card_cvv_enc,
                        favorite, created_at, updated_at
                 FROM vault_items
                 ORDER BY favorite DESC, updated_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |r| {
                Ok(RawVaultRow {
                    id: r.get(0)?,
                    category: r.get(1)?,
                    title: r.get(2)?,
                    username: r.get(3)?,
                    password_enc: r.get(4)?,
                    website: r.get(5)?,
                    notes_enc: r.get(6)?,
                    card_number_enc: r.get(7)?,
                    card_expiry: r.get(8)?,
                    card_cvv_enc: r.get(9)?,
                    favorite: r.get::<_, i64>(10)? != 0,
                    created_at: r.get(11)?,
                    updated_at: r.get(12)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn vault_insert_item(&self, row: &RawVaultRow) -> Result<i64, String> {
        self.conn
            .execute(
                "INSERT INTO vault_items(
                    category, title, username, password_enc, website,
                    notes_enc, card_number_enc, card_expiry, card_cvv_enc,
                    favorite, created_at, updated_at
                ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    row.category,
                    row.title,
                    row.username,
                    row.password_enc,
                    row.website,
                    row.notes_enc,
                    row.card_number_enc,
                    row.card_expiry,
                    row.card_cvv_enc,
                    row.favorite as i64,
                    row.created_at,
                    row.updated_at,
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn vault_update_item(&self, row: &RawVaultRow) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE vault_items SET
                    category = ?1,
                    title = ?2,
                    username = ?3,
                    password_enc = ?4,
                    website = ?5,
                    notes_enc = ?6,
                    card_number_enc = ?7,
                    card_expiry = ?8,
                    card_cvv_enc = ?9,
                    favorite = ?10,
                    updated_at = ?11
                 WHERE id = ?12",
                params![
                    row.category,
                    row.title,
                    row.username,
                    row.password_enc,
                    row.website,
                    row.notes_enc,
                    row.card_number_enc,
                    row.card_expiry,
                    row.card_cvv_enc,
                    row.favorite as i64,
                    row.updated_at,
                    row.id,
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn vault_delete_item(&self, id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM vault_items WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn vault_toggle_favorite(&self, id: i64) -> Result<bool, String> {
        let current: i64 = self
            .conn
            .query_row(
                "SELECT favorite FROM vault_items WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let new_fav = if current == 0 { 1 } else { 0 };
        self.conn
            .execute(
                "UPDATE vault_items SET favorite = ?1 WHERE id = ?2",
                params![new_fav, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(new_fav != 0)
    }
}

#[derive(Debug, Clone)]
pub struct RawVaultRow {
    pub id: i64,
    pub category: String,
    pub title: String,
    pub username: Option<String>,
    pub password_enc: Option<String>,
    pub website: Option<String>,
    pub notes_enc: Option<String>,
    pub card_number_enc: Option<String>,
    pub card_expiry: Option<String>,
    pub card_cvv_enc: Option<String>,
    pub favorite: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

