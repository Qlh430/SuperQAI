"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const { collectPortablePackageManifest } = require("./portable-package-manifest");

const main = read("desktop/main.js");
assert.match(main, /requestSingleInstanceLock/);
assert.match(main, /spawn\(/);
assert.match(main, /server\.js/);
assert.match(main, /waitForServiceReady/);
assert.match(main, /recoverServiceWindow/);
assert.match(main, /scheduleStartupRecovery/);
assert.match(main, /host\.retryService/);
assert.match(main, /const developmentReload = app\.isPackaged \? null : require\("\.\/dev-reload"\)/);
assert.match(main, /developmentReload\.createDevReloadController/);
assert.match(main, /restartServerForDevelopment/);
assert.match(main, /startDevelopmentReload\(\)/);
assert.doesNotMatch(main, /^const\s+\{[^}]*createDevReloadController[^}]*\}\s*=\s*require\("\.\/dev-reload"\)/m);
assert.doesNotMatch(main, /onclick="location\.reload\(\)"/);
assert.match(main, /before-input-event/, "development refresh shortcuts must be controlled by the host");
assert.match(main, /requestDevelopmentRefresh/, "the host must expose a manual development refresh path");
assert.match(main, /host\.triggerDevReload/);
assert.match(main, /刷新开发更改/);
assert.match(main, /new Tray/);
assert.match(main, /mainWindow\.hide\(\)/);
assert.match(main, /await stopChild\(serverProcess, timeoutMs\)/);
// Quitting gets its own shorter budget than an update handover.
assert.match(main, /stopServer\(8_000\)/);
assert.match(main, /host\.getStatus/);
assert.match(main, /host\.openSystem/);
// A link that leaves the app - the 即梦 authorization page, a vendor document -
// is handed to the operator's own browser instead of opening a bare popup.
assert.match(main, /setWindowOpenHandler/);
assert.match(main, /shell\.openExternal/);
assert.match(main, /host\.openExternal/);
assert.match(main, /host\.getAutostart/);
assert.match(main, /host\.setAutostart/);
assert.match(main, /host\.getDevReloadStatus/);
assert.match(main, /host\.quit/);

const preload = read("desktop/preload.js");
assert.match(preload, /contextBridge\.exposeInMainWorld/);
assert.match(preload, /aiOsHost/);
assert.match(preload, /host\.openExternal/);
assert.match(preload, /host\.retryService/);
assert.match(preload, /host\.getDevReloadStatus/);
assert.match(preload, /host\.devReloadStatus/);
assert.match(preload, /host\.triggerDevReload/);
assert.doesNotMatch(preload, /nodeIntegration\s*:\s*true/);

const autostart = read("desktop/autostart.js");
assert.match(autostart, /getLoginItemSettings/);
assert.match(autostart, /setLoginItemSettings/);
assert.match(autostart, /openAtLogin/);

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.scripts["desktop:start"], "electron desktop/main.js");
assert.equal(
  packageJson.scripts["desktop:check"],
  "node --check desktop/main.js && node --check desktop/component-state.js && node --check desktop/component-rollback.js && node --check desktop/runtime-retention.js && node --check desktop/rollback-retention.js && node --check startup-overlay.js && npm run check:desktop-reload && node tools/check-startup-loading.js && node tools/check-desktop-service-readiness.js && node tools/check-host-launcher.js && node --disable-warning=ExperimentalWarning tools/check-host-shutdown.js",
);
assert.equal(packageJson.scripts["check:desktop-reload"], "node --check desktop/dev-reload.js && node tools/check-desktop-dev-reload.js");
assert.ok(packageJson.devDependencies?.electron);

const icon = fs.readFileSync(path.join(root, "desktop", "icon.ico"));
assert.ok(icon.length > 1000);
assert.deepEqual([...icon.subarray(0, 4)], [0, 0, 1, 0]);

const portableManifest = collectPortablePackageManifest(root);
assert.ok(portableManifest.directories.includes("node_modules/electron/dist"));

console.log("Host launcher checks passed.");
