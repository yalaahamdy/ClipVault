import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import type { SnipCommitResult, SnipFrame } from "../types";
import { useT } from "../i18n";
import { Icon } from "../icons";
import { SnipAnnotator } from "./SnipAnnotator";

/**
 * Full-screen region-selection overlay (runs inside the dedicated "snip" window).
 * The frozen monitor capture is the backdrop.
 *
 * v1.6 flow — three phases:
 *  1. "select"   drag a rectangle (classic behaviour).
 *  2. "picked"   the region is locked; a floating bar offers Quick copy
 *                (Enter — the v1.5 instant path) or Annotate (A).
 *  3. "annotate" SnipAnnotator edits the crop; saving routes it through
 *                snip_commit_annotated (store → OCR → clipboard).
 * Esc always cancels the whole snip.
 */
export function SnipOverlay({
  onClose,
  onCommitted,
}: {
  /** Dev-mode only: called when the overlay is dismissed without a capture. */
  onClose?: () => void;
  /** Dev-mode only: called after a successful commit (main window reloads). */
  onCommitted?: (result: SnipCommitResult) => void;
} = {}) {
  const t = useT();
  const [frame, setFrame] = useState<SnipFrame | null>(null);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<"select" | "picked" | "annotate">("select");
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [committing, setCommitting] = useState(false);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // Load the frozen frame (retried briefly — the window may boot a beat before
  // the backend finished storing a re-captured session).
  const loadFrame = useCallback(async (attempt = 0) => {
    try {
      const f = await api.snipGetFrame();
      setFrame(f);
    } catch {
      if (attempt < 10) {
        setTimeout(() => loadFrame(attempt + 1), 120);
      } else {
        setFailed(true);
      }
    }
  }, []);

  useEffect(() => {
    loadFrame();
    const un = listen("clipvault:snip-frame", () => loadFrame());
    return () => {
      un.then((f) => f());
    };
  }, [loadFrame]);

  const cancel = useCallback(() => {
    api.snipCancel().catch(() => {});
    onClose?.();
  }, [onClose]);

  const commitQuick = useCallback(async () => {
    if (!sel) return;
    setCommitting(true);
    try {
      const result = await api.snipCommit({
        x: sel.x,
        y: sel.y,
        w: sel.w,
        h: sel.h,
        dpr: window.devicePixelRatio || 1,
      });
      onCommitted?.(result);
      // Real Tauri: the backend closes this window and notifies "main".
    } catch {
      // Failed commit (e.g. region too small) — back to selection.
      setCommitting(false);
      setPhase("select");
    }
  }, [sel, onCommitted]);

  const commitAnnotated = useCallback(
    async (dataUrl: string) => {
      setCommitting(true);
      try {
        const result = await api.snipCommitAnnotated(dataUrl);
        onCommitted?.(result);
      } catch {
        setCommitting(false);
        setPhase("annotate");
      }
    },
    [onCommitted],
  );

  // Global keys for the select/picked phases (the annotator owns the keys
  // while it is open).
  useEffect(() => {
    if (phase === "annotate") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && phase === "picked" && !committing) {
        e.preventDefault();
        commitQuick();
      } else if (e.key.toLowerCase() === "a" && phase === "picked" && !committing) {
        e.preventDefault();
        setPhase("annotate");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, cancel, commitQuick, committing]);

  const onDown = (e: React.MouseEvent) => {
    if (phase === "annotate" || committing) return;
    e.preventDefault();
    setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
    setSel(null);
  };

  const onMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setDrag((d) => (d ? { ...d, x1: e.clientX, y1: e.clientY } : d));
  };

  const onUp = () => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    setDrag(null);
    if (w < 6 || h < 6) return; // ignore accidental clicks
    setSel({ x, y, w, h });
    setPhase("picked");
  };

  const liveSel = drag
    ? {
        x: Math.min(drag.x0, drag.x1),
        y: Math.min(drag.y0, drag.y1),
        w: Math.abs(drag.x1 - drag.x0),
        h: Math.abs(drag.y1 - drag.y0),
      }
    : null;

  const shownSel = phase === "select" ? liveSel : sel;

  // Keep the action bar fully inside the viewport (it is centered on the
  // selection, which can sit near a screen edge).
  const barRef = useRef<HTMLDivElement>(null);
  const [barLeft, setBarLeft] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== "picked" || !sel) {
      setBarLeft(null);
      return;
    }
    const measure = () => {
      const bar = barRef.current;
      if (!bar) return;
      const half = bar.offsetWidth / 2 + 10;
      const cx = sel.x + sel.w / 2;
      setBarLeft(Math.min(Math.max(cx, half), window.innerWidth - half));
    };
    measure();
    // re-measure after fonts/layout settle
    const id = setTimeout(measure, 60);
    return () => clearTimeout(id);
  }, [phase, sel]);

  // ------------------------------------------------------------------ annotate
  if (phase === "annotate" && frame && sel) {
    return (
      <div className="snip-overlay annot-host">
        {frame ? (
          <img className="snip-frame" src={frame.dataUrl} alt="" draggable={false} />
        ) : null}
        <SnipAnnotator
          frame={frame}
          rect={sel}
          onDone={(dataUrl) => void commitAnnotated(dataUrl)}
          onBack={() => setPhase("picked")}
          onCancel={cancel}
        />
      </div>
    );
  }

  // ------------------------------------------------------------- select/picked
  return (
    <div
      className={`snip-overlay${phase === "picked" ? " picked" : ""}`}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      role="application"
      aria-label={t("snip.hint")}
    >
      {frame ? (
        <img className="snip-frame" src={frame.dataUrl} alt="" draggable={false} />
      ) : (
        <div className="snip-loading">
          {failed ? t("common.error") : t("snip.preparing")}
        </div>
      )}

      {shownSel && shownSel.w > 2 && shownSel.h > 2 && (
        <>
          <div
            className="snip-selection"
            style={{ left: shownSel.x, top: shownSel.y, width: shownSel.w, height: shownSel.h }}
          />
          {phase === "select" && (
            <div
              className="snip-size-badge"
              style={{
                left: shownSel.x + shownSel.w / 2,
                top: shownSel.y + shownSel.h > 44 ? shownSel.y + shownSel.h + 10 : shownSel.y + 10,
              }}
            >
              {Math.round(shownSel.w * (window.devicePixelRatio || 1))} ×{" "}
              {Math.round(shownSel.h * (window.devicePixelRatio || 1))}
            </div>
          )}
        </>
      )}

      {phase === "picked" && sel && (
        <div
          ref={barRef}
          className="snip-action-bar animate-in"
          style={{
            left: barLeft ?? sel.x + sel.w / 2,
            top:
              sel.y + sel.h + 96 < window.innerHeight
                ? sel.y + sel.h + 12
                : Math.max(12, sel.y - 96),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="snip-bar-dims">
            {t("snip.sizeHint", {
              w: Math.round(sel.w * (window.devicePixelRatio || 1)),
              h: Math.round(sel.h * (window.devicePixelRatio || 1)),
            })}
          </span>
          <span className="snip-bar-sep" />
          <button
            className="snip-bar-btn quick"
            title={t("snip.quickCopyTitle")}
            disabled={committing}
            onClick={() => void commitQuick()}
          >
            <Icon name="check" size={14} />
            {t("snip.quickCopy")}
            <kbd>↵</kbd>
          </button>
          <button
            className="snip-bar-btn snip-btn-annot"
            title={t("snip.annotateTitle")}
            disabled={committing}
            onClick={() => setPhase("annotate")}
          >
            <Icon name="pen" size={14} />
            {t("snip.annotate")}
            <kbd>A</kbd>
          </button>
          <span className="snip-bar-sep" />
          <button
            className="snip-bar-btn cancel"
            title={t("snip.escHint")}
            onClick={cancel}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {phase === "select" && (
        <div className="snip-hint">
          <span className="snip-hint-dot" />
          {frame ? t("snip.hint") : t("snip.escHint")}
          <button
            className="snip-cancel-btn"
            onClick={cancel}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {t("common.cancel")} (Esc)
          </button>
        </div>
      )}

      {/* Crosshair cursor layer */}
      <div className="snip-crosshair" />
    </div>
  );
}
