(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasTheme = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasTheme() {
  "use strict";

  const STORAGE_KEY = "ai-canvas-theme";
  const ATTRIBUTE = "data-canvas-theme";
  const MODE_ATTRIBUTE = "data-canvas-theme-mode";
  const EVENT = "canvas-theme-changed";
  const ROOT_ID = "canvasEditorScreen";

  // The canvas editor ships four palettes plus the classic one that predates
  // the migration. "auto" is a mode, not a palette: it picks midnight or paper
  // from the OS light/dark state.
  const THEMES = Object.freeze([
    Object.freeze({ id: "midnight", label: "午夜电光", scheme: "dark" }),
    Object.freeze({ id: "paper", label: "纸白紫调", scheme: "light" }),
    Object.freeze({ id: "warm", label: "暖光浮雕", scheme: "light" }),
    Object.freeze({ id: "legacy", label: "经典画布", scheme: "system", note: "沿用 AI OS 配色" }),
  ]);
  const THEME_IDS = Object.freeze(THEMES.map((theme) => theme.id));
  const MODES = Object.freeze(["auto", ...THEME_IDS]);
  const AUTO = Object.freeze({ dark: "midnight", light: "paper" });
  const DEFAULT_MODE = "auto";
  const AUTO_NOTE = "跟随系统明暗";

  function normalizeMode(value) {
    const mode = String(value ?? "").trim().toLowerCase();
    return MODES.includes(mode) ? mode : DEFAULT_MODE;
  }

  function themeEntry(id) {
    return THEMES.find((theme) => theme.id === id) || null;
  }

  function label(id) {
    return themeEntry(id)?.label || id;
  }

  function systemScheme(doc) {
    const target = doc || (typeof document !== "undefined" ? document : null);
    const rootElement = target?.documentElement;
    if (rootElement?.dataset?.theme === "dark" || rootElement?.dataset?.theme === "light") {
      return rootElement.dataset.theme;
    }
    if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function resolveTheme(mode, doc) {
    const normalized = normalizeMode(mode);
    if (normalized !== "auto") return normalized;
    return AUTO[systemScheme(doc)] || AUTO.light;
  }

  function readStoredMode(storage) {
    const target = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!target) return DEFAULT_MODE;
    try {
      return normalizeMode(target.getItem(STORAGE_KEY));
    } catch {
      return DEFAULT_MODE;
    }
  }

  function writeStoredMode(mode, storage) {
    const target = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!target) return;
    try {
      target.setItem(STORAGE_KEY, normalizeMode(mode));
    } catch {
      /* private mode or quota: the in-memory mode still applies for this session */
    }
  }

  // Only the canvas editor is themed. The board library and the project
  // manager stay on the AI OS palette, so they must never receive the
  // attribute even though they live under the same canvas view.
  function canvasTargets(doc) {
    const target = doc || (typeof document !== "undefined" ? document : null);
    if (!target?.querySelectorAll) return [];
    const found = new Set();
    const editor = target.getElementById?.(ROOT_ID);
    if (editor) found.add(editor);
    target.querySelectorAll("[data-canvas-theme-scope]").forEach((element) => found.add(element));
    // The rail only belongs to the canvas while the canvas shell owns it;
    // tinting it in any other shell would repaint AI OS chrome.
    if (target.body?.classList?.contains("canvas-first-shell")) {
      target.querySelectorAll(".rail").forEach((element) => found.add(element));
    }
    return [...found];
  }

  function paint(mode, doc) {
    const normalized = normalizeMode(mode);
    const theme = resolveTheme(normalized, doc);
    canvasTargets(doc).forEach((element) => {
      if (element.getAttribute(ATTRIBUTE) !== theme) element.setAttribute(ATTRIBUTE, theme);
      if (element.getAttribute(MODE_ATTRIBUTE) !== normalized) {
        element.setAttribute(MODE_ATTRIBUTE, normalized);
      }
    });
    return theme;
  }

  function themeOptions() {
    return [
      { id: "auto", label: "跟随系统", note: AUTO_NOTE },
      ...THEMES.map((theme) => ({ id: theme.id, label: theme.label, note: theme.note || "" })),
    ];
  }

  function createController(win) {
    const ownerWindow = win || (typeof window !== "undefined" ? window : null);
    const ownerDocument = ownerWindow?.document || (typeof document !== "undefined" ? document : null);
    let mode = readStoredMode(ownerWindow?.localStorage);
    let resolved = resolveTheme(mode, ownerDocument);
    let mediaQuery = null;
    let observer = null;
    let control = null;
    const listeners = new Set();

    function emit() {
      const detail = { mode, theme: resolved, themeLabel: label(resolved), label: modeLabel(mode) };
      renderControl();
      listeners.forEach((listener) => {
        try {
          listener(detail);
        } catch {
          /* a broken subscriber must not break theme application */
        }
      });
      if (ownerWindow?.CustomEvent && ownerWindow?.dispatchEvent) {
        try {
          ownerWindow.dispatchEvent(new ownerWindow.CustomEvent(EVENT, { detail }));
        } catch {
          /* CustomEvent is optional */
        }
      }
    }

    function modeLabel(next = mode) {
      return next === "auto" ? `跟随系统 · ${label(resolved)}` : label(next);
    }

    function sync({ notify = false } = {}) {
      const next = paint(mode, ownerDocument);
      const changed = next !== resolved;
      resolved = next;
      if (notify || changed) emit();
      else renderControl();
      return resolved;
    }

    function set(nextMode) {
      mode = normalizeMode(nextMode);
      writeStoredMode(mode, ownerWindow?.localStorage);
      sync({ notify: true });
      return mode;
    }

    /* ---------------------------------------------------------------- *
     * Theme entry point inside the canvas HUD. Built here so the whole
     * feature stays in one file and script.js keeps its own concerns.
     * ---------------------------------------------------------------- */

    function mountControl() {
      if (control) return control;
      const nav = ownerDocument?.querySelector?.(".canvas-editor-navigation");
      if (!nav) return null;
      const toggle = ownerDocument.createElement("button");
      toggle.type = "button";
      toggle.id = "canvasThemeToggle";
      toggle.className = "text-action canvas-theme-toggle";
      toggle.setAttribute("aria-haspopup", "true");
      toggle.setAttribute("aria-expanded", "false");
      toggle.title = "画布主题";
      toggle.innerHTML = '<i data-lucide="palette" aria-hidden="true"></i><span data-canvas-theme-label>主题</span>';

      const menu = ownerDocument.createElement("div");
      menu.className = "canvas-theme-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "画布主题");
      menu.hidden = true;
      menu.innerHTML = [
        '<span class="canvas-theme-menu-title">画布主题</span>',
        ...themeOptions().map((option) => [
          `<button type="button" role="menuitemradio" aria-checked="false"`,
          ` data-canvas-theme-option="${option.id}">`,
          `<span class="canvas-theme-option-copy"><strong>${option.label}</strong>`,
          option.note ? `<small>${option.note}</small>` : "",
          "</span><span class=\"canvas-theme-option-check\" aria-hidden=\"true\">✓</span></button>",
        ].join("")),
      ].join("");

      const close = () => {
        menu.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      };
      const open = () => {
        menu.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        renderControl();
      };
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (menu.hidden) open();
        else close();
      });
      menu.addEventListener("click", (event) => {
        const option = event.target?.closest?.("[data-canvas-theme-option]");
        if (!option) return;
        event.stopPropagation();
        set(option.dataset.canvasThemeOption);
        close();
      });
      menu.addEventListener("pointerdown", (event) => event.stopPropagation());
      ownerDocument.addEventListener("pointerdown", (event) => {
        if (menu.hidden) return;
        if (toggle.contains(event.target) || menu.contains(event.target)) return;
        close();
      });
      ownerDocument.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || menu.hidden) return;
        close();
        toggle.focus();
      });

      nav.append(toggle, menu);
      control = { nav, toggle, menu, close };
      ownerWindow?.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
      return control;
    }

    function renderControl() {
      if (!control) {
        mountControl();
        if (!control) return;
      }
      const current = mode;
      const labelNode = control.toggle.querySelector("[data-canvas-theme-label]");
      if (labelNode) labelNode.textContent = modeLabel(current);
      control.toggle.setAttribute("aria-pressed", String(current !== DEFAULT_MODE));
      control.menu.querySelectorAll("[data-canvas-theme-option]").forEach((option) => {
        option.setAttribute("aria-checked", String(option.dataset.canvasThemeOption === current));
        option.classList.toggle("is-active", option.dataset.canvasThemeOption === current);
      });
    }

    // The canvas markup is created by script.js, so watch for it and stop
    // watching the moment it appears — watching longer would observe every
    // node class toggle on the board and cost frames for nothing.
    function watchForCanvas() {
      if (!ownerDocument?.documentElement || typeof MutationObserver !== "function") return;
      if (ownerDocument.getElementById?.(ROOT_ID)) return;
      observer = new MutationObserver(() => {
        if (!ownerDocument.getElementById?.(ROOT_ID)) return;
        observer?.disconnect();
        observer = null;
        sync();
        renderControl();
      });
      observer.observe(ownerDocument.documentElement, { childList: true, subtree: true });
      ownerWindow?.setTimeout?.(() => {
        observer?.disconnect();
        observer = null;
        sync();
        renderControl();
      }, 8000);
    }

    function watchSystemScheme() {
      if (mediaQuery || typeof matchMedia !== "function") return;
      mediaQuery = matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {
        if (mode === "auto") sync({ notify: true });
      };
      if (typeof mediaQuery.addEventListener === "function") mediaQuery.addEventListener("change", onChange);
      else mediaQuery.addListener?.(onChange);
    }

    function start() {
      sync();
      renderControl();
      watchForCanvas();
      watchSystemScheme();
      // The AI OS preference applier owns html[data-theme]; when it flips we
      // re-resolve "auto" so canvas light/dark never drifts from the OS.
      ownerWindow?.addEventListener?.("ai-os-preferences-applied", () => {
        if (mode === "auto") sync({ notify: true });
        else sync();
      });
      ownerDocument?.addEventListener?.("DOMContentLoaded", () => {
        sync();
        renderControl();
      }, { once: true });
      ownerWindow?.addEventListener?.("load", () => {
        sync();
        renderControl();
      }, { once: true });
    }

    if (ownerDocument?.readyState === "loading") {
      ownerDocument.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }

    return {
      ROOT_ID,
      THEMES,
      MODES,
      STORAGE_KEY,
      get: () => mode,
      theme: () => resolved,
      set,
      sync,
      options: themeOptions,
      mountControl,
      subscribe(listener) {
        if (typeof listener !== "function") return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }

  const controller = typeof window !== "undefined" ? createController(window) : null;

  return Object.freeze({
    STORAGE_KEY,
    ATTRIBUTE,
    MODE_ATTRIBUTE,
    EVENT,
    ROOT_ID,
    THEMES,
    MODES,
    DEFAULT_MODE,
    normalizeMode,
    resolveTheme,
    systemScheme,
    readStoredMode,
    canvasTargets,
    themeOptions,
    label,
    createController,
    ...(controller || {}),
  });
});
