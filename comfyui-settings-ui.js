(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsComfySettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const copy = value => JSON.parse(JSON.stringify(value));
  const defaults = () => ({ mode: "remote", baseUrl: "", providerId: "", rootDirectory: "", pythonPath: "", mainPath: "", listenHost: "127.0.0.1", port: 8188, outputDirectory: "" });
  function localUrl(config) {
    const host = config.listenHost === "0.0.0.0" ? "127.0.0.1" : config.listenHost === "::" ? "::1" : config.listenHost;
    return `http://${host.includes(":") ? `[${host}]` : host}:${config.port}`;
  }
  function create({ root, request, render = () => {}, pollMs = 2000 }) {
    const state = { config: defaults(), saved: null, connections: [], runtime: { state: "stopped", owned: false },
      connection: null, warnings: [], hostName: "", busy: "", error: "", note: "", advanced: false, loaded: false };
    let active = false;
    let disposed = false;
    let revision = 0;
    let edits = 0;
    let timer;
    let remoteUrl = "";
    const dirty = () => JSON.stringify(state.config) !== JSON.stringify(state.saved);
    const current = token => active && !disposed && token === revision;
    const form = () => root.querySelector("[data-comfy-form]");
    const redraw = () => { if (active && !disposed) render(); };
    function read(element = form()) {
      if (!element) return copy(state.config);
      const data = new FormData(element);
      const config = { ...state.config };
      // Disabled or hidden local controls must not erase saved paths on a remote save.
      for (const key of Object.keys(config)) if (data.has(key)) config[key] = String(data.get(key)).trim();
      config.port = Number(config.port);
      if (config.mode === "local") config.baseUrl = localUrl(config);
      return config;
    }
    function adopt(result, updateConfig = true) {
      if (updateConfig && result.config) {
        state.config = copy(result.config);
        state.saved = copy(result.config);
        if (result.config.mode === "remote") remoteUrl = result.config.baseUrl;
      }
      if (result.connections) state.connections = result.connections;
      if (result.runtime) state.runtime = result.runtime;
      if (result.warnings) state.warnings = result.warnings;
      if (result.hostName) state.hostName = result.hostName;
    }
    function connectionStatus() {
      if (state.busy === "load") return ["读取中", "pending"];
      if (state.busy === "test") return ["测试中", "pending"];
      if (state.config.mode === "local" && state.runtime.owned) {
        if (state.runtime.state === "running") return ["运行中", "success"];
        if (state.runtime.state === "error") return ["运行异常", "error"];
        return [state.runtime.state === "stopping" ? "停止中" : "正在启动", "pending"];
      }
      const connection = state.connection;
      if (connection?.baseUrl === state.config.baseUrl) return [connection.ok ? "连接可用" : "无法连接", connection.ok ? "success" : "error"];
      if (state.config.mode === "local" && state.runtime.state === "error") return ["启动失败", "error"];
      if (state.config.mode === "local" && state.runtime.message === "ComfyUI 已停止") return ["已停止", "neutral"];
      return ["未测试", "neutral"];
    }
    function feedbackMarkup() {
      const connection = state.connection?.baseUrl === state.config.baseUrl ? state.connection : null;
      return `${state.error ? `<p class="settings-comfy-error" role="alert">${esc(state.error)}</p>` : ""}
        ${state.note ? `<p class="settings-comfy-hint">${esc(state.note)}</p>` : ""}
        ${connection ? `<p class="settings-comfy-result" data-kind="${connection.ok ? "success" : "error"}">${esc(connection.message)}${connection.ok && connection.elapsedMs != null ? ` · ${connection.elapsedMs} ms` : ""}${connection.devices?.length ? `<small>${connection.devices.map(esc).join(" · ")}</small>` : ""}</p>` : ""}
        ${state.warnings.length ? `<ul class="settings-comfy-warnings">${state.warnings.map(warning => `<li>${esc(warning)}</li>`).join("")}</ul>` : ""}`;
    }
    function runtimeMarkup() {
      const runtime = state.runtime;
      const external = !runtime.owned && state.connection?.ok && state.connection.baseUrl === state.config.baseUrl;
      return `<div class="settings-comfy-runtime-heading"><div><strong>${runtime.owned ? "AI OS 托管进程" : external ? "已连接外部 ComfyUI" : "进程管理"}</strong><span>${esc(runtime.message || (external ? "此进程不是 AI OS 启动的，不提供停止操作。" : "没有 AI OS 托管进程。"))}</span></div>${runtime.pid ? `<code>PID ${esc(runtime.pid)}</code>` : ""}</div>
        <details data-comfy-logs ${runtime.state === "error" && runtime.logs ? "open" : ""}><summary>最近启动日志</summary><pre>${esc(runtime.logs || "暂无启动日志。")}</pre></details>`;
    }
    function refreshParts() {
      if (!active || disposed || !form()) return;
      const [label, kind] = connectionStatus();
      const badge = root.querySelector("[data-comfy-badge]");
      badge.textContent = label; badge.dataset.kind = kind;
      root.querySelector("[data-comfy-feedback]").innerHTML = feedbackMarkup();
      const runtime = root.querySelector("[data-comfy-runtime]");
      const wasOpen = runtime.querySelector("details")?.open;
      runtime.innerHTML = runtimeMarkup();
      if (wasOpen) runtime.querySelector("details").open = true;
      const locked = !state.loaded || Boolean(state.runtime.owned) || ["load", "save", "detect", "start", "stop"].includes(state.busy);
      root.querySelector("[data-comfy-fields]").disabled = locked;
      root.querySelectorAll("[data-comfy-action]").forEach(button => {
        const action = button.dataset.comfyAction;
        button.hidden = action === "start" ? state.config.mode !== "local" || state.runtime.owned
          : action === "stop" ? !state.runtime.owned : false;
        button.disabled = !state.loaded || Boolean(state.busy) || (action === "save" && state.runtime.owned);
        if (action === "start") button.textContent = dirty() ? "保存并启动" : "启动 ComfyUI";
        if (action === "save") button.textContent = state.busy === "save" ? "保存中…" : "保存配置";
      });
      root.querySelector("[data-comfy-dirty]").textContent = dirty() && state.loaded ? "有未保存的更改" : "配置已保存";
      if (state.config.mode === "local") form().elements.baseUrl.value = state.config.baseUrl;
    }
    function schedule() {
      clearTimeout(timer);
      if (active && !disposed && state.config.mode === "local" && state.runtime.owned) timer = setTimeout(() => { void poll(); }, pollMs);
    }
    async function poll() {
      if (!active || disposed) return;
      if (state.busy || root.offsetParent === null || root.ownerDocument?.hidden) { schedule(); return; }
      const token = revision;
      try {
        const result = await request("/api/comfyui/status");
        if (!current(token)) return;
        // Polling never updates form values, dirty drafts, focus, or selection.
        adopt(result, false);
        if (!dirty()) state.connection = result.connection || null;
        refreshParts();
      } catch (error) { if (current(token)) { state.error = error.message; refreshParts(); } }
      finally { if (current(token)) schedule(); }
    }
    async function load() {
      active = true;
      const token = ++revision;
      state.busy = "load"; state.error = "";
      redraw();
      try {
        const result = await request("/api/comfyui/settings");
        if (!current(token)) return;
        adopt(result, !state.loaded || !dirty());
        state.loaded = true;
      } catch (error) { if (current(token)) state.error = error.message; }
      finally { if (current(token)) { state.busy = ""; redraw(); schedule(); } }
    }
    function input(event) {
      if (["mode", "providerId"].includes(event.target.name)) return;
      const previousRoot = state.config.rootDirectory;
      state.config = read(event.target.closest("form"));
      edits++;
      state.connection = null; state.error = ""; state.note = ""; state.warnings = [];
      if (event.target.name === "rootDirectory" && state.config.rootDirectory !== previousRoot) {
        for (const name of ["pythonPath", "mainPath"]) {
          state.config[name] = "";
          if (form()?.elements[name]) form().elements[name].value = "";
        }
        state.note = "根目录已更改，保存时将重新识别 Python 和 main.py；自定义路径可在高级设置填写。";
      }
      refreshParts();
    }
    function change(event) {
      const name = event.target.name;
      if (!["mode", "providerId"].includes(name)) { input(event); return; }
      const previousMode = state.config.mode;
      const priorUrl = state.config.baseUrl;
      state.config = read(event.target.closest("form"));
      if (name === "mode") {
        if (previousMode === "remote") remoteUrl = priorUrl;
        state.config.baseUrl = state.config.mode === "local" ? localUrl(state.config) : remoteUrl || "http://127.0.0.1:8188";
      } else {
        const connection = state.connections.find(item => item.id === state.config.providerId);
        if (connection) { state.config.mode = "remote"; state.config.baseUrl = connection.baseUrl; remoteUrl = connection.baseUrl; }
      }
      state.connection = null; state.error = ""; state.note = ""; state.warnings = [];
      edits++;
      redraw();
    }
    async function action(name, element = form()) {
      if (!active || disposed || state.busy || !state.loaded) return;
      state.config = read(element);
      const submitted = copy(state.config);
      const token = ++revision;
      const editToken = edits;
      state.busy = name; state.error = ""; state.note = "";
      clearTimeout(timer); refreshParts();
      try {
        if (name === "test") {
          const result = await request("/api/comfyui/test", { method: "POST", body: submitted });
          if (!current(token) || edits !== editToken) return;
          state.connection = result; // Endpoint returns the probe itself, not {connection}.
        } else if (name === "detect") {
          const result = await request("/api/comfyui/detect", { method: "POST", body: submitted });
          if (!current(token) || edits !== editToken) return;
          state.config = result.config; state.warnings = result.warnings || [];
          state.advanced = !result.valid;
          state.note = result.valid ? "已识别 Python 和 main.py，保存后即可启动。" : "未能完整识别，请展开高级设置检查路径。";
          redraw();
        } else if (name === "save" || name === "start") {
          if (name === "save" || dirty()) {
            const result = await request("/api/comfyui/settings", { method: "PUT", body: submitted });
            if (!current(token)) return;
            adopt(result);
            if (name === "save") state.note = "配置已保存。连接测试不会提交生成任务。";
          }
          // Navigation away cancels the second step, even if save already finished.
          if (name === "start" && current(token)) {
            const result = await request("/api/comfyui/start", { method: "POST", body: {} });
            if (!current(token)) return;
            adopt(result); state.connection = null;
          }
          if (current(token)) redraw();
        } else if (name === "stop") {
          const result = await request("/api/comfyui/stop", { method: "POST", body: {} });
          if (!current(token)) return;
          adopt(result, false); state.connection = null;
        } else if (name === "refresh") {
          const result = await request("/api/comfyui/status");
          if (!current(token)) return;
          adopt(result, false);
          if (!dirty()) state.connection = result.connection;
          else state.note = "已刷新托管进程状态。当前表单未保存，请使用“测试连接”检查当前地址。";
        }
      } catch (error) { if (current(token)) state.error = error.message || "操作未完成，请检查配置。"; }
      finally { if (current(token)) { state.busy = ""; refreshParts(); schedule(); } }
    }
    function field(label, name, placeholder, extra = "") {
      return `<label class="settings-comfy-field"><span>${label}</span><input name="${name}" value="${esc(state.config[name])}" placeholder="${esc(placeholder)}" ${extra} /></label>`;
    }
    function markup() {
      const c = state.config;
      const local = c.mode === "local";
      const [label, kind] = connectionStatus();
      const locked = !state.loaded || state.runtime.owned || Boolean(state.busy && state.busy !== "test" && state.busy !== "refresh");
      return `<section class="settings-page settings-comfy-page" data-settings-section="comfyui">
        <header><p>COMFYUI</p><h2>ComfyUI 配置</h2><span>连接已有服务，或在 AI OS 服务主机启动 ComfyUI。</span></header>
        <article class="settings-comfy-connection-card">
          <div class="settings-comfy-flow"><span>AI OS 服务主机${state.hostName ? `<small>${esc(state.hostName)}</small>` : ""}</span><i aria-hidden="true">→</i><strong>ComfyUI</strong><em data-comfy-badge data-kind="${kind}">${label}</em></div>
          <form data-comfy-form>
            <fieldset data-comfy-fields ${locked ? "disabled" : ""}>
              <legend class="settings-comfy-sr-only">ComfyUI 连接设置</legend>
              <div class="settings-comfy-mode" role="radiogroup" aria-label="连接模式">
                <label class="${!local ? "active" : ""}"><input type="radio" name="mode" value="remote" ${!local ? "checked" : ""} /><span><strong>远程连接</strong><small>只需访问地址 · 不管理进程</small></span></label>
                <label class="${local ? "active" : ""}"><input type="radio" name="mode" value="local" ${local ? "checked" : ""} /><span><strong>本机托管</strong><small>同机部署 · 可启动和停止</small></span></label>
              </div>
              ${state.connections.length > 1 ? `<label class="settings-comfy-field"><span>已保存连接</span><select name="providerId">${state.connections.map(item => `<option value="${esc(item.id)}" ${item.id === c.providerId ? "selected" : ""}>${esc(item.name)}${item.enabled ? "" : "（未启用）"}</option>`).join("")}</select><small>修改只影响所选连接，其他连接和工作流保留。</small></label>` : ""}
              <label class="settings-comfy-field"><span>ComfyUI 访问地址${local ? " · 自动生成" : ""}</span><input name="baseUrl" type="url" value="${esc(c.baseUrl)}" placeholder="http://192.168.1.53:8188" ${local ? "readonly" : ""} required /><small>${local ? "这是 AI OS 服务主机连接 ComfyUI 的地址，不是其他电脑的浏览器地址。" : "填写 ComfyUI 所在电脑的 IP 和端口，例如 http://192.168.1.53:8188。"}</small></label>
              ${local ? `<div class="settings-comfy-local">
                <label class="settings-comfy-field"><span>ComfyUI 根目录</span><div class="settings-comfy-inline"><input name="rootDirectory" value="${esc(c.rootDirectory)}" placeholder="例如 D:\\ComfyUI_windows_portable" /><button type="button" class="settings-secondary-button" data-comfy-detect data-comfy-action="detect" ${state.busy ? "disabled" : ""}>识别路径</button></div></label>
                <div class="settings-comfy-grid">${field("监听地址", "listenHost", "127.0.0.1", 'list="comfy-listen-hosts"')}${field("端口", "port", "8188", 'type="number" min="1" max="65535" required')}</div>
                <datalist id="comfy-listen-hosts"><option value="127.0.0.1">仅本机</option><option value="0.0.0.0">允许局域网访问</option></datalist>
                <p class="settings-comfy-hint">只通过 AI OS 使用时，监听 127.0.0.1 即可。若要从其他电脑直接访问 ComfyUI，请监听 0.0.0.0，并在服务主机放行端口。</p>
                <details class="settings-comfy-advanced" ${state.advanced ? "open" : ""}><summary>高级设置 <span>Python、入口文件和输出目录</span></summary>
                  ${field("Python 路径", "pythonPath", "点击“识别路径”自动查找 python.exe")}
                  ${field("main.py 路径", "mainPath", "点击“识别路径”自动查找 ComfyUI\\main.py")}
                  ${field("默认输出目录（可选）", "outputDirectory", "留空使用 ComfyUI 默认输出目录")}
                </details>
                <p class="settings-comfy-hint">路径必须属于 AI OS 服务所在电脑。共享目录不能让程序在另一台电脑上启动。</p>
              </div>` : '<p class="settings-comfy-hint">远程模式只连接 ComfyUI，不负责启动或停止。若 ComfyUI 在另一台电脑，需先在那台电脑启动服务。</p>'}
            </fieldset>
            <div data-comfy-feedback role="status" aria-live="polite">${feedbackMarkup()}</div>
            <footer class="settings-comfy-actions">
              <button type="button" class="settings-secondary-button" data-comfy-test data-comfy-action="test" ${state.busy || !state.loaded ? "disabled" : ""}>测试连接</button>
              <small data-comfy-dirty>${dirty() ? "有未保存的更改" : "配置已保存"}</small>
              <button type="button" class="settings-primary-button" data-comfy-start data-comfy-action="start" ${!local || state.runtime.owned ? "hidden" : ""} ${state.busy || !state.loaded ? "disabled" : ""}>${dirty() ? "保存并启动" : "启动 ComfyUI"}</button>
              <button type="button" class="settings-danger-button" data-comfy-stop data-comfy-action="stop" ${!state.runtime.owned ? "hidden" : ""} ${state.busy ? "disabled" : ""}>停止托管进程</button>
              <button type="submit" class="settings-primary-button" data-comfy-action="save" ${locked ? "disabled" : ""}>保存配置</button>
            </footer>
          </form>
        </article>
        <article class="settings-card settings-comfy-runtime"><header><h3>运行状态</h3><button type="button" class="settings-secondary-button" data-comfy-refresh data-comfy-action="refresh" ${state.busy || !state.loaded ? "disabled" : ""}>刷新状态</button></header><div data-comfy-runtime>${runtimeMarkup()}</div><p class="settings-comfy-hint">仅停止 AI OS 自己启动的进程；退出 AI OS 服务也会停止托管进程。停止将中断该进程正在执行的任务。</p></article>
      </section>`;
    }
    function leave() { active = false; revision++; clearTimeout(timer); state.busy = ""; }
    return { markup, load, leave, read, action, input, change, save: element => action("save", element), destroy() { leave(); disposed = true; } };
  }
  return Object.freeze({ create });
});
