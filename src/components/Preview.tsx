import { useEffect, useRef, useState } from "react";
import type { Item } from "../types";
import { api } from "../api";
import { Icon } from "../icons";
import {
  detectLanguage,
  formatHtml,
  formatJson,
  getCodeStats,
  highlightCode,
  isHtml,
  isJson,
  isMarkdown,
} from "../utils/codeHighlighter";
import { renderMarkdown } from "../utils/markdown";
import { useT } from "../i18n";

interface Props {
  item: Item;
  onClose: () => void;
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp", ".ico"];

export function Preview({ item, onClose }: Props) {
  const t = useT();

  // --- Content Classification ---
  const textContent = (item.text ?? "").trim();
  const htmlContent = (item.html ?? "").trim();

  // Check if item is a local image file
  const firstFile = item.kind === "files" && item.files && item.files.length > 0 ? item.files[0] : null;
  const isFileImage = firstFile ? IMAGE_EXTS.some((ext) => firstFile.toLowerCase().endsWith(ext)) : false;

  const isSvgText = textContent.startsWith("<svg") && textContent.includes("</svg>");
  const isDataUrlImage = textContent.startsWith("data:image/");

  const isImageKind = item.kind === "image" || isFileImage || isSvgText || isDataUrlImage;
  const isHtmlKind = !isImageKind && (!!htmlContent || isHtml(textContent));
  const isMdKind = !isImageKind && !isHtmlKind && isMarkdown(textContent);
  const isJsonKind = !isImageKind && !isHtmlKind && !isMdKind && isJson(textContent);

  // Content type
  const activeType = isImageKind
    ? "image"
    : isHtmlKind
    ? "html"
    : isMdKind
    ? "markdown"
    : "code";

  // --- Image Preview State ---
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [bgPattern, setBgPattern] = useState<"grid" | "dark" | "light">("grid");
  const [imgMeta, setImgMeta] = useState<{ width: number; height: number; ratio: string } | null>(null);

  // --- OCR State for images ---
  const [imageTab, setImageTab] = useState<"image" | "ocr">("image");
  const [ocrText, setOcrText] = useState<string>(item.ocrText || "");
  const [ocrLines, setOcrLines] = useState<string[]>(() =>
    item.ocrText ? item.ocrText.split("\n").filter(Boolean) : []
  );
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrCopied, setOcrCopied] = useState(false);

  const handleExtractOcr = async (force = false) => {
    setIsOcrLoading(true);
    setOcrError(null);
    try {
      const res = await api.extractOcr(item.id, force);
      setOcrText(res.text);
      setOcrLines(res.lines.map((l: { text: string }) => l.text));
      setImageTab("ocr");
    } catch (e) {
      setOcrError(String(e));
    } finally {
      setIsOcrLoading(false);
    }
  };

  // Pan / Dragging image
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // --- Code / HTML / Markdown State ---
  const [htmlTab, setHtmlTab] = useState<"preview" | "code">(isHtmlKind ? "preview" : "code");
  const [htmlViewport, setHtmlViewport] = useState<"desktop" | "mobile">("desktop");
  const [mdTab, setMdTab] = useState<"rendered" | "raw">("rendered");
  const [copied, setCopied] = useState(false);
  const [formattedJson, setFormattedJson] = useState(false);
  const [formattedHtml, setFormattedHtml] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);

  // Load Image Data
  useEffect(() => {
    let alive = true;
    if (item.kind === "image") {
      api.getItemImage(item.id, false)
        .then((url) => alive && setImageUrl(url))
        .catch(() => alive && setImageError(true));
    } else if (isFileImage && firstFile) {
      api.readFileDataUrl(firstFile)
        .then((url) => alive && setImageUrl(url))
        .catch(() => alive && setImageError(true));
    } else if (isSvgText) {
      const b64 = btoa(unescape(encodeURIComponent(textContent)));
      setImageUrl(`data:image/svg+xml;base64,${b64}`);
    } else if (isDataUrlImage) {
      setImageUrl(textContent);
    }
    return () => {
      alive = false;
    };
  }, [item.id, item.kind, isFileImage, firstFile, isSvgText, isDataUrlImage, textContent]);

  // Keyboard Navigation (Esc to close)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Copy with feedback
  const handleCopy = async () => {
    await api.copyItem(item.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveImage = async () => {
    const path = await api.saveImage(item.id);
    if (path) onClose();
  };

  // On Image load metadata
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    let ratio = "";
    if (w && h) {
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(w, h);
      ratio = `${w / divisor}:${h / divisor}`;
    }
    setImgMeta({ width: w, height: h, ratio });
  };

  // Zoom controls
  const zoomIn = () => setZoom((z) => Math.min(5, Math.round((z + 0.25) * 100) / 100));
  const zoomOut = () => setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100));
  const zoomReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const rotateRight = () => setRotation((r) => (r + 90) % 360);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (activeType !== "image") return;
    if (e.ctrlKey || e.metaKey || true) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
  };

  // Dragging for zoom
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const handleMouseUp = () => setIsDragging(false);

  // Code statistics
  const currentCode = isHtmlKind
    ? formattedHtml
      ? formatHtml(htmlContent || textContent)
      : htmlContent || textContent
    : isJsonKind && formattedJson
    ? formatJson(textContent)
    : textContent;

  const stats = getCodeStats(currentCode);
  const lang = detectLanguage(currentCode);

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="preview-header">
          <div className="preview-title-group">
            <span className="preview-kind-icon">
              <Icon
                name={
                  activeType === "image"
                    ? "image"
                    : activeType === "html"
                    ? "globe"
                    : activeType === "markdown"
                    ? "fileText"
                    : "code"
                }
                size={16}
              />
            </span>
            <div className="preview-title-info">
              <h3 className="preview-title">
                {activeType === "image"
                  ? isFileImage && firstFile
                    ? t("preview.title.fileImage", { name: firstFile.split(/[\\/]/).pop() ?? "" })
                    : t("preview.title.image")
                  : activeType === "html"
                  ? t("preview.title.html")
                  : activeType === "markdown"
                  ? t("preview.title.markdown")
                  : isJsonKind
                  ? t("preview.title.json")
                  : t("preview.title.code", { lang: lang.toUpperCase() })}
              </h3>
              <span className="preview-stats-hint">
                {activeType === "image"
                  ? imageTab === "ocr"
                    ? t("preview.stats.ocrHint", {
                        lines: ocrLines.length,
                        words: ocrText.trim().split(/\s+/).filter(Boolean).length,
                        chars: ocrText.length,
                      })
                    : imgMeta
                    ? t("preview.stats.imageMeta", {
                        w: imgMeta.width,
                        h: imgMeta.height,
                        ratio: imgMeta.ratio,
                        zoom: Math.round(zoom * 100),
                      })
                    : t("preview.stats.image")
                  : t("preview.stats.codeHint", { lines: stats.lines, words: stats.words, kb: stats.kb })}
              </span>
            </div>
          </div>

          {/* Type Specific Header Controls */}
          <div className="preview-header-controls">
            {activeType === "html" && (
              <div className="segmented">
                <button
                  className={htmlTab === "preview" ? "on" : ""}
                  onClick={() => setHtmlTab("preview")}
                  title={t("preview.tabs.liveTitle")}
                >
                  <Icon name="eye" size={13} /> {t("preview.tabs.live")}
                </button>
                <button
                  className={htmlTab === "code" ? "on" : ""}
                  onClick={() => setHtmlTab("code")}
                  title={t("preview.tabs.codeTitle")}
                >
                  <Icon name="code" size={13} /> {t("preview.tabs.code")}
                </button>
              </div>
            )}

            {activeType === "html" && htmlTab === "preview" && (
              <div className="segmented">
                <button
                  className={htmlViewport === "desktop" ? "on" : ""}
                  onClick={() => setHtmlViewport("desktop")}
                  title={t("preview.viewport.desktopTitle")}
                >
                  <Icon name="monitor" size={13} />
                </button>
                <button
                  className={htmlViewport === "mobile" ? "on" : ""}
                  onClick={() => setHtmlViewport("mobile")}
                  title={t("preview.viewport.mobileTitle")}
                >
                  <Icon name="smartphone" size={13} />
                </button>
              </div>
            )}

            {activeType === "html" && htmlTab === "code" && (
              <button
                className={`top-control-btn${formattedHtml ? " warn" : ""}`}
                onClick={() => setFormattedHtml(!formattedHtml)}
                title={t("preview.format.htmlTitle")}
              >
                <Icon name="sparkles" size={13} /> {formattedHtml ? t("preview.format.original") : t("preview.format.html")}
              </button>
            )}

            {activeType === "markdown" && (
              <div className="segmented">
                <button
                  className={mdTab === "rendered" ? "on" : ""}
                  onClick={() => setMdTab("rendered")}
                  title={t("preview.tabs.renderedTitle")}
                >
                  <Icon name="fileText" size={13} /> {t("preview.tabs.rendered")}
                </button>
                <button
                  className={mdTab === "raw" ? "on" : ""}
                  onClick={() => setMdTab("raw")}
                  title={t("preview.tabs.rawTitle")}
                >
                  <Icon name="code" size={13} /> {t("preview.tabs.raw")}
                </button>
              </div>
            )}

            {isJsonKind && (
              <button
                className={`top-control-btn${formattedJson ? " warn" : ""}`}
                onClick={() => setFormattedJson(!formattedJson)}
                title={t("preview.format.jsonTitle")}
              >
                <Icon name="sparkles" size={13} /> {formattedJson ? t("preview.format.original") : t("preview.format.json")}
              </button>
            )}

            {((activeType === "html" && htmlTab === "code") ||
              (activeType === "markdown" && mdTab === "raw") ||
              activeType === "code") && (
              <button
                className={`top-control-btn${wordWrap ? " warn" : ""}`}
                onClick={() => setWordWrap(!wordWrap)}
                title={t("preview.wrap.title")}
              >
                <Icon name="columns" size={13} /> {wordWrap ? t("preview.wrap.off") : t("preview.wrap.on")}
              </button>
            )}

            {activeType === "image" && (
              <div className="segmented">
                <button
                  className={imageTab === "image" ? "on" : ""}
                  onClick={() => setImageTab("image")}
                  title={t("preview.title.image")}
                >
                  <Icon name="image" size={13} /> {t("preview.tab.image")}
                </button>
                <button
                  className={imageTab === "ocr" ? "on" : ""}
                  onClick={() => {
                    setImageTab("ocr");
                    if (!ocrText && !isOcrLoading) {
                      handleExtractOcr(false);
                    }
                  }}
                  title={t("preview.tab.ocrTitle")}
                >
                  <Icon name="scan" size={13} /> {t("preview.tab.ocr")}
                </button>
              </div>
            )}

            {activeType === "image" && imageTab === "ocr" && (
              <>
                <button
                  className="top-control-btn"
                  onClick={() => handleExtractOcr(true)}
                  disabled={isOcrLoading}
                  title={t("preview.ocr.rescanTitle")}
                >
                  <Icon name="refresh" size={13} /> {t("preview.ocr.rescan")}
                </button>
                <button
                  className="top-control-btn"
                  onClick={() => {
                    if (ocrText) {
                      navigator.clipboard.writeText(ocrText);
                      setOcrCopied(true);
                      setTimeout(() => setOcrCopied(false), 2000);
                    }
                  }}
                  disabled={!ocrText || isOcrLoading}
                  title={t("preview.ocr.copyTitle")}
                >
                  <Icon name={ocrCopied ? "check" : "copy"} size={13} /> {ocrCopied ? t("preview.copied") : t("preview.ocr.copyText")}
                </button>
              </>
            )}

            {activeType === "image" && imageTab === "image" && (
              <div className="preview-img-toolbar">
                <button className="icon-btn" onClick={zoomOut} title={t("preview.zoom.outTitle")}>
                  <Icon name="zoomOut" size={15} />
                </button>
                <button className="btn-label" onClick={zoomReset} title={t("preview.zoom.resetTitle")}>
                  {Math.round(zoom * 100)}%
                </button>
                <button className="icon-btn" onClick={zoomIn} title={t("preview.zoom.inTitle")}>
                  <Icon name="zoomIn" size={15} />
                </button>
                <button className="icon-btn" onClick={rotateRight} title={t("preview.zoom.rotateTitle")}>
                  <Icon name="rotate" size={14} />
                </button>
                <button
                  className={`icon-btn${bgPattern === "grid" ? " active" : ""}`}
                  onClick={() =>
                    setBgPattern((prev) => (prev === "grid" ? "dark" : prev === "dark" ? "light" : "grid"))
                  }
                  title={t("preview.zoom.bgTitle", { pattern: bgPattern })}
                >
                  <Icon name="grid" size={15} />
                </button>
              </div>
            )}

            <button className="preview-close-btn" onClick={onClose} title={t("preview.close.title")}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>

        {/* Modal Main Viewport */}
        <div className="preview-viewport" onWheel={handleWheel}>
          {/* IMAGE VIEW */}
          {activeType === "image" && imageTab === "image" && (
            <div
              className={`preview-img-container bg-${bgPattern}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
            >
              {imageError ? (
                <div className="preview-error-box">
                  <Icon name="image" size={36} />
                  <p>{t("preview.image.error")}</p>
                </div>
              ) : imageUrl ? (
                <img
                  src={imageUrl}
                  alt={t("preview.image.alt")}
                  onLoad={onImgLoad}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                    transition: isDragging ? "none" : "transform 150ms ease",
                  }}
                  draggable={false}
                />
              ) : (
                <div className="skel-block preview-skel" />
              )}
            </div>
          )}

          {/* OCR VIEW FOR IMAGES */}
          {activeType === "image" && imageTab === "ocr" && (
            <div className="preview-ocr-container">
              {isOcrLoading ? (
                <div className="preview-ocr-loading">
                  <div className="ocr-scanner-box">
                    <div className="ocr-scanner-laser" />
                    <Icon name="scan" size={48} className="ocr-scanner-icon" />
                  </div>
                  <h4>{t("preview.ocr.loadingTitle")}</h4>
                  <p>{t("preview.ocr.loadingDesc")}</p>
                </div>
              ) : ocrError ? (
                <div className="preview-error-box">
                  <Icon name="shield" size={36} />
                  <p>{t("preview.ocr.error", { error: ocrError })}</p>
                  <button className="btn" onClick={() => handleExtractOcr(true)} style={{ marginTop: 12 }}>
                    {t("preview.ocr.retry")}
                  </button>
                </div>
              ) : !ocrText.trim() ? (
                <div className="preview-ocr-empty">
                  <Icon name="scan" size={40} />
                  <h4>{t("preview.ocr.emptyTitle")}</h4>
                  <p>{t("preview.ocr.emptyDesc")}</p>
                  <button className="btn" onClick={() => handleExtractOcr(true)} style={{ marginTop: 12 }}>
                    {t("preview.ocr.rescanBtn")}
                  </button>
                </div>
              ) : (
                <div className="preview-ocr-content selectable">
                  <div className="preview-ocr-stats-bar">
                    <span>
                      <strong>{ocrLines.length}</strong> {t("preview.stats.line")}
                    </span>
                    <span>•</span>
                    <span>
                      <strong>{ocrText.trim().split(/\s+/).filter(Boolean).length}</strong> {t("preview.stats.word")}
                    </span>
                    <span>•</span>
                    <span>
                      <strong>{ocrText.length}</strong> {t("preview.stats.char")}
                    </span>
                  </div>
                  <div className="preview-code-viewer selectable wrap-lines">
                    <div className="code-line-numbers" aria-hidden="true">
                      {ocrText.split("\n").map((_, i) => (
                        <span key={i}>{i + 1}</span>
                      ))}
                    </div>
                    <pre className="code-content ocr-text-view">
                      <code>{ocrText}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HTML LIVE VIEW */}
          {activeType === "html" && htmlTab === "preview" && (
            <div className={`preview-html-frame-wrap viewport-${htmlViewport}`}>
              <iframe
                title={t("preview.html.iframeTitle")}
                className="preview-html-iframe"
                sandbox="allow-scripts allow-same-origin"
                srcDoc={htmlContent || textContent}
              />
            </div>
          )}

          {/* MARKDOWN RENDERED VIEW */}
          {activeType === "markdown" && mdTab === "rendered" && (
            <div
              className="preview-markdown-rendered selectable"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(textContent) }}
            />
          )}

          {/* CODE / RAW VIEW (For HTML source, Markdown raw, JSON, and source codes) */}
          {((activeType === "html" && htmlTab === "code") ||
            (activeType === "markdown" && mdTab === "raw") ||
            activeType === "code") && (
            <div className={`preview-code-viewer selectable${wordWrap ? " wrap-lines" : ""}`}>
              <div className="code-line-numbers" aria-hidden="true">
                {currentCode.split("\n").map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              <pre className="code-content">
                <code
                  dangerouslySetInnerHTML={{
                    __html: highlightCode(currentCode, isHtmlKind ? "html" : lang),
                  }}
                />
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="preview-footer">
          <div className="preview-footer-left">
            <button className="btn primary" onClick={handleCopy}>
              <Icon name={copied ? "check" : "copy"} size={13} />
              {copied ? t("preview.copiedExcl") : t("preview.copy.toVault")}
            </button>
            {activeType === "image" && (
              <button
                className={`btn${imageTab === "ocr" ? " primary" : ""}`}
                onClick={() => {
                  if (imageTab === "image") {
                    setImageTab("ocr");
                    if (!ocrText && !isOcrLoading) handleExtractOcr(false);
                  } else {
                    setImageTab("image");
                  }
                }}
              >
                <Icon name="scan" size={13} />
                {imageTab === "image" ? t("preview.footer.extractOcr") : t("preview.footer.showImage")}
              </button>
            )}
            {activeType === "image" && item.kind === "image" && (
              <button className="btn" onClick={handleSaveImage}>
                <Icon name="download" size={13} /> {t("preview.footer.saveAs")}
              </button>
            )}
            <button className="btn" onClick={() => api.revealItem(item.id)}>
              <Icon name="external" size={13} /> {t("preview.footer.reveal")}
            </button>
          </div>

          <div className="preview-footer-right">
            <button className="btn" onClick={onClose}>
              {t("preview.close.title")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
