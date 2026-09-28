"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { app, BrowserWindow, Menu, Tray, clipboard, dialog, ipcMain, nativeImage, shell } = require("electron");

const { getAutostart, setAutostart } = require("./autostart");
const { resolveDesktopPaths, getServerEnvironment, seedPortableWorkflows } = require("./runtime-paths");
const { preparePortableData } = require("./portable-setup");
const { createUpdater } = require("./updater");
const { prepareInstall, writeCandidateStatus } = require("./update-install");
const { registerUpdateIpc } = require("./update-ipc");
const { pruneRuntimeSnapshots } = require("./runtime-retention");
const { pruneRollbackSnapshots } = require("./rollback-retention");
const { stopChild } = require("./child-lifecycle");
const { waitForServiceReady } = require("./service-readiness");
const developmentReload = app.isPackaged ? null : require("./dev-reload");

const runtimePaths = resolveDesktopPaths({
  appRoot: app.isPackaged ? path.join(process.resourcesPath, "app") : path.resolve(__dirname, ".."),
  resourcesPath: process.resourcesPath, isPackaged: app.isPackaged,
  userDataPath: app.getPath("userData"), exePath: process.execPath,
});
if (runtimePaths.portableRoot) {
  process.env.AI_OS_PORTABLE_ROOT = runtimePaths.portableRoot;
  fs.mkdirSync(runtimePaths.userDataDir, { recursive: true });
  fs.mkdirSync(path.join(runtimePaths.dataDir, ".logs"), { recursive: true });
  app.setPath("userData", runtimePaths.userDataDir);
  app.setPath("sessionData", runtimePaths.userDataDir);
  app.setPath("logs", path.join(runtimePaths.dataDir, ".logs"));
  app.setPath("crashDumps", path.join(runtimePaths.dataDir, ".logs", "crashes"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const PREFERRED_PORT = Math.max(1, Number(process.env.PORT) || 3199);
let activePort = PREFERRED_PORT;
let localUrl = `http://127.0.0.1:${activePort}`;
const hiddenLaunch = process.argv.includes("--hidden");
let mainWindow = null;
let startupWindow = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;
let lanUrls = [];
let serverOutput = "";
let quitPending = false;
let serviceRecovery = null;
let startupRecoveryPromise = null;
let startupRecoveryTimer = null;
let devReloadController = null;
let devReloadStatus = { enabled: false, message: "", updatedAt: null };
const currentVersion = require(path.join(runtimePaths.appRoot, "package.json")).version;
const currentRuntimeName = (() => {
  if (!runtimePaths.portableRoot) return `${currentVersion}-win-x64`;
  try {
    const value = fs.readFileSync(path.join(runtimePaths.portableRoot, ".ai-runtime", ".active-runtime"), "utf8").trim();
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(value) ? value : `${currentVersion}-win-x64`;
  } catch {
    return `${currentVersion}-win-x64`;
  }
})();
const updater = createUpdater({ portableRoot: runtimePaths.portableRoot, currentVersion, onRestart: restartToUpdate });

function projectRoot() {
  return runtimePaths.appRoot;
}

function dataDirectory() {
  return runtimePaths.dataDir;
}

function nodeRuntime() {
  return runtimePaths.nodeExecutable;
}

function rememberServerOutput(chunk) {
  const text = String(chunk || "");
  serverOutput = `${serverOutput}${text}`.slice(-12_000);
  for (const match of text.matchAll(/LAN access:\s*(https?:\/\/[^\s]+)/g)) {
    if (!lanUrls.includes(match[1])) lanUrls.push(match[1]);
  }
}

function canListen(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    const finish = (available) => {
      const done = () => resolve(available);
      probe.removeAllListeners();
      if (probe.listening) {
        try { probe.close(done); } catch { done(); }
      } else done();
    };
    probe.once("error", () => finish(false));
    probe.listen({ port, host: "0.0.0.0", exclusive: true }, () => finish(true));
  });
}

async function selectServerPort() {
  const candidates = [...new Set([
    PREFERRED_PORT,
    3199,
    3188,
    3110,
    3644,
  ])];
  for (const candidate of candidates) {
    if (!await canListen(candidate)) continue;
    activePort = candidate;
    localUrl = `http://127.0.0.1:${activePort}`;
    if (activePort !== PREFERRED_PORT) {
      rememberServerOutput(`\n端口 ${PREFERRED_PORT} 当前不可用，已切换到 ${activePort}。`);
    }
    return activePort;
  }
  throw new Error(`无法找到可用的本地端口（首选端口 ${PREFERRED_PORT}）。`);
}

async function startServer() {
  if (serverProcess && serverProcess.exitCode === null) return serverProcess;
  await selectServerPort();
  const root = projectRoot();
  const executable = nodeRuntime();
  const serverPath = path.join(root, "server.js");
  const usesElectronAsNode = executable === process.execPath;
  serverProcess = spawn(executable, [serverPath], {
    cwd: root,
    windowsHide: true,
    env: {
      ...getServerEnvironment(runtimePaths),
      PORT: String(activePort),
      HOST: "0.0.0.0",
      AI_OS_DATA_DIR: dataDirectory(),
      AI_OS_STATIC_CACHE_MODE: app.isPackaged ? "production" : "development",
      ...(usesElectronAsNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  serverProcess.stdout?.on("data", rememberServerOutput);
  serverProcess.stderr?.on("data", rememberServerOutput);
  serverProcess.once("error", error => rememberServerOutput(`\nService error: ${error.message}`));
  if (process.env.AI_OS_UPDATE_ID) writeCandidateStatus(runtimePaths.portableRoot, currentRuntimeName, "process", {serverPid:serverProcess.pid});
  serverProcess.once("exit", (code) => {
    rememberServerOutput(`\nAI OS service exited with code ${code}.`);
    serverProcess = null;
    rebuildTrayMenu();
  });
  return serverProcess;
}

async function waitForHealth(timeoutMs = 30_000) {
  const ready = await waitForServiceReady({
    localUrl,
    timeoutMs,
    requestTimeoutMs: 1_500,
    retryDelayMs: 300,
    isServiceRunning: () => Boolean(serverProcess && serverProcess.exitCode === null),
    getStoppedError: () => new Error(serverOutput || "AI OS service stopped during startup."),
  });
  lanUrls = Array.isArray(ready.lanUrls) ? ready.lanUrls : lanUrls;
  return ready;
}

function developmentReloadEnabled() {
  if (!developmentReload) return false;
  return developmentReload.isDevelopmentReloadEnabled({
    isPackaged: app.isPackaged,
    argv: process.argv,
    env: process.env,
  });
}

function publishDevReloadStatus(message) {
  const text = String(message || "").trim();
  devReloadStatus = {
    enabled: developmentReloadEnabled(),
    message: text,
    updatedAt: new Date().toISOString(),
  };
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const webContents = mainWindow.webContents;
  if (!webContents || webContents.isDestroyed()) return;
  tray?.setToolTip(text ? `AI OS Host · ${text}` : "AI OS Host · 局域网服务运行中");
  webContents.send("host.devReloadStatus", devReloadStatus);
  if (!/(?:已启用|已热替换|已刷新|刷新完成|重启|失败)/.test(text)) return;
  webContents.executeJavaScript(`window.AiOsDesktop?.toast?.(${JSON.stringify(text)})`, true).catch(() => {});
}

async function restartServerForDevelopment() {
  if (serviceRecovery) await serviceRecovery;
  await stopServer(15_000);
  serverProcess = null;
  lanUrls = [];
  await startServer();
  await waitForHealth(30_000);
  rebuildTrayMenu();
  writeRuntimeDiagnostics();
}

async function relaunchForDevelopment() {
  devReloadController?.stop();
  devReloadController = null;
  isQuitting = true;
  app.relaunch();
  app.quit();
}

function startDevelopmentReload() {
  if (!developmentReload || !developmentReloadEnabled() || devReloadController) return false;
  devReloadController = developmentReload.createDevReloadController({
    root: projectRoot(),
    getWindow: () => mainWindow,
    onRestartServer: restartServerForDevelopment,
    onRelaunchApp: relaunchForDevelopment,
    onStatus: publishDevReloadStatus,
  });
  const started = devReloadController.start();
  if (started) rebuildTrayMenu();
  if (started) setImmediate(() => { void devReloadController?.restorePendingState?.(); });
  return started;
}

function requestDevelopmentRefresh(reason) {
  if (!devReloadController || !developmentReloadEnabled()) {
    return { ok: false, message: "开发刷新未启用。" };
  }
  void devReloadController.requestRefresh(reason || "手动刷新");
  return { ok: true };
}

async function recoverServiceWindow() {
  if (startupRecoveryPromise) return startupRecoveryPromise;
  startupRecoveryPromise = (async () => {
    if (!serverProcess || serverProcess.exitCode !== null) await startServer();
    const ready = await waitForHealth(30_000);
    if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
    startupRecoveryTimer = null;
    if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(localUrl);
    else await createWindow();
    rebuildTrayMenu();
    return { ok: true, localUrl, lanUrls, ready };
  })().finally(() => { startupRecoveryPromise = null; });
  return startupRecoveryPromise;
}

function scheduleStartupRecovery(delayMs = 1_500) {
  if (startupRecoveryTimer || isQuitting) return;
  startupRecoveryTimer = setTimeout(async () => {
    startupRecoveryTimer = null;
    try {
      await recoverServiceWindow();
    } catch (error) {
      rememberServerOutput(`\nRecovery failed: ${error.message}`);
      if (mainWindow && !mainWindow.isDestroyed() && !isQuitting) scheduleStartupRecovery(2_500);
    }
  }, delayMs);
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function createStartupWindow() {
  if (startupWindow && !startupWindow.isDestroyed()) return startupWindow;
  startupWindow = new BrowserWindow({
    width: 486,
    height: 326,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    frame: false,
    title: "正在启动 AI OS",
    icon: path.join(__dirname, "icon.ico"),
    backgroundColor: "#eef3f8",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  startupWindow.setMenu(null);
  startupWindow.once("ready-to-show", () => {
    if (!hiddenLaunch && startupWindow && !startupWindow.isDestroyed()) startupWindow.show();
  });
  startupWindow.on("closed", () => { startupWindow = null; });
  await startupWindow.loadFile(path.join(__dirname, "startup.html"));
  return startupWindow;
}

function setStartupStatus(message, detail = "", progress = null) {
  if (!startupWindow || startupWindow.isDestroyed()) return;
  const safeMessage = JSON.stringify(String(message || ""));
  const safeDetail = JSON.stringify(String(detail || ""));
  const safeProgress = Number.isFinite(Number(progress)) ? Math.max(0.04, Math.min(1, Number(progress))) : null;
  if (safeProgress !== null) startupWindow.setProgressBar(safeProgress);
  startupWindow.webContents.executeJavaScript(
    `(() => {
      const status = document.querySelector("#status");
      const detail = document.querySelector("#detail");
      const progress = document.querySelector("#progress");
      if (status) status.textContent = ${safeMessage};
      if (detail) detail.textContent = ${safeDetail};
      ${safeProgress === null ? "" : `if (progress) progress.style.width = ${JSON.stringify(`${Math.round(safeProgress * 100)}%`)};`}
    })();`,
  ).catch(() => {});
}

function closeStartupWindow() {
  if (!startupWindow || startupWindow.isDestroyed()) return;
  startupWindow.destroy();
  startupWindow = null;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

// The sign-in host is chosen by the vendor, so the only requirement is a plain
// HTTPS address: a window may hand us anything, including a file: or
// javascript: URL, and neither may reach the operating system.
function openExternalUrl(value) {
  const target = String(value || "").trim();
  if (!/^https:\/\/[^\s"'<>]+$/i.test(target)) return false;
  try {
    shell.openExternal(target).catch(() => {});
  } catch {
    return false;
  }
  return true;
}

function isLocalAppUrl(value) {
  try {
    return new URL(String(value || "")).origin === new URL(localUrl).origin;
  } catch {
    return false;
  }
}

async function createWindow({ startupError = "" } = {}) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: "AI OS",
    icon: path.join(__dirname, "icon.ico"),
    backgroundColor: "#dbe8f4",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once("ready-to-show", () => {
    closeStartupWindow();
    if (!hiddenLaunch) showWindow();
  });
  mainWindow.once("ready-to-show", writeRuntimeDiagnostics);
  // Anything that leaves the app - the 即梦 authorization page, a vendor
  // document - belongs in the operator's own browser. Electron would otherwise
  // open a bare popup window without the profile the sign-in expects.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isLocalAppUrl(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!devReloadController || !developmentReloadEnabled() || input?.type !== "keyDown") return;
    const key = String(input.key || "").toLowerCase();
    const primary = Boolean(input.control || input.meta);
    if (key !== "f5" && !(primary && key === "r")) return;
    event.preventDefault();
    requestDevelopmentRefresh(key === "f5" ? "F5" : "Ctrl+R");
  });
  // A hidden launch does not reliably emit ready-to-show on every Windows
  // graphics stack. Keep diagnostics tied to the navigation as well so a
  // failed first paint can still be diagnosed and recovered.
  mainWindow.webContents.once("did-finish-load", writeRuntimeDiagnostics);
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (details?.reason === "launch-failed" && !isQuitting) {
      rememberServerOutput("\n窗口渲染进程启动失败，正在重试。请检查图形驱动或安全软件拦截。\n");
      scheduleStartupRecovery(1_000);
    }
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  if (startupError) {
    const detail = escapeHtml(startupError);
    try {
      await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#dbe8f4;color:#172033;font:16px system-ui;padding:48px}main{max-width:720px;margin:10vh auto;background:#fff;border-radius:18px;padding:28px;box-shadow:0 16px 50px #8190a033}h1{font-size:22px}pre{white-space:pre-wrap;background:#f1f5f9;padding:16px;border-radius:10px;font-size:13px}button{border:0;border-radius:10px;background:#2563eb;color:white;padding:10px 16px;font-weight:700}button:disabled{opacity:.65}#retryStatus{margin-left:12px;color:#64748b;font-size:13px}</style><main><h1>AI OS 服务启动失败</h1><p>本地服务暂时没有完成启动，AI OS 会自动重新连接。</p><pre>${detail}</pre><button id="retryService" type="button">重新连接</button><span id="retryStatus" role="status">正在等待服务…</span></main><script>const button=document.querySelector('#retryService');const status=document.querySelector('#retryStatus');button.addEventListener('click',async()=>{button.disabled=true;status.textContent='正在重新连接…';try{await window.aiOsHost.retryService()}catch(error){status.textContent=error.message||'重新连接失败';button.disabled=false}})</script>`)}`);
    } catch (error) {
      // A renderer launch failure must not create an unhandled rejection and
      // hide the actionable service error from the host process.
      rememberServerOutput(`\n错误页加载失败：${error.message}`);
    }
  } else {
    try {
      await mainWindow.loadURL(localUrl);
    } catch (error) {
      // Electron can report ERR_FAILED for the first navigation while the
      // local listener is already coming up. Do not turn that transient
      // renderer error into a second startup failure; the recovery loop will
      // retry the same window shortly.
      rememberServerOutput(`\n窗口加载失败：${error.message}`);
      scheduleStartupRecovery(1_000);
    }
  }
  writeRuntimeDiagnostics();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const auto = getAutostart(app);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 AI OS", click: showWindow },
    { label: "在默认浏览器中打开", click: () => shell.openExternal(localUrl) },
    ...(runtimePaths.portableRoot ? [{ label: "打开数据目录", click: () => shell.openPath(dataDirectory()) }] : []),
    { type: "separator" },
    ...(developmentReloadEnabled() ? [
      {
        label: "刷新开发更改",
        accelerator: "Control+Alt+R",
        enabled: Boolean(devReloadController),
        click: () => requestDevelopmentRefresh("托盘菜单"),
      },
      { type: "separator" },
    ] : []),
    {
      label: "复制局域网地址",
      enabled: lanUrls.length > 0,
      click: () => clipboard.writeText(lanUrls[0] || localUrl),
    },
    {
      label: "开机自动启动",
      type: "checkbox",
      checked: auto.enabled,
      click: (item) => { setAutostart(app, item.checked); rebuildTrayMenu(); },
    },
    { type: "separator" },
    { label: "退出并停止服务", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function writeRuntimeDiagnostics() {
  if (!runtimePaths.portableRoot) return;
  const report = {
    createdAt: new Date().toISOString(), pid: process.pid, serverPid: serverProcess?.pid || null,
    appRoot: projectRoot(), runtimeName: currentRuntimeName, dataDirectory: dataDirectory(), nodeExecutable: nodeRuntime(),
    localUrl, isPackaged: app.isPackaged, versions: process.versions,
    gpuFeatureStatus: app.getGPUFeatureStatus(),
  };
  try { fs.writeFileSync(path.join(dataDirectory(), ".logs", "runtime-diagnostics.json"), JSON.stringify(report, null, 2)); } catch {}
}

function createTray() {
  const iconPath = path.join(__dirname, "icon.ico");
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip("AI OS Host · 局域网服务运行中");
  tray.on("double-click", showWindow);
  rebuildTrayMenu();
}

async function stopServer(timeoutMs) {
  await stopChild(serverProcess, timeoutMs);
}

async function restartToUpdate(candidate) {
  // A prior timed-out shutdown still owns recovery until its draining server has exited.
  if (serviceRecovery) await serviceRecovery;
  let tx;
  try {
    await stopServer();
    tx = prepareInstall(runtimePaths.portableRoot, candidate, {parentPid:process.pid,hidden:hiddenLaunch});
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.AI_OS_UPDATE_ID;
    const helper = spawn(nodeRuntime(), [path.join(__dirname, "update-helper.js"), runtimePaths.portableRoot], {cwd:runtimePaths.portableRoot,env,windowsHide:true,detached:true,stdio:["ignore","ignore","ignore","ipc"]});
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { helper.kill(); reject(Error("更新助手启动超时。")); }, 10_000);
      helper.once("error", error => {clearTimeout(timer);reject(error)});
      helper.once("exit", code => {clearTimeout(timer);reject(Error(`更新助手提前退出：${code}`))});
      helper.once("message", message => { if (message?.type === "ready") {clearTimeout(timer);resolve()} });
    });
    helper.unref();
    setTimeout(() => { isQuitting = true; app.quit(); }, 200);
  } catch (error) {
    if (tx) {
      try { fs.unlinkSync(path.join(runtimePaths.portableRoot, ".ai-runtime", "updates", "install.json")); } catch(cleanupError) {if(cleanupError.code!=="ENOENT")throw cleanupError;}
    }
    const resume = () => isQuitting ? Promise.resolve() : startServer().then(() => waitForHealth()).catch(failure => rememberServerOutput(failure.message));
    if (serverProcess && serverProcess.exitCode === null) {
      serviceRecovery = new Promise(resolve => serverProcess.once("exit", resolve)).then(resume).finally(() => {serviceRecovery=null});
    } else await resume();
    throw error;
  }
}

function registerIpc() {
  registerUpdateIpc({ipcMain,updater,getWindow:()=>mainWindow,getLocalUrl:()=>localUrl});
  ipcMain.handle("host.getStatus", async () => ({
    running: Boolean(serverProcess && serverProcess.exitCode === null),
    localUrl,
    lanUrls,
    output: serverOutput,
    versions: process.versions,
    gpuFeatureStatus: app.getGPUFeatureStatus(),
  }));
  ipcMain.handle("host.getDevReloadStatus", () => ({
    ...devReloadStatus,
    enabled: developmentReloadEnabled(),
  }));
  ipcMain.handle("host.triggerDevReload", () => requestDevelopmentRefresh("主界面"));
  ipcMain.handle("host.openSystem", () => { showWindow(); return true; });
  ipcMain.handle("host.openExternal", (_event, url) => openExternalUrl(url));
  ipcMain.handle("host.getAutostart", () => getAutostart(app));
  ipcMain.handle("host.setAutostart", (_event, enabled) => {
    const result = setAutostart(app, Boolean(enabled));
    rebuildTrayMenu();
    return result;
  });
  ipcMain.handle("host.retryService", () => recoverServiceWindow());
  ipcMain.handle("host.quit", () => { isQuitting = true; app.quit(); return true; });
}

app.on("second-instance", showWindow);
app.on("window-all-closed", () => {});
app.on("before-quit", event => {
  isQuitting = true;
  devReloadController?.stop();
  devReloadController = null;
  if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
  startupRecoveryTimer = null;
  if (!serverProcess) return;
  event.preventDefault();
  if (quitPending) return;
  quitPending = true;
  // Quitting owns a shorter budget than an update handover: the server already
  // closes its sockets and data files on its own, and a stuck stop must not keep
  // the operator waiting for the full update timeout before the window leaves.
  stopServer(8_000).catch(error => { rememberServerOutput(error.message); serverProcess?.kill("SIGTERM"); })
    .finally(() => app.exit(0));
});

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    registerIpc();
    try {
      await createStartupWindow();
      setStartupStatus("正在检查运行环境", "确认便携目录与本地数据位置…", 0.08);
      const setupResult = await preparePortableData({
        paths: runtimePaths,
        dialog,
        BrowserWindow,
        ipcMain,
        argv: process.argv,
        onSetupWindowOpen: () => {
          if (!hiddenLaunch && startupWindow && !startupWindow.isDestroyed()) startupWindow.hide();
        },
      });
      if (setupResult.action !== "fresh" && setupResult.action !== "migrated") {
        closeStartupWindow();
        isQuitting = true;
        app.quit();
        return;
      }
      if (!hiddenLaunch && startupWindow && !startupWindow.isDestroyed()) startupWindow.show();
      setStartupStatus("正在准备本地数据", "初始化工作流与桌面运行目录…", 0.22);
      seedPortableWorkflows(runtimePaths);
      setStartupStatus("正在启动本地服务", "AI OS 服务正在绑定本机端口…", 0.38);
      await startServer();
      setStartupStatus("正在等待服务就绪", "检查接口、数据库与局域网访问状态…", 0.62);
      await waitForHealth();
      setStartupStatus("正在加载工作台", "准备桌面、画布与组件目录…", 0.88);
      writeRuntimeDiagnostics();
      await createWindow();
      createTray();
      startDevelopmentReload();
      if (process.env.AI_OS_UPDATE_ID) writeCandidateStatus(runtimePaths.portableRoot, currentRuntimeName, "health", {serverPid:serverProcess?.pid});
      delete process.env.AI_OS_UPDATE_ID;
      if (runtimePaths.portableRoot) {
        setImmediate(() => {
          try {
            const result = pruneRuntimeSnapshots(runtimePaths.portableRoot);
            if (result.errors.length) rememberServerOutput(`\nRuntime retention completed with ${result.errors.length} cleanup error(s).`);
          } catch (error) {
            rememberServerOutput(`\nRuntime retention skipped: ${error.message}`);
          }
          try {
            const result = pruneRollbackSnapshots(runtimePaths.portableRoot);
            if (result.errors.length) rememberServerOutput(`\nRollback retention completed with ${result.errors.length} cleanup error(s).`);
          } catch (error) {
            rememberServerOutput(`\nRollback retention skipped: ${error.message}`);
          }
        });
      }
      app.once("gpu-info-update", writeRuntimeDiagnostics);
    } catch (error) {
      rememberServerOutput(`\nStartup failed: ${error.message}`);
      if (error?.portableSetup) {
        setStartupStatus("迁移未完成", "保存诊断信息后退出，不会打开空系统…", 1);
        writeRuntimeDiagnostics();
        closeStartupWindow();
        isQuitting = true;
        app.quit();
        return;
      }
      setStartupStatus("服务启动遇到问题", "正在打开可操作的诊断窗口…", 1);
      writeRuntimeDiagnostics();
      if (process.env.AI_OS_UPDATE_ID) {
        closeStartupWindow();
        app.quit();
        return;
      }
      await createWindow({ startupError: serverOutput || error.message });
      createTray();
      startDevelopmentReload();
      scheduleStartupRecovery();
    }
  });
}
