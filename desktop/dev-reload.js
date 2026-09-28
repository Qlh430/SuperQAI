"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEV_STATE_KEY = "__ai_os_dev_reload_state_v1";
const DEV_REFRESH_KEY = "__ai_os_dev_reload_refresh_v1";
const CODE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".json", ".html", ".css"]);
const IGNORED_SEGMENTS = new Set([
  ".git",
  ".cache",
  ".codex",
  ".planning",
  "artifacts",
  "coverage",
  "data",
  "dist",
  "logs",
  "node_modules",
  "output",
  "runtime",
  "tmp",
]);
const IGNORED_SUFFIXES = [".bak", ".log", ".map", ".sqlite", ".sqlite3", ".db", ".tmp", "~"];
const SERVER_PREFIXES = ["core/", "server-components/"];

function isDevelopmentReloadEnabled(options = {}) {
  const argv = Array.isArray(options.argv) ? options.argv : [];
  const env = options.env || {};
  if (argv.includes("--no-dev-reload")) return false;
  const envValue = String(env.AI_OS_DEV_RELOAD || "").trim();
  if (/^(?:0|false|no|off)$/i.test(envValue)) return false;
  if (argv.includes("--dev-reload")) return true;
  if (/^(?:1|true|yes|on)$/i.test(envValue)) return true;
  return options.isPackaged === false;
}

function normalizeRelativePath(root, file) {
  const absoluteRoot = path.resolve(root);
  const absoluteFile = path.resolve(absoluteRoot, file);
  const relative = path.relative(absoluteRoot, absoluteFile).replace(/\\/g, "/");
  if (!relative || relative === "." || relative.startsWith("../") || path.isAbsolute(relative)) return "";
  return relative;
}

function shouldIgnoreFile(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  if (!normalized) return true;
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) return true;
  if (segments.some((segment) => segment.startsWith("_encoding_corrupt_backup_"))) return true;
  if (IGNORED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  const basename = segments.at(-1) || "";
  if (basename === ".env" || basename.startsWith(".env.")) return false;
  if (basename === "package.json" || basename === "package-lock.json") return false;
  return !CODE_EXTENSIONS.has(path.extname(basename).toLowerCase());
}

function collectCommonJsDependencies(root, entries, fsImpl = fs) {
  const absoluteRoot = path.resolve(root);
  const visited = new Set();
  const pending = [];
  for (const entry of entries) {
    const relative = normalizeRelativePath(absoluteRoot, entry);
    if (relative) pending.push(relative);
  }
  while (pending.length) {
    const relative = pending.pop();
    if (!relative || visited.has(relative) || shouldIgnoreFile(relative)) continue;
    const absolute = path.join(absoluteRoot, relative);
    let source = "";
    try {
      source = fsImpl.readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    visited.add(relative);
    for (const match of source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
      const resolved = resolveCommonJsDependency(absoluteRoot, absolute, match[1], fsImpl);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }
  return visited;
}

function resolveCommonJsDependency(root, fromFile, request, fsImpl = fs) {
  if (typeof request !== "string" || !request.startsWith(".")) return "";
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.cjs`,
    `${base}.mjs`,
    `${base}.json`,
    path.join(base, "index.js"),
    path.join(base, "index.json"),
  ];
  for (const candidate of candidates) {
    try {
      if (!fsImpl.statSync(candidate).isFile()) continue;
      return normalizeRelativePath(root, candidate);
    } catch {}
  }
  return "";
}

function collectRendererAssets(root, entryFile = "index.html", fsImpl = fs) {
  const absoluteRoot = path.resolve(root);
  const entry = path.resolve(absoluteRoot, entryFile);
  let html = "";
  try {
    html = fsImpl.readFileSync(entry, "utf8");
  } catch {
    return new Set();
  }
  const assets = new Set(["index.html", "desktop/preload.js"]);
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) {
    const raw = String(match[1] || "").split(/[?#]/, 1)[0].trim();
    if (!raw || /^(?:[a-z]+:|\/\/|data:)/i.test(raw)) continue;
    const assetPath = raw.replace(/^\/+/, "");
    const resolved = path.resolve(absoluteRoot, assetPath);
    const relative = normalizeRelativePath(absoluteRoot, resolved);
    if (!relative || shouldIgnoreFile(relative)) continue;
    try {
      if (fsImpl.statSync(resolved).isFile()) assets.add(relative);
    } catch {}
  }
  return assets;
}

function createDevelopmentReloadPlan(root, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const absoluteRoot = path.resolve(root);
  const renderer = collectRendererAssets(absoluteRoot, "index.html", fsImpl);
  const server = collectCommonJsDependencies(absoluteRoot, ["server.js"], fsImpl);
  const main = collectCommonJsDependencies(absoluteRoot, ["desktop/main.js"], fsImpl);
  return Object.freeze({
    root: absoluteRoot,
    renderer,
    server,
    main,
  });
}

function classifyDevelopmentChange(relativePath, plan) {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  if (shouldIgnoreFile(normalized)) return { kind: "ignore", relativePath: normalized };
  const extension = path.extname(normalized).toLowerCase();
  if (normalized === "package.json" || normalized === "package-lock.json") {
    return { kind: "main", relativePath: normalized };
  }
  if (normalized === ".env" || path.basename(normalized).startsWith(".env.")) {
    return { kind: "server", relativePath: normalized };
  }

  const renderer = plan?.renderer?.has(normalized) || false;
  const server = plan?.server?.has(normalized) || false;
  const main = plan?.main?.has(normalized) || false;
  if (main) return { kind: "main", relativePath: normalized };
  if (server && renderer) return { kind: "both", relativePath: normalized };
  if (server) return { kind: "server", relativePath: normalized };
  if (extension === ".css") return { kind: "css", relativePath: normalized };
  if (renderer || extension === ".html") return { kind: "renderer", relativePath: normalized };
  if (SERVER_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    || /^server(?:-|\.|$)/i.test(path.basename(normalized))
    || /-http-api\.js$/i.test(normalized)
    || /-service\.js$/i.test(normalized)) {
    return { kind: "server", relativePath: normalized };
  }
  if (CODE_EXTENSIONS.has(extension)) return { kind: "renderer", relativePath: normalized };
  return { kind: "ignore", relativePath: normalized };
}

function buildCaptureStateScript() {
  return `(() => {
    try {
      const canvas = typeof canvasState !== "undefined" ? canvasState : null;
      const boardInfo = typeof getActiveCanvasBoardInfo === "function" ? getActiveCanvasBoardInfo() : null;
      const board = boardInfo?.id && Array.isArray(canvas?.boards)
        ? canvas.boards.find((item) => String(item.id || "") === String(boardInfo.id))
        : null;
      const focusedContent = document.querySelector(".ai-os-app-window.is-focused [data-window-content]");
      const activeApp = focusedContent
        ? Object.entries({
            canvas: "#canvasView",
            image: "#imageView",
            chat: "#chatView",
            records: "#recordsView",
            shared: "#aiOsSharedWindow",
            accounts: "#aiOsAccountsWindow",
            settings: "#aiOsSystemWindow",
          }).find(([, selector]) => focusedContent.querySelector(selector))?.[0] || ""
        : "";
      const selectedIds = canvas?.selectedIds instanceof Set ? Array.from(canvas.selectedIds) : [];
      const snapshot = {
        version: 1,
        capturedAt: Date.now(),
        activeApp,
        immersive: Boolean(document.documentElement.dataset.aiImmersiveApp),
        agentOpen: Boolean(document.querySelector(".canvas-workspace")?.classList.contains("canvas-agent-open")),
        canvas: boardInfo?.id ? {
          boardId: String(boardInfo.id),
          resourceId: String(board?.resourceId || ""),
          screen: String(document.querySelector("#canvasView")?.dataset?.canvasScreen || canvas?.appScreen || "editor"),
          viewport: {
            x: Number(canvas?.x || 0),
            y: Number(canvas?.y || 0),
            scale: Number(canvas?.scale || 1),
          },
          selectedIds: selectedIds.map(String),
          activeNodeId: String(canvas?.activeNode?.dataset?.id || ""),
        } : null,
      };
      const serialized = JSON.stringify(snapshot);
      sessionStorage.setItem(${JSON.stringify(DEV_STATE_KEY)}, serialized);
      localStorage.setItem(${JSON.stringify(DEV_STATE_KEY)}, serialized);
      sessionStorage.setItem(${JSON.stringify(DEV_REFRESH_KEY)}, String(Date.now()));
      localStorage.setItem(${JSON.stringify(DEV_REFRESH_KEY)}, String(Date.now()));
      return snapshot;
    } catch (error) {
      return { error: String(error?.message || error) };
    }
  })()`;
}

function buildRestoreStateScript() {
  return `(() => {
    const key = ${JSON.stringify(DEV_STATE_KEY)};
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    return (async () => {
      let snapshot = null;
      let stored = "";
      try {
        stored = sessionStorage.getItem(key) || localStorage.getItem(key) || "";
        snapshot = JSON.parse(stored || "null");
      } catch {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
        return { restored: false, reason: "invalid_state" };
      }

      for (let attempt = 0; attempt < 600; attempt += 1) {
        if (window.AiOsDesktop?.isReady?.()) break;
        await sleep(50);
      }
      if (!window.AiOsDesktop?.isReady?.()) return { restored: false, reason: "desktop_not_ready" };

      if (!snapshot?.canvas && !snapshot?.activeApp) {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
        return { restored: false, reason: "empty_state" };
      }
      if (!Number.isFinite(Number(snapshot.capturedAt)) || Date.now() - Number(snapshot.capturedAt) > 60_000) {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
        return { restored: false, reason: "stale_state" };
      }

      const canvasStateRef = typeof canvasState !== "undefined" ? canvasState : null;
      const target = snapshot.canvas;
      if (target && String(target.screen || "editor") === "editor") {
        if (target.resourceId) {
          window.AiOsDesktop.openApp("canvas", { resourceId: target.resourceId, screen: "editor" });
        } else {
          for (let attempt = 0; attempt < 120; attempt += 1) {
            const board = canvasStateRef?.boards?.find((item) => String(item.id || "") === String(target.boardId));
            if (board && typeof openCanvasBoardFromHistory === "function") {
              await openCanvasBoardFromHistory(board);
              break;
            }
            await sleep(50);
          }
        }
        for (let attempt = 0; attempt < 160; attempt += 1) {
          if (String(canvasStateRef?.activeBoardId || "") === String(target.boardId)) break;
          await sleep(50);
        }
        for (let attempt = 0; attempt < 160; attempt += 1) {
          if (!canvasStateRef?.boardOpening && !canvasStateRef?.isRestoring) break;
          await sleep(50);
        }
      } else if (snapshot.activeApp) {
        window.AiOsDesktop.openApp(
          snapshot.activeApp,
          snapshot.activeApp === "canvas" ? { screen: target?.screen || "library" } : undefined,
        );
      }

      await sleep(120);
      if (target?.viewport && canvasStateRef && typeof scheduleCanvasTransform === "function") {
        canvasStateRef.x = Number(target.viewport.x || 0);
        canvasStateRef.y = Number(target.viewport.y || 0);
        canvasStateRef.scale = Math.max(0.02, Math.min(8, Number(target.viewport.scale || 1)));
        scheduleCanvasTransform();
      }
      const requestedSelection = Array.from(new Set([
        String(target?.activeNodeId || ""),
        ...(Array.isArray(target?.selectedIds) ? target.selectedIds.map(String) : []),
      ].filter(Boolean)));
      if (requestedSelection.length && typeof selectCanvasNode === "function") {
        const waitForNode = async (id) => {
          for (let attempt = 0; attempt < 160; attempt += 1) {
            let node = document.querySelector('[data-id="' + CSS.escape(id) + '"]');
            if (!node && typeof ensureCanvasNodeMounted === "function") {
              node = ensureCanvasNodeMounted(id);
            }
            if (node) return node;
            await sleep(50);
          }
          return null;
        };
        let selected = false;
        for (const id of requestedSelection) {
          const node = await waitForNode(id);
          if (!node) continue;
          if (!selected) {
            selectCanvasNode(node);
            selected = true;
          } else if (typeof toggleCanvasNodeSelection === "function" && !canvasStateRef?.selectedIds?.has(id)) {
            toggleCanvasNodeSelection(node);
          }
        }
      }
      if (snapshot.immersive) window.AiOsDesktop.setAppImmersive("canvas", true);
      if (snapshot.agentOpen && !document.querySelector(".canvas-workspace")?.classList.contains("canvas-agent-open")) {
        document.querySelector("#canvasAgentToggle")?.click();
      }
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      return { restored: true, boardId: target?.boardId || "" };
    })();
  })()`;
}

function buildStylesheetReloadScript(relativePath) {
  return `(() => {
    const relative = ${JSON.stringify(String(relativePath || "").replace(/\\/g, "/"))};
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'));
    const link = links.find((item) => {
      try {
        const pathname = new URL(item.href, location.href).pathname.replace(/\\\\/g, "/");
        return pathname.endsWith("/" + relative) || pathname.endsWith(relative);
      } catch {
        return false;
      }
    });
    if (!link) return { applied: false, relative };
    const next = new URL(link.href, location.href);
    next.searchParams.set("ai_os_dev_hot", String(Date.now()));
    link.href = next.href;
    return { applied: true, relative };
  })()`;
}

function createDevReloadController(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const getWindow = typeof options.getWindow === "function" ? options.getWindow : () => null;
  const onRestartServer = typeof options.onRestartServer === "function" ? options.onRestartServer : async () => {};
  const onRelaunchApp = typeof options.onRelaunchApp === "function" ? options.onRelaunchApp : async () => {};
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  const fsImpl = options.fsImpl || fs;
  const watchFactory = options.watchFactory || fsImpl.watch;
  let watcher = null;
  let stopped = false;
  let queue = Promise.resolve();
  const pending = new Set();

  function handleChange(file) {
    if (stopped || !file) return;
    const relativePath = normalizeRelativePath(root, file);
    if (!relativePath || shouldIgnoreFile(relativePath)) return;
    pending.add(relativePath);
    const changed = Array.from(pending).slice(0, 3).join("、");
    onStatus(`检测到 ${pending.size} 项开发改动：${changed}；不会自动刷新，完成后按 Ctrl+R 或使用托盘“刷新开发更改”`);
  }

  function flush(reason = "手动刷新") {
    if (!pending.size) return queue;
    const plan = createDevelopmentReloadPlan(root, { fsImpl });
    const changes = Array.from(pending, (relativePath) => classifyDevelopmentChange(relativePath, plan))
      .filter((item) => item.kind !== "ignore");
    pending.clear();
    if (!changes.length) return queue;
    queue = queue.then(() => dispatchChanges(changes, reason)).catch((error) => {
      onStatus(`热刷新失败：${error.message}`);
    });
    return queue;
  }

  function requestRefresh(reason = "手动刷新") {
    if (stopped) return Promise.resolve(false);
    if (!pending.size) {
      onStatus(`正在刷新最新界面：${reason}`);
      queue = queue.then(() => reloadRenderer(reason)).catch((error) => {
        onStatus(`开发刷新失败：${error.message}`);
      });
      return queue;
    }
    return flush(reason);
  }

  async function dispatchChanges(changes, reason) {
    if (changes.some((item) => item.kind === "main")) {
      const change = changes.find((item) => item.kind === "main");
      onStatus(`正在应用主进程改动并重启：${change.relativePath}`);
      await captureRendererState();
      await onRelaunchApp(change.relativePath);
      return;
    }
    const serverChange = changes.find((item) => item.kind === "server" || item.kind === "both");
    if (serverChange) {
      onStatus(`正在重启本地服务：${serverChange.relativePath}`);
      await onRestartServer(serverChange.relativePath);
      await reloadRenderer(`服务已重启：${serverChange.relativePath}`);
      return;
    }
    await reloadRenderer(`${reason}：${changes[0]?.relativePath || ""}`);
  }

  async function captureRendererState() {
    const window = getWindow();
    const webContents = window && !window.isDestroyed?.() ? window.webContents : null;
    if (!webContents || webContents.isDestroyed?.()) return false;
    try {
      await webContents.executeJavaScript(buildCaptureStateScript(), true);
      return true;
    } catch (error) {
      onStatus(`重启前状态保存失败，将继续重启：${error.message}`);
      return false;
    }
  }

  async function restorePendingState() {
    const window = getWindow();
    const webContents = window && !window.isDestroyed?.() ? window.webContents : null;
    if (!webContents || webContents.isDestroyed?.()) return { restored: false, reason: "window_unavailable" };
    try {
      const result = await webContents.executeJavaScript(buildRestoreStateScript(), true);
      if (result?.restored) onStatus("自动重启后已恢复画布与视图");
      return result || { restored: false, reason: "empty_result" };
    } catch (error) {
      onStatus(`自动恢复画布失败：${error.message}`);
      return { restored: false, reason: "restore_failed", error: error.message };
    } finally {
      await completeDevelopmentRefresh(webContents);
    }
  }

  async function completeDevelopmentRefresh(webContents) {
    if (!webContents || webContents.isDestroyed?.()) return false;
    try {
      await webContents.executeJavaScript(
        `window.AiOsDevRefreshGate?.complete?.(); true`,
        true,
      );
      return true;
    } catch {
      return false;
    }
  }

  async function reloadRenderer(reason) {
    const window = getWindow();
    if (!window || window.isDestroyed?.()) return false;
    const webContents = window.webContents;
    if (!webContents || webContents.isDestroyed?.()) return false;
    onStatus(`正在刷新渲染页面并恢复画布：${reason}`);
    await captureRendererState();
    await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        onStatus("页面刷新等待超时，请手动刷新一次。");
        void completeDevelopmentRefresh(webContents);
        finish();
      }, 60_000);
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        webContents.removeListener?.("did-finish-load", onFinishLoad);
        webContents.removeListener?.("did-fail-load", onFailLoad);
        resolve();
      };
      const onFinishLoad = async () => {
        try {
          const restored = await webContents.executeJavaScript(buildRestoreStateScript(), true);
          if (restored?.restored) onStatus("渲染页面已刷新，画布与视图已恢复");
          else onStatus(`页面已刷新，状态未恢复：${restored?.reason || "unknown"}`);
        } catch (error) {
          onStatus(`页面已刷新，但状态恢复失败：${error.message}`);
        } finally {
          await completeDevelopmentRefresh(webContents);
          finish();
        }
      };
      const onFailLoad = (_event, code, description) => {
        onStatus(`页面刷新失败：${description || code || "unknown"}`);
        finish();
      };
      webContents.once("did-finish-load", onFinishLoad);
      webContents.once("did-fail-load", onFailLoad);
      try {
        webContents.reload();
      } catch (error) {
        onStatus(`页面刷新失败：${error.message}`);
        finish();
      }
    });
    return true;
  }

  function start() {
    if (watcher || stopped) return false;
    try {
      watcher = watchFactory(root, { recursive: true, persistent: true, encoding: "utf8" }, (_event, file) => handleChange(file));
      watcher.on?.("error", (error) => onStatus(`文件监听失败：${error.message}`));
      onStatus("开发刷新已启用：文件变化只标记待刷新，完成后按 Ctrl+R、F5 或使用托盘“刷新开发更改”");
      return true;
    } catch (error) {
      onStatus(`开发热刷新启动失败：${error.message}`);
      return false;
    }
  }

  function stop() {
    stopped = true;
    pending.clear();
    try { watcher?.close?.(); } catch {}
    watcher = null;
  }

  return {
    start,
    stop,
    flush,
    handleChange,
    requestRefresh,
    reloadRenderer,
    restorePendingState,
    classify: (file) => classifyDevelopmentChange(
      normalizeRelativePath(root, file),
      createDevelopmentReloadPlan(root, { fsImpl }),
    ),
  };
}

module.exports = {
  DEV_STATE_KEY,
  DEV_REFRESH_KEY,
  classifyDevelopmentChange,
  collectCommonJsDependencies,
  collectRendererAssets,
  createDevReloadController,
  createDevelopmentReloadPlan,
  isDevelopmentReloadEnabled,
  normalizeRelativePath,
  shouldIgnoreFile,
};
