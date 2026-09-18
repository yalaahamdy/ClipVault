import { useEffect, useRef, useState } from "react";
import type { Item, TagWithCount, CollectionWithCount } from "../types";
import { Icon } from "../icons";
import { looksLikeCode } from "../utils";
import { isHtml, isJson, isMarkdown } from "../utils/codeHighlighter";

export interface MenuAction {
  action:
    | "copy" | "pin" | "favorite" | "sensitive" | "edit" | "delete"
    | "open" | "reveal" | "save" | "preview" | "panel"
    | "toggle-tag" | "toggle-collection"
    | "ocr" | "copy-ocr";
  tagId?: number;
  collectionId?: number;
}

interface Props {
  x: number;
  y: number;
  item: Item;
  tags: TagWithCount[];
  collections: CollectionWithCount[];
  onAction: (a: MenuAction, item: Item) => void;
  onClose: () => void;
}

function CtxRow({
  icon, label, danger, check, onClick,
}: {
  icon: string; label: string; danger?: boolean; check?: boolean; onClick: () => void;
}) {
  return (
    <button className={`ctx-item${danger ? " danger" : ""}`} onClick={onClick}>
      {check !== undefined ? (
        <span className="ctx-check" style={{ visibility: check ? "visible" : "hidden" }}>
          <Icon name="check" size={13} />
        </span>
      ) : (
        <span className="ctx-ico"><Icon name={icon} size={14} /></span>
      )}
      <span className="ctx-label">{label}</span>
    </button>
  );
}

function SubMenu({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ctx-sub" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="ctx-item ctx-sub-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="ctx-ico"><Icon name={icon} size={14} /></span>
        <span className="ctx-label">{label}</span>
        <Icon name="chevronDown" size={12} className="ctx-ico" />
      </button>
      {open && <div className="ctx-submenu">{children}</div>}
    </div>
  );
}

export function ContextMenu({ x, y, item, tags, collections, onAction, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      let nx = x;
      let ny = y;
      if (x + r.width > window.innerWidth - 8) nx = window.innerWidth - r.width - 8;
      if (y + r.height > window.innerHeight - 8) ny = window.innerHeight - r.height - 8;
      if (nx !== x || ny !== y) {
        el.style.left = `${nx}px`;
        el.style.top = `${ny}px`;
      }
    }
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onClose);
    };
  }, [x, y, onClose]);

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }}>
      <CtxRow icon="copy" label="نسخ" onClick={() => onAction({ action: "copy" }, item)} />

      {(() => {
        const text = (item.text ?? "").trim();
        const firstFile = item.kind === "files" && item.files && item.files.length > 0 ? item.files[0] : null;
        const isFileImage = firstFile ? /\.(png|jpe?g|webp|svg|gif|bmp|ico)$/i.test(firstFile) : false;
        const isSvgText = text.startsWith("<svg") && text.includes("</svg>");
        const canPreview =
          item.kind === "image" ||
          isFileImage ||
          isSvgText ||
          !!item.html ||
          isHtml(text) ||
          isMarkdown(text) ||
          isJson(text) ||
          looksLikeCode(text);

        if (!canPreview) return null;

        const label =
          item.kind === "image" || isFileImage || isSvgText
            ? "عرض الصورة بالحجم الكامل"
            : item.html || isHtml(text)
            ? "معاينة HTML (حية وشفرة)"
            : isMarkdown(text)
            ? "معاينة مستند Markdown منسق"
            : isJson(text)
            ? "معاينة بيانات JSON المنسقة"
            : "معاينة الكود المنسق";

        return <CtxRow icon="eye" label={label} onClick={() => onAction({ action: "preview" }, item)} />;
      })()}

      {item.kind === "text" && (
        <CtxRow icon="edit" label="تعديل النص" onClick={() => onAction({ action: "edit" }, item)} />
      )}
      {item.kind === "image" && (
        <>
          <CtxRow
            icon="scan"
            label={item.ocrText ? "إعادة استخراج النص (OneOCR)" : "استخراج النص من الصورة (OneOCR)"}
            onClick={() => onAction({ action: "ocr" }, item)}
          />
          {item.ocrText && (
            <CtxRow
              icon="copy"
              label="نسخ النص المستخرج (OCR)"
              onClick={() => onAction({ action: "copy-ocr" }, item)}
            />
          )}
          <CtxRow icon="download" label="حفظ الصورة…" onClick={() => onAction({ action: "save" }, item)} />
        </>
      )}
      {item.kind === "link" && (
        <CtxRow icon="external" label="فتح الرابط" onClick={() => onAction({ action: "open" }, item)} />
      )}
      {item.kind === "files" && (
        <>
          <CtxRow icon="external" label="فتح" onClick={() => onAction({ action: "open" }, item)} />
          <CtxRow icon="folder" label="إظهار في المستكشف" onClick={() => onAction({ action: "reveal" }, item)} />
        </>
      )}

      <div className="ctx-sep" />

      {tags.length > 0 && (
        <SubMenu icon="tag" label="وسم سريع">
          {tags.map((t) => (
            <button
              key={t.id}
              className="ctx-item"
              onClick={() => onAction({ action: "toggle-tag", tagId: t.id }, item)}
            >
              <span className="org-dot" style={{ background: t.color }} />
              <span className="ctx-label">{t.name}</span>
              <span className="ctx-check" style={{ visibility: item.tags.some((it) => it.id === t.id) ? "visible" : "hidden" }}>
                <Icon name="check" size={13} />
              </span>
            </button>
          ))}
        </SubMenu>
      )}

      {collections.length > 0 && (
        <SubMenu icon="folder" label="إضافة إلى مجموعة">
          {collections.map((c) => (
            <button
              key={c.id}
              className="ctx-item"
              onClick={() => onAction({ action: "toggle-collection", collectionId: c.id }, item)}
            >
              <span className="ctx-ico"><Icon name="folder" size={13} /></span>
              <span className="ctx-label">{c.name}</span>
            </button>
          ))}
        </SubMenu>
      )}

      <CtxRow icon="tag" label="الوسوم والمجموعات…" onClick={() => onAction({ action: "panel" }, item)} />

      <div className="ctx-sep" />

      <CtxRow
        icon="star"
        label={item.favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
        check={item.favorite}
        onClick={() => onAction({ action: "favorite" }, item)}
      />
      <CtxRow
        icon="pin"
        label={item.pinned ? "إلغاء التثبيت" : "تثبيت"}
        check={item.pinned}
        onClick={() => onAction({ action: "pin" }, item)}
      />
      <CtxRow
        icon="shield"
        label={item.sensitive ? "إلغاء تمييز كحساس" : "تمييز كمحتوى حساس"}
        check={item.sensitive}
        onClick={() => onAction({ action: "sensitive" }, item)}
      />

      <div className="ctx-sep" />
      <CtxRow icon="trash" label="حذف" danger onClick={() => onAction({ action: "delete" }, item)} />
    </div>
  );
}
