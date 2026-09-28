(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasImageInfo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function dimensions(width, height) {
    const w = Number(width), h = Number(height);
    return Number.isFinite(w) && Number.isFinite(h) && w >= 1 && h >= 1
      ? `${Math.round(w)} × ${Math.round(h)}` : "";
  }
  function filename(source) {
    if (!source || /^(?:data|blob):/i.test(source)) return "";
    try { return decodeURIComponent(new URL(source, "http://canvas.local").pathname.split("/").pop() || ""); }
    catch { return ""; }
  }
  function getInfo(image, metadata = {}) {
    const data = image?.dataset || {};
    const source = metadata.source || image?.getAttribute?.("data-original-src") || data.canvasOriginalSrc || "";
    const displayed = image?.currentSrc || image?.getAttribute?.("src") || "";
    // Only trust natural dimensions when the decoded pixels really are original.
    const original = data.imageQuality === "original"
      || (source && displayed === source && data.imageQuality !== "thumbnail");
    return {
      name: String(metadata.name || image?.alt || filename(source) || "图片"),
      dimensions: dimensions(data.originalWidth, data.originalHeight)
        || dimensions(metadata.width, metadata.height)
        || (original ? dimensions(image?.naturalWidth, image?.naturalHeight) : "")
        || "尺寸未知",
    };
  }
  function create({ viewport, getMetadata = () => ({}), onRename = null }) {
    const doc = viewport.ownerDocument, win = doc.defaultView;
    const overlay = doc.createElement("div");
    overlay.className = "canvas-image-info";
    overlay.hidden = true;
    overlay.setAttribute("role", "tooltip");
    overlay.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span data-image-info-name></span><input type="text" data-image-info-name-editor aria-label="图片名称" autocomplete="off" spellcheck="false"><span data-image-info-dimensions></span>';
    viewport.append(overlay);
    const nameText = overlay.querySelector("[data-image-info-name]");
    const nameEl = overlay.querySelector("[data-image-info-name-editor]");
    nameEl.hidden = true;
    const sizeEl = overlay.querySelector("[data-image-info-dimensions]");
    let image = null, focused = false, editing = false, pressed = false, frame = 0, disposed = false;
    let pointer = null;
    let hoverMember = null;
    function setHoverMember(next) {
      if (hoverMember === next) return;
      hoverMember?.classList.remove("is-image-info-hover");
      hoverMember = next;
      hoverMember?.classList.add("is-image-info-hover");
    }
    const handlers = [];
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      handlers.push(() => target.removeEventListener(type, handler, options));
    };
    const find = target => {
      if (!target?.closest || target.closest(".canvas-image-toolbar, .canvas-port, .canvas-resize-handle, .canvas-crop-overlay")) return null;
      const candidate = target.closest("img[data-canvas-original-src]")
        || target.closest(".canvas-gallery-member-preview, .canvas-image-upload, .canvas-node-result")?.querySelector("img[data-canvas-original-src]");
      return candidate?.closest(".canvas-node") && viewport.contains(candidate) ? candidate : null;
    };
    const observer = new win.MutationObserver(refresh);
    function exitEditing({ restore = false } = {}) {
      if (!editing && nameEl.hidden) return;
      if (restore && image) nameEl.value = getInfo(image, getMetadata(image) || {}).name;
      editing = false;
      nameEl.hidden = true;
      nameText.hidden = false;
      if (doc.activeElement === nameEl) nameEl.blur();
    }
    function hide() {
      exitEditing();
      setHoverMember(null);
      image = null; focused = false; overlay.hidden = true;
      observer.disconnect();
    }
    function show(next, keyboard = false) {
      if (!next || pressed) return hide();
      if (image !== next) {
        observer.disconnect(); image = next;
        observer.observe(image, { attributes: true, attributeFilter: ["alt", "src", "data-original-src", "data-original-width", "data-original-height", "data-image-quality"] });
        // Detect removal/replacement of only the active image, without observing
        // every attribute or scanning every image on a large canvas.
        let ancestor = image.parentElement;
        while (ancestor && ancestor !== viewport) { observer.observe(ancestor, { childList: true }); ancestor = ancestor.parentElement; }
      }
      focused = keyboard; refresh();
    }
    function draw() {
      frame = 0;
      if (disposed || !image) return;
      if (!image.isConnected || !viewport.contains(image) || pressed || doc.hidden || doc.body.classList.contains("canvas-overlay-open")) return hide();
      const rect = image.getBoundingClientRect(), stage = viewport.getBoundingClientRect();
      if (!rect.width || !rect.height || !viewport.clientWidth || rect.bottom <= stage.top || rect.top >= stage.bottom || rect.right <= stage.left || rect.left >= stage.right) return hide();
      const overlayRect = overlay.hidden ? null : overlay.getBoundingClientRect();
      const pointerInImage = pointer && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
      const pointerInOverlay = overlayRect && pointer.x >= overlayRect.left && pointer.x <= overlayRect.right && pointer.y >= overlayRect.top && pointer.y <= overlayRect.bottom;
      const pointerNearOverlay = overlayRect && pointer.x >= overlayRect.left - 12 && pointer.x <= overlayRect.right + 12
        && pointer.y >= overlayRect.top - 14 && pointer.y <= overlayRect.bottom + 14;
      if (!editing && !focused && pointer && !pointerInImage && !pointerInOverlay && !pointerNearOverlay) return hide();
      const info = getInfo(image, getMetadata(image) || {});
      if (!editing && doc.activeElement !== nameEl) {
        nameText.textContent = info.name;
        nameEl.value = info.name;
      }
      sizeEl.textContent = info.dimensions;
      overlay.setAttribute("aria-label", `${info.name}，${info.dimensions}`);
      const unitX = stage.width / Math.max(1, viewport.offsetWidth);
      const unitY = stage.height / Math.max(1, viewport.offsetHeight);
      const width = Math.min(rect.width / unitX, Math.max(1, viewport.clientWidth - 16));
      // Keep normal captions readable; below 220px shrink the entire caption
      // (including the editor and dimensions) into the image's painted width.
      const captionScale = Math.min(1, width / 220);
      overlay.style.width = `${width / captionScale}px`;
      overlay.style.transform = `scale(${captionScale})`;
      overlay.style.left = `${Math.max(8, Math.min((rect.left - stage.left) / unitX, viewport.clientWidth - width - 8))}px`;
      const galleryMember = image.closest(".canvas-gallery-member");
      // The caption is outside the member's DOM. Keep its hover lift while
      // the pointer crosses onto the caption, so neither moves away in a loop.
      setHoverMember(!focused || editing ? galleryMember : null);
      overlay.classList.toggle("is-gallery-member", Boolean(galleryMember));
      overlay.hidden = false;
      const height = overlay.offsetHeight * captionScale;
      const imageTop = (rect.top - stage.top) / unitY;
      let top = imageTop - height - 4 * captionScale;
      if (galleryMember) {
        const gallery = galleryMember.closest(".canvas-node-gallery-container");
        const galleryBar = gallery?.querySelector(":scope > .canvas-node-bar")?.getBoundingClientRect();
        const headerBottom = galleryBar ? (galleryBar.bottom - stage.top) / unitY : -Infinity;
        if (top < headerBottom + 2) top = imageTop + 4 * captionScale;
      }
      if (top < 8) top = Math.max(8, (rect.top - stage.top) / unitY + 8);
      overlay.style.top = `${Math.min(top, viewport.clientHeight - height - 8)}px`;
    }
    function refresh(options = {}) {
      if (disposed || !image) return;
      if (options.immediate) {
        if (frame) {
          win.cancelAnimationFrame(frame);
          frame = 0;
        }
        draw();
        return;
      }
      if (!frame) frame = win.requestAnimationFrame(draw);
    }
    listen(viewport, "pointermove", event => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      if (pressed) return hide();
      // Native text selection also moves the pointer with a button held down.
      // Keep editing until blur/outside pointerdown, not merely until mousemove.
      if (editing) return refresh();
      if (event.target?.closest?.(".canvas-image-info")) return refresh();
      if (event.buttons) return hide();
      if (image && !focused) {
        const infoRect = overlay.getBoundingClientRect();
        if (event.clientX >= infoRect.left - 12 && event.clientX <= infoRect.right + 12
          && event.clientY >= infoRect.top - 14 && event.clientY <= infoRect.bottom + 14) return refresh();
      }
      const next = find(event.target);
      if (next) show(next); else hide();
    }, { passive: true });
    listen(viewport, "pointerleave", () => {
      if (editing) return;
      hide();
    });
    listen(viewport, "pointerdown", event => {
      if (event.target?.closest?.(".canvas-image-info")) return;
      if (editing) exitEditing();
      pressed = true; hide();
    }, true);
    listen(win, "pointerup", () => { pressed = false; }, true);
    listen(win, "pointercancel", () => {
      pressed = false;
      // Dragging selected text can cancel pointer events without blurring the
      // native input. Only a real edit exit should dismiss the editor.
      if (!editing) hide();
    }, true);
    listen(viewport, "focusin", event => { const next = find(event.target); if (next) show(next, true); });
    listen(viewport, "focusout", event => {
      if (overlay.contains(event.relatedTarget)) return;
      if (focused) hide();
    });
    listen(viewport, "load", refresh, true);
    listen(win, "resize", refresh);
    listen(viewport, "transitionrun", refresh, true);
    listen(viewport, "transitionend", refresh, true);
    listen(win, "canvas:selectionchange", refresh);
    listen(doc, "visibilitychange", hide);
    listen(win, "blur", () => { pressed = false; hide(); });
    listen(overlay, "dblclick", event => event.stopPropagation());
    listen(overlay, "dragstart", event => {
      // The canvas accepts text/plain as an image payload. Keep selected
      // caption text out of that native drag/drop route.
      event.preventDefault();
      event.stopPropagation();
    });
    listen(nameEl, "pointerdown", event => event.stopPropagation());
    listen(nameEl, "click", event => event.stopPropagation());
    listen(nameText, "pointerdown", event => {
      event.stopPropagation();
      // The caption lives outside the gallery preview button. Retain that
      // button's focus until click transfers it directly into the editor.
      if (event.button === 0) event.preventDefault();
    });
    listen(nameText, "click", event => {
      event.stopPropagation();
      if (!image) return;
      editing = true;
      nameText.hidden = true;
      nameEl.hidden = false;
      nameEl.value = getInfo(image, getMetadata(image) || {}).name;
      nameEl.focus();
      nameEl.select();
      refresh();
    });
    listen(nameEl, "focus", () => {
      editing = true;
      nameEl.select();
    });
    listen(nameEl, "keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        nameEl.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (image) nameEl.value = getInfo(image, getMetadata(image) || {}).name;
        editing = false;
        nameEl.hidden = true;
        nameText.hidden = false;
        nameEl.blur();
      }
    });
    listen(nameEl, "blur", () => {
      if (!image) return;
      const target = image;
      const requested = nameEl.value;
      editing = false;
      nameEl.hidden = true;
      nameText.hidden = false;
      Promise.resolve(onRename?.(target, requested)).then((nextName) => {
        if (image !== target || !image) return;
        if (nextName) {
          nameEl.value = String(nextName);
          nameText.textContent = String(nextName);
        }
        refresh();
      }).catch(() => refresh());
    });
    return { refresh, hide, destroy() {
      disposed = true; hide();
      if (frame) win.cancelAnimationFrame(frame);
      handlers.forEach(remove => remove()); overlay.remove();
    } };
  }
  return Object.freeze({ getInfo, create });
});
