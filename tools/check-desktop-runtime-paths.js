"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const runtimeFile = path.resolve(__dirname, "../desktop/runtime-paths.js");
assert.ok(fs.existsSync(runtimeFile), "desktop must resolve portable data separately from its runtime");
const { resolveDesktopPaths, getServerEnvironment } = require(runtimeFile);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-runtime-paths-"));
try {
  const portableRoot = path.join(temporary, "AI OS 中文");
  const appRoot = path.join(portableRoot, ".ai-runtime/versions/v1/resources/app");
  fs.mkdirSync(appRoot, { recursive: true });
  fs.writeFileSync(path.join(portableRoot, "ai-os-portable.json"), JSON.stringify({ product: "AI OS", portable: true, dataDirectory: "data" }));
  const paths = resolveDesktopPaths({ appRoot, resourcesPath: path.dirname(appRoot), isPackaged: true, userDataPath: path.join(temporary, "appdata"), env: {} });
  assert.equal(paths.portableRoot, portableRoot);
  assert.equal(paths.dataDir, path.join(portableRoot, "data"));
  assert.equal(paths.outputDir, path.join(portableRoot, "data/output"));
  assert.equal(paths.userDataDir, path.join(portableRoot, "data/.desktop"));
  assert.equal(paths.nodeExecutable, path.join(path.dirname(appRoot), "runtime/node.exe"));
  const env = getServerEnvironment(paths, { CANVAS_DB_FILE: "X:/old/canvas.db", SETTINGS_FILE: "X:/old/settings.json", AI_API_KEY: "synthetic-key" });
  assert.equal(env.CANVAS_DB_FILE, path.join(paths.dataDir, "canvas.db"));
  assert.equal(env.SETTINGS_FILE, path.join(paths.dataDir, "settings.json"));
  assert.equal(env.AI_OS_ENV_FILE, path.join(paths.dataDir, ".env"));
  assert.equal(env.AI_API_KEY, "synthetic-key");
  const dev = resolveDesktopPaths({ appRoot: temporary, isPackaged: false, userDataPath: "profile", exePath: "electron.exe", env: { AI_OS_DATA_DIR: path.join(temporary, "dev-data") } });
  assert.equal(dev.portableRoot, "");
  assert.equal(dev.dataDir, path.join(temporary, "dev-data"));
  assert.equal(dev.outputDir, path.join(temporary, "output"));
  assert.equal(getServerEnvironment(dev, { CANVAS_DB_FILE: "custom.db" }).CANVAS_DB_FILE, "custom.db");
  fs.writeFileSync(path.join(portableRoot, "ai-os-portable.json"), JSON.stringify({ product: "AI OS", portable: true, dataDirectory: "../elsewhere" }));
  assert.throws(() => resolveDesktopPaths({ appRoot, resourcesPath: path.dirname(appRoot), isPackaged: true, userDataPath: "profile", env: {} }), /data/);
  console.log("PASS portable paths survive relocation, protect local data boundaries, and preserve development overrides");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
