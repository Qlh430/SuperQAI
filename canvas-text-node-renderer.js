(function initCanvasTextNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasTextNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasTextNodeRenderer() {
  "use strict";

  const PLACEHOLDER = "写下一个想法";
  const editors = new WeakMap();
  const selectionDocuments = new WeakSet();
  const FORMATS = [
    ["bold", "粗体", "bold"], ["italic", "斜体", "italic"], ["underline", "下划线", "underline"],
    ["p", "正文", "pilcrow"], ["h1", "一级标题", "heading-1"], ["h2", "二级标题", "heading-2"], ["h3", "三级标题", "heading-3"],
  ];
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

  // Only semantic markup travels with a node. External fonts, colours, event
  // handlers and active content never enter the editable DOM.
  function sanitizeHtml(document, html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    const allowed = new Set("p div h1 h2 h3 h4 h5 h6 strong b em i u s blockquote pre code br ul ol li hr table thead tbody tfoot tr th td a".split(" "));
    const dropped = new Set("script style iframe object embed svg math img video audio input button textarea select link meta".split(" "));
    function clean(source) {
      if (source.nodeType === 3) return document.createTextNode(source.textContent);
      if (source.nodeType !== 1 || dropped.has(source.localName)) return document.createDocumentFragment();
      const tag = source.localName;
      let result = allowed.has(tag) ? document.createElement(tag) : document.createDocumentFragment();
      for (const child of source.childNodes) result.append(clean(child));
      if (result.nodeType === 1) {
        const classes = [...source.classList].filter(name => ["canvas-agent-md-title", "canvas-agent-table-wrap", "canvas-agent-table"].includes(name));
        if (classes.length) result.className = classes.join(" ");
        if (tag === "a" && source.hasAttribute("href")) {
          try {
            const url = new URL(source.getAttribute("href"), document.baseURI);
            if (["http:", "https:", "mailto:"].includes(url.protocol)) { result.href = url.href; result.rel = "noopener noreferrer"; }
          } catch { /* Keep the link text. */ }
        }
        if (tag === "ol" && /^\d+$/.test(source.getAttribute("start") || "")) result.setAttribute("start", source.getAttribute("start"));
      }
      const style = source.style;
      for (const [semantic, enabled] of [["strong", /^(bold|[6-9]00)$/.test(style.fontWeight) && !["b", "strong"].includes(tag)], ["em", style.fontStyle === "italic" && !["em", "i"].includes(tag)], ["u", style.textDecorationLine.includes("underline") && tag !== "u"]]) {
        if (enabled) { const wrap = document.createElement(semantic); wrap.append(result); result = wrap; }
      }
      return result;
    }
    const container = document.createElement("div");
    for (const child of template.content.childNodes) container.append(clean(child));
    return container.innerHTML;
  }

  function richContainer(text) { return text.querySelector(":scope > .canvas-text-markdown") || text; }

  function htmlToMarkdown(document, html) {
    const container = document.createElement("div"); container.innerHTML = html;
    function read(node) {
      if (node.nodeType === 3) return node.textContent.replace(/\u00a0/g, " ");
      const tag = node.localName;
      const children = () => [...node.childNodes].map(read).join("");
      if (tag === "br") return "\n";
      if (tag === "strong" || tag === "b") return `**${children()}**`;
      if (tag === "em" || tag === "i") return `*${children()}*`;
      if (tag === "u") return `<u>${children()}</u>`;
      if (tag === "s") return `~~${children()}~~`;
      if (tag === "pre") return `\n\n\`\`\`\n${node.textContent.replace(/\n$/, "")}\n\`\`\`\n\n`;
      if (tag === "code") return `\`${children()}\``;
      if (/^h[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${children().trim()}\n\n`;
      if (tag === "blockquote") return `\n\n${children().trim().split("\n").map(line => `> ${line}`).join("\n")}\n\n`;
      if (tag === "ul" || tag === "ol") return `\n\n${[...node.children].map((li, i) => `${tag === "ul" ? "-" : `${i + Number(node.getAttribute("start") || 1)}.`} ${read(li).trim().replace(/\n/g, "\n  ")}`).join("\n")}\n\n`;
      if (tag === "a" && node.hasAttribute("href")) return `[${children()}](${node.getAttribute("href")})`;
      if (tag === "table") {
        const rows = [...node.querySelectorAll("tr")].map(row => `| ${[...row.children].map(cell => read(cell).trim().replace(/\|/g, "\\|").replace(/\n/g, "<br>")).join(" | ")} |`);
        if (rows.length) rows.splice(1, 0, `| ${[...node.querySelector("tr").children].map(() => "---").join(" | ")} |`);
        return `\n\n${rows.join("\n")}\n\n`;
      }
      if (tag === "hr") return "\n\n---\n\n";
      if (tag === "p" || tag === "div") return `\n\n${children()}\n\n`;
      return children();
    }
    return [...container.childNodes].map(read).join("").replace(/\n{3,}/g, "\n\n").trim();
  }

  function getRichHtml(target) {
    const text = resolveText(target);
    if (!text) return "";
    if (!text.textContent.trim() && !text.querySelector("hr,table,pre")) return "";
    const html = [...text.childNodes].map(child => child.nodeType === 1 && child.classList.contains("canvas-text-markdown")
      ? child.innerHTML : child.nodeType === 3 ? escapeHtml(child.textContent) : child.outerHTML || "").join("");
    return sanitizeHtml(text.ownerDocument, html);
  }

  function syncContent(text) {
    const html = getRichHtml(text);
    const state = editors.get(text);
    if (html !== state?.lastHtml) {
      text.dataset.markdownSource = htmlToMarkdown(text.ownerDocument, html);
      if (state) state.lastHtml = html;
    }
    text.dataset.richHtml = html;
    const node = text.closest(".canvas-node");
    if (node) node.dataset.textRichHtml = html;
    markEmptyState(text, text.textContent.trim() || (text.querySelector("hr,table,pre") ? "结构内容" : ""));
    syncToolbar(text);
  }

  function renderPreview(text, source, richHtml) {
    if (!text) return "";
    const value = normalizeSource(source);
    const markdown = markdownApi(text);
    const rendered = richHtml !== undefined ? sanitizeHtml(text.ownerDocument, richHtml) : markdown?.renderMarkdown
      ? markdown.renderMarkdown(value)
      : renderFallbackMarkdown(value);
    const scrollTop = Number(text.scrollTop) || 0;
    text.dataset.markdownSource = value;
    text.dataset.editing = "false";
    text.contentEditable = "false";
    text.classList.remove("is-editing");
    text.classList.add("is-markdown");
    markEmptyState(text, value);
    text.dataset.placeholder = "双击开始编辑…";
    text.innerHTML = `<div class="canvas-agent-markdown canvas-text-markdown">${rendered || "<p><br></p>"}</div>`;
    text.dataset.richHtml = getRichHtml(text);
    text.dataset.richOverride = String(richHtml !== undefined);
    const node = text.closest(".canvas-node");
    if (node) node.dataset.textRichHtml = text.dataset.richHtml;
    text.title = value ? "双击编辑" : "";
    text.setAttribute("role", "textbox"); text.setAttribute("aria-multiline", "true");
    text.setAttribute("aria-label", "文字内容，双击编辑");
    syncToolbar(text);
    text.scrollTop = scrollTop;
    return value;
  }

  function beginEdit(target) {
    const text = resolveText(target);
    if (!text) return false;
    if (text.dataset.editing === "true") return true;
    const state = editors.get(text) || {};
    state.before = state.context?.captureCanvasTextEdit?.(text.closest(".canvas-node"));
    state.lastHtml = getRichHtml(text); editors.set(text, state);
    const source = normalizeSource(text.dataset.markdownSource ?? text.textContent ?? "");
    const scrollTop = Number(text.scrollTop) || 0;
    text.dataset.markdownSource = source;
    text.dataset.editing = "true";
    text.classList.add("is-markdown");
    text.classList.add("is-editing");
    text.contentEditable = "true";
    text.dataset.placeholder = "请输入文字内容…";
    text.title = "";
    text.setAttribute("aria-label", "文字内容");
    markEmptyState(text, source);
    text.scrollTop = scrollTop;
    syncToolbar(text);
    const focus = () => {
      if (!text.isConnected || text.dataset.editing !== "true") return;
      text.focus({ preventScroll: true });
      const selection = text.ownerDocument?.getSelection?.();
      if (!selection) return;
      const range = text.ownerDocument.createRange();
      range.selectNodeContents(richContainer(text));
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
    syncContent(text);
    const state = editors.get(text);
    const value = renderPreview(text, text.dataset.markdownSource || "", text.dataset.richHtml);
    state?.context?.commitCanvasTextEdit?.(text.closest(".canvas-node"), state.before);
    if (state) { state.before = null; state.range = null; }
    return value;
  }

  function setValue(target, value, options = {}) {
    const text = resolveText(target);
    if (!text) return "";
    const source = normalizeSource(value);
    const editing = text.dataset.editing === "true" && options.preserveEditing !== false;
    const result = renderPreview(text, source, options.richHtml);
    if (editing) beginEdit(text);
    return result;
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
      renderPreview(text, text.dataset.markdownSource || "", text.dataset.richOverride === "true" ? text.dataset.richHtml : undefined);
    });
  }

  function selectionRange(text) {
    const selection = text.ownerDocument.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return text.contains(range.commonAncestorContainer) ? range : null;
  }

  function syncToolbar(text) {
    const node = text.closest(".canvas-node");
    if (!node) return;
    const editing = text.dataset.editing === "true";
    if (node.dataset.textEditing !== String(editing)) node.dataset.textEditing = String(editing);
    const group = node.querySelector(".flora-text-format-tools");
    if (!group) return;
    if (group.hidden === editing) group.hidden = !editing;
    const range = selectionRange(text), state = editors.get(text);
    if (range && editing && state) state.range = range.cloneRange();
    const anchor = range?.startContainer;
    const element = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
    const block = element?.closest("h1,h2,h3,p,div,li,blockquote");
    group.querySelectorAll("[data-text-format]").forEach(button => {
      const command = button.dataset.textFormat;
      const active = Boolean(editing && range && (["bold", "italic", "underline"].includes(command)
        ? text.ownerDocument.queryCommandState(command)
        : command === "p" ? !block?.matches("h1,h2,h3") : block?.localName === command));
      if (button.getAttribute("aria-pressed") !== String(active)) button.setAttribute("aria-pressed", String(active));
    });
  }

  function applyFormat(text, command) {
    if (text.dataset.editing !== "true") return;
    const state = editors.get(text), document = text.ownerDocument;
    text.focus({ preventScroll: true });
    if (state?.range && text.contains(state.range.commonAncestorContainer)) {
      const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(state.range);
    }
    // Browser editing transactions preserve native caret and undo semantics.
    document.execCommand("styleWithCSS", false, false);
    document.execCommand(["bold", "italic", "underline"].includes(command) ? command : "formatBlock", false,
      ["bold", "italic", "underline"].includes(command) ? null : command);
    syncContent(text);
  }

  function mountToolbar(node, toolbar) {
    const text = resolveText(node);
    if (!text || toolbar.querySelector(".flora-text-format-tools")) return;
    const document = text.ownerDocument;
    const group = document.createElement("div"); group.className = "flora-text-format-tools"; group.hidden = true;
    group.setAttribute("role", "group"); group.setAttribute("aria-label", "文字格式");
    for (const [command, title, icon] of FORMATS) {
      const button = document.defaultView.CanvasNodeActionBar.createButton({ id: `text-${command}`, title, icon, modifierClass: "flora-node-action flora-node-icon-action flora-text-format-action" });
      button.dataset.textFormat = command; button.setAttribute("aria-pressed", "false");
      button.addEventListener("pointerdown", event => { event.preventDefault(); event.stopPropagation(); });
      button.addEventListener("click", event => { event.stopPropagation(); applyFormat(text, command); });
      button.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); commitEdit(text); } });
      group.append(button);
    }
    group.addEventListener("focusout", () => queueMicrotask(() => {
      if (!node.contains(document.activeElement)) commitEdit(text);
    }));
    toolbar.prepend(group);
    document.defaultView.lucide?.createIcons?.({ root: group });
    syncToolbar(text);
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

  // Language-model controls for a text node: reference material, an instruction
  // box, the model picker and the run button. The Flora composer lifts these into
  // the panel below the node, so they stay descendants of the node for
  // serialization while rendering outside the editable surface.
  function createLlmComposer(node, document, context) {
    const {
      createCanvasLlmPresetBar,
      fillCanvasLlmModelSelect,
      renderCanvasLlmImages,
      runCanvasLlmNode,
      scheduleCanvasSave,
      stopCanvasTextWheel,
    } = context;

    const images = document.createElement("div");
    images.className = "canvas-llm-images";
    renderCanvasLlmImages?.(node, images);

    const prompt = document.createElement("textarea");
    prompt.className = "canvas-node-prompt canvas-llm-prompt";
    prompt.rows = 4;
    prompt.placeholder = "输入要让模型回答或反推图片的要求...";
    prompt.value = String(node.dataset.llmPrompt || "");
    if (stopCanvasTextWheel) prompt.addEventListener("wheel", stopCanvasTextWheel);
    prompt.addEventListener("input", () => {
      node.dataset.llmPrompt = prompt.value;
      scheduleCanvasSave?.();
    });

    let presets = null;
    try {
      presets = createCanvasLlmPresetBar?.(node, prompt) || null;
    } catch (error) {
      // Presets are optional and must never block the text node itself.
      console.warn("Canvas text node preset bar failed to render.", error);
    }

    const controls = document.createElement("div");
    controls.className = "canvas-llm-controls";
    const select = document.createElement("select");
    select.className = "canvas-node-model canvas-llm-model";
    fillCanvasLlmModelSelect?.(select, String(node.dataset.llmModel || ""));
    select.addEventListener("change", () => {
      node.dataset.llmModel = select.value;
      scheduleCanvasSave?.();
    });
    const run = document.createElement("button");
    run.type = "button";
    run.className = "canvas-node-run canvas-llm-run";
    run.textContent = "生成文字";
    run.addEventListener("click", () => runCanvasLlmNode?.(node));
    controls.append(select, run);

    return [images, prompt, ...(presets ? [presets] : []), controls];
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
      syncCanvasLlmPromptState,
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
    editors.set(text, { context });
    const initial = normalizeSource(content);
    renderPreview(text, initial === PLACEHOLDER ? "" : initial, node.dataset.textRichHtml);
    if (!selectionDocuments.has(document)) {
      selectionDocuments.add(document);
      document.addEventListener("selectionchange", () => document.querySelectorAll('.canvas-text[data-editing="true"]').forEach(syncToolbar));
    }
    text.addEventListener("pointerdown", (event) => {
      // Preview follows the canvas's normal selection and drag path. While
      // editing, keep pointer gestures inside the text for caret selection.
      if (text.dataset.editing === "true") event.stopPropagation();
    });
    text.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      context.selectCanvasNode?.(node);
      if (text.dataset.editing !== "true") beginEdit(text);
    });
    text.addEventListener("input", () => {
      syncContent(text);
    });
    const insert = (event, data) => {
      if (text.dataset.editing !== "true" || !data) return;
      event.preventDefault(); event.stopPropagation();
      const html = data.getData("text/html");
      const safe = html ? sanitizeHtml(document, html) : escapeHtml(data.getData("text/plain")).replace(/\n/g, "<br>");
      document.execCommand("insertHTML", false, safe);
      syncContent(text);
    };
    text.addEventListener("paste", event => insert(event, event.clipboardData));
    text.addEventListener("drop", event => insert(event, event.dataTransfer));
    if (stopCanvasTextWheel) text.addEventListener("wheel", stopCanvasTextWheel);
    text.addEventListener("blur", () => {
      queueMicrotask(() => {
        if (node.querySelector(".flora-text-format-tools")?.contains(document.activeElement)) return;
        if (text.closest('.flora-text-expanded-dialog[open]')) return;
        commitEdit(text);
        scheduleCanvasSave?.();
      });
    });
    text.addEventListener("keydown", (event) => {
      if (text.dataset.editing !== "true") return;
      event.stopPropagation();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && ["b", "i", "u"].includes(event.key.toLowerCase())) {
        event.preventDefault(); applyFormat(text, { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()]);
      }
      if (event.key === "Escape" && text.dataset.editing === "true") {
        event.preventDefault();
        commitEdit(text);
        text.blur();
      }
    });
    const textName = String(node.dataset.textName || "文字").replace(/\s+/g, " ").trim().slice(0, 80) || "文字";
    node.dataset.textName = textName;
    // The language-model composer lives under the text node now: the LLM node
    // type is no longer offered, so its controls move beside the editable text.
    const composer = createLlmComposer(node, document, context);
    node.append(
      inputPort,
      outputPort,
      createCanvasNodeBar(textName, { editable: true, editableKind: "text" }),
      text,
      ...composer,
      createCanvasResizeHandle(),
    );
    syncCanvasTextFromLlmInputs?.(node);
    syncCanvasLlmPromptState?.(node);
    scheduleCanvasConnectionRender?.();
  }

  ensureMarkdownUpgradeListener(typeof root !== "undefined" ? root : globalThis);

  return Object.freeze({
    render,
    beginEdit,
    commitEdit,
    getValue,
    getRichHtml,
    toMarkdown: target => {
      const text = resolveText(target);
      return text?.dataset.editing === "true" ? htmlToMarkdown(text.ownerDocument, getRichHtml(text)) : getValue(target);
    },
    sanitizeHtml,
    mountToolbar,
    refreshMarkdown,
    setValue,
  });
});
