// Minimal safe Markdown for lessons. Pure: text in, AST out; AST to escaped HTML string.
// Supported: paragraphs, **bold**, *italic*, `code`, [links](https://...), - / 1. lists,
// ### headings, fenced ```prompt / ```claude (chat bubbles) and other fences (code block).
// Anything else stays literal text. Raw HTML is never passed through.

const FENCE = /^```\s*([\w-]*)\s*$/;
const UL = /^\s*[-*]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;

/** Only absolute https URLs are links; everything else becomes plain text. */
export function safeHref(url) {
  const u = String(url || "").trim();
  if (!/^https:\/\/[^\s"'<>`]+$/i.test(u)) return null;
  return u;
}

/** Parse inline markup into nodes: text | strong | em | code | link | br. */
export function parseInline(src) {
  const nodes = [];
  let buf = "";
  const flush = () => {
    if (buf) nodes.push({ type: "text", value: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\" && i + 1 < src.length && "\\`*_[]()".includes(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      flush();
      nodes.push({ type: "br" });
      i++;
      continue;
    }
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: "code", value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        nodes.push({ type: "strong", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === "*" && src[i + 1] !== " " && src[i + 1] !== "*") {
      const end = findSingleStar(src, i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: "em", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        flush();
        const href = safeHref(m[2]);
        const children = parseInline(m[1]);
        nodes.push(href ? { type: "link", href, children } : { type: "text", value: m[1] });
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return nodes;
}

function findSingleStar(src, from) {
  for (let j = from; j < src.length; j++) {
    if (src[j] === "\n") return -1;
    if (src[j] === "*" && src[j + 1] !== "*" && src[j - 1] !== " ") return j;
    if (src[j] === "*" && src[j + 1] === "*") j++;
  }
  return -1;
}

/** Parse block structure. */
export function parseMarkdown(md) {
  const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  let list = null;
  const endPara = () => {
    if (para.length) blocks.push({ type: "paragraph", children: parseInline(para.join("\n")) });
    para = [];
  };
  const endList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line.trim());
    if (fence) {
      endPara();
      endList();
      const lang = fence[1].toLowerCase();
      const body = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "```") body.push(lines[i++]);
      const text = body.join("\n").replace(/\s+$/, "");
      if (lang === "prompt") blocks.push({ type: "bubble", role: "user", text });
      else if (lang === "claude") blocks.push({ type: "bubble", role: "assistant", text });
      else blocks.push({ type: "codeblock", lang, text });
      continue;
    }
    if (!line.trim()) {
      endPara();
      endList();
      continue;
    }
    const ul = UL.exec(line);
    const ol = ul ? null : OL.exec(line);
    if (ul || ol) {
      endPara();
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        endList();
        list = { type: "list", ordered, items: [] };
      }
      list.items.push(parseInline((ul || ol)[1]));
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      endPara();
      endList();
      blocks.push({ type: "heading", level: Math.min(h[1].length + 2, 6), children: parseInline(h[2]) });
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      // continuation of the previous list item
      const last = list.items[list.items.length - 1];
      last.push({ type: "br" }, ...parseInline(line.trim()));
      continue;
    }
    endList();
    para.push(line);
  }
  endPara();
  endList();
  return blocks;
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function inlineHtml(nodes) {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text": return escapeHtml(n.value);
        case "br": return "<br>";
        case "code": return `<code>${escapeHtml(n.value)}</code>`;
        case "strong": return `<strong>${inlineHtml(n.children)}</strong>`;
        case "em": return `<em>${inlineHtml(n.children)}</em>`;
        case "link":
          return `<a href="${escapeHtml(n.href)}" target="_blank" rel="noopener noreferrer">${inlineHtml(n.children)}</a>`;
        default: return "";
      }
    })
    .join("");
}

/** AST to HTML string. Every piece of text is escaped. `assistantLabel` names the Claude bubble. */
export function toHtml(blocks, { assistantLabel = "Claude", userLabel = "" } = {}) {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "paragraph": return `<p>${inlineHtml(b.children)}</p>`;
        case "heading": return `<h${b.level}>${inlineHtml(b.children)}</h${b.level}>`;
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          return `<${tag}>${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join("")}</${tag}>`;
        }
        case "codeblock": return `<pre><code>${escapeHtml(b.text)}</code></pre>`;
        case "bubble": {
          const label = b.role === "assistant" ? assistantLabel : userLabel;
          return `<div class="bubble bubble--${b.role}">${label ? `<span class="bubble__label">${escapeHtml(label)}</span>` : ""}<p class="bubble__text">${escapeHtml(b.text)}</p></div>`;
        }
        default: return "";
      }
    })
    .join("");
}

export const renderMarkdownToHtml = (md, opts) => toHtml(parseMarkdown(md), opts);

/** Plain text of inline nodes (for aria labels, previews). */
export function inlineText(nodes) {
  return nodes.map((n) => (n.type === "text" || n.type === "code" ? n.value : n.type === "br" ? " " : n.children ? inlineText(n.children) : "")).join("");
}
