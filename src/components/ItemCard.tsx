import { useEffect, useRef, useState } from "react";
import type { Item } from "../types";
import { api } from "../api";
import { Icon } from "../icons";
import {
  classNames,
  colorFor,
  domainOf,
  fileNameOf,
  looksLikeCode,
  relTime,
  sourceLabel,
} from "../utils";
import { isHtml, isJson, isMarkdown } from "../utils/codeHighlighter";

const thumbCache = new Map<number, string>();

export interface CardActionEvt {
  item: Item;
  action: "copy" | "pin" | "favorite" | "sensitive" | "edit" | "menu" | "preview" | "save" | "open" | "reveal" | "tags";
  x?: number;
  y?: number;
}

export function ItemCard({
  item,
  selected,
  animate,
  query,
  onAction,
  onSelect,
}: {
  item: Item;
  selected: boolean;
  animate: boolean;
  query: string;
  onAction: (e: CardActionEvt) => void;
  onSelect?: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(() => thumbCache.get(item.id) ?? null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (item.kind === "image" && !thumb && !thumbFailed) {
      let alive = true;
      api.getItemImage(item.id, true).then((url) => {
        thumbCache.set(item.id, url);
        if (alive) setThumb(url);
      }).catch(() => alive && setThumbFailed(true));
      return () => { alive = false; };
    }
  }, [item.id, item.kind, thumb, thumbFailed]);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const masked = item.sensitive && !revealed;
  const isCode = item.kind === "text" && !!item.text && looksLikeCode(item.text);
  const kindClass =
    item.kind === "image" ? "kind-image"
    : item.kind === "link" ? "kind-link"
    : item.kind === "files" ? "kind-files"
    : isCode ? "kind-code"
    : "kind-text";

  const rawText = (item.text ?? "").trim();
  const firstFile = item.kind === "files" && item.files && item.files.length > 0 ? item.files[0] : null;
  const isFileImage = firstFile ? /\.(png|jpe?g|webp|svg|gif|bmp|ico)$/i.test(firstFile) : false;
  const isSvgText = rawText.startsWith("<svg") && rawText.includes("</svg>");
  const canPreview =
    item.kind === "image" ||
    isFileImage ||
    isSvgText ||
    !!item.html ||
    isHtml(rawText) ||
    isMarkdown(rawText) ||
    isJson(rawText) ||
    looksLikeCode(rawText);

  const domain = item.kind === "link" && item.text ? domainOf(item.text) : "";

  return (
    <article
      ref={ref}
      className={classNames("card", kindClass, selected && "selected", animate && "card--new")}
      data-id={item.id}
      tabIndex={-1}
      onClickCapture={() => onSelect?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onAction({ item, action: "copy" });
        }
      }}
    >
      {item.pinned && <span className="pin-stripe" />}

      <div
        className="card-main"
        onClick={() => onAction({ item, action: "copy" })}
        onContextMenu={(e) => {
          e.preventDefault();
          onAction({ item, action: "menu", x: e.clientX, y: e.clientY });
        }}
      >
        {item.kind === "image" ? (
          thumb ? (
            <img className="card-thumb" src={thumb} alt="صورة منسوخة" draggable={false} />
          ) : thumbFailed ? (
            <div className="kind-ico"><Icon name="image" size={15} /></div>
          ) : (
            <div className="skel-block" style={{ width: 96, height: 60 }} />
          )
        ) : item.kind === "link" ? (
          <div className="link-row">
            <div className="link-avatar" style={{ background: colorFor(domain) }}>
              {domain.charAt(0).toUpperCase() || "?"}
            </div>
            <div className="card-body">
              <div className="link-domain">{domain}</div>
              <div className="link-url">{item.text}</div>
            </div>
          </div>
        ) : item.kind === "files" ? (
          <div className="kind-ico"><Icon name="folder" size={15} /></div>
        ) : isCode ? (
          <div className="kind-ico"><Icon name="code" size={15} /></div>
        ) : (
          <div className="kind-ico"><Icon name="text" size={15} /></div>
        )}

        {item.kind !== "image" && item.kind !== "link" && (
          <div className="card-body">
            {item.kind === "files" ? (
              <div className="file-list">
                {(item.files || []).slice(0, 3).map((f, i) => (
                  <div className="file-row" key={i}>
                    <span className="f-icon"><Icon name="file" size={13} /></span>
                    <span className="f-name">{fileNameOf(f)}</span>
                  </div>
                ))}
                {(item.files?.length || 0) > 3 && (
                  <span className="files-more">+ {(item.files?.length || 0) - 3} ملفات أخرى</span>
                )}
              </div>
            ) : (
              <div className="card-text">{highlight(item.text || "", query)}</div>
            )}
          </div>
        )}
      </div>

      <div className="card-footer">
        <div className="card-meta">
          {item.sourceApp && (
            <span className="meta-badge app-badge" title={`منسوخ من: ${item.sourceApp}`}>
              <Icon name="monitor" size={11} />
              <span className="app-name">{sourceLabel(item.sourceApp)}</span>
            </span>
          )}
          <span className="meta-badge time-badge" title={new Date(item.lastUsedAt).toLocaleString("ar")}>
            <Icon name="clock" size={11} />
            <span>{relTime(item.lastUsedAt)}</span>
          </span>
          {item.useCount > 1 && (
            <span className="meta-badge count-badge" title={`استُخدم ${item.useCount} مرات`}>
              ×{item.useCount}
            </span>
          )}
          {item.pinned && (
            <span className="meta-badge pin-badge" title="مثبت">
              <Icon name="pin" size={10} filled />
            </span>
          )}
          {item.favorite && (
            <span className="meta-badge star-badge" title="مفضل">
              <Icon name="star" size={10} filled />
            </span>
          )}
          {item.sensitive && (
            <span className="meta-badge sens-badge" title="محتوى حساس">
              <Icon name="shield" size={10} />
            </span>
          )}
          {item.tags.length > 0 && (
            <div className="meta-tags">
              {item.tags.slice(0, 2).map((t) => (
                <span key={t.id} className="meta-badge tag-badge" style={{ color: t.color }}>
                  <span className="tag-dot" style={{ background: t.color }} />
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* hover/focus toolbar — now situated neatly in footer, not covering text */}
        <div className="card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-btn copy-btn" title="نسخ (Enter)" onClick={() => onAction({ item, action: "copy" })}
          >
            <Icon name="copy" size={13} />
          </button>

          {canPreview && (
            <button
              className="icon-btn"
              title={
                item.kind === "image" || isFileImage || isSvgText
                  ? "معاينة الصورة بالحجم الكامل"
                  : item.html || isHtml(rawText)
                  ? "معاينة كود HTML (عرض حي وشفرة)"
                  : isMarkdown(rawText)
                  ? "معاينة مستند Markdown منسق"
                  : "معاينة الكود المنسق"
              }
              onClick={() => onAction({ item, action: "preview" })}
            >
              <Icon name="eye" size={13} />
            </button>
          )}

          {item.kind === "text" && (
            <button className="icon-btn" title="تعديل النص" onClick={() => onAction({ item, action: "edit" })}>
              <Icon name="edit" size={13} />
            </button>
          )}
          {item.kind === "image" && (
            <button className="icon-btn" title="حفظ الصورة" onClick={() => onAction({ item, action: "save" })}>
              <Icon name="download" size={13} />
            </button>
          )}
          {item.kind === "link" && (
            <button className="icon-btn" title="فتح الرابط" onClick={() => onAction({ item, action: "open" })}>
              <Icon name="external" size={13} />
            </button>
          )}
          {item.kind === "files" && (
            <>
              <button className="icon-btn" title="فتح" onClick={() => onAction({ item, action: "open" })}>
                <Icon name="external" size={13} />
              </button>
              <button className="icon-btn" title="إظهار في المستكشف" onClick={() => onAction({ item, action: "reveal" })}>
                <Icon name="folder" size={13} />
              </button>
            </>
          )}

          <button
            className={classNames("icon-btn", item.favorite && "on")}
            title={item.favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
            onClick={() => onAction({ item, action: "favorite" })}
          >
            <Icon name="star" size={13} filled={item.favorite} />
          </button>
          <button
            className={classNames("icon-btn", item.pinned && "on")}
            title={item.pinned ? "إلغاء التثبيت" : "تثبيت"}
            onClick={() => onAction({ item, action: "pin" })}
          >
            <Icon name="pin" size={13} filled={item.pinned} />
          </button>
          <button
            className="icon-btn" title="خيارات"
            onClick={(e) => {
              const r = (e.target as HTMLElement).closest("button")!.getBoundingClientRect();
              onAction({ item, action: "menu", x: r.left + r.width / 2, y: r.bottom + 4 });
            }}
          >
            <Icon name="more" size={13} />
          </button>
        </div>
      </div>

      {masked && (
        <div className="sens-mask" onClick={(e) => { e.stopPropagation(); setRevealed(true); }} title="اضغط للكشف">
          <span className="sens-hint">
            <Icon name="shield" size={13} /> محتوى حساس — اضغط للعرض
          </span>
        </div>
      )}
    </article>
  );
}

/** Wrap query tokens in <mark> for quick scanning. */
function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const tokens = q.split(/\s+/).filter((t) => t.length > 0).slice(0, 4);
  if (tokens.length === 0) return text;
  try {
    const re = new RegExp(
      `(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      "gi",
    );
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) && tokens.some((t) => p.toLowerCase() === t.toLowerCase())
        ? <mark key={i}>{p}</mark>
        : p,
    );
  } catch {
    return text;
  }
}
