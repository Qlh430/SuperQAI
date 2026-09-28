"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const main = read("desktop/main.js");
const startupHtml = read("desktop/startup.html");
const index = read("index.html");
const overlay = read("startup-overlay.js");
const devReload = read("desktop/dev-reload.js");
const desktopShell = read("desktop-shell.js");
const script = read("script.js");
const moduleLoader = read("module-loader.js");
const moduleKernel = read("core/module-kernel.js");
const moduleManifest = read("module-manifest.js");

assert.match(main, /async function createStartupWindow\(/, "desktop entry must own a native startup window");
assert.match(main, /await createStartupWindow\(\);[\s\S]*await preparePortableData/, "the startup window must appear before migration and service startup");
assert.match(main, /const setupResult = await preparePortableData/);
assert.match(main, /setupResult\.action !== "fresh" && setupResult\.action !== "migrated"/);
assert.doesNotMatch(main, /if \(!await preparePortableData/);
assert.match(main, /mainWindow\.once\("ready-to-show", \(\) => \{[\s\S]*closeStartupWindow\(\)/, "the native startup window must close only when the main window can paint");
assert.match(main, /setStartupStatus\("正在启动本地服务"/, "the startup window must report the service phase");
assert.match(startupHtml, /id="status"/, "the native startup window needs a status label");
assert.match(startupHtml, /id="progress"/, "the native startup window needs a progress indicator");

assert.match(index, /id="aiOsStartupGate"/, "the workbench must render a startup gate before the app shell");
assert.ok(index.indexOf('id="aiOsStartupGate"') < index.indexOf('id="aiOsAuthGate"'), "the startup gate must precede authentication and desktop markup");
assert.match(index, /startup-overlay\.js[\s\S]*core\/module-kernel\.js/, "startup overlay listeners must exist before component loading starts");
assert.match(overlay, /ai-os-module-load-progress/, "the startup overlay must consume component progress");
assert.match(overlay, /ai-os-critical-load-complete/, "the startup overlay must wait for the critical component phase");
assert.match(overlay, /ai-os-module-load-complete/, "the startup overlay must close after component loading");
assert.match(overlay, /12_000/, "the startup overlay must expose a bounded slow-start fallback");
assert.match(
  overlay,
  /criticalReady\s*&&\s*workbenchReady[\s\S]{0,220}finish\("ready"\)/,
  "the startup gate must wait for critical components and the legacy workbench",
);
assert.match(index, /aiOsDevRefresh/, "the document must mark an automatic development refresh before first paint");
assert.match(overlay, /AiOsDevRefreshGate/, "development refreshes need an explicit readiness release gate");
assert.match(
  overlay,
  /reason === "ready" && isDevelopmentRefresh && !developmentRefreshReleased[\s\S]{0,220}return/,
  "development refreshes must stay covered until the host confirms restoration",
);
assert.doesNotMatch(
  overlay,
  /if \(isDevelopmentRefresh\)\s*\{\s*finished\s*=\s*true;[\s\S]{0,160}gate\.hidden = true;/,
  "development refreshes must not reveal an unfinished workbench",
);
assert.match(devReload, /DEV_REFRESH_KEY[\s\S]*sessionStorage\.setItem/, "development reloads must mark the next renderer load as an automatic refresh");
assert.match(devReload, /webContents\.reload\(\)/, "development refreshes should use the normal cache-aware reload path");
assert.match(devReload, /requestRefresh/, "development refreshes must require an explicit request");
assert.match(devReload, /AiOsDevRefreshGate/, "the host must release the renderer readiness gate after restoration");
assert.doesNotMatch(devReload, /reloadIgnoringCache/, "development refreshes must not discard every cached asset");
assert.match(moduleLoader, /ai-os-module-load-complete/, "the module loader must publish completion");
assert.match(moduleLoader, /completed,[\s\S]*total/, "the module loader must publish progress counts");
assert.match(moduleLoader, /ensureImplementation\s*=\s*async/, "the module loader must support on-demand component readiness");
assert.match(moduleKernel, /priority/, "the module kernel must preserve component scheduling priority");
assert.match(moduleKernel, /startupCritical/, "the module kernel must preserve startup critical metadata");
assert.match(moduleLoader, /left\.priority - right\.priority/, "critical components must be scheduled first");
assert.match(
  moduleLoader,
  /deferOptionalDependencies[\s\S]*function dependenciesSettled/s,
  "only explicitly deferred optional dependencies may run after their consumer",
);
assert.match(
  moduleManifest,
  /id: "canvas-runtime"[\s\S]*priority: 95/,
  "the canvas runtime must rank ahead of default optional components",
);
assert.match(
  moduleManifest,
  /id: "canvas-runtime"[\s\S]*deferOptionalDependencies: true/,
  "the canvas runtime alone may defer its optional node modules",
);
assert.match(
  moduleManifest,
  /id: "os-shell"[\s\S]{0,900}deferOptionalDependencies: true/,
  "the desktop shell must not wait for deferred settings components",
);
assert.match(
  moduleManifest,
  /id: "canvas-runtime"[\s\S]{0,260}startupCritical: true/,
  "the canvas runtime must be part of the critical startup path",
);
assert.match(index, /shoe-sneaker-thumb\.webp/, "the shoe example must use a lightweight startup thumbnail");
assert.match(index, /shoe-heel-thumb\.webp/, "the shoe example must use a lightweight startup thumbnail");
assert.doesNotMatch(
  index,
  /<img src="\.\/assets\/examples\/shoe-(?:sneaker|heel)\.png"/,
  "the full example images must not be downloaded during startup",
);

assert.match(script, /scheduleModelCatalogHydration\(\)/, "model catalogs must be scheduled after first paint");
assert.match(script, /scheduleCanvasBoardsHydration\(\)/, "canvas board metadata must be hydrated after first paint");
assert.match(script, /ai-os-session[\s\S]{0,220}scheduleCanvasBoardsHydration\(\)/, "authenticated sessions must start canvas prefetch before the first app click");
assert.match(script, /reload: !canvasState\.boardsLoadedAt/, "opening a cached canvas library must not repeat the board request");
assert.doesNotMatch(
  script,
  /initializeCanvasBoard\(\);\s*loadChatModels\(\);\s*loadVisionModels\(\)/,
  "model catalogs must no longer block the synchronous canvas startup path",
);
assert.match(script, /requestIdleCallback\(hydrate, \{ timeout: 900 \}\)/, "model hydration should use idle time with a bounded fallback");
assert.match(
  desktopShell,
  /function bridgeIsReady\(\)[\s\S]{0,220}window\.AiOsLegacyWorkbench[\s\S]{0,120}getLegacyView\("canvas"\)/,
  "the desktop shell must recover when the legacy bridge or canvas view loads before the readiness event",
);
assert.match(
  desktopShell,
  /if \(!bridgeIsReady\(\) && !getLegacyView\(appId\)\) \{[\s\S]{0,180}state\.pendingAppOpen = \{ appId, params:/,
  "an app click during renderer startup must be retained unless its DOM view is already available",
);
assert.match(
  desktopShell,
  /schedulePendingAppOpen\(\)[\s\S]{0,520}正在准备，完成后会自动打开[\s\S]{0,120}schedulePendingAppOpen\(\)/,
  "a retained app click must keep waiting and auto-open when its runtime becomes ready",
);
assert.doesNotMatch(
  desktopShell,
  /界面仍在加载，请按 Ctrl\+R 刷新后重试/,
  "a pending app open must not be discarded with a manual refresh instruction",
);
assert.match(
  desktopShell,
  /ai-os-legacy-workbench-ready[\s\S]{0,240}flushPendingAppOpen\(\)/,
  "the retained app open must run as soon as the workbench is ready",
);

console.log("AI OS startup loading checks passed.");
