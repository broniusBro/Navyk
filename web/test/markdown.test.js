import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, renderMarkdownToHtml, safeHref, escapeHtml } from "../js/engine/markdown.js";

test("escapes raw HTML everywhere", () => {
  const html = renderMarkdownToHtml('<script>alert(1)</script> **<b>x</b>** `<i>` *"q"*');
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<b>"));
  assert.ok(!html.includes("<i>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<strong>&lt;b&gt;x&lt;/b&gt;</strong>"));
  assert.ok(html.includes("<em>&quot;q&quot;</em>"));
});

test("bold, italic, code inline", () => {
  assert.equal(renderMarkdownToHtml("a **b** *c* `d`"), "<p>a <strong>b</strong> <em>c</em> <code>d</code></p>");
});

test("bold containing italic", () => {
  assert.equal(renderMarkdownToHtml("**a *b* c**"), "<p><strong>a <em>b</em> c</strong></p>");
});

test("lone asterisks stay literal", () => {
  assert.equal(renderMarkdownToHtml("2 * 3 = 6"), "<p>2 * 3 = 6</p>");
  assert.equal(renderMarkdownToHtml("карта ****1234"), "<p>карта ****1234</p>");
});

test("links: only https, with target and rel", () => {
  const html = renderMarkdownToHtml("[ok](https://example.com/a?b=1) [bad](javascript:alert(1)) [http](http://x.com)");
  assert.ok(html.includes('<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">ok</a>'));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes('href="http://'));
  assert.ok(html.includes("bad"));
});

test("safeHref rejects quotes and non-https", () => {
  assert.equal(safeHref('https://a.com/"onmouseover=x'), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref("//evil.com"), null);
  assert.equal(safeHref("https://a.com"), "https://a.com");
});

test("paragraphs and line breaks", () => {
  assert.equal(renderMarkdownToHtml("one\ntwo\n\nthree"), "<p>one<br>two</p><p>three</p>");
});

test("unordered and ordered lists", () => {
  assert.equal(renderMarkdownToHtml("- a;\n- **b**;\n\n1. x\n2. y"), "<ul><li>a;</li><li><strong>b</strong>;</li></ul><ol><li>x</li><li>y</li></ol>");
});

test("prompt and claude fences become chat bubbles, escaped", () => {
  const md = "Intro\n\n```prompt\nHi <there>\nline 2\n```\n\n```claude\nHello & welcome\n```\n\nOutro";
  const blocks = parseMarkdown(md);
  assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "bubble", "bubble", "paragraph"]);
  assert.equal(blocks[1].role, "user");
  assert.equal(blocks[2].role, "assistant");
  const html = renderMarkdownToHtml(md, { assistantLabel: "Claude" });
  assert.ok(html.includes('<div class="bubble bubble--user"><p class="bubble__text">Hi &lt;there&gt;\nline 2</p></div>'));
  assert.ok(html.includes('<span class="bubble__label">Claude</span><p class="bubble__text">Hello &amp; welcome</p>'));
});

test("other fences are code blocks; markdown inside is not parsed", () => {
  const html = renderMarkdownToHtml("```\n**x** <y>\n```");
  assert.equal(html, "<pre><code>**x** &lt;y&gt;</code></pre>");
});

test("unterminated fence does not swallow the rest unsafely", () => {
  const html = renderMarkdownToHtml("```prompt\n<img src=x onerror=alert(1)>");
  assert.ok(!html.includes("<img"));
});

test("attribute injection via label is escaped", () => {
  const html = renderMarkdownToHtml("x", { assistantLabel: '"><img>' });
  assert.ok(!html.includes("<img>"));
  assert.equal(escapeHtml(`'"<>&`), "&#39;&quot;&lt;&gt;&amp;");
});

test("real lesson markdown renders without leftovers", async () => {
  const { readFile } = await import("node:fs/promises");
  const lesson = JSON.parse(await readFile(new URL("../../content/dist/ru/b1.1.json", import.meta.url), "utf8"));
  for (const b of lesson.blocks.filter((x) => x.markdown)) {
    const html = renderMarkdownToHtml(b.markdown);
    assert.ok(!html.includes("```"), "fence leaked");
    assert.ok(!/<(?!\/?(p|br|strong|em|code|a|ul|ol|li|div|span|pre|h\d)\b)/.test(html), "unexpected tag");
  }
});
