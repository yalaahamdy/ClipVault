/** Universal preview (Preview.tsx) dictionary — flat dotted keys.
 *  Arabic is the source of truth; keys used as t("preview.<key>"). */

export const previewAr: Record<string, string> = {
  // Modal titles
  "title.fileImage": "معاينة صورة: {name}",
  "title.image": "معاينة الصورة بالحجم الكامل",
  "title.html": "معاينة كود ومستند HTML",
  "title.markdown": "معاينة مستند Markdown",
  "title.json": "معاينة بيانات JSON",
  "title.code": "معاينة كود ({lang})",

  // Header stats hint
  "stats.ocrHint": "{lines} سطر • {words} كلمة • {chars} حرف",
  "stats.imageMeta": "{w} × {h} px ({ratio}) • تكبير {zoom}%",
  "stats.image": "صورة",
  "stats.codeHint": "{lines} سطر • {words} كلمة • {kb} KB",

  // OCR stats bar units
  "stats.line": "سطر",
  "stats.word": "كلمة",
  "stats.char": "حرف",

  // HTML / Markdown segmented controls
  "tabs.liveTitle": "معاينة تفاعلية حية",
  "tabs.live": "عرض حي",
  "tabs.codeTitle": "الشفرة المصدرية",
  "tabs.code": "الشفرة",
  "tabs.renderedTitle": "مستند منسق بالكامل",
  "tabs.rendered": "منسق",
  "tabs.rawTitle": "الشفرة الأصلية",
  "tabs.raw": "خام",

  // Image / OCR segmented control
  "tab.image": "الصورة",
  "tab.ocrTitle": "استخراج النص من الصورة بواسطة محرك OneOCR الاحترافي",
  "tab.ocr": "النص المستخرج (OCR)",

  // HTML viewport sizes
  "viewport.desktopTitle": "مقاس الحاسوب",
  "viewport.mobileTitle": "مقاس الهاتف (375px)",

  // Format actions
  "format.htmlTitle": "تنسيق وترتيب شفرة HTML تلقائياً",
  "format.original": "الأصل",
  "format.html": "تنسيق HTML",
  "format.jsonTitle": "تنسيق وترتيب JSON تلقائياً",
  "format.json": "تنسيق JSON",

  // Word wrap
  "wrap.title": "تبديل التفاف الأسطر الطويلة",
  "wrap.off": "أفقي",
  "wrap.on": "التفاف",

  // OCR toolbar
  "ocr.rescanTitle": "إعادة فحص الصورة واستخراج النصوص مجدداً",
  "ocr.rescan": "إعادة الفحص",
  "ocr.copyTitle": "نسخ النص المستخرج بالكامل",
  "ocr.copyText": "نسخ النص",
  "copied": "تم النسخ",

  // Zoom toolbar
  "zoom.outTitle": "تصغير (-)",
  "zoom.resetTitle": "إعادة الضبط (100%)",
  "zoom.inTitle": "تكبير (+)",
  "zoom.rotateTitle": "تدوير 90°",
  "zoom.bgTitle": "تبديل خلفية الشفافية ({pattern})",

  // Close
  "close.title": "إغلاق (Esc)",

  // Image view
  "image.error": "تعذر تحميل أو فك تشفير الصورة",
  "image.alt": "معاينة",

  // OCR view
  "ocr.loadingTitle": "جارٍ فحص الصورة واستخراج النصوص...",
  "ocr.loadingDesc": "يتم تحليل البكسلات محلياً عبر محرك OneOCR فائق السرعة والدقة",
  "ocr.error": "حدث خطأ أثناء استخراج النص: {error}",
  "ocr.retry": "إعادة المحاولة",
  "ocr.emptyTitle": "لم يتم العثور على أي نصوص واضحة في هذه الصورة",
  "ocr.emptyDesc": "تأكد من وضوح النص في الصورة ثم أعد الفحص إن لزم الأمر",
  "ocr.rescanBtn": "إعادة الفحص (Re-scan)",

  // HTML live iframe
  "html.iframeTitle": "معاينة HTML حية",

  // Footer actions
  "copiedExcl": "تم النسخ!",
  "copy.toVault": "نسخ للمحفظة",
  "footer.extractOcr": "استخراج النص (OneOCR)",
  "footer.showImage": "عرض الصورة",
  "footer.saveAs": "حفظ باسم…",
  "footer.reveal": "في المستكشف",
};

export const previewEn: Record<string, string> = {
  // Modal titles
  "title.fileImage": "Image preview: {name}",
  "title.image": "Full-size image preview",
  "title.html": "HTML code & document preview",
  "title.markdown": "Markdown document preview",
  "title.json": "JSON data preview",
  "title.code": "Code preview ({lang})",

  // Header stats hint
  "stats.ocrHint": "{lines} lines • {words} words • {chars} chars",
  "stats.imageMeta": "{w} × {h} px ({ratio}) • Zoom {zoom}%",
  "stats.image": "Image",
  "stats.codeHint": "{lines} lines • {words} words • {kb} KB",

  // OCR stats bar units
  "stats.line": "lines",
  "stats.word": "words",
  "stats.char": "chars",

  // HTML / Markdown segmented controls
  "tabs.liveTitle": "Interactive live preview",
  "tabs.live": "Live",
  "tabs.codeTitle": "Source code",
  "tabs.code": "Code",
  "tabs.renderedTitle": "Fully rendered document",
  "tabs.rendered": "Rendered",
  "tabs.rawTitle": "Raw source",
  "tabs.raw": "Raw",

  // Image / OCR segmented control
  "tab.image": "Image",
  "tab.ocrTitle": "Extract text from the image with the professional OneOCR engine",
  "tab.ocr": "Extracted Text (OCR)",

  // HTML viewport sizes
  "viewport.desktopTitle": "Desktop size",
  "viewport.mobileTitle": "Mobile size (375px)",

  // Format actions
  "format.htmlTitle": "Auto-format and tidy the HTML code",
  "format.original": "Original",
  "format.html": "Format HTML",
  "format.jsonTitle": "Auto-format and tidy the JSON",
  "format.json": "Format JSON",

  // Word wrap
  "wrap.title": "Toggle wrapping of long lines",
  "wrap.off": "Horizontal",
  "wrap.on": "Word Wrap",

  // OCR toolbar
  "ocr.rescanTitle": "Re-scan the image and extract the text again",
  "ocr.rescan": "Re-scan",
  "ocr.copyTitle": "Copy the full extracted text",
  "ocr.copyText": "Copy Text",
  "copied": "Copied",

  // Zoom toolbar
  "zoom.outTitle": "Zoom out (-)",
  "zoom.resetTitle": "Reset (100%)",
  "zoom.inTitle": "Zoom in (+)",
  "zoom.rotateTitle": "Rotate 90°",
  "zoom.bgTitle": "Toggle transparency background ({pattern})",

  // Close
  "close.title": "Close (Esc)",

  // Image view
  "image.error": "The image could not be loaded or decoded",
  "image.alt": "Preview",

  // OCR view
  "ocr.loadingTitle": "Scanning the image and extracting text...",
  "ocr.loadingDesc": "Pixels are analyzed locally through the ultra-fast, high-accuracy OneOCR engine",
  "ocr.error": "An error occurred while extracting text: {error}",
  "ocr.retry": "Retry",
  "ocr.emptyTitle": "No clear text was found in this image",
  "ocr.emptyDesc": "Make sure the text in the image is clearly readable, then re-scan if needed",
  "ocr.rescanBtn": "Re-scan",

  // HTML live iframe
  "html.iframeTitle": "Live HTML preview",

  // Footer actions
  "copiedExcl": "Copied!",
  "copy.toVault": "Copy",
  "footer.extractOcr": "Extract Text (OneOCR)",
  "footer.showImage": "Show Image",
  "footer.saveAs": "Save As…",
  "footer.reveal": "Show in Explorer",
};
