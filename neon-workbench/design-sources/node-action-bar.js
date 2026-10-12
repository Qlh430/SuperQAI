(function installNodeActionBar(root) {
  "use strict";

  const ROOT_CLASS = "canvas-node-action-bar";
  const BUTTON_CLASS = "canvas-node-action";

  function createButton({ id, label = "", title = label, icon = "circle", modifierClass = "" } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = [BUTTON_CLASS, modifierClass].filter(Boolean).join(" ");
    button.dataset.nodeAction = id || "";
    if (icon) {
      const glyph = document.createElement("i");
      glyph.dataset.lucide = icon;
      button.append(glyph);
    }
    if (label) {
      const caption = document.createElement("span");
      caption.className = "canvas-node-action-caption flora-node-action-caption";
      caption.textContent = label;
      button.append(caption);
    }
    button.title = title || label;
    button.setAttribute("aria-label", title || label);
    return button;
  }

  function create({
    appendTo,
    className = "",
    ariaLabel = "节点工具栏",
    actions = [],
    onAction,
    hidden = false,
  } = {}) {
    const toolbar = document.createElement("div");
    toolbar.className = [ROOT_CLASS, className].filter(Boolean).join(" ");
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", ariaLabel);
    toolbar.hidden = Boolean(hidden);
    const buttons = new Map();

    actions.forEach((spec) => {
      const button = createButton(spec);
      buttons.set(spec.id, button);
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (button.disabled || button.hidden) return;
        button.dataset.busy = "true";
        try {
          await onAction?.(spec.id, { button, event, toolbar });
        } finally {
          delete button.dataset.busy;
        }
      });
      toolbar.append(button);
    });

    toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());
    toolbar.addEventListener("dblclick", (event) => event.stopPropagation());
    appendTo?.append(toolbar);
    root.lucide?.createIcons?.({ root: toolbar, attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });

    return {
      element: toolbar,
      buttons,
      setActionHidden(id, hidden) {
        const button = buttons.get(id);
        if (button) button.hidden = Boolean(hidden);
      },
      setActionDisabled(id, disabled) {
        const button = buttons.get(id);
        if (button) button.disabled = Boolean(disabled);
      },
      setVisible(visible) {
        toolbar.hidden = !visible;
      },
      refreshIcons() {
        root.lucide?.createIcons?.({ root: toolbar, attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
      },
      hide() {
        toolbar.hidden = true;
      },
      destroy() {
        toolbar.remove();
      },
    };
  }

  root.CanvasNodeActionBar = Object.freeze({ ROOT_CLASS, BUTTON_CLASS, create, createButton });
})(typeof window !== "undefined" ? window : globalThis);
