import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import type { SnipCommitResult, SnipFrame } from "../types";
import { useT } from "../i18n";

/**
 * Full-screen region-selection overlay (runs inside the dedicated "snip" window).
 * The frozen monitor capture is the backdrop; the user drags a rectangle and we
 * send it back to Rust for cropping + OCR. Esc cancels; drag-release commits.
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
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancel]);

  const commit = useCallback(async () => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    setDrag(null);
    if (w < 6 || h < 6) {
      cancel();
      return;
    }
    try {
      const result = await api.snipCommit({ x, y, w, h, dpr: window.devicePixelRatio || 1 });
      onCommitted?.(result);
      // Real Tauri: the backend hides this window and notifies "main".
    } catch {
      cancel();
    }
  }, [cancel, onCommitted]);

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
  };

  const onMove = (e: React.MouseEvent) => {
    setDrag((d) => (d ? { ...d, x1: e.clientX, y1: e.clientY } : d));
  };

  const sel = drag
    ? {
        x: Math.min(drag.x0, drag.x1),
        y: Math.min(drag.y0, drag.y1),
        w: Math.abs(drag.x1 - drag.x0),
        h: Math.abs(drag.y1 - drag.y0),
      }
    : null;

  return (
    <div
      className="snip-overlay"
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={() => commit()}
      role="application"
      aria-label={t("snip.hint")}
    >
      {frame ? (
        <img
          className="snip-frame"
          src={frame.dataUrl}
          alt=""
          draggable={false}
        />
      ) : (
        <div className="snip-loading">
          {failed ? t("common.error") : t("snip.preparing")}
        </div>
      )}

      {sel && sel.w > 2 && sel.h > 2 && (
        <>
          <div
            className="snip-selection"
            style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
          />
          <div
            className="snip-size-badge"
            style={{
              left: sel.x + sel.w / 2,
              top: sel.y + sel.h > 44 ? sel.y + sel.h + 10 : sel.y + 10,
            }}
          >
            {Math.round(sel.w * (window.devicePixelRatio || 1))} ×{" "}
            {Math.round(sel.h * (window.devicePixelRatio || 1))}
          </div>
        </>
      )}

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

      {/* Crosshair cursor layer */}
      <div className="snip-crosshair" />
    </div>
  );
}
