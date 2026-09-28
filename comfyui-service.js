"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const os = require("node:os");
const { spawn, execFile } = require("node:child_process");

const SETTINGS_KEY = "comfyui_settings_v1";
const DEFAULT_URL = "http://127.0.0.1:8188";
const fail = (code, message, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
const text = value => String(value ?? "").trim();
const clone = value => JSON.parse(JSON.stringify(value));
const redact = value => String(value || "")
  .replace(/\u001b\[[0-9;]*m/g, "")
  .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
  .replace(/\b(?:sk|rk|pk|key)-[A-Za-z0-9._-]+/gi, "[REDACTED]")
  .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)\S+/gi, "$1[REDACTED]");

function normalizeUrl(value) {
  let url;
  try { url = new URL(text(value)); } catch {}
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw fail("comfy_invalid_url", "访问地址须为完整的 http:// 或 https:// 地址，不能包含密钥、查询参数或片段。");
  }
  if (["0.0.0.0", "[::]"].includes(url.hostname)) throw fail("comfy_invalid_url", "0.0.0.0 / :: 是监听地址；访问地址请填写实际 IP 或 127.0.0.1。");
  return url.toString().replace(/\/+$/, "");
}

function localPath(value, label, optional = false) {
  const input = text(value);
  if (!input && optional) return "";
  if (/^(?:\\\\|\/\/)/.test(input)) throw fail("comfy_remote_path", `${label}不能使用远程共享路径。启动仅发生在 AI OS 服务所在电脑；远程 ComfyUI 请使用访问地址。`);
  if (!input || !path.isAbsolute(input) || /[\0\r\n]/.test(input)) throw fail("comfy_invalid_path", `${label}请填写 AI OS 服务所在电脑上的绝对路径。`);
  const resolved = path.resolve(input);
  if (fs.existsSync(resolved) && /^(?:\\\\|\/\/)/.test(fs.realpathSync(resolved))) throw fail("comfy_remote_path", `${label}指向远程共享，不能用于本机托管。`);
  return resolved;
}

function isFile(filename) { try { return fs.statSync(filename).isFile(); } catch { return false; } }
function isDirectory(filename) { try { return fs.statSync(filename).isDirectory(); } catch { return false; } }

function normalizeConfig(input, previous) {
  const config = { ...previous };
  for (const key of ["mode", "baseUrl", "providerId", "rootDirectory", "pythonPath", "mainPath", "listenHost", "outputDirectory"]) {
    if (Object.hasOwn(input, key)) config[key] = text(input[key]);
  }
  if (Object.hasOwn(input, "port")) config.port = Number(input.port);
  if (!["remote", "local"].includes(config.mode)) throw fail("comfy_invalid_mode", "请选择远程连接或本机托管。");
  const validPort = value => Number.isInteger(value) && value >= 1 && value <= 65535;
  if (config.mode === "local") {
    if (!validPort(config.port)) throw fail("comfy_invalid_port", "端口须为 1–65535 的整数。");
    if (!net.isIP(config.listenHost)) throw fail("comfy_invalid_host", "监听地址请填写 IP，例如 127.0.0.1 或 0.0.0.0，不要填写网址。");
    config.rootDirectory = localPath(config.rootDirectory, "ComfyUI 根目录", true);
    config.pythonPath = localPath(config.pythonPath, "Python 路径", true);
    config.mainPath = localPath(config.mainPath, "main.py 路径", true);
    config.outputDirectory = localPath(config.outputDirectory, "输出目录", true);
    if (config.pythonPath && !/^python(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i.test(path.basename(config.pythonPath))) throw fail("comfy_invalid_python", "Python 路径必须指向 Python 可执行文件，不能使用 bat、快捷方式或命令。");
    if (config.mainPath && path.basename(config.mainPath).toLowerCase() !== "main.py") throw fail("comfy_invalid_main", "请选择 ComfyUI 的 main.py 文件。");
  } else {
    // Inactive launch controls must not block a URL-only connection or poison its saved defaults.
    if (!validPort(config.port)) config.port = validPort(previous.port) ? previous.port : 8188;
    if (!net.isIP(config.listenHost)) config.listenHost = net.isIP(previous.listenHost) ? previous.listenHost : "127.0.0.1";
  }
  config.baseUrl = config.mode === "local" ? localUrl(config) : normalizeUrl(config.baseUrl);
  return config;
}

function localUrl(config) {
  const host = config.listenHost === "0.0.0.0" ? "127.0.0.1" : config.listenHost === "::" ? "::1" : config.listenHost;
  return `http://${net.isIP(host) === 6 ? `[${host}]` : host}:${config.port}`;
}

function detectPaths(input, previous) {
  const root = localPath(input.rootDirectory ?? previous.rootDirectory, "ComfyUI 根目录");
  const mainPath = [path.join(root, "main.py"), path.join(root, "ComfyUI", "main.py")].find(isFile) || "";
  const roots = [root, ...(path.basename(root).toLowerCase() === "comfyui" ? [path.dirname(root)] : [])];
  const pythonPath = roots.flatMap(folder => [
    "python_embeded/python.exe", "python_embedded/python.exe", "python/python.exe",
    ".venv/Scripts/python.exe", "venv/Scripts/python.exe", ".venv/bin/python", "venv/bin/python",
  ].map(relative => path.join(folder, relative))).find(isFile) || "";
  const config = normalizeConfig({ ...input, mode: "local", rootDirectory: root, pythonPath, mainPath }, previous);
  const warnings = pathWarnings(config);
  return { config, valid: warnings.length === 0, warnings };
}

function pathWarnings(config) {
  const warnings = [];
  if (!isDirectory(config.rootDirectory)) warnings.push("ComfyUI 根目录不存在或无法读取。");
  if (!isFile(config.pythonPath)) warnings.push("未找到 Python，请在高级设置中填写实际 Python 路径。");
  if (!isFile(config.mainPath)) warnings.push("未找到 main.py，请选择整合包根目录，或在高级设置中填写 main.py 路径。");
  if (config.outputDirectory && !isDirectory(config.outputDirectory)) warnings.push("输出目录不存在，请先在 AI OS 服务主机创建目录。");
  return warnings;
}

async function readProbeJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw fail("comfy_invalid_response", "未返回 ComfyUI 状态数据。");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) throw fail("comfy_invalid_response", "响应过大，不像 ComfyUI 状态接口；请检查访问地址。");
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error.code) throw error;
    throw fail("comfy_invalid_response", "地址有响应，但未返回 ComfyUI 状态数据；请检查是否填了其他服务的地址。");
  } finally { reader.releaseLock(); }
}

function checkPort(config) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", error => reject(fail(
      error.code === "EADDRINUSE" ? "comfy_port_in_use" : "comfy_listen_failed",
      error.code === "EADDRINUSE" ? `端口 ${config.port} 已被占用。已有 ComfyUI 可直接连接；否则请更换端口。`
        : "监听地址不属于 AI OS 服务主机或端口不可用；请使用 127.0.0.1 / 0.0.0.0 或该主机的 IP。",
    )));
    probe.listen({ host: config.listenHost, port: config.port, exclusive: true }, () => probe.close(error => error ? reject(error) : resolve()));
  });
}

function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let forceTimer;
    const timer = setTimeout(() => done(fail("comfy_stop_timeout", "进程尚未退出，不能重启。请检查服务主机的进程状态。", 409)), 12_000);
    const onExit = () => done();
    const onError = error => done(error);
    function done(error) {
      clearTimeout(timer); clearTimeout(forceTimer);
      child.removeListener("exit", onExit); child.removeListener("error", onError);
      error ? reject(error) : resolve();
    }
    child.once("exit", onExit); child.once("error", onError);
    if (process.platform === "win32") {
      // Only this live child handle's PID; never kill by executable name or port.
      execFile(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"),
        ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10_000 },
        error => { if (error && child.exitCode === null && !child.signalCode) done(fail("comfy_stop_failed", "未能停止托管进程，请检查服务主机权限。", 409)); });
    } else {
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => { if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL"); }, 8_000);
    }
  });
}

function createComfyService({
  settings, getConnections = () => [], updateConnection = () => {},
  defaultUrl = DEFAULT_URL, fetchImpl = globalThis.fetch, spawnImpl = spawn,
  stopProcess = stopOwnedProcess, probeTimeoutMs = 4_000, startupTimeoutMs = 180_000,
} = {}) {
  if (!settings?.getSetting || !settings?.setSetting) throw new TypeError("ComfyUI requires a settings store.");
  let child = null;
  let busy = false;
  let closing = false;
  let closePromise;
  let runtime = { state: "stopped", owned: false, pid: null, startedAt: null, message: "", logs: "" };
  let statusPromise = null;

  function configuration() {
    const connections = getConnections().map(item => ({ id: item.id, name: item.name, baseUrl: item.baseUrl, enabled: item.enabled !== false }));
    const legacy = connections.find(item => item.enabled) || connections[0];
    const defaults = { mode: "remote", providerId: legacy?.id || "", baseUrl: legacy?.baseUrl || defaultUrl,
      rootDirectory: "", pythonPath: "", mainPath: "", listenHost: "127.0.0.1", port: 8188, outputDirectory: "" };
    const config = normalizeConfig(settings.getSetting(SETTINGS_KEY) || {}, defaults);
    return { config, connections, hostName: os.hostname(), runtime: clone(runtime), warnings: config.mode === "local" ? pathWarnings(config) : [] };
  }

  async function exclusive(action) {
    if (busy) throw fail("comfy_busy", "正在处理 ComfyUI 操作，请稍候。", 409);
    if (closing) throw fail("comfy_closing", "AI OS 服务正在关闭。", 409);
    busy = true;
    try { return await action(); } finally { busy = false; }
  }

  async function save(input = {}) {
    return exclusive(async () => {
      if (child) throw fail("comfy_running", "请先停止 AI OS 托管的 ComfyUI，再修改连接或启动配置。", 409);
      const current = configuration();
      const config = normalizeConfig(input, current.config);
      if (config.mode === "local" && config.rootDirectory && (!config.pythonPath || !config.mainPath)) {
        const detected = detectPaths(config, current.config).config;
        config.pythonPath ||= detected.pythonPath;
        config.mainPath ||= detected.mainPath;
      }
      if (Object.hasOwn(input, "providerId") && config.providerId && !current.connections.some(item => item.id === config.providerId)) {
        throw fail("comfy_invalid_connection", "所选 ComfyUI 连接已不存在，请刷新设置。");
      }
      const persist = () => {
        if (config.providerId) updateConnection(config.providerId, config.baseUrl);
        settings.setSetting(SETTINGS_KEY, config);
      };
      if (typeof settings.runInTransaction === "function") settings.runInTransaction(persist);
      else persist();
      runtime = { ...runtime, state: "stopped", message: "", logs: "" };
      return configuration();
    });
  }

  async function probe(baseUrl) {
    const started = Date.now();
    const signal = AbortSignal.timeout(probeTimeoutMs);
    try {
      let endpoint = "/system_stats";
      let response = await fetchImpl(baseUrl + endpoint, { method: "GET", redirect: "error", signal, headers: { Accept: "application/json" } });
      if (response.status === 404) {
        await response.body?.cancel();
        endpoint = "/queue";
        response = await fetchImpl(baseUrl + endpoint, { method: "GET", redirect: "error", signal, headers: { Accept: "application/json" } });
      }
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) throw fail("comfy_auth_required", "ComfyUI 地址要求鉴权。当前页面连接标准局域网 ComfyUI；请检查反向代理的访问限制。");
        throw fail("comfy_http_error", `ComfyUI 返回 HTTP ${response.status}，请检查地址和服务状态。`);
      }
      const data = await readProbeJson(response);
      const valid = endpoint === "/queue" ? Array.isArray(data?.queue_running) && Array.isArray(data?.queue_pending)
        : data?.system && typeof data.system === "object" && Array.isArray(data.devices);
      if (!valid) throw fail("comfy_invalid_response", "地址有响应，但不是可识别的 ComfyUI 状态接口；请检查访问地址。");
      return { ok: true, baseUrl, elapsedMs: Date.now() - started, checkedAt: new Date().toISOString(), message: "ComfyUI 连接可用", devices: (data.devices || []).slice(0, 8).map(item => text(item.name).slice(0, 160)) };
    } catch (error) {
      return { ok: false, baseUrl, elapsedMs: Date.now() - started, checkedAt: new Date().toISOString(), code: error.code || "comfy_unreachable",
        message: error.code?.startsWith("comfy_") ? error.message : "无法连接 ComfyUI。请确认服务已启动、IP 和端口正确；跨电脑访问需监听 0.0.0.0 或局域网 IP，并允许防火墙端口。" };
    }
  }

  function test(input = {}) { return probe(normalizeConfig(input, configuration().config).baseUrl); }
  function detect(input = {}) { return detectPaths(input, configuration().config); }
  function resolveUrl() { return configuration().config.baseUrl; }

  function status() {
    if (statusPromise) return statusPromise;
    const observedChild = child;
    const baseUrl = resolveUrl();
    statusPromise = probe(baseUrl).then(connection => {
      if (observedChild && child === observedChild && runtime.state !== "stopping") {
        if (connection.ok) runtime.readyAt ||= Date.now();
        runtime.state = connection.ok ? "running" : runtime.readyAt || Date.now() - runtime.startedAt >= startupTimeoutMs ? "error" : "starting";
        runtime.message = connection.ok ? "ComfyUI 已可用" : runtime.readyAt
          ? "ComfyUI 暂时无法连接，进程仍在运行；将继续检查连接，请查看日志。"
          : runtime.state === "error"
          ? "进程已启动但状态接口仍不可用，请查看启动日志；可停止后检查依赖或端口。"
          : "进程已启动，正在等待 ComfyUI 就绪…";
      }
      return { ...configuration(), connection };
    }).finally(() => { statusPromise = null; });
    return statusPromise;
  }

  async function start() {
    return exclusive(async () => {
      if (child) throw fail("comfy_running", "ComfyUI 已由 AI OS 托管，请勿重复启动。", 409);
      const config = normalizeConfig(configuration().config, configuration().config);
      if (config.mode !== "local") throw fail("comfy_remote_start", "远程连接不能启动另一台电脑的进程。请在 ComfyUI 所在电脑运行 AI OS 服务，或另行部署远程启动代理。");
      const warnings = pathWarnings(config);
      if (warnings.length) throw fail("comfy_invalid_paths", warnings.join(" "));
      if ((await probe(config.baseUrl)).ok) throw fail("comfy_already_available", "此地址已有可用的 ComfyUI，直接连接即可；AI OS 不会接管或停止它。", 409);
      await checkPort(config);
      const args = ["-u", config.mainPath, "--listen", config.listenHost, "--port", String(config.port), "--disable-auto-launch"];
      if (/python_embed+ed/i.test(config.pythonPath)) args.push("--windows-standalone-build");
      if (config.outputDirectory) args.push("--output-directory", config.outputDirectory);
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(?:API_?KEY|TOKEN|SECRET|PASSWORD)/i.test(key)));
      runtime = { state: "starting", owned: false, pid: null, startedAt: Date.now(), message: "正在启动 ComfyUI…", logs: "" };
      let launched;
      let spawned = false;
      try {
        launched = spawnImpl(config.pythonPath, args, { cwd: path.dirname(config.mainPath), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...env, PYTHONUNBUFFERED: "1" } });
        child = launched;
        runtime.owned = true;
        runtime.pid = launched.pid || null;
        const append = chunk => { if (child === launched) runtime.logs = redact(runtime.logs + String(chunk)).slice(-8_000); };
        launched.stdout?.on("data", append); launched.stderr?.on("data", append);
        launched.on("error", () => {
          if (child !== launched) return;
          if (spawned) {
            runtime = { ...runtime, state: "error", message: "托管进程操作失败，进程仍由 AI OS 管理；请检查服务主机权限或停止后重试。" };
            return;
          }
          child = null;
          runtime = { ...runtime, state: "error", owned: false, pid: null, message: "Python 启动失败，请检查路径、执行权限和运行环境。" };
        });
        launched.once("exit", (code, signal) => {
          if (child !== launched) return;
          const stopped = runtime.state === "stopping";
          child = null;
          runtime = { ...runtime, state: stopped ? "stopped" : "error", owned: false, pid: null,
            message: stopped ? "ComfyUI 已停止" : `ComfyUI 进程已退出（${code ?? signal ?? "未知"}），请查看启动日志并检查依赖。` };
        });
        await new Promise((resolve, reject) => {
          const onSpawn = () => { spawned = true; launched.removeListener("error", onError); resolve(); };
          const onError = () => { launched.removeListener("spawn", onSpawn); reject(fail("comfy_spawn_failed", "Python 启动失败，请检查路径和执行权限。")); };
          launched.once("spawn", onSpawn); launched.once("error", onError);
        });
        return configuration();
      } catch (error) {
        if (!launched) runtime = { ...runtime, state: "error", owned: false, message: "Python 启动失败，请检查路径和执行权限。" };
        throw error;
      }
    });
  }

  async function stopInternal() {
    const owned = child;
    if (!owned) return configuration();
    runtime.state = "stopping";
    runtime.message = "正在停止 ComfyUI…";
    try { await stopProcess(owned); }
    catch (error) { runtime.state = "error"; runtime.message = "停止失败，进程仍由 AI OS 托管；请检查服务主机权限。"; throw error; }
    if (child === owned) { child = null; runtime = { ...runtime, owned: false, pid: null, state: "stopped", message: "ComfyUI 已停止" }; }
    return configuration();
  }
  function stop() { return exclusive(stopInternal); }
  function close() {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      while (busy) await new Promise(resolve => setTimeout(resolve, 25));
      await stopInternal();
    })();
    return closePromise;
  }
  return Object.freeze({ configuration, save, detect, test, status, start, stop, close, resolveUrl });
}

module.exports = { createComfyService, normalizeUrl };
