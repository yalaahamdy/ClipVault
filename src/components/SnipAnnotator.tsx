import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SnipFrame } from "../types";
import { useT } from "../i18n";
import { Icon } from "../icons";

/**
 * SnipAnnotator (v1.6) — full annotation editor for a selected screenshot crop.
 *
 * Runs inside the snip overlay window after the user picks a region.
 * Everything is drawn on a canvas kept at the crop's NATURAL (physical)
 * resolution; CSS only scales it to fit, so the exported PNG is lossless.
 *
 * Tools: freehand pen · arrow · rectangle · ellipse · text (full Arabic
 * shaping via the platform text engine) · mosaic blur. Undo/redo included.
 */

type Tool = "pen" | "arrow" | "rect" | "ellipse" | "text" | "blur";

interface BaseOp {
  color: string;
  width: number;
}
interface PenOp extends BaseOp {
  type: "pen";
  pts: Array<{ x: number; y: number }>;
}
interface ArrowOp extends BaseOp {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface ShapeOp extends BaseOp {
  type: "rect" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
}
interface TextOp extends BaseOp {
  type: "text";
  x: number;
  y: number;
  text: string;
  size: number;
}
interface BlurOp {
  type: "blur";
  x: number;
  y: number;
  w: number;
  h: number;
}
type Op = PenOp | ArrowOp | ShapeOp | TextOp | BlurOp;

const COLORS = ["#ef4444", "#fde047", "#4ade80", "#38bdf8", "#c084fc", "#ffffff", "#111827"];
const WIDTHS = [3, 5, 9];
const TEXT_SIZES = [18, 26, 38];

export interface AnnotatorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function SnipAnnotator({
  frame,
  rect,
  onDone,
  onBack,
  onCancel,
}: {
  frame: SnipFrame;
  rect: AnnotatorRect;
  onDone: (pngDataUrl: string) => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const t = useT();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null); // original crop @ natural res
  const bakedRef = useRef<HTMLCanvasElement | null>(null); // base + blur ops baked
  const bakedDirty = useRef(true);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [ops, setOps] = useState<Op[]>([]);
  const [redoStack, setRedoStack] = useState<Op[]>([]);
  const [displayW, setDisplayW] = useState(0); // CSS width of the canvas (fit-to-stage)
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const opsRef = useRef(ops);
  opsRef.current = ops;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;
  const widthRef = useRef(width);
  widthRef.current = width;

  // Natural (physical) size of the crop.
  // In the real snip window the viewport is sized to the monitor, so
  // devicePixelRatio maps CSS px → physical px exactly. (Falling back to the
  // frame/viewport ratio covers exotic setups.)
  const dprEff = useMemo(() => {
    if (typeof window !== "undefined" && window.devicePixelRatio > 0) {
      return window.devicePixelRatio;
    }
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    if (vw > 0 && frame.width > 0) return frame.width / vw;
    return 1;
  }, [frame.width]);

  const natW = Math.max(2, Math.round(rect.w * dprEff));
  const natH = Math.max(2, Math.round(rect.h * dprEff));

  // ---------------------------------------------------------------- base setup
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const base = document.createElement("canvas");
      base.width = natW;
      base.height = natH;
      const ctx = base.getContext("2d")!;
      ctx.drawImage(
        img,
        Math.round(rect.x * dprEff),
        Math.round(rect.y * dprEff),
        natW,
        natH,
        0,
        0,
        natW,
        natH,
      );
      baseRef.current = base;
      bakedDirty.current = true;
      render();
    };
    img.src = frame.dataUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.dataUrl]);

  // Fit the canvas to the stage (also re-fits on resize).
  useEffect(() => {
    const fit = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const pad = 8;
      const availW = stage.clientWidth - pad * 2;
      const availH = stage.clientHeight - pad * 2;
      const scale = Math.min(availW / natW, availH / natH, 1);
      setDisplayW(Math.max(80, Math.floor(natW * scale)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [natW, natH]);

  // ---------------------------------------------------------------- rendering

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, op: Op) => {
    switch (op.type) {
      case "pen": {
        if (op.pts.length === 0) return;
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(op.pts[0].x, op.pts[0].y);
        for (let i = 1; i < op.pts.length; i++) ctx.lineTo(op.pts[i].x, op.pts[i].y);
        if (op.pts.length === 1) ctx.lineTo(op.pts[0].x + 0.4, op.pts[0].y + 0.4);
        ctx.stroke();
        break;
      }
      case "arrow": {
        ctx.strokeStyle = op.color;
        ctx.fillStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.lineCap = "round";
        const { x1, y1, x2, y2 } = op;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 2) return;
        const head = Math.min(len * 0.35, op.width * 4.5 + 10);
        const ang = Math.atan2(y2 - y1, x2 - x1);
        // shorten the shaft so it meets the head base
        const bx = x2 - Math.cos(ang) * head * 0.8;
        const by = y2 - Math.sin(ang) * head * 0.8;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(ang - 0.42) * head, y2 - Math.sin(ang - 0.42) * head);
        ctx.lineTo(x2 - Math.cos(ang + 0.42) * head, y2 - Math.sin(ang + 0.42) * head);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "rect": {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.beginPath();
        ctx.rect(op.x, op.y, op.w, op.h);
        ctx.stroke();
        break;
      }
      case "ellipse": {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.beginPath();
        ctx.ellipse(
          op.x + op.w / 2,
          op.y + op.h / 2,
          Math.abs(op.w / 2),
          Math.abs(op.h / 2),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        break;
      }
      case "text": {
        ctx.fillStyle = op.color;
        ctx.font = `bold ${op.size}px "Segoe UI", Tahoma, sans-serif`;
        ctx.textBaseline = "top";
        // subtle dark halo keeps text readable on any background
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = Math.max(3, op.size / 5);
        const lines = op.text.split("\n");
        lines.forEach((ln, i) => ctx.fillText(ln, op.x, op.y + i * op.size * 1.3));
        ctx.restore();
        break;
      }
      case "blur":
        break; // blur is baked into the base, never drawn as a shape
    }
  }, []);

  /** Rebuild the baked canvas = base crop + all blur ops applied in order. */
  const bake = useCallback(() => {
    const base = baseRef.current;
    if (!base) return;
    if (!bakedRef.current) bakedRef.current = document.createElement("canvas");
    const baked = bakedRef.current;
    if (baked.width !== base.width || baked.height !== base.height) {
      baked.width = base.width;
      baked.height = base.height;
    }
    const ctx = baked.getContext("2d")!;
    ctx.clearRect(0, 0, baked.width, baked.height);
    ctx.drawImage(base, 0, 0);
    for (const op of opsRef.current) {
      if (op.type !== "blur") continue;
      // mosaic pixelation of the region
      const x = Math.max(0, Math.round(op.x));
      const y = Math.max(0, Math.round(op.y));
      const w = Math.max(1, Math.round(op.w));
      const h = Math.max(1, Math.round(op.h));
      const block = Math.max(5, Math.round(Math.min(w, h) / 8));
      const sw = Math.max(1, Math.floor(w / block));
      const sh = Math.max(1, Math.floor(h / block));
      const small = document.createElement("canvas");
      small.width = sw;
      small.height = sh;
      const sctx = small.getContext("2d")!;
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(baked, x, y, w, h, 0, 0, sw, sh);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, sw, sh, x, y, w, h);
      ctx.restore();
    }
    bakedDirty.current = false;
  }, []);

  const render = useCallback(
    (liveOp?: Op | null) => {
      const canvas = canvasRef.current;
      const base = baseRef.current;
      if (!canvas || !base) return;
      if (bakedDirty.current) bake();
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bakedRef.current) ctx.drawImage(bakedRef.current, 0, 0);
      for (const op of opsRef.current) {
        if (op.type !== "blur") drawShape(ctx, op);
      }
      if (liveOp && liveOp.type !== "blur") drawShape(ctx, liveOp);
    },
    [bake, drawShape],
  );

  useEffect(() => {
    bakedDirty.current = true;
    render();
  }, [ops, render]);

  // ---------------------------------------------------------------- pointer

  const dragRef = useRef<{
    start: { x: number; y: number };
    op: Op | null;
  } | null>(null);

  const toNat = (e: React.PointerEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const scale = canvas.width / r.width;
    return {
      x: Math.round((e.clientX - r.left) * scale),
      y: Math.round((e.clientY - r.top) * scale),
      scale,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (textDraft) {
      commitTextDraft();
      return;
    }
    const { x, y } = toNat(e);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    let op: Op;
    const curTool = toolRef.current;
    const common = { color: colorRef.current, width: widthRef.current };
    if (curTool === "pen") op = { type: "pen", ...common, pts: [{ x, y }] };
    else if (curTool === "arrow")
      op = { type: "arrow", ...common, x1: x, y1: y, x2: x, y2: y };
    else if (curTool === "rect" || curTool === "ellipse")
      op = { type: curTool, ...common, x, y, w: 0, h: 0 };
    else if (curTool === "blur") op = { type: "blur", x, y, w: 0, h: 0 };
    else return; // text tool handles clicks separately
    dragRef.current = { start: { x, y }, op };
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !drag.op) return;
    const { x, y } = toNat(e);
    const op = drag.op;
    if (op.type === "text") return; // text is committed via the input, never dragged
    if (op.type === "pen") op.pts.push({ x, y });
    else if (op.type === "arrow") {
      op.x2 = x;
      op.y2 = y;
    } else {
      op.w = x - drag.start.x;
      op.h = y - drag.start.y;
      if (op.type === "rect" || op.type === "ellipse" || op.type === "blur") {
        // normalize negative drags
        op.x = Math.min(drag.start.x, x);
        op.y = Math.min(drag.start.y, y);
        op.w = Math.abs(x - drag.start.x);
        op.h = Math.abs(y - drag.start.y);
      }
    }
    render(drag.op);
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (!drag || !drag.op) return;
    dragRef.current = null;
    const op = drag.op;
    // Discard degenerate shapes (accidental clicks)
    const tiny =
      (op.type === "rect" || op.type === "ellipse" || op.type === "blur") &&
      (op.w < 6 || op.h < 6);
    const straightArrow = op.type === "arrow" && Math.hypot(op.x2 - op.x1, op.y2 - op.y1) < 6;
    if (tiny || straightArrow) {
      render();
      return;
    }
    setOps((prev) => [...prev, op]);
    setRedoStack([]);
  };

  // ---------------------------------------------------------------- text tool

  const onCanvasClickForText = (e: React.MouseEvent) => {
    if (toolRef.current !== "text") return;
    const { x, y, scale } = toNat(e);
    setTextDraft({ x, y, value: "" });
    requestAnimationFrame(() => textInputRef.current?.focus());
    void scale;
  };

  const commitTextDraft = () => {
    const draft = textDraft;
    setTextDraft(null);
    if (!draft || !draft.value.trim()) return;
    setOps((prev) => [
      ...prev,
      {
        type: "text",
        color: colorRef.current,
        width: widthRef.current,
        size: TEXT_SIZES[WIDTHS.indexOf(widthRef.current)] ?? TEXT_SIZES[1],
        x: draft.x,
        y: draft.y,
        text: draft.value,
      },
    ]);
    setRedoStack([]);
  };

  // ---------------------------------------------------------------- undo/redo/save

  const undo = useCallback(() => {
    setOps((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      setOps((prev) => [...prev, last]);
      return r.slice(0, -1);
    });
  }, []);

  const save = useCallback(() => {
    if (textDraft) {
      commitTextDraft();
      // let the state flush, then save on the next frame
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (canvas) onDone(canvas.toDataURL("image/png"));
      });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    onDone(canvas.toDataURL("image/png"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone, textDraft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement === textInputRef.current;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (typing) {
          setTextDraft(null);
        } else {
          onBack();
        }
        return;
      }
      if (e.key === "Enter" && !typing) {
        e.preventDefault();
        save();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !typing) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((k === "z" && e.shiftKey) || k === "y") {
          e.preventDefault();
          redo();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onBack, save, undo, redo]);

  // ---------------------------------------------------------------- render

  const displayH = displayW ? Math.round((natH / natW) * displayW) : 0;
  const textInputStyle: React.CSSProperties = textDraft && displayW
    ? {
        left: (textDraft.x / natW) * displayW,
        top: (textDraft.y / natH) * displayH,
        fontSize: ((TEXT_SIZES[WIDTHS.indexOf(width)] ?? TEXT_SIZES[1]) / natW) * displayW,
        color,
      }
    : {};

  return (
    <div className="annot" dir={document.documentElement.dir || "rtl"}>
      <div className="annot-toolbar">
        <div className="annot-group" role="toolbar" aria-label={t("annot.pen")}>
          {(
            [
              ["pen", "pen", t("annot.pen")],
              ["arrow", "annotArrow", t("annot.arrow")],
              ["rect", "square", t("annot.rect")],
              ["ellipse", "circle", t("annot.ellipse")],
              ["text", "text", t("annot.text")],
              ["blur", "droplet", t("annot.blur")],
            ] as Array<[Tool, string, string]>
          ).map(([id, icon, label]) => (
            <button
              key={id}
              className={`annot-tool${tool === id ? " active" : ""}`}
              title={label}
              aria-label={label}
              onClick={() => {
                setTool(id);
                setTextDraft(null);
              }}
            >
              <Icon name={icon as never} size={14} />
            </button>
          ))}
        </div>

        <span className="annot-sep" />

        <div className="annot-group" role="group" aria-label={t("annot.colorTitle")}>
          {COLORS.map((c) => (
            <button
              key={c}
              className={`annot-color${color === c ? " active" : ""}`}
              style={{ background: c }}
              title={t("annot.colorTitle")}
              aria-label={`${t("annot.colorTitle")} ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <span className="annot-sep" />

        <div className="annot-group" role="group" aria-label={t("annot.sizeTitle")}>
          {WIDTHS.map((w, i) => (
            <button
              key={w}
              className={`annot-size${width === w ? " active" : ""}`}
              title={[t("annot.sizeS"), t("annot.sizeM"), t("annot.sizeL")][i]}
              aria-label={[t("annot.sizeS"), t("annot.sizeM"), t("annot.sizeL")][i]}
              onClick={() => setWidth(w)}
            >
              <span style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
            </button>
          ))}
        </div>

        <span className="annot-sep" />

        <div className="annot-group">
          <button
            className="annot-tool"
            title={t("annot.undo")}
            aria-label={t("annot.undo")}
            disabled={ops.length === 0}
            onClick={undo}
          >
            <Icon name="undo" size={14} />
          </button>
          <button
            className="annot-tool"
            title={t("annot.redo")}
            aria-label={t("annot.redo")}
            disabled={redoStack.length === 0}
            onClick={redo}
          >
            <Icon name="redo" size={14} />
          </button>
        </div>

        <span className="annot-spacer" />
        <span className="annot-hint">{t("annot.hint")}</span>
      </div>

      <div className="annot-stage" ref={stageRef}>
        <div
          className="annot-canvas-wrap"
          style={{ width: displayW || undefined, height: displayH || undefined }}
        >
          <canvas
            ref={canvasRef}
            width={natW}
            height={natH}
            style={{ width: displayW || undefined, height: displayH || undefined }}
            className={`annot-canvas tool-${tool}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={onCanvasClickForText}
          />
          {textDraft && (
            <input
              ref={textInputRef}
              className="annot-text-input"
              style={textInputStyle}
              value={textDraft.value}
              placeholder={t("annot.textPlaceholder")}
              onChange={(e) =>
                setTextDraft((d) => (d ? { ...d, value: e.target.value } : d))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTextDraft();
                }
                e.stopPropagation();
              }}
            />
          )}
        </div>
      </div>

      <div className="annot-footer">
        <span className="annot-dims">{t("snip.sizeHint", { w: natW, h: natH })}</span>
        <span className="annot-spacer" />
        <button className="btn ghost" onClick={onCancel}>
          {t("annot.cancel")}
        </button>
        <button className="btn" onClick={onBack}>
          {t("annot.back")}
        </button>
        <button className="btn primary" onClick={save}>
          <Icon name="check" size={13} /> {t("annot.save")}
        </button>
      </div>
    </div>
  );
}
