"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  classifyDevelopmentChange,
  createDevReloadController,
  createDevelopmentReloadPlan,
  isDevelopmentReloadEnabled,
} = require("../desktop/dev-reload");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-dev-reload-"));
const write = (relative, content) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
};

function createFakeWindow() {
  const listeners = new Map();
  const executed = [];
  let reloads = 0;
  const webContents = {
    isDestroyed: () => false,
    executeJavaScript: async (source) => {
      executed.push(source);
      if (source.includes("ai_os_dev_hot")) return { applied: true };
      return { restored: true };
    },
    once: (event, listener) => {
      const list = listeners.get(event) || [];
      list.push(listener);
      listeners.set(event, list);
    },
    reload: () => {
      reloads += 1;
      queueMicrotask(() => {
        for (const listener of listeners.get("did-finish-load") || []) listener();
      });
    },
  };
  return {
    window: { isDestroyed: () => false, webContents },
    executed,
    get reloads() { return reloads; },
    emit(event) {
      for (const listener of listeners.get(event) || []) listener();
    },
  };
}

(async () => {
try {
  write("index.html", [
    '<link rel="stylesheet" href="./styles.css">',
    '<script src="./desktop-app-runtime.js"></script>',
    '<script src="./canvas-agent-runtime.js"></script>',
    '<script src="./script.js"></script>',
  ].join("\n"));
  write("styles.css", "body{}");
  write("desktop-app-runtime.js", "window.runtime = true;");
  write("canvas-agent-runtime.js", "module.exports = {};");
  write("script.js", "window.scriptLoaded = true;");
  write("server.js", 'require("./server-components/composition"); require("./canvas-agent-runtime");');
  write("server-components/composition.js", 'require("../provider-store");');
  write("provider-store.js", "module.exports = {};");
  write("desktop/main.js", 'require("./runtime-paths"); require("./dev-reload");');
  write("desktop/runtime-paths.js", "module.exports = {};");
  write("desktop/dev-reload.js", "module.exports = {};");
  write("desktop/preload.js", "window.preload = true;");
  write("package.json", "{}");
  write("README.md", "docs");
  write(".env", "PORT=3199");

  const plan = createDevelopmentReloadPlan(root);
  assert.equal(classifyDevelopmentChange("styles.css", plan).kind, "css");
  assert.equal(classifyDevelopmentChange("script.js", plan).kind, "renderer");
  assert.equal(classifyDevelopmentChange("canvas-agent-runtime.js", plan).kind, "both");
  assert.equal(classifyDevelopmentChange("server-components/composition.js", plan).kind, "server");
  assert.equal(classifyDevelopmentChange("provider-store.js", plan).kind, "server");
  assert.equal(classifyDevelopmentChange("desktop/runtime-paths.js", plan).kind, "main");
  assert.equal(classifyDevelopmentChange("desktop/preload.js", plan).kind, "renderer");
  assert.equal(classifyDevelopmentChange("package.json", plan).kind, "main");
  assert.equal(classifyDevelopmentChange(".env", plan).kind, "server");
  assert.equal(classifyDevelopmentChange("README.md", plan).kind, "ignore");

  assert.equal(isDevelopmentReloadEnabled({ isPackaged: false }), true);
  assert.equal(isDevelopmentReloadEnabled({ isPackaged: true }), false);
  assert.equal(isDevelopmentReloadEnabled({ isPackaged: true, argv: ["--dev-reload"] }), true);
  assert.equal(isDevelopmentReloadEnabled({ isPackaged: true, env: { AI_OS_DEV_RELOAD: "1" } }), true);
  assert.equal(isDevelopmentReloadEnabled({ isPackaged: false, argv: ["--no-dev-reload"] }), false);
  assert.equal(isDevelopmentReloadEnabled({ isPackaged: false, env: { AI_OS_DEV_RELOAD: "0" } }), false);
  assert.equal(isDevelopmentReloadEnabled({ isPackaged: false, argv: ["--dev-reload", "--no-dev-reload"] }), false);

  const cssWindow = createFakeWindow();
  const cssStatuses = [];
  const cssController = createDevReloadController({
    root,
    getWindow: () => cssWindow.window,
    onStatus: (message) => cssStatuses.push(message),
  });
  cssController.handleChange("styles.css");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cssWindow.reloads, 0, "CSS changes must wait for an explicit development refresh");
  assert.ok(!cssWindow.executed.some((source) => source.includes("ai_os_dev_hot")), "CSS must not hot-swap during editing");
  assert.match(cssStatuses.at(-1) || "", /不会自动刷新/, "a pending change must tell the operator that refresh is manual");
  await cssController.requestRefresh("test");
  assert.equal(cssWindow.reloads, 1, "an explicit refresh must apply CSS changes once");
  assert.ok(cssWindow.executed.some((source) => source.includes("AiOsDevRefreshGate")), "a refresh must release the readiness gate after loading");
  cssController.stop();

  const mixedWindow = createFakeWindow();
  const mixedController = createDevReloadController({
    root,
    getWindow: () => mixedWindow.window,
    onStatus: () => {},
  });
  mixedController.handleChange("styles.css");
  mixedController.handleChange("script.js");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mixedWindow.reloads, 0, "mixed changes must not refresh automatically");
  await mixedController.requestRefresh("test");
  assert.equal(mixedWindow.reloads, 1, "Mixed CSS and renderer changes should refresh the renderer once on demand");
  mixedController.stop();

  const rendererWindow = createFakeWindow();
  const rendererController = createDevReloadController({
    root,
    getWindow: () => rendererWindow.window,
    onStatus: () => {},
  });
  rendererController.handleChange("script.js");
  await rendererController.requestRefresh("test");
  assert.equal(rendererWindow.reloads, 1, "Renderer changes should reload the renderer once");
  assert.ok(rendererWindow.executed.some((source) => source.includes("__ai_os_dev_reload_state_v1")));
  assert.ok(rendererWindow.executed.some((source) => source.includes("localStorage.setItem")), "renderer reloads must persist canvas state across main-process restarts");
  assert.ok(rendererWindow.executed.some((source) => source.includes("desktop_not_ready")));
  assert.ok(rendererWindow.executed.some((source) => source.includes("AiOsDevRefreshGate")), "renderer reloads must wait for and then release the readiness gate");
  rendererController.stop();

  const serverWindow = createFakeWindow();
  let serverRestarts = 0;
  const serverController = createDevReloadController({
    root,
    getWindow: () => serverWindow.window,
    onRestartServer: async () => { serverRestarts += 1; },
    onStatus: () => {},
  });
  serverController.handleChange("server-components/composition.js");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(serverRestarts, 0, "backend changes must wait for an explicit development refresh");
  assert.equal(serverWindow.reloads, 0, "backend changes must not refresh automatically");
  await serverController.requestRefresh("test");
  assert.equal(serverRestarts, 1, "Backend changes should restart the child server");
  assert.equal(serverWindow.reloads, 1, "Backend restarts should refresh the renderer afterward");
  serverController.stop();

  const mainWindow = createFakeWindow();
  let mainRelaunches = 0;
  let capturedBeforeRelaunch = false;
  const mainController = createDevReloadController({
    root,
    getWindow: () => mainWindow.window,
    onRelaunchApp: async () => {
      mainRelaunches += 1;
      capturedBeforeRelaunch = mainWindow.executed.some((source) => source.includes("__ai_os_dev_reload_state_v1"));
    },
    onStatus: () => {},
  });
  mainController.handleChange("desktop/runtime-paths.js");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mainRelaunches, 0, "main-process changes must wait for an explicit development refresh");
  await mainController.requestRefresh("test");
  assert.equal(mainRelaunches, 1, "Main-process changes should relaunch the desktop app");
  assert.equal(capturedBeforeRelaunch, true, "main-process restarts must capture canvas state before relaunching");
  mainController.stop();

  const manualWindow = createFakeWindow();
  const manualController = createDevReloadController({
    root,
    getWindow: () => manualWindow.window,
    onStatus: () => {},
  });
  await manualController.requestRefresh("test");
  assert.equal(manualWindow.reloads, 1, "an explicit refresh must reload even when the watcher missed a file change");
  manualController.stop();

  console.log("Desktop manual development reload checks passed.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
