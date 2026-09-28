"use strict";

// AI OS AI 抠图工作台。
//
// 两条路线共用这一个界面：
//   主体模式 —— 本地 ONNX 模型（BEN2 Base）出原始掩膜，界面按阈值 / 羽化 / 收缩实时调参；
//   特效模式 —— 不走模型，直接按四边采样的背景色做颜色键控，适合纯色底素材。
// 调参在前端实时预览，导出时把设置交回服务端按原图全分辨率重算，保证落盘结果与预览一致。

(function initBackgroundRemovalUi(root) {
  const ENDPOINTS = {
    models: "/api/background-removal/models",
    import: "/api/background-removal/models/import",
    prepare: "/api/background-removal/prepare",
    apply: "/api/background-removal/apply",
  };
  const PREVIEW_MAX_EDGE = 1400;
  const SUBJECT_FIELDS = [
    { key: "background", label: "去除弱前景", min: 0, max: 98, hint: "数值越高，越倾向判定为背景" },
    { key: "foreground", label: "保留强前景", min: 1, max: 100, hint: "数值越高，主体边缘越干净" },
    { key: "edge", label: "边缘收缩 / 扩张", min: -50, max: 50, hint: "负数向内收，正数向外扩" },
    { key: "feather", label: "边缘羽化", min: 0, max: 100, hint: "让边缘过渡更柔和" },
  ];
  const EFFECT_FIELDS = [
    { key: "low", label: "低阈值", min: 0, max: 254, hint: "低于这个亮度当作背景色" },
    { key: "high", label: "高阈值", min: 1, max: 255, hint: "高于这个亮度当作背景色" },
    { key: "feather", label: "边缘羽化", min: 0, max: 100, hint: "柔化抠出的边缘" },
    { key: "spill", label: "去溢色", min: 0, max: 100, hint: "压掉边缘残留的背景色" },
  ];
  const DEFAULT_SUBJECT = { background: 18, foreground: 78, edge: 2, feather: 8, opacity: 100 };
  const DEFAULT_EFFECT = { low: 6, high: 190, feather: 18, spill: 86, invert: false, opacity: 100 };

  let modal = null;
  let dom = null;
  let state = null;
  let renderFrame = 0;

  function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  // 滑块的已选段用 CSS 变量上色，取值变化时同步一次百分比。
  function paintRange(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const span = max - min;
    const value = Number(input.value);
    const progress = span > 0 ? ((value - min) / span) * 100 : 0;
    input.style.setProperty("--cutout-progress", `${Math.max(0, Math.min(100, progress)).toFixed(2)}%`);
  }

  function smoothstep(edge0, edge1, value) {
    const t = clamp01((value - edge0) / Math.max(1e-4, edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || `请求失败：${response.status}`);
      error.code = data.code || "";
      throw error;
    }
    return data;
  }

  function setStatus(message, tone = "") {
    if (!dom) return;
    dom.status.textContent = message || "";
    dom.status.dataset.tone = tone;
  }

  function setEmptyMessage(message) {
    if (!dom) return;
    dom.empty.hidden = false;
    dom.emptyChip.textContent = message;
  }

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "";
    return value >= 1024 * 1024 * 1024
      ? `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
      : `${Math.round(value / 1024 / 1024)} MB`;
  }

  function shortDirectory(directory) {
    const parts = String(directory || "").split(/[\\/]+/).filter(Boolean);
    return parts.slice(-3).join("/");
  }

  function setBusy(busy, message = "") {
    if (!dom) return;
    if (state) state.busy = busy;
    dom.body.classList.toggle("is-busy", busy);
    dom.run.disabled = busy;
    dom.export.disabled = busy || !state?.token;
    if (message) setStatus(message);
  }

  function buildField(field, settings, onInput) {
    const wrapper = document.createElement("label");
    wrapper.className = "cutout-field";
    const head = document.createElement("span");
    head.className = "cutout-field-head";
    const name = document.createElement("b");
    name.textContent = field.label;
    const value = document.createElement("em");
    value.textContent = String(settings[field.key] ?? "");
    head.append(name, value);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = "1";
    input.value = String(settings[field.key] ?? field.min);
    input.dataset.cutoutField = field.key;
    const sync = () => {
      value.textContent = input.value;
      paintRange(input);
      onInput(field.key, Number(input.value));
    };
    input.addEventListener("input", sync);
    paintRange(input);

    const hint = document.createElement("small");
    hint.textContent = field.hint || "";
    wrapper.append(head, input, hint);
    return { wrapper, input, syncValue: (next) => { value.textContent = String(next); } };
  }

  function buildMarkup() {
    const element = document.createElement("div");
    element.className = "canvas-cutout-modal";
    element.innerHTML = [
      "<div class=\"canvas-cutout-dialog\" role=\"dialog\" aria-modal=\"true\" aria-label=\"AI 抠图\">",
      "  <header class=\"canvas-cutout-header\">",
      "    <div><strong>AI 抠图</strong><span class=\"canvas-cutout-subtitle\">主体模式在本地运行，不占用 API 额度；特效模式适合纯色背景。</span></div>",
      "    <button type=\"button\" class=\"canvas-cutout-close\" aria-label=\"关闭\">×</button>",
      "  </header>",
      "  <div class=\"canvas-cutout-body\">",
      "    <div class=\"canvas-cutout-preview\"><canvas class=\"canvas-cutout-canvas\"></canvas><span class=\"canvas-cutout-empty\"><b class=\"canvas-cutout-empty-chip\">选择抠图模式后开始</b></span></div>",
      "    <aside class=\"canvas-cutout-panel\">",
      "      <div class=\"cutout-mode-switch\" role=\"tablist\">",
      "        <button type=\"button\" data-cutout-mode=\"subject\" class=\"is-active\">主体模式</button>",
      "        <button type=\"button\" data-cutout-mode=\"effect\">特效模式</button>",
      "      </div>",
      "      <section class=\"cutout-section cutout-section-model\">",
      "        <div class=\"cutout-model-row\"><span class=\"cutout-model-name\">BEN2 Base</span><span class=\"cutout-model-state\"></span></div>",
      "        <p class=\"cutout-model-meta\"></p>",
      "        <div class=\"cutout-model-actions\">",
      "          <button type=\"button\" class=\"cutout-import-toggle\">导入本地模型</button>",
      "        </div>",
      "        <div class=\"cutout-import\" hidden>",
      "          <input type=\"text\" class=\"cutout-import-path\" placeholder=\"本机 .onnx 文件，例如 F:\\\\models\\\\ben2-base-1.0.0.onnx\" spellcheck=\"false\">",
      "          <button type=\"button\" class=\"cutout-import-run\">导入</button>",
      "        </div>",
      "      </section>",
      "      <section class=\"cutout-section\"><h4 class=\"cutout-section-title\">参数</h4><div class=\"cutout-fields\"></div>",
      "        <label class=\"cutout-toggle\"><input type=\"checkbox\" class=\"cutout-invert\"><span>反选（保留背景）</span></label>",
      "      </section>",
      "      <section class=\"cutout-section\"><h4>图层透明度</h4>",
      "        <label class=\"cutout-field\"><span class=\"cutout-field-head\"><b>透明度</b><em class=\"cutout-opacity-value\">100</em></span><input type=\"range\" class=\"cutout-opacity\" min=\"0\" max=\"100\" step=\"1\" value=\"100\"></label>",
      "      </section>",
      "    </aside>",
      "  </div>",
      "  <footer class=\"canvas-cutout-footer\">",
      "    <p class=\"canvas-cutout-status\" aria-live=\"polite\"></p>",
      "    <div class=\"canvas-cutout-actions\">",
      "      <button type=\"button\" class=\"cutout-reset\">恢复默认</button>",
      "      <button type=\"button\" class=\"cutout-run\">重新运行</button>",
      "      <button type=\"button\" class=\"cutout-export\">保存到画布</button>",
      "    </div>",
      "  </footer>",
      "</div>",
    ].join("");
    return element;
  }

  function ensureMarkup() {
    if (modal) return modal;
    modal = buildMarkup();
    const host = document.querySelector("#aiOsDesktop") || document.body;
    host.append(modal);
    dom = {
      dialog: modal.querySelector(".canvas-cutout-dialog"),
      body: modal.querySelector(".canvas-cutout-body"),
      preview: modal.querySelector(".canvas-cutout-preview"),
      canvas: modal.querySelector(".canvas-cutout-canvas"),
      empty: modal.querySelector(".canvas-cutout-empty"),
      emptyChip: modal.querySelector(".canvas-cutout-empty-chip"),
      modeButtons: [...modal.querySelectorAll("[data-cutout-mode]")],
      fields: modal.querySelector(".cutout-fields"),
      modelState: modal.querySelector(".cutout-model-state"),
      modelMeta: modal.querySelector(".cutout-model-meta"),
      importToggle: modal.querySelector(".cutout-import-toggle"),
      importBox: modal.querySelector(".cutout-import"),
      importPath: modal.querySelector(".cutout-import-path"),
      importRun: modal.querySelector(".cutout-import-run"),
      invert: modal.querySelector(".cutout-invert"),
      opacity: modal.querySelector(".cutout-opacity"),
      opacityValue: modal.querySelector(".cutout-opacity-value"),
      status: modal.querySelector(".canvas-cutout-status"),
      reset: modal.querySelector(".cutout-reset"),
      run: modal.querySelector(".cutout-run"),
      export: modal.querySelector(".cutout-export"),
      close: modal.querySelector(".canvas-cutout-close"),
      sectionTitle: modal.querySelector(".cutout-section-title"),
    };
    bindEvents();
    return modal;
  }

  function bindEvents() {
    dom.close.addEventListener("click", close);
    modal.addEventListener("pointerdown", (event) => {
      if (event.target === modal) close();
    });
    root.addEventListener("keydown", onKeydown, true);
    dom.modeButtons.forEach((button) => {
      button.addEventListener("click", () => switchMode(button.dataset.cutoutMode));
    });
    dom.opacity.addEventListener("input", () => {
      if (!state) return;
      const value = Number(dom.opacity.value);
      currentSettings().opacity = value;
      dom.opacityValue.textContent = String(value);
      paintRange(dom.opacity);
      scheduleRender();
    });
    dom.invert.addEventListener("change", () => {
      if (!state) return;
      state.effect.invert = dom.invert.checked;
      scheduleRender();
    });
    dom.reset.addEventListener("click", () => {
      if (!state) return;
      state.subject = { ...DEFAULT_SUBJECT };
      state.effect = { ...DEFAULT_EFFECT };
      syncControls();
      scheduleRender();
    });
    dom.run.addEventListener("click", () => runRemoval({ force: true }));
    dom.export.addEventListener("click", exportToCanvas);
    dom.importToggle.addEventListener("click", () => {
      dom.importBox.hidden = !dom.importBox.hidden;
      if (!dom.importBox.hidden) dom.importPath.focus();
    });
    dom.importRun.addEventListener("click", importModel);
    dom.importPath.addEventListener("keydown", (event) => {
      if (event.key === "Enter") importModel();
    });
  }

  function onKeydown(event) {
    if (!modal || modal.hidden || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  function currentSettings() {
    return state?.mode === "effect" ? state.effect : state.subject;
  }

  function switchMode(mode) {
    if (!state || state.mode === mode) return;
    state.mode = mode === "effect" ? "effect" : "subject";
    dom.modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.cutoutMode === state.mode));
    syncControls();
    scheduleRender();
  }

  function syncControls() {
    if (!state) return;
    const effect = state.mode === "effect";
    dom.sectionTitle.textContent = effect ? "颜色键控参数" : "边缘参数";
    dom.invert.parentElement.hidden = !effect;
    dom.invert.checked = Boolean(state.effect.invert);
    const fields = effect ? EFFECT_FIELDS : SUBJECT_FIELDS;
    const settings = currentSettings();
    dom.fields.innerHTML = "";
    fields.forEach((field) => {
      const built = buildField(field, settings, (key, value) => {
        currentSettings()[key] = value;
        scheduleRender();
      });
      dom.fields.append(built.wrapper);
    });
    dom.opacity.value = String(settings.opacity ?? 100);
    dom.opacityValue.textContent = String(settings.opacity ?? 100);
    paintRange(dom.opacity);
  }

  function scheduleRender() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      renderPreview();
    });
  }

  function sampleBorderColor(data, width, height) {
    const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
    let r = 0, g = 0, b = 0, weight = 0;
    const take = (x, y) => {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] / 255;
      r += data[index] * alpha;
      g += data[index + 1] * alpha;
      b += data[index + 2] * alpha;
      weight += alpha;
    };
    for (let x = 0; x < width; x += step) { take(x, 0); take(x, height - 1); }
    for (let y = 0; y < height; y += step) { take(0, y); take(width - 1, y); }
    if (!weight) return { r: 255, g: 255, b: 255 };
    return { r: r / weight, g: g / weight, b: b / weight };
  }

  // 与 background-removal-service.js 里的 refineSubjectAlpha 保持同一套公式。
  function renderPreview() {
    if (!state?.base) return;
    const { width, height } = state.preview;
    const source = state.base.data;
    const raw = state.raw;
    const output = state.output || (state.output = new ImageData(width, height));
    const target = output.data;
    const settings = currentSettings();
    const opacity = clamp01(Number(settings.opacity ?? 100) / 100);
    let opaque = 0;

    if (state.mode === "subject") {
      const low = Math.min(settings.foreground - 1, settings.background) / 100;
      const high = Math.max(settings.background + 1, settings.foreground) / 100;
      const shrink = settings.edge / 100;
      const feather = settings.feather / 100;
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        const index = pixel * 4;
        const value = raw[pixel] / 255;
        let alpha = smoothstep(low, high, clamp01(value - shrink));
        if (feather > 0) alpha = alpha * (1 - feather * 0.7) + value * feather * 0.7;
        alpha = clamp01(alpha) * opacity;
        target[index] = source[index];
        target[index + 1] = source[index + 1];
        target[index + 2] = source[index + 2];
        target[index + 3] = Math.round(alpha * 255);
        if (alpha > 0.5) opaque += 1;
      }
    } else {
      const key = sampleBorderColor(source, width, height);
      const luminance = key.r * 0.2126 + key.g * 0.7152 + key.b * 0.0722;
      const dark = luminance < 56;
      const bright = luminance > 205;
      const lowByte = Math.min(settings.low, settings.high - 1);
      const highByte = Math.max(settings.low + 1, settings.high);
      const lowValue = lowByte / 255;
      const highValue = highByte / 255;
      const feather = settings.feather / 100;
      const spill = clamp01(settings.spill / 100);
      const divisor = Math.min(0.999, Math.max(0.12, spill + (1 - spill) * 0.88));
      const inverseSpill = spill > 0.5 && luminance > 205;
      const adjust = (value) => {
        const adjusted = inverseSpill ? 255 - (255 - value) / divisor : value / divisor;
        return Math.max(0, Math.min(255, Math.round(adjusted)));
      };
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        const index = pixel * 4;
        const r = source[index], g = source[index + 1], b = source[index + 2];
        const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
        const distance = Math.sqrt((r - key.r) ** 2 + (g - key.g) ** 2 + (b - key.b) ** 2) / 441.7;
        let value = dark
          ? smoothstep(lowByte, highByte, luma)
          : bright
          ? smoothstep(lowByte, highByte, 255 - luma)
          : smoothstep(lowValue, highValue, distance);
        if (feather > 0) value = value * (1 - feather * 0.22) + Math.sqrt(Math.max(0, value)) * feather * 0.22;
        if (settings.invert) value = 1 - value;
        const alpha = clamp01(value) * opacity;
        target[index] = adjust(r);
        target[index + 1] = adjust(g);
        target[index + 2] = adjust(b);
        target[index + 3] = Math.round(alpha * 255);
        if (alpha > 0.5) opaque += 1;
      }
    }

    dom.canvas.getContext("2d").putImageData(output, 0, 0);
    dom.empty.hidden = true;
    const ratio = opaque / Math.max(1, width * height);
    state.coverage = ratio;
    if (!state.busy) {
      setStatus(ratio <= 0.005 ? "几乎全部被抠掉，试试降低「去除弱前景」。" : `前景占比约 ${(ratio * 100).toFixed(1)}%`);
    }
  }

  // 模型还没准备好时也要让用户看见原图，而不是一直停在“正在准备图片…”。
  function showSourcePreview() {
    if (!state?.image) return;
    const width = Math.max(1, Math.round(state.width || state.image.naturalWidth || 0));
    const height = Math.max(1, Math.round(state.height || state.image.naturalHeight || 0));
    const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(width, height));
    const previewWidth = Math.max(1, Math.round(width * scale));
    const previewHeight = Math.max(1, Math.round(height * scale));
    dom.canvas.width = previewWidth;
    dom.canvas.height = previewHeight;
    dom.preview.style.setProperty("--cutout-aspect", `${previewWidth} / ${previewHeight}`);
    const context = dom.canvas.getContext("2d");
    context.clearRect(0, 0, previewWidth, previewHeight);
    context.drawImage(state.image, 0, 0, previewWidth, previewHeight);
    setEmptyMessage("先准备模型，再开始抠图");
  }

  async function loadModelStatus() {
    const data = await requestJson(ENDPOINTS.models);
    const model = data.models?.[0];
    if (!model) throw new Error("服务端没有注册抠图模型。");
    dom.modelState.textContent = model.installed ? "已就绪" : "不可用";
    dom.modelState.dataset.state = model.installed ? "ready" : "missing";
    dom.importToggle.hidden = Boolean(model.installed);
    dom.importBox.hidden = true;
    const size = formatBytes(model.size);
    const store = shortDirectory(data.store);
    dom.modelMeta.textContent = model.installed
      ? [
        model.external
          ? "直接使用本机已有的权重文件（没有复制副本）"
          : model.source === "update"
            ? "正在使用已下载的模型更新"
            : model.source === "import"
              ? `使用手动导入的权重（${store || "data/models/background-removal"}）`
              : "随应用内置，不需要下载",
        size,
      ].filter(Boolean).join(" · ")
      : [
        `应用内置的 ${size} 权重缺失或被改动`,
        "重新安装 AI OS，或导入一份权重文件",
      ].filter(Boolean).join(" · ");
    return model;
  }

  async function importModel() {
    if (state?.busy) return;
    const filePath = String(dom.importPath.value || "").trim();
    if (!filePath) {
      setStatus("请先填写模型文件路径。", "error");
      return;
    }
    setBusy(true, "正在导入本机模型文件…");
    try {
      await requestJson(ENDPOINTS.import, { method: "POST", body: { id: "ben2-base", path: filePath } });
      await loadModelStatus();
      setStatus("模型导入完成，正在运行抠图…");
      setBusy(false);
      await runRemoval({ force: true });
    } catch (error) {
      setStatus(`${error.message}　文件名要写完整路径，并且是运行 AI OS 服务那台电脑上的路径。`, "error");
      setBusy(false);
    }
  }

  async function loadPreviewSources() {
    const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(state.width, state.height));
    const width = Math.max(1, Math.round(state.width * scale));
    const height = Math.max(1, Math.round(state.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(state.image, 0, 0, width, height);
    state.base = ctx.getImageData(0, 0, width, height);
    state.preview = { width, height };

    const maskResponse = await fetch(state.maskUrl);
    if (!maskResponse.ok) throw new Error("抠图掩膜读取失败，请重新运行一次。");
    const maskBitmap = await createImageBitmap(await maskResponse.blob());
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(maskBitmap, 0, 0, width, height);
    const maskData = ctx.getImageData(0, 0, width, height).data;
    const raw = new Uint8ClampedArray(width * height);
    for (let pixel = 0; pixel < raw.length; pixel += 1) raw[pixel] = maskData[pixel * 4];
    state.raw = raw;
    state.output = new ImageData(width, height);

    dom.canvas.width = width;
    dom.canvas.height = height;
    dom.preview.style.setProperty("--cutout-aspect", `${width} / ${height}`);
    renderPreview();
  }

  async function runRemoval({ force = false } = {}) {
    if (!state || state.busy) return;
    const model = await loadModelStatus().catch((error) => {
      setStatus(error.message, "error");
      return null;
    });
    if (!model) return;
    if (!model.installed) {
      setStatus("内置抠图模型不可用，请重新安装 AI OS 或导入权重文件。", "error");
      showSourcePreview();
      return;
    }
    setBusy(true, force ? "正在重新运行抠图…" : "正在运行抠图，第一次大约需要十几秒…");
    try {
      const prepared = await requestJson(ENDPOINTS.prepare, {
        method: "POST",
        body: { image: state.source, name: state.name, model: "ben2-base" },
      });
      state.token = prepared.token;
      state.maskUrl = prepared.mask_url;
      state.width = prepared.width || state.width;
      state.height = prepared.height || state.height;
      await loadPreviewSources();
      setStatus("抠图完成，可以拖动参数微调。");
    } catch (error) {
      setStatus(error.message, "error");
      showSourcePreview();
      setEmptyMessage("抠图失败");
    } finally {
      setBusy(false);
    }
  }

  async function exportToCanvas() {
    if (!state?.token || state.busy) return;
    setBusy(true, "正在按原图分辨率保存…");
    try {
      const result = await requestJson(ENDPOINTS.apply, {
        method: "POST",
        body: { token: state.token, mode: state.mode, settings: currentSettings(), name: state.name },
      });
      setStatus("已保存到画布。");
      const onSaved = state.onSaved;
      const name = state.name;
      close();
      await onSaved?.(result, name);
    } catch (error) {
      setStatus(error.message, "error");
      setBusy(false);
    }
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    state = null;
    root.removeEventListener("keydown", onKeydown, true);
  }

  async function open(options = {}) {
    const source = String(options.source || "");
    if (!source) {
      throw new Error("这个图片节点还没有可抠图的原图。");
    }
    ensureMarkup();
    modal.hidden = false;
    root.addEventListener("keydown", onKeydown, true);
    setEmptyMessage("正在准备图片…");
    dom.canvas.width = 0;
    dom.canvas.height = 0;
    setStatus("");
    state = {
      node: options.node || null,
      name: options.name || "image.png",
      source: options.savedUrl || source,
      sourceForMask: source,
      mode: "subject",
      subject: { ...DEFAULT_SUBJECT },
      effect: { ...DEFAULT_EFFECT },
      token: "",
      maskUrl: "",
      width: Number(options.width || 0),
      height: Number(options.height || 0),
      busy: false,
      onSaved: options.onSaved,
    };
    dom.modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.cutoutMode === "subject"));
    syncControls();
    setBusy(false);
    try {
      state.image = await loadImage(state.sourceForMask);
      state.width = state.width || state.image.naturalWidth || state.image.width;
      state.height = state.height || state.image.naturalHeight || state.image.height;
    } catch {
      setEmptyMessage("原图加载失败");
      setStatus("原图加载失败，无法抠图。", "error");
      return false;
    }
    await runRemoval();
    return true;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片加载失败"));
      image.src = src;
    });
  }

  root.BackgroundRemovalUi = Object.freeze({ open, close, isOpen: () => Boolean(modal && !modal.hidden) });
})(window);
