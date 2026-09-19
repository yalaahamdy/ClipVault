import { useEffect, useRef, useState } from "react";
import type { Item, TagWithCount, CollectionWithCount } from "../types";
import { Icon } from "../icons";
import { looksLikeCode } from "../utils";
import { isHtml, isJson, isMarkdown } from "../utils/codeHighlighter";
import { TRANSFORMS, TRANSFORM_GROUPS } from "../utils/transforms";
import { useT } from "../i18n";

export interface MenuAction {
  action:
    | "copy" | "pin" | "favorite" | "sensitive" | "edit" | "delete"
    | "open" | "reveal" | "save" | "preview" | "panel"
    | "toggle-tag" | "toggle-collection"
    | "ocr" | "copy-ocr"
    | "transform" | "qr";
  tagId?: number;
  collectionId?: number;
  transformId?: string;
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
  const subRef = useRef<HTMLDivElement>(null);

  // Keep the flyout inside the narrow popup window (flip/clamp after render).
  useEffect(() => {
    const el = subRef.current;
    if (!open || !el) return;
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    let dx = 0;
    if (r.right > window.innerWidth - 6) dx = window.innerWidth - 6 - r.right;
    if (r.left + dx < 6) dx = 6 - r.left;
    let dy = 0;
    if (r.bottom > window.innerHeight - 6) dy = window.innerHeight - 6 - r.bottom;
    if (r.top + dy < 6) dy = 6 - r.top;
    if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`;
  }, [open]);

  return (
    <div className="ctx-sub" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="ctx-item ctx-sub-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="ctx-ico"><Icon name={icon} size={14} /></span>
        <span className="ctx-label">{label}</span>
        <Icon name="chevronDown" size={12} className="ctx-ico" />
      </button>
      {open && (
        <div className="ctx-submenu" ref={subRef}>
          {children}
        </div>
      )}
    </div>
  );
}

export function ContextMenu({ x, y, item, tags, collections, onAction, onClose }: Props) {
  const t = useT();
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

  const text = (item.text ?? item.ocrText ?? "").trim();
  const hasText = text.length > 0;

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }}>
      <CtxRow icon="copy" label={t("ctx.copy")} onClick={() => onAction({ action: "copy" }, item)} />

      {(() => {
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
            ? t("ctx.previewImage")
            : item.html || isHtml(text)
            ? t("ctx.previewHtml")
            : isMarkdown(text)
            ? t("ctx.previewMd")
            : isJson(text)
            ? t("ctx.previewJson")
            : t("ctx.previewCode");

        return <CtxRow icon="eye" label={label} onClick={() => onAction({ action: "preview" }, item)} />;
      })()}

      {hasText && (
        <SubMenu icon="wand" label={t("ctx.transforms")}>
          {TRANSFORM_GROUPS.map((group) => (
            <div key={group.id} className="ctx-group">
              <div className="ctx-group-label">{t(group.key)}</div>
              {TRANSFORMS.filter((tr) => tr.group === group.id).map((tr) => (
                <button
                  key={tr.id}
                  className="ctx-item"
                  onClick={() => onAction({ action: "transform", transformId: tr.id }, item)}
                >
                  <span className="ctx-ico"><Icon name={tr.icon} size={13} /></span>
                  <span className="ctx-label">{t(tr.key)}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="ctx-group">
            <button className="ctx-item" onClick={() => onAction({ action: "qr" }, item)}>
              <span className="ctx-ico"><Icon name="qr" size={13} /></span>
              <span className="ctx-label">{t("tr.qr")}</span>
            </button>
          </div>
        </SubMenu>
      )}

      {item.kind === "text" && (
        <CtxRow icon="edit" label={t("ctx.edit")} onClick={() => onAction({ action: "edit" }, item)} />
      )}
      {item.kind === "image" && (
        <>
          <CtxRow
            icon="scan"
            label={item.ocrText ? t("ctx.ocrRedo") : t("ctx.ocrNew")}
            onClick={() => onAction({ action: "ocr" }, item)}
          />
          {item.ocrText && (
            <CtxRow
              icon="copy"
              label={t("ctx.copyOcr")}
              onClick={() => onAction({ action: "copy-ocr" }, item)}
            />
          )}
          <CtxRow icon="download" label={t("ctx.saveImage")} onClick={() => onAction({ action: "save" }, item)} />
        </>
      )}
      {item.kind === "link" && (
        <>
          <CtxRow icon="external" label={t("ctx.openLink")} onClick={() => onAction({ action: "open" }, item)} />
          <CtxRow icon="qr" label={t("ctx.qrForLink")} onClick={() => onAction({ action: "qr" }, item)} />
        </>
      )}
      {item.kind === "files" && (
        <>
          <CtxRow icon="external" label={t("ctx.open")} onClick={() => onAction({ action: "open" }, item)} />
          <CtxRow icon="folder" label={t("ctx.reveal")} onClick={() => onAction({ action: "reveal" }, item)} />
        </>
      )}

      <div className="ctx-sep" />

      {tags.length > 0 && (
        <SubMenu icon="tag" label={t("ctx.quickTag")}>
          {tags.map((tg) => (
            <button
              key={tg.id}
              className="ctx-item"
              onClick={() => onAction({ action: "toggle-tag", tagId: tg.id }, item)}
            >
              <span className="org-dot" style={{ background: tg.color }} />
              <span className="ctx-label">{tg.name}</span>
              <span className="ctx-check" style={{ visibility: item.tags.some((it) => it.id === tg.id) ? "visible" : "hidden" }}>
                <Icon name="check" size={13} />
              </span>
            </button>
          ))}
        </SubMenu>
      )}

      {collections.length > 0 && (
        <SubMenu icon="folder" label={t("ctx.addToCollection")}>
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

      <CtxRow icon="tag" label={t("ctx.orgPanel")} onClick={() => onAction({ action: "panel" }, item)} />

      <div className="ctx-sep" />

      <CtxRow
        icon="star"
        label={item.favorite ? t("ctx.favRemove") : t("ctx.favAdd")}
        check={item.favorite}
        onClick={() => onAction({ action: "favorite" }, item)}
      />
      <CtxRow
        icon="pin"
        label={item.pinned ? t("ctx.pinRemove") : t("ctx.pinAdd")}
        check={item.pinned}
        onClick={() => onAction({ action: "pin" }, item)}
      />
      <CtxRow
        icon="shield"
        label={item.sensitive ? t("ctx.sensRemove") : t("ctx.sensAdd")}
        check={item.sensitive}
        onClick={() => onAction({ action: "sensitive" }, item)}
      />

      <div className="ctx-sep" />
      <CtxRow icon="trash" label={t("ctx.delete")} danger onClick={() => onAction({ action: "delete" }, item)} />
    </div>
  );
}
