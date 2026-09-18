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

interface Props {
  item: Item;
  onClose: () => void;
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp", ".ico"];

export function Preview({ item, onClose }: Props) {
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
                    ? `معاينة صورة: ${firstFile.split(/[\\/]/).pop()}`
                    : "معاينة الصورة بالحجم الكامل"
                  : activeType === "html"
                  ? "معاينة كود ومستند HTML"
                  : activeType === "markdown"
                  ? "معاينة مستند Markdown"
                  : isJsonKind
                  ? "معاينة بيانات JSON"
                  : `معاينة كود (${lang.toUpperCase()})`}
              </h3>
              <span className="preview-stats-hint">
                {activeType === "image"
                  ? imageTab === "ocr"
                    ? `${ocrLines.length} سطر • ${ocrText.trim().split(/\s+/).filter(Boolean).length} كلمة • ${ocrText.length} حرف`
                    : imgMeta
                    ? `${imgMeta.width} × ${imgMeta.height} px (${imgMeta.ratio}) • تكبير ${Math.round(zoom * 100)}%`
                    : "صورة"
                  : `${stats.lines} سطر • ${stats.words} كلمة • ${stats.kb} KB`}
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
                  title="معاينة تفاعلية حية"
                >
                  <Icon name="eye" size={13} /> عرض حي
                </button>
                <button
                  className={htmlTab === "code" ? "on" : ""}
                  onClick={() => setHtmlTab("code")}
                  title="الشفرة المصدرية"
                >
                  <Icon name="code" size={13} /> الشفرة
                </button>
              </div>
            )}

            {activeType === "html" && htmlTab === "preview" && (
              <div className="segmented">
                <button
                  className={htmlViewport === "desktop" ? "on" : ""}
                  onClick={() => setHtmlViewport("desktop")}
                  title="مقاس الحاسوب"
                >
                  <Icon name="monitor" size={13} />
                </button>
                <button
                  className={htmlViewport === "mobile" ? "on" : ""}
                  onClick={() => setHtmlViewport("mobile")}
                  title="مقاس الهاتف (375px)"
                >
                  <Icon name="smartphone" size={13} />
                </button>
              </div>
            )}

            {activeType === "html" && htmlTab === "code" && (
              <button
                className={`top-control-btn${formattedHtml ? " warn" : ""}`}
                onClick={() => setFormattedHtml(!formattedHtml)}
                title="تنسيق وترتيب شفرة HTML تلقائياً"
              >
                <Icon name="sparkles" size={13} /> {formattedHtml ? "الأصل" : "تنسيق HTML"}
              </button>
            )}

            {activeType === "markdown" && (
              <div className="segmented">
                <button
                  className={mdTab === "rendered" ? "on" : ""}
                  onClick={() => setMdTab("rendered")}
                  title="مستند منسق بالكامل"
                >
                  <Icon name="fileText" size={13} /> منسق
                </button>
                <button
                  className={mdTab === "raw" ? "on" : ""}
                  onClick={() => setMdTab("raw")}
                  title="الشفرة الأصلية"
                >
                  <Icon name="code" size={13} /> خام
                </button>
              </div>
            )}

            {isJsonKind && (
              <button
                className={`top-control-btn${formattedJson ? " warn" : ""}`}
                onClick={() => setFormattedJson(!formattedJson)}
                title="تنسيق وترتيب JSON تلقائياً"
              >
                <Icon name="sparkles" size={13} /> {formattedJson ? "الأصل" : "تنسيق JSON"}
              </button>
            )}

            {((activeType === "html" && htmlTab === "code") ||
              (activeType === "markdown" && mdTab === "raw") ||
              activeType === "code") && (
              <button
                className={`top-control-btn${wordWrap ? " warn" : ""}`}
                onClick={() => setWordWrap(!wordWrap)}
                title="تبديل التفاف الأسطر الطويلة"
              >
                <Icon name="columns" size={13} /> {wordWrap ? "أفقي" : "التفاف"}
              </button>
            )}

            {activeType === "image" && (
              <div className="segmented">
                <button
                  className={imageTab === "image" ? "on" : ""}
                  onClick={() => setImageTab("image")}
                  title="معاينة الصورة بالحجم الكامل"
                >
                  <Icon name="image" size={13} /> الصورة
                </button>
                <button
                  className={imageTab === "ocr" ? "on" : ""}
                  onClick={() => {
                    setImageTab("ocr");
                    if (!ocrText && !isOcrLoading) {
                      handleExtractOcr(false);
                    }
                  }}
                  title="استخراج النص من الصورة بواسطة محرك OneOCR الاحترافي"
                >
                  <Icon name="scan" size={13} /> النص المستخرج (OCR)
                </button>
              </div>
            )}

            {activeType === "image" && imageTab === "ocr" && (
              <>
                <button
                  className="top-control-btn"
                  onClick={() => handleExtractOcr(true)}
                  disabled={isOcrLoading}
                  title="إعادة فحص الصورة واستخراج النصوص مجدداً"
                >
                  <Icon name="refresh" size={13} /> إعادة الفحص
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
                  title="نسخ النص المستخرج بالكامل"
                >
                  <Icon name={ocrCopied ? "check" : "copy"} size={13} /> {ocrCopied ? "تم النسخ" : "نسخ النص"}
                </button>
              </>
            )}

            {activeType === "image" && imageTab === "image" && (
              <div className="preview-img-toolbar">
                <button className="icon-btn" onClick={zoomOut} title="تصغير (-)">
                  <Icon name="zoomOut" size={15} />
                </button>
                <button className="btn-label" onClick={zoomReset} title="إعادة الضبط (100%)">
                  {Math.round(zoom * 100)}%
                </button>
                <button className="icon-btn" onClick={zoomIn} title="تكبير (+)">
                  <Icon name="zoomIn" size={15} />
                </button>
                <button className="icon-btn" onClick={rotateRight} title="تدوير 90°">
                  <Icon name="rotate" size={14} />
                </button>
                <button
                  className={`icon-btn${bgPattern === "grid" ? " active" : ""}`}
                  onClick={() =>
                    setBgPattern((prev) => (prev === "grid" ? "dark" : prev === "dark" ? "light" : "grid"))
                  }
                  title={`تبديل خلفية الشفافية (${bgPattern})`}
                >
                  <Icon name="grid" size={15} />
                </button>
              </div>
            )}

            <button className="preview-close-btn" onClick={onClose} title="إغلاق (Esc)">
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
                  <p>تعذر تحميل أو فك تشفير الصورة</p>
                </div>
              ) : imageUrl ? (
                <img
                  src={imageUrl}
                  alt="معاينة"
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
                  <h4>جارٍ فحص الصورة واستخراج النصوص...</h4>
                  <p>يتم تحليل البكسلات محلياً عبر محرك OneOCR فائق السرعة والدقة</p>
                </div>
              ) : ocrError ? (
                <div className="preview-error-box">
                  <Icon name="shield" size={36} />
                  <p>حدث خطأ أثناء استخراج النص: {ocrError}</p>
                  <button className="btn" onClick={() => handleExtractOcr(true)} style={{ marginTop: 12 }}>
                    إعادة المحاولة
                  </button>
                </div>
              ) : !ocrText.trim() ? (
                <div className="preview-ocr-empty">
                  <Icon name="scan" size={40} />
                  <h4>لم يتم العثور على أي نصوص واضحة في هذه الصورة</h4>
                  <p>تأكد من وضوح النص في الصورة ثم أعد الفحص إن لزم الأمر</p>
                  <button className="btn" onClick={() => handleExtractOcr(true)} style={{ marginTop: 12 }}>
                    إعادة الفحص (Re-scan)
                  </button>
                </div>
              ) : (
                <div className="preview-ocr-content selectable">
                  <div className="preview-ocr-stats-bar">
                    <span>
                      <strong>{ocrLines.length}</strong> سطر
                    </span>
                    <span>•</span>
                    <span>
                      <strong>{ocrText.trim().split(/\s+/).filter(Boolean).length}</strong> كلمة
                    </span>
                    <span>•</span>
                    <span>
                      <strong>{ocrText.length}</strong> حرف
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
                title="معاينة HTML حية"
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
              {copied ? "تم النسخ!" : "نسخ للمحفظة"}
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
                {imageTab === "image" ? "استخراج النص (OneOCR)" : "عرض الصورة"}
              </button>
            )}
            {activeType === "image" && item.kind === "image" && (
              <button className="btn" onClick={handleSaveImage}>
                <Icon name="download" size={13} /> حفظ باسم…
              </button>
            )}
            <button className="btn" onClick={() => api.revealItem(item.id)}>
              <Icon name="external" size={13} /> في المستكشف
            </button>
          </div>

          <div className="preview-footer-right">
            <button className="btn" onClick={onClose}>
              إغلاق (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
