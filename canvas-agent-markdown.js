(function initializeCanvasAgentMarkdown(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentMarkdown = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentMarkdown() {
  const HTML_ESCAPE = Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  });

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPE[character]);
  }

  function safeUrl(value) {
    const url = String(value || "").trim();
    return /^(?:https?:\/\/|mailto:)/i.test(url) ? escapeHtml(url) : "";
  }

  function markLeadingTitle(value) {
    return String(value || "").replace(/^<strong>/, '<strong class="canvas-agent-md-title">');
  }

  function renderInlineMarkdown(value) {
    const codeTokens = [];
    const withCodeTokens = String(value ?? "").replace(/`([^`\n]+)`/g, (_, code) => {
      const token = `\u0000${codeTokens.length}\u0000`;
      codeTokens.push(code);
      return token;
    });

    let output = escapeHtml(withCodeTokens)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
        const href = safeUrl(url);
        return href
          ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
          : match;
      })
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
      .replace(/(^|[^\w])\*([^*\n]+)\*(?=$|[^\w])/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_([^_\n]+)_(?=$|[^\w])/g, "$1<em>$2</em>");

    return output.replace(/\u0000(\d+)\u0000/g, (_, index) => {
      const code = codeTokens[Number(index)] || "";
      return `<code>${escapeHtml(code)}</code>`;
    });
  }

  function isTableStart(lines, index) {
    return /^\s*\|.+\|\s*$/.test(lines[index] || "")
      && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] || "");
  }

  function splitTableRow(line) {
    return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  }

  function renderTable(lines) {
    const rows = lines.filter((_, index) => index !== 1).map(splitTableRow);
    if (!rows.length) return "";
    const [head, ...body] = rows;
    return `<div class="canvas-agent-table-wrap"><table class="canvas-agent-table"><thead><tr>${
      head.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")
    }</tr></thead><tbody>${
      body.map((row) => `<tr>${
        row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")
      }</tr>`).join("")
    }</tbody></table></div>`;
  }

  function isBlockStart(lines, index) {
    const line = lines[index] || "";
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (/^```/.test(trimmed)) return true;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (/^>\s?/.test(trimmed)) return true;
    if (/^\s*[-+*]\s+/.test(line)) return true;
    if (/^\s*\d+[.)]\s+/.test(line)) return true;
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return true;
    return isTableStart(lines, index);
  }

  function renderList(lines, startIndex, ordered) {
    const items = [];
    let currentItem = "";
    let index = startIndex;
    const markerPattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
    const oppositeMarker = ordered
      ? (line) => /^\s*[-+*]\s+/.test(line)
      : (line) => /^\s*\d+[.)]\s+/.test(line);

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) break;
      const marker = line.match(markerPattern);
      if (marker) {
        if (currentItem) items.push(currentItem);
        currentItem = markLeadingTitle(renderInlineMarkdown(marker[1]));
        index += 1;
        continue;
      }
      if (oppositeMarker(line) || /^(?:```|#{1,6}\s+|>\s?)/.test(line.trim())) break;
      if (!currentItem) break;
      currentItem += `<br>${renderInlineMarkdown(line.trim())}`;
      index += 1;
    }

    if (currentItem) items.push(currentItem);
    const tag = ordered ? "ol" : "ul";
    return {
      html: `<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`,
      index,
    };
  }

  function renderMarkdown(value) {
    const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();
      if (!trimmed) {
        index += 1;
        continue;
      }

      const fence = trimmed.match(/^```\s*([A-Za-z0-9_-]*)\s*$/);
      if (fence) {
        index += 1;
        const codeLines = [];
        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const language = fence[1] ? ` language-${fence[1]}` : "";
        blocks.push(`<pre><code class="${language.trim()}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        continue;
      }

      if (isTableStart(lines, index)) {
        const tableLines = [];
        while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
          tableLines.push(lines[index]);
          index += 1;
        }
        blocks.push(renderTable(tableLines));
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        blocks.push("<hr>");
        index += 1;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        const quoteLines = [];
        while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
          quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
          index += 1;
        }
        blocks.push(`<blockquote>${quoteLines.map(renderInlineMarkdown).join("<br>")}</blockquote>`);
        continue;
      }

      if (/^\s*[-+*]\s+/.test(line)) {
        const list = renderList(lines, index, false);
        blocks.push(list.html);
        index = list.index;
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const list = renderList(lines, index, true);
        blocks.push(list.html);
        index = list.index;
        continue;
      }

      const paragraphLines = [];
      while (index < lines.length && !isBlockStart(lines, index)) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }
      if (paragraphLines.length) {
        const renderedLines = paragraphLines.map(renderInlineMarkdown);
        renderedLines[0] = markLeadingTitle(renderedLines[0]);
        blocks.push(`<p>${renderedLines.join("<br>")}</p>`);
      }
    }

    return blocks.join("");
  }

  return Object.freeze({
    escapeHtml,
    renderInlineMarkdown,
    renderMarkdown,
  });
});
