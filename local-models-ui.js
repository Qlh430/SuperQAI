(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsLocalModels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // 本地模型管理页：目前只有 AI 抠图用的 BEN2 Base。
  // 权重随应用内置，这里负责对着上游官方发布源检查更新、下载到数据目录并回退内置版本。
  const ENDPOINTS = {
    models: "/api/background-removal/models",
    check: "/api/background-removal/models/check",
    update: "/api/background-removal/models/update",
    progress: "/api/background-removal/models/update/progress",
    reset: "/api/background-removal/models/reset",
  };
  const SOURCE_LABELS = {
    bundled: "随应用内置",
    update: "已下载的更新",
    import: "手动导入的权重",
    external: ".env 指定的自定义路径",
  };
  const MODEL_PURPOSE = "通用前景分割模型，人物、商品、动物都能抠，纯 CPU 运行、不占 API 额度。";

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function shortHash(value) {
    const text = String(value || "").trim().toLowerCase();
    return /^[a-f0-9]{8,}$/.test(text) ? text.slice(0, 8) : "—";
  }

  function formatTime(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function create({ root, request, notify = () => {}, render = () => {}, pollMs = 800 }) {
    const state = { models: [], loaded: false, busy: "", error: "", note: "", progress: null };
    let active = false;
    let disposed = false;
    let timer = null;
    let revision = 0;

    const current = (token) => active && !disposed && token === revision;
    const redraw = () => { if (active && !disposed) render(); };
    const card = () => root.querySelector("[data-local-model]");
    const model = () => state.models[0] || null;
    const modelId = () => model()?.id || "ben2-base";

    // 已经知道上游版本时，本地就能判断“能不能更新”，不必每次打开设置都联网。
    function pendingUpdate(entry) {
      const upstream = entry?.upstream;
      if (!upstream?.sha256) return false;
      if (!entry.sha256) return true;
      return entry.sha256 !== upstream.sha256;
    }

    function statusOf(entry) {
      if (!entry) return ["读取中", "pending"];
      if (!entry.installed) return ["不可用", "error"];
      if (pendingUpdate(entry)) return ["可更新", "warning"];
      return ["已就绪", "success"];
    }

    function blockedByExternal(entry) {
      return entry?.source === "external";
    }

    function progressMarkup() {
      const progress = state.progress;
      if (!progress || state.busy !== "update") return "";
      const received = Number(progress.received) || 0;
      const total = Number(progress.total) || 0;
      const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
      const label = progress.phase === "connecting" ? "正在连接发布源" : "下载权重";
      const detail = total ? `${formatBytes(received)} / ${formatBytes(total)}` : (progress.message || "");
      return `<div class="settings-update-progress" data-local-model-progress>
        <div><span>${esc(label)}</span><strong data-local-model-percent>${percent}%</strong></div>
        <progress max="100" value="${percent}" aria-label="模型更新进度" aria-valuenow="${percent}">${percent}%</progress>
        ${detail ? `<small>${esc(detail)}</small>` : ""}
      </div>`;
    }

    function factsMarkup(entry) {
      if (!entry) return "";
      const rows = [
        ["当前生效", SOURCE_LABELS[entry.source] || "—", ""],
        ["权重体积", formatBytes(entry.size), ""],
      ];
      if (entry.sha256) rows.push(["本地校验值", shortHash(entry.sha256), "sha256 前 8 位"]);
      const upstreamVersion = entry.upstream?.sha256
        ? `${shortHash(entry.upstream.sha256)}${entry.upstream.publishedAt ? ` · ${formatTime(entry.upstream.publishedAt)}` : ""}`
        : "尚未检查";
      rows.push(["上游版本", upstreamVersion, entry.upstream?.checkedAt ? `上次检查 ${formatTime(entry.upstream.checkedAt)}` : ""]);
      return `<div class="settings-update-versions">${rows.map(([label, value, small]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong>${small ? `<small>${esc(small)}</small>` : ""}</div>`).join("")}</div>`;
    }

    function markup() {
      if (!state.loaded) {
        return `<section class="settings-page settings-local-model-page" data-settings-section="models">
          <header><p>LOCAL MODELS</p><h2>本地模型</h2><span>管理随应用分发的本地模型。更新会下载到数据目录，并优先于内置版本生效。</span></header>
          <article class="settings-card settings-update-card"><p class="settings-update-message">正在读取模型状态…</p></article>
        </section>`;
      }
      const entry = model();
      if (!entry) {
        return `<section class="settings-page settings-local-model-page" data-settings-section="models">
          <header><p>LOCAL MODELS</p><h2>本地模型</h2><span>管理随应用分发的本地模型。</span></header>
          <article class="settings-card settings-update-card"><p class="settings-update-error" role="alert">${esc(state.error || "服务端没有注册本地模型。")}</p></article>
        </section>`;
      }
      const [label, kind] = statusOf(entry);
      const blocked = blockedByExternal(entry);
      const canUpdate = pendingUpdate(entry) && !blocked;
      const busy = Boolean(state.busy);
      const updatable = state.remote?.sha256 && state.remote.sha256 !== entry.sha256;
      return `<section class="settings-page settings-local-model-page" data-settings-section="models">
        <header><p>LOCAL MODELS</p><h2>本地模型</h2><span>管理随应用分发的本地模型。更新会下载到数据目录，并优先于内置版本生效。</span></header>
        <article class="settings-card settings-update-card" data-local-model="${esc(entry.id)}" data-local-model-status="${kind}">
          <div class="settings-update-heading">
            <div><span>LOCAL MODEL</span><h3>${esc(entry.name)}</h3></div>
            <strong data-local-model-badge data-kind="${kind}">${esc(label)}</strong>
          </div>
          <p class="settings-update-message">${esc(entry.description || MODEL_PURPOSE)}</p>
          ${factsMarkup(entry)}
          <div class="settings-update-versions"><div><span>上游发布源</span><strong>${esc(entry.upstreamRepository || "—")}</strong><small>${entry.upstreamLicense ? `${esc(entry.upstreamLicense)} 许可` : ""}</small></div><div><span>文件</span><strong>BEN2_Base.onnx</strong><small>更新只从该来源下载</small></div></div>
          ${blocked ? `<p class="settings-update-error" role="status">当前生效的是 .env 里 AI_OS_BACKGROUND_REMOVAL_MODEL_PATH 指定的权重，它优先级最高，下载的更新不会生效。要改用这里的更新，请先移除该环境变量。</p>` : ""}
          ${entry.error ? `<p class="settings-update-error" role="alert">${esc(entry.error)}</p>` : ""}
          ${state.error ? `<p class="settings-update-error" role="alert">${esc(state.error)}</p>` : ""}
          ${state.note ? `<p class="settings-update-message" data-local-model-note>${esc(state.note)}</p>` : ""}
          ${progressMarkup()}
          <footer>
            <button type="button" data-local-model-check ${busy ? "disabled" : ""}>${state.remote ? "重新检查" : "检查更新"}</button>
            ${canUpdate || updatable ? `<button type="button" class="settings-primary-button" data-local-model-update ${busy ? "disabled" : ""}>下载更新</button>` : ""}
            ${entry.stored && entry.bundledAvailable ? `<button type="button" data-local-model-reset ${busy ? "disabled" : ""}>恢复内置版本</button>` : ""}
          </footer>
        </article>
        <p class="settings-update-message">更新只替换数据目录里的权重，不会改动应用自带的文件；校验不过的下载会被整份丢弃。不方便联网时，可以在能联网的机器上下好权重，再到抠图工作台用「导入本地模型」放进来。</p>
      </section>`;
    }

    async function load() {
      active = true;
      disposed = false;
      const token = ++revision;
      try {
        const data = await request(ENDPOINTS.models);
        if (!current(token)) return;
        state.models = Array.isArray(data?.models) ? data.models : [];
        state.error = "";
      } catch (error) {
        if (current(token)) state.error = error?.message || String(error);
      }
      if (current(token)) { state.loaded = true; redraw(); }
    }

    function stopPolling() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    function refreshProgress() {
      const node = root.querySelector("[data-local-model-progress]");
      if (!node) return;
      const progress = state.progress || {};
      const received = Number(progress.received) || 0;
      const total = Number(progress.total) || 0;
      const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
      node.querySelector("progress")?.setAttribute("value", String(percent));
      const label = node.querySelector("[data-local-model-percent]");
      if (label) label.textContent = `${percent}%`;
      const small = node.querySelector("small");
      if (small && total) small.textContent = `${formatBytes(received)} / ${formatBytes(total)}`;
    }

    function startPolling() {
      stopPolling();
      timer = setInterval(async () => {
        try {
          const data = await request(ENDPOINTS.progress);
          if (data?.progress && state.busy === "update") {
            state.progress = data.progress;
            refreshProgress();
          }
        } catch {
          /* 进度查不到不影响下载本身 */
        }
      }, pollMs);
    }

    async function check() {
      if (state.busy) return true;
      state.busy = "check";
      state.error = "";
      state.note = "";
      redraw();
      try {
        const data = await request(ENDPOINTS.check, { method: "POST", body: { id: modelId() } });
        state.models = data?.model ? [data.model] : state.models;
        state.remote = data?.remote || null;
        state.note = data?.updateAvailable
          ? `上游有新版本：${shortHash(state.remote.sha256)}（${formatBytes(state.remote.size)}）`
          : "已经是最新版本，本地权重与上游发布源一致。";
      } catch (error) {
        state.error = `检查更新失败：${error?.message || error}`;
      }
      state.busy = "";
      redraw();
      return true;
    }

    async function update() {
      if (state.busy) return true;
      state.busy = "update";
      state.error = "";
      state.note = "";
      state.progress = { phase: "connecting", received: 0, total: 0 };
      redraw();
      startPolling();
      try {
        const data = await request(ENDPOINTS.update, { method: "POST", body: { id: modelId() } });
        state.models = data?.model ? [data.model] : state.models;
        state.remote = data?.remote || state.remote;
        state.note = "更新完成，已经生效。";
        notify?.("抠图模型已更新");
      } catch (error) {
        state.error = error?.message || String(error);
      }
      stopPolling();
      state.busy = "";
      state.progress = null;
      redraw();
      return true;
    }

    async function reset() {
      if (state.busy) return true;
      state.busy = "reset";
      state.error = "";
      state.note = "";
      redraw();
      try {
        const data = await request(ENDPOINTS.reset, { method: "POST", body: { id: modelId() } });
        state.models = data?.model ? [data.model] : state.models;
        state.note = data?.removed ? "已删除数据目录里的权重，改回使用随应用内置的版本。" : "没有找到需要清理的权重，当前已在用内置版本。";
      } catch (error) {
        state.error = error?.message || String(error);
      }
      state.busy = "";
      redraw();
      return true;
    }

    async function onClick(event) {
      if (event.target.closest("[data-local-model-check]")) return check();
      if (event.target.closest("[data-local-model-update]")) return update();
      if (event.target.closest("[data-local-model-reset]")) return reset();
      return false;
    }

    function leave() {
      active = false;
      revision += 1;
      stopPolling();
    }

    function dispose() {
      disposed = true;
      leave();
    }

    return { markup, load, leave, dispose, onClick, state, ENDPOINTS, SOURCE_LABELS, pendingUpdate, formatBytes, shortHash };
  }

  return { create, SOURCE_LABELS, ENDPOINTS, MODEL_PURPOSE };
});
