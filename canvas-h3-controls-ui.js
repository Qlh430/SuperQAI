(function initCanvasH3ControlsUi(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasH3ControlsUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasH3ControlsUi() {
  "use strict";

  function calculateResolution(aspectRatios, aspectRatio, megapixels, multiple = 32) {
    const fallback = aspectRatios?.["16:9"] || [16, 9];
    const [widthRatio, heightRatio] = aspectRatios?.[aspectRatio] || fallback;
    const normalizedMegapixels = Number(megapixels) === 1 ? 1 : 0.6;
    const scale = Math.sqrt((normalizedMegapixels * 1024 * 1024) / (widthRatio * heightRatio));
    return {
      width: Math.round((widthRatio * scale) / multiple) * multiple,
      height: Math.round((heightRatio * scale) / multiple) * multiple,
    };
  }

  function createSelectField(options = {}) {
    const document = options.document || globalThis.document;
    if (!document) throw new Error("H3 select field requires a document.");
    const field = document.createElement("label");
    field.className = "canvas-h3-field";
    const caption = document.createElement("span");
    caption.textContent = options.label;
    const select = document.createElement("select");
    (Array.isArray(options.choices) ? options.choices : []).forEach(([choiceValue, choiceLabel]) => {
      const option = document.createElement("option");
      option.value = choiceValue;
      option.textContent = choiceLabel;
      select.append(option);
    });
    select.value = String(options.value);
    select.addEventListener("change", () => options.onChange?.(select.value, select));
    field.append(caption, select);
    return field;
  }

  function createNumberField(options = {}) {
    const document = options.document || globalThis.document;
    if (!document) throw new Error("H3 number field requires a document.");
    const min = Number(options.min) || 0;
    const max = Number(options.max) || 0;
    const field = document.createElement("label");
    field.className = "canvas-h3-field";
    const caption = document.createElement("span");
    caption.textContent = options.label;
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step);
    input.value = options.value === "" && options.allowBlank ? "" : String(options.value);
    input.addEventListener("change", () => {
      let nextValue = "";
      if (options.allowBlank && input.value === "") {
        nextValue = "";
      } else {
        const next = Math.max(min, Math.min(max, Number(input.value) || min));
        input.value = String(next);
        nextValue = input.value;
      }
      options.onChange?.(nextValue, input);
    });
    field.append(caption, input);
    return field;
  }

  return Object.freeze({
    calculateResolution,
    createSelectField,
    createNumberField,
  });
});
