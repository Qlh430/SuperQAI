(function initCanvasTextNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasTextNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasTextNodeRenderer() {
  "use strict";

  const PLACEHOLDER = "写下一个想法";
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

  function normalizeSource(value) {
    return String(value ?? "").replace(/\r\n?/g, "\n");
  }

  function renderFallbackInline(value) {
    return escapeHtml(value)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
      .replace(/(^|[^\w])\*([^*\n]+)\*(?=$|[^\w])/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_([^_\n]+)_(?=$|[^\w])/g, "$1<em>$2</em>");
  }

  function renderFallbackMarkdown(value) {
    const source = normalizeSource(value);
    const blocks = source.split(/\n{2,}/);
    const rendered = [];
    for (const block of blocks) {
      const lines = block.split("\n");
      const first = lines[0]?.trim() || "";
      const heading = first.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        rendered.push(`<h${level}>${renderFallbackInline(heading[2])}</h${level}>`);
        if (lines.length > 1) {
          rendered.push(`<p>${lines.slice(1).map(renderFallbackInline).join("<br>")}</p>`);
        }
        continue;
      }
      if (lines.every((line) => /^\s*[-+*]\s+/.test(line))) {
        rendered.push(`<ul>${lines.map((line) => `<li>${renderFallbackInline(line.replace(/^\s*[-+*]\s+/, ""))}</li>`).join("")}</ul>`);
        continue;
      }
      if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
        rendered.push(`<ol>${lines.map((line) => `<li>${renderFallbackInline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`);
        continue;
      }
      if (lines.every((line) => /^>\s?/.test(line.trim()))) {
        rendered.push(`<blockquote>${lines.map((line) => renderFallbackInline(line.trim().replace(/^>\s?/, ""))).join("<br>")}</blockquote>`);
        continue;
      }
      rendered.push(`<p>${lines.map(renderFallbackInline).join("<br>")}</p>`);
    }
    return rendered.join("");
  }

  function resolveText(target) {
    if (!target) return null;
    if (target.classList?.contains("canvas-text")) return target;
    return target.querySelector?.(".canvas-text") || null;
  }

  function markdownApi(text) {
    const elementRoot = text?.ownerDocument?.defaultView || globalThis;
    return elementRoot.CanvasAgentMarkdown || globalThis.CanvasAgentMarkdown || null;
  }

  function markEmptyState(text, value) {
    text.dataset.empty = String(value).trim() ? "false" : "true";
  }

  function renderPreview(text, source) {
    if (!text) return "";
    const value = normalizeSource(source);
    const markdown = markdownApi(text);
    const rendered = markdown?.renderMarkdown
      ? markdown.renderMarkdown(value)
      : renderFallbackMarkdown(value);
    const scrollTop = Number(text.scrollTop) || 0;
    text.dataset.markdownSource = value;
    text.dataset.editing = "false";
    text.contentEditable = "false";
    text.classList.remove("is-editing");
    text.classList.add("is-markdown");
    markEmptyState(text, value);
    text.innerHTML = `<div class="canvas-agent-markdown canvas-text-markdown">${
      rendered || `<p class="canvas-text-placeholder">${PLACEHOLDER}</p>`
    }</div>`;
    text.scrollTop = scrollTop;
    return value;
  }

  function readEditableSource(text) {
    const raw = typeof text?.innerText === "string" ? text.innerText : text?.textContent || "";
    return normalizeSource(raw).replace(/\n$/, "");
  }

  function beginEdit(target) {
    const text = resolveText(target);
    if (!text) return false;
    const source = normalizeSource(text.dataset.markdownSource ?? text.textContent ?? "");
    const scrollTop = Number(text.scrollTop) || 0;
    text.dataset.markdownSource = source;
    text.dataset.editing = "true";
    text.classList.remove("is-markdown");
    text.classList.add("is-editing");
    text.contentEditable = "true";
    text.textContent = source;
    markEmptyState(text, source);
    text.scrollTop = scrollTop;
    const focus = () => {
      if (!text.isConnected || text.dataset.editing !== "true") return;
      text.focus({ preventScroll: true });
      const selection = text.ownerDocument?.getSelection?.();
      if (!selection) return;
      const range = text.ownerDocument.createRange();
      range.selectNodeContents(text);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    };
    if (typeof text.ownerDocument?.defaultView?.requestAnimationFrame === "function") {
      text.ownerDocument.defaultView.requestAnimationFrame(focus);
    } else {
      Promise.resolve().then(focus);
    }
    return true;
  }

  function commitEdit(target) {
    const text = resolveText(target);
    if (!text || text.dataset.editing !== "true") return "";
    return renderPreview(text, readEditableSource(text));
  }

  function setValue(target, value, options = {}) {
    const text = resolveText(target);
    if (!text) return "";
    const source = normalizeSource(value);
    if (text.dataset.editing === "true" && options.preserveEditing !== false) {
      text.dataset.markdownSource = source;
      text.textContent = source;
      markEmptyState(text, source);
      return source;
    }
    return renderPreview(text, source);
  }

  function getValue(target) {
    const text = resolveText(target);
    if (!text) return "";
    return normalizeSource(text.dataset.markdownSource ?? text.textContent ?? "");
  }

  function refreshMarkdown(root = globalThis) {
    const document = root.document;
    if (!document) return;
    document.querySelectorAll(".canvas-text[data-markdown-source]").forEach((text) => {
      if (text.dataset.editing === "true") return;
      renderPreview(text, text.dataset.markdownSource || "");
    });
  }

  function ensureMarkdownUpgradeListener(root) {
    if (!root?.document || root.__canvasTextMarkdownUpgradeBound) return;
    root.__canvasTextMarkdownUpgradeBound = true;
    const upgrade = () => {
      if (root.CanvasAgentMarkdown?.renderMarkdown) refreshMarkdown(root);
    };
    root.document.addEventListener("ai-os-module-load-progress", (event) => {
      const source = String(event?.detail?.src || "").split(/[?#]/, 1)[0];
      if (event?.detail?.status === "loaded" && source.endsWith("/canvas-agent-markdown.js")) upgrade();
    });
    root.document.addEventListener("ai-os-module-load-complete", upgrade);
  }

  function render(node, content, context = {}) {
    const document = context.document || globalThis.document;
    const {
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      scheduleCanvasConnectionRender,
      scheduleCanvasSave,
      stopCanvasTextWheel,
      syncCanvasTextFromLlmInputs,
    } = context;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas text node renderer context is incomplete.");
    }

    node.innerHTML = "";
    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const text = document.createElement("div");
    text.className = "canvas-text";
    const initial = normalizeSource(content);
    renderPreview(text, initial === PLACEHOLDER ? "" : initial);
    text.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (text.dataset.editing !== "true") beginEdit(text);
    });
    text.addEventListener("input", () => {
      const value = readEditableSource(text);
      text.dataset.markdownSource = value;
      markEmptyState(text, value);
    });
    if (stopCanvasTextWheel) text.addEventListener("wheel", stopCanvasTextWheel);
    text.addEventListener("blur", () => {
      commitEdit(text);
      scheduleCanvasSave?.();
    });
    text.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && text.dataset.editing === "true") {
        event.preventDefault();
        text.blur();
      }
    });
    const textName = String(node.dataset.textName || "文字").replace(/\s+/g, " ").trim().slice(0, 80) || "文字";
    node.dataset.textName = textName;
    node.append(
      inputPort,
      outputPort,
      createCanvasNodeBar(textName, { editable: true, editableKind: "text" }),
      text,
      createCanvasResizeHandle(),
    );
    syncCanvasTextFromLlmInputs?.(node);
    scheduleCanvasConnectionRender?.();
  }

  ensureMarkdownUpgradeListener(typeof root !== "undefined" ? root : globalThis);

  return Object.freeze({
    render,
    beginEdit,
    commitEdit,
    getValue,
    refreshMarkdown,
    setValue,
  });
});
