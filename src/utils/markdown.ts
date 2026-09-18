/**
 * ClipVault — Modern Luxury Markdown-to-HTML Engine
 * Inspired by GitHub Flavored Markdown Alerts, Notion, and Obsidian.
 * Features:
 * - GitHub/Obsidian Alerts: [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
 * - Embedded Code Syntax Highlighting with language badges and instant copy
 * - Notion-style interactive tables with cell alignments
 * - Task list checkboxes with strike-through completion
 * - Rich typography, blockquotes, keyboard shortcuts, and dividers
 */

import { detectLanguage, escapeHtml, highlightCode } from "./codeHighlighter";

export function renderMarkdown(md: string): string {
  if (!md) return "";

  const text = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  const output: string[] = [];

  let inCodeBlock = false;
  let codeLang = "";
  let codeBuffer: string[] = [];

  let inTable = false;
  let tableAlignments: Array<"left" | "center" | "right" | ""> = [];

  let inList: "ul" | "ol" | null = null;
  let inAlert: { type: string; title: string; icon: string } | null = null;
  let inBlockquote = false;

  const closeList = () => {
    if (inList) {
      output.push(inList === "ul" ? "</ul>" : "</ol>");
      inList = null;
    }
  };

  const closeTable = () => {
    if (inTable) {
      output.push("</tbody></table></div>");
      inTable = false;
      tableAlignments = [];
    }
  };

  const closeQuote = () => {
    if (inAlert) {
      output.push("</div></div>");
      inAlert = null;
    } else if (inBlockquote) {
      output.push("</blockquote>");
      inBlockquote = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Fenced Code Blocks (```lang)
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        closeList();
        closeTable();
        closeQuote();
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim() || "code";
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        const codeText = codeBuffer.join("\n");
        const detected = detectLanguage(codeText, codeLang);
        const highlighted = highlightCode(codeText, detected);

        output.push(
          `<div class="md-code-block">
            <div class="md-code-head">
              <span class="md-code-lang">${escapeHtml(codeLang.toUpperCase())}</span>
              <button class="md-code-copy" data-code="${encodeURIComponent(
                codeText
              )}" onclick="navigator.clipboard.writeText(decodeURIComponent(this.dataset.code));this.innerText='✓ تم النسخ';this.classList.add('copied');setTimeout(()=>{this.innerText='نسخ';this.classList.remove('copied')},2000)">نسخ</button>
            </div>
            <pre class="code-content"><code class="lang-${escapeHtml(codeLang)}">${highlighted}</code></pre>
          </div>`
        );
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // 2. Horizontal Rules (---, ***, ___)
    if (/^([-*_]){3,}\s*$/.test(trimmed)) {
      closeList();
      closeTable();
      closeQuote();
      output.push('<div class="md-hr-wrap"><hr class="md-hr" /><span class="md-hr-dot"></span></div>');
      continue;
    }

    // 3. GitHub / Obsidian Alerts: > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]
    const alertMatch = rawLine.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
    if (alertMatch) {
      closeList();
      closeTable();
      closeQuote();

      const type = alertMatch[1].toUpperCase();
      const customTitle = alertMatch[2].trim();

      const metaMap: Record<string, { title: string; icon: string }> = {
        NOTE: { title: "ملاحظة", icon: "ℹ️" },
        TIP: { title: "نصيحة", icon: "💡" },
        IMPORTANT: { title: "هام جداً", icon: "📌" },
        WARNING: { title: "تحذير", icon: "⚠️" },
        CAUTION: { title: "تنبيه خطر", icon: "🛑" },
      };

      const meta = metaMap[type] ?? { title: type, icon: "💬" };
      inAlert = { type: type.toLowerCase(), title: customTitle || meta.title, icon: meta.icon };

      output.push(
        `<div class="md-alert md-alert-${inAlert.type}">
          <div class="md-alert-title">
            <span class="md-alert-icon">${inAlert.icon}</span>
            <span class="md-alert-heading">${escapeHtml(inAlert.title)}</span>
          </div>
          <div class="md-alert-body">`
      );
      continue;
    }

    // 4. Blockquotes & Alert Body continuation
    if (rawLine.startsWith(">")) {
      closeList();
      closeTable();
      const quoteText = inlineFormatting(rawLine.replace(/^>\s?/, ""));

      if (inAlert) {
        output.push(`<p class="md-alert-p">${quoteText}</p>`);
      } else {
        if (!inBlockquote) {
          output.push('<blockquote class="md-quote">');
          inBlockquote = true;
        }
        output.push(`<p>${quoteText}</p>`);
      }
      continue;
    } else {
      closeQuote();
    }

    // 5. Headings (# Heading)
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      closeTable();
      const level = headingMatch[1].length;
      const content = inlineFormatting(headingMatch[2].trim());
      output.push(
        `<h${level} class="md-h${level}">
          <span class="md-heading-marker">#</span>
          <span class="md-heading-text">${content}</span>
        </h${level}>`
      );
      continue;
    }

    // 6. Tables (| col1 | col2 |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      closeList();
      const rawCells = trimmed.slice(1, -1).split("|");
      const cells = rawCells.map((c) => c.trim());

      // Check if separator line (|:---|:---:|---:|)
      const isSeparator = cells.every((c) => /^:?[-]+:?$/.test(c));

      if (isSeparator) {
        // Parse alignments
        tableAlignments = cells.map((c) => {
          const left = c.startsWith(":");
          const right = c.endsWith(":");
          if (left && right) return "center";
          if (right) return "right";
          if (left) return "left";
          return "";
        });
        continue;
      }

      if (!inTable) {
        inTable = true;
        output.push('<div class="md-table-wrap"><table class="md-table"><thead><tr>');
        for (let idx = 0; idx < cells.length; idx++) {
          const align = tableAlignments[idx] ? ` style="text-align: ${tableAlignments[idx]}"` : "";
          output.push(`<th${align}>${inlineFormatting(cells[idx])}</th>`);
        }
        output.push("</tr></thead><tbody>");
      } else {
        output.push("<tr>");
        for (let idx = 0; idx < cells.length; idx++) {
          const align = tableAlignments[idx] ? ` style="text-align: ${tableAlignments[idx]}"` : "";
          output.push(`<td${align}>${inlineFormatting(cells[idx])}</td>`);
        }
        output.push("</tr>");
      }
      continue;
    } else {
      closeTable();
    }

    // 7. Task List Checkboxes (- [ ] or - [x])
    const taskMatch = rawLine.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      closeTable();
      if (inList !== "ul") {
        closeList();
        output.push('<ul class="md-list md-task-list">');
        inList = "ul";
      }
      const checked = taskMatch[1].toLowerCase() === "x";
      const taskText = inlineFormatting(taskMatch[2]);
      output.push(
        `<li class="md-task-item${checked ? " completed" : ""}">
          <input type="checkbox" disabled ${checked ? "checked" : ""} class="md-checkbox" />
          <span class="md-task-label">${taskText}</span>
        </li>`
      );
      continue;
    }

    // 8. Bullet Lists (- item or * item)
    const bulletMatch = rawLine.match(/^\s*[-*+]\s+(.+)$/);
    if (bulletMatch) {
      closeTable();
      if (inList !== "ul") {
        closeList();
        output.push('<ul class="md-list">');
        inList = "ul";
      }
      output.push(`<li>${inlineFormatting(bulletMatch[1])}</li>`);
      continue;
    }

    // 9. Numbered Lists (1. item)
    const numMatch = rawLine.match(/^\s*\d+\.\s+(.+)$/);
    if (numMatch) {
      closeTable();
      if (inList !== "ol") {
        closeList();
        output.push('<ol class="md-list md-ol">');
        inList = "ol";
      }
      output.push(`<li>${inlineFormatting(numMatch[1])}</li>`);
      continue;
    }

    // 10. Empty lines
    if (!trimmed) {
      closeList();
      closeTable();
      closeQuote();
      continue;
    }

    // 11. Raw HTML block elements (GitHub README support: div, center, p, img, details, etc.)
    const isHtmlBlock = /^<(?:\/)?(div|p|center|details|summary|table|tbody|thead|tr|th|td|section|article|header|footer|img|h[1-6]|sub|sup|ul|ol|li)\b/i.test(
      trimmed
    );
    if (isHtmlBlock) {
      closeList();
      closeTable();
      closeQuote();
      // Normalize relative image paths in raw HTML
      const processedHtml = trimmed.replace(/src=["']\.\/([^"']+)["']/g, 'src="/$1"');
      output.push(processedHtml);
      continue;
    }

    // 12. Regular Paragraph
    closeList();
    closeTable();
    closeQuote();
    output.push(`<p class="md-p">${inlineFormatting(trimmed)}</p>`);
  }

  closeList();
  closeTable();
  closeQuote();

  return output.join("\n");
}

/**
 * Parses inline elements: bold, italics, strikethrough, inline code, links, images, kbd
 */
function inlineFormatting(str: string): string {
  let s = escapeHtml(str);

  // 1. Linked badges & images: [![alt](img_url)](target_url)
  s = s.replace(
    /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g,
    (_m, alt, imgUrl, targetUrl) => {
      const cleanImg = imgUrl.trim().replace(/^\.\//, "/");
      return `<a href="${targetUrl.trim()}" target="_blank" rel="noreferrer" class="md-badge-link"><img src="${cleanImg}" alt="${alt}" class="md-badge-img" /></a>`;
    }
  );

  // 2. Standalone Images: ![alt](url)
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_m, alt, url) => {
      const cleanUrl = url.trim().replace(/^\.\//, "/");
      return `<img src="${cleanUrl}" alt="${alt}" class="md-img" />`;
    }
  );

  // 3. Regular Links: [text](url)
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="md-link">$1 <span class="md-link-arrow">↗</span></a>'
  );

  // 4. Inline Code: `code`
  s = s.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // 5. Bold & Italic: ***text***
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");

  // 6. Bold: **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // 7. Italic: *text*
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // 8. Strikethrough: ~~text~~
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // 9. Preserved safe inline HTML tags
  s = s.replace(/&lt;(kbd|sub|sup|b|i|strong|em|del|mark)&gt;([\s\S]*?)&lt;\/\1&gt;/gi, '<$1>$2</$1>');
  s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br />');

  return s;
}
