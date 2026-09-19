import { useMemo, useState } from "react";
import type { Item } from "../types";
import { Icon } from "../icons";
import { useT } from "../i18n";

/** Floating action bar shown while multiple items are selected. */
export function SelectionBar({
  count,
  total,
  onPasteSeq,
  onMerge,
  onDelete,
  onSelectAll,
  onClear,
  onExit,
}: {
  count: number;
  total: number;
  onPasteSeq: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
}) {
  const t = useT();
  if (count === 0) return null;
  return (
    <div className="selection-bar animate-in" role="toolbar" aria-label={t("sel.modeTitle")}>
      <span className="sel-count">
        <Icon name="listChecks" size={14} />
        {t("sel.selected", { n: count })}
      </span>

      <span className="sel-divider" />

      <button className="sel-btn" onClick={onPasteSeq} disabled={count < 1} title={t("sel.pasteSeqTitle")}>
        <Icon name="zap" size={13} />
        <span>{t("sel.pasteSeq")}</span>
      </button>
      <button className="sel-btn" onClick={onMerge} disabled={count < 2} title={t("sel.mergeTitle")}>
        <Icon name="merge" size={13} />
        <span>{t("sel.merge")}</span>
      </button>
      <button className="sel-btn" onClick={onSelectAll} disabled={count >= total}>
        <Icon name="check" size={13} />
        <span>{t("sel.selectAll")}</span>
      </button>
      <button className="sel-btn danger" onClick={onDelete}>
        <Icon name="trash" size={13} />
        <span>{t("sel.deleteSel")}</span>
      </button>

      <span className="sel-spacer" />

      <button className="sel-btn quiet" onClick={onClear} disabled={count === 0}>
        <span>{t("sel.clear")}</span>
      </button>
      <button className="icon-btn" onClick={onExit} title={t("sel.exit")}>
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

export type MergeSeparatorId = "newline" | "space" | "commaAr" | "comma" | "custom";

const SEPARATORS: Record<Exclude<MergeSeparatorId, "custom">, string> = {
  newline: "\n",
  space: " ",
  commaAr: "، ",
  comma: ", ",
};

/** Merge dialog — joins the selected items with a chosen separator. */
export function MergeModal({
  items,
  onCancel,
  onConfirm,
}: {
  items: Item[];
  onCancel: () => void;
  onConfirm: (mergedText: string) => void;
}) {
  const t = useT();
  const [sepId, setSepId] = useState<MergeSeparatorId>("newline");
  const [custom, setCustom] = useState("");

  const merged = useMemo(() => {
    const sep = sepId === "custom" ? custom : SEPARATORS[sepId];
    return items
      .map((it) => (it.text ?? it.ocrText ?? "").trim())
      .filter((s) => s.length > 0)
      .join(sep);
  }, [items, sepId, custom]);

  const usable = merged.trim().length > 0;

  return (
    <div className="preview-overlay" onClick={onCancel}>
      <div className="merge-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("merge.title")}>
        <header className="merge-head">
          <h3><Icon name="merge" size={16} /> {t("merge.title")}</h3>
          <button className="icon-btn" onClick={onCancel} title={t("merge.cancel")}>
            <Icon name="x" size={14} />
          </button>
        </header>

        <div className="merge-body">
          <div className="merge-sep-label">{t("merge.sepLabel")}</div>
          <div className="segmented merge-seps">
            <button className={sepId === "newline" ? "on" : ""} onClick={() => setSepId("newline")}>
              {t("merge.sepNewline")}
            </button>
            <button className={sepId === "space" ? "on" : ""} onClick={() => setSepId("space")}>
              {t("merge.sepSpace")}
            </button>
            <button className={sepId === "commaAr" ? "on" : ""} onClick={() => setSepId("commaAr")}>
              {t("merge.sepCommaAr")}
            </button>
            <button className={sepId === "comma" ? "on" : ""} onClick={() => setSepId("comma")}>
              {t("merge.sepComma")}
            </button>
            <button className={sepId === "custom" ? "on" : ""} onClick={() => setSepId("custom")}>
              {t("merge.sepCustom")}
            </button>
          </div>
          {sepId === "custom" && (
            <input
              className="merge-custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={t("merge.customPlaceholder")}
              maxLength={24}
            />
          )}

          <div className="merge-sep-label">{t("merge.previewLabel")}</div>
          <div className="merge-preview selectable" dir="auto">
            {usable ? (merged.length > 600 ? `${merged.slice(0, 600)}…` : merged) : t("merge.emptyPreview")}
          </div>
        </div>

        <footer className="merge-actions">
          <button
            className="btn primary"
            disabled={!usable}
            onClick={() => usable && onConfirm(merged)}
          >
            <Icon name="copy" size={13} /> {t("merge.confirm", { n: items.length })}
          </button>
          <button className="btn" onClick={onCancel}>
            {t("merge.cancel")}
          </button>
        </footer>
      </div>
    </div>
  );
}
