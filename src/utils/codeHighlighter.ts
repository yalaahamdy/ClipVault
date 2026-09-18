/**
 * ClipVault — Advanced Code Analysis & Syntax Highlighting Engine
 * Inspired by VS Code, One Dark Pro & Tokyo Night themes.
 * Supports HTML (with internal CSS & JS), Markdown, JSON, and multi-language syntax.
 */

export type SupportedLang =
  | "html"
  | "xml"
  | "markdown"
  | "json"
  | "javascript"
  | "typescript"
  | "python"
  | "css"
  | "sql"
  | "rust"
  | "shell"
  | "text";

/** Escape HTML entities safely */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Detect if string is valid JSON */
export function isJson(str: string): boolean {
  const trimmed = str.trim();
  if (
    (!trimmed.startsWith("{") || !trimmed.endsWith("}")) &&
    (!trimmed.startsWith("[") || !trimmed.endsWith("]"))
  ) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** Format JSON nicely with 2 spaces */
export function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str.trim());
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

/**
 * Intelligent HTML Beautifier / Formatter
 * Formats messy or minified HTML into cleanly indented, human-readable markup.
 */
export function formatHtml(html: string): string {
  const tab = "  ";
  let result = "";
  let indent = 0;

  // Normalize and tokenize tags and text nodes
  const tokens = html
    .replace(/>\s*</g, "><")
    .replace(/</g, "~#~<")
    .replace(/>/g, ">~#~")
    .split("~#~")
    .filter((t) => t.trim().length > 0);

  const voidTags = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr", "!doctype",
  ]);

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("<!--")) {
      // Comment
      result += tab.repeat(indent) + trimmed + "\n";
    } else if (trimmed.startsWith("</")) {
      // Closing tag
      indent = Math.max(0, indent - 1);
      result += tab.repeat(indent) + trimmed + "\n";
    } else if (trimmed.startsWith("<")) {
      // Opening or self-closing tag
      const tagNameMatch = trimmed.match(/^<([a-zA-Z0-9:-]+)/);
      const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : "";
      const isSelfClosing = trimmed.endsWith("/>") || voidTags.has(tagName);

      result += tab.repeat(indent) + trimmed + "\n";
      if (!isSelfClosing) {
        indent++;
      }
    } else {
      // Text content
      result += tab.repeat(indent) + trimmed + "\n";
    }
  }

  return result.trim() || html;
}

/** Check if text looks like HTML */
export function isHtml(str: string): boolean {
  const t = str.trim();
  if (t.toLowerCase().startsWith("<!doctype html") || t.toLowerCase().startsWith("<html")) {
    return true;
  }
  return /<([a-z1-6]+)(?:\s+[^>]*?)?>[\s\S]*?<\/\1>|<(img|input|br|hr|meta|link)[^>]*?\/?>/i.test(
    t
  );
}

/** Check if text looks like Markdown */
export function isMarkdown(str: string): boolean {
  const t = str.trim();
  if (t.length < 8) return false;
  let score = 0;
  if (/^#{1,6}\s+.+/m.test(t)) score += 2;
  if (/^\|?.+\|.+\|[\r\n]+\|?[-: ]+[-| :]+[-: ]+\|?/m.test(t)) score += 3;
  if (/```[\s\S]*?```/.test(t)) score += 2;
  if (/\[.+?\]\(https?:\/\/[^\s)]+\)/.test(t)) score += 2;
  if (/^[-*+]\s+\[[ xX]\]\s+/m.test(t)) score += 3;
  if (/^>\s+\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/im.test(t)) score += 4;
  if (/^>\s+.+/m.test(t)) score += 1;
  if (/^[-*+]\s+.+/m.test(t)) score += 1;
  if (/^\d+\.\s+.+/m.test(t)) score += 1;
  if (/\*\*.+?\*\*|__.+?__/.test(t)) score += 1;
  return score >= 2;
}

/** Guess code language */
export function detectLanguage(text: string, hint?: string): SupportedLang {
  if (hint) {
    const l = hint.toLowerCase();
    if (l.includes("html") || l.includes("htm")) return "html";
    if (l.includes("md") || l.includes("markdown")) return "markdown";
    if (l.includes("json")) return "json";
    if (l.includes("js") || l.includes("javascript")) return "javascript";
    if (l.includes("ts") || l.includes("typescript")) return "typescript";
    if (l.includes("py") || l.includes("python")) return "python";
    if (l.includes("css")) return "css";
    if (l.includes("sql")) return "sql";
    if (l.includes("rs") || l.includes("rust")) return "rust";
    if (l.includes("sh") || l.includes("bash")) return "shell";
  }

  const t = text.trim();
  if (isJson(t)) return "json";
  if (isHtml(t)) return "html";
  if (isMarkdown(t)) return "markdown";
  if (/(^|\n)\s*(import|export|const|let|var|function|return|console\.log)\b/.test(t)) {
    return t.includes(": string") || t.includes("interface ") || t.includes("type ")
      ? "typescript"
      : "javascript";
  }
  if (/(^|\n)\s*(def |class |elif |import |print\(|if __name__)/.test(t)) return "python";
  if (/(^|\n)\s*(fn |pub |impl |let mut |use std::|match )/.test(t)) return "rust";
  if (/(^|\n)\s*(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|WHERE|GROUP BY)\b/i.test(t))
    return "sql";
  if (/([.#][a-zA-Z0-9_-]+|\bbody|\bdiv|\bhtml)\s*\{[^}]*?\}/.test(t)) return "css";
  if (/(^|\n)\s*(echo |cd |mkdir |rm -rf |npm |git |curl |wget )\b/.test(t)) return "shell";

  return "text";
}

/**
 * Tokyo Night & One Dark Pro Inspired Syntax Highlighter
 * High fidelity token classification with HTML embedded CSS/JS highlighting.
 */
export function highlightCode(code: string, lang: SupportedLang): string {
  if (lang === "text" || !code) {
    return escapeHtml(code);
  }

  // 1. JSON Highlighter
  if (lang === "json") {
    const escaped = escapeHtml(code);
    return escaped.replace(
      /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g,
      (match, str, isKey, bool) => {
        if (isKey) return `<span class="tok-key">${str}</span>:`;
        if (str) return `<span class="tok-string">${str}</span>`;
        if (bool) return `<span class="tok-bool">${bool}</span>`;
        return `<span class="tok-number">${match}</span>`;
      }
    );
  }

  // 2. HTML / XML Advanced Highlighter
  if (lang === "html" || lang === "xml") {
    // Process comments first
    let text = code;
    const commentTokens: string[] = [];
    text = text.replace(/<!--[\s\S]*?-->/g, (match) => {
      commentTokens.push(`<span class="tok-comment">${escapeHtml(match)}</span>`);
      return `___HTML_COMM_${commentTokens.length - 1}___`;
    });

    // Escape markup
    let escaped = escapeHtml(text);

    // Doctype
    escaped = escaped.replace(
      /(&lt;!DOCTYPE[\s\S]*?&gt;)/gi,
      '<span class="tok-doctype">$1</span>'
    );

    // Tags and attributes
    escaped = escaped.replace(
      /(&lt;\/?)([a-zA-Z0-9:-]+)((?:\s+[a-zA-Z0-9_:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s&>]+))?)*\s*)(\/?&gt;)/g,
      (_match, open, tag, attrs, close) => {
        const highlightedAttrs = attrs.replace(
          /([a-zA-Z0-9_:-]+)(=)("[^"]*"|'[^']*'|[^\s&>]+)?/g,
          '<span class="tok-attr">$1</span><span class="tok-punct">$2</span><span class="tok-string">$3</span>'
        );
        return `<span class="tok-punct">${open}</span><span class="tok-tag">${tag}</span>${highlightedAttrs}<span class="tok-punct">${close}</span>`;
      }
    );

    // HTML Entities: &amp;, &lt;, &#123;, etc.
    escaped = escaped.replace(/(&amp;[a-zA-Z0-9#]+;)/g, '<span class="tok-entity">$1</span>');

    // Restore comments
    for (let i = 0; i < commentTokens.length; i++) {
      escaped = escaped.replace(`___HTML_COMM_${i}___`, commentTokens[i]);
    }

    return escaped;
  }

  // 3. General Programming Languages (JS, TS, Python, Rust, SQL, CSS, Shell)
  let escaped = escapeHtml(code);

  // Strings
  escaped = escaped.replace(
    /(["'`])(?:(?=(\\?))\2.)*?\1/g,
    '<span class="tok-string">$&</span>'
  );

  // Comments
  escaped = escaped.replace(
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g,
    '<span class="tok-comment">$1</span>'
  );

  // Numbers (hex, float, int)
  escaped = escaped.replace(/\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="tok-number">$1</span>');

  // Keywords
  const keywords =
    lang === "sql"
      ? /\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|ON|AND|OR|NOT|IN|EXISTS|CREATE|TABLE|DROP|ALTER|PRIMARY|KEY|CASCADE|SET|VALUES)\b/gi
      : lang === "python"
      ? /\b(def|class|if|elif|else|while|for|in|return|import|from|as|try|except|finally|with|pass|break|continue|lambda|yield|async|await|None|True|False|is|not)\b/g
      : lang === "rust"
      ? /\b(fn|let|mut|pub|struct|enum|impl|trait|use|mod|match|if|else|loop|while|for|in|return|async|await|const|type|where|self|Self|true|false|ref|move)\b/g
      : lang === "css"
      ? /\b(important|px|rem|em|vh|vw|calc|var|rgba?|hsl|none|auto|inherit|solid|flex|grid|block|inline|absolute|relative|fixed)\b/g
      : /\b(function|const|let|var|class|new|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|async|await|import|export|from|default|extends|implements|interface|type|public|private|protected|static|true|false|null|undefined|typeof|instanceof)\b/g;

  escaped = escaped.replace(keywords, '<span class="tok-keyword">$&</span>');

  // Function invocations: foo(...)
  escaped = escaped.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, '<span class="tok-fn">$1</span>');

  return escaped;
}

/** Get line, word, character, and byte stats */
export function getCodeStats(text: string) {
  const lines = text.split("\n").length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const bytes = new Blob([text]).size;
  const kb = (bytes / 1024).toFixed(1);
  return { lines, words, chars, bytes, kb };
}
