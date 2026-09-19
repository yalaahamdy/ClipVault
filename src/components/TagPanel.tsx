import { useEffect, useState } from "react";
import type { TagWithCount, CollectionWithCount } from "../types";
import { api } from "../api";
import { Icon } from "../icons";
import { TAG_COLORS } from "../utils";

export type OrgFilter =
  | { type: "tag"; id: number; name: string; color: string }
  | { type: "collection"; id: number; name: string };

interface Props {
  open: boolean;
  active: OrgFilter | null;
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  onChanged: () => void;
  onFilter: (f: OrgFilter | null) => void;
  onClose: () => void;
}

export function TagPanel({ open, active, tags, collections, onChanged, onFilter, onClose }: Props) {
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [newColName, setNewColName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) { setError(""); setNewTagName(""); setNewColName(""); }
  }, [open]);

  if (!open) return null;

  const addTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      await api.createTag(name, newTagColor);
      setNewTagName("");
      setError("");
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  const addCollection = async () => {
    const name = newColName.trim();
    if (!name) return;
    try {
      await api.createCollection(name);
      setNewColName("");
      setError("");
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="side-panel" aria-label="التنظيم">
        <div className="panel-head">
          <span>التنظيم</span>
          <button className="icon-btn" onClick={onClose} title="إغلاق"><Icon name="x" size={15} /></button>
        </div>

        <div className="panel-body">
          {/* tags */}
          <div className="panel-section">
            <h4>الوسوم</h4>
            {tags.length === 0 && <div className="org-empty">لا توجد وسوم بعد — أنشئ أول وسم أدناه.</div>}
            {tags.map((t) => (
              <div
                key={t.id}
                className={`org-row${active?.type === "tag" && active.id === t.id ? " active" : ""}`}
                onClick={() => onFilter(
                  active?.type === "tag" && active.id === t.id
                    ? null
                    : { type: "tag", id: t.id, name: t.name, color: t.color },
                )}
              >
                <span className="org-dot" style={{ background: t.color }} />
                <span className="org-name">{t.name}</span>
                <span className="org-count">{t.count}</span>
                <button
                  className="org-del"
                  title="حذف الوسم"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (active?.type === "tag" && active.id === t.id) onFilter(null);
                    await api.deleteTag(t.id);
                    onChanged();
                  }}
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            <div className="panel-add">
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                placeholder="وسم جديد…"
                maxLength={32}
              />
              <button className="btn primary icon-only" onClick={addTag} title="إضافة وسم">
                <Icon name="plus" size={14} />
              </button>
            </div>
            <div className="swatches">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch${newTagColor === c ? " on" : ""}`}
                  style={{ background: c }}
                  onClick={() => setNewTagColor(c)}
                  aria-label={`لون ${c}`}
                />
              ))}
            </div>
          </div>

          {/* collections */}
          <div className="panel-section">
            <h4>المجموعات</h4>
            {collections.length === 0 && <div className="org-empty">المجموعات تجمع عناصر ذات صلة معًا.</div>}
            {collections.map((c) => (
              <div
                key={c.id}
                className={`org-row${active?.type === "collection" && active.id === c.id ? " active" : ""}`}
                onClick={() => onFilter(
                  active?.type === "collection" && active.id === c.id
                    ? null
                    : { type: "collection", id: c.id, name: c.name },
                )}
              >
                <span className="ctx-ico"><Icon name="folder" size={14} /></span>
                <span className="org-name">{c.name}</span>
                <span className="org-count">{c.count}</span>
                <button
                  className="org-del"
                  title="حذف المجموعة"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (active?.type === "collection" && active.id === c.id) onFilter(null);
                    await api.deleteCollection(c.id);
                    onChanged();
                  }}
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            <div className="panel-add">
              <input
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCollection()}
                placeholder="مجموعة جديدة…"
                maxLength={48}
              />
              <button className="btn primary icon-only" onClick={addCollection} title="إضافة مجموعة">
                <Icon name="plus" size={14} />
              </button>
            </div>
          </div>

          {error && <div className="org-empty" style={{ color: "var(--danger)" }}>{error}</div>}
        </div>
      </aside>
    </>
  );
}
