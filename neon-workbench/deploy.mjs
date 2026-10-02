import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
const source = dirname(fileURLToPath(import.meta.url))
const runtime = resolve(source, "../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app")
if (!existsSync(join(runtime, "desktop-shell.js"))) throw new Error("目标运行时不存在，已停止部署。")
const workbenchCss = readFileSync(join(source, "src/index.css"), "utf8")
const startupTokens = ["background", "foreground", "primary", "primary-foreground", "secondary", "muted-foreground", "radius"].map(name => {
  const value = workbenchCss.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
  if (!value) throw new Error(`启动页缺少官方令牌 ${name}，已停止部署。`)
  return `--${name}: ${value};`
}).join("\n")
const startupHtml = readFileSync(join(source, "design-sources/desktop-startup.html"), "utf8")
if (!startupHtml.includes("/* __NEON_STARTUP_TOKENS__ */")) throw new Error("桌面启动页缺少令牌插入点，已停止部署。")
// Electron's native window fill uses the sRGB equivalent of --background.
// Match the page before any HTML/CSS has painted, including the handover window.
const desktopMainPath = join(runtime, "desktop/main.js")
let desktopMain = readFileSync(desktopMainPath, "utf8")
if ((desktopMain.match(/backgroundColor: "(?:#eef3f8|#dbe8f4|#080a0e)"/g) || []).length !== 2) throw new Error("桌面窗口背景入口不匹配，已停止部署。")
desktopMain = desktopMain.replace(/backgroundColor: "(?:#eef3f8|#dbe8f4|#080a0e)"/g, 'backgroundColor: "#080a0e"')
execFileSync(process.execPath, [join(source, "node_modules/typescript/bin/tsc"), "-b"], { cwd: source, stdio: "inherit" })
execFileSync(process.execPath, [join(source, "node_modules/vite/bin/vite.js"), "build"], { cwd: source, stdio: "inherit" })
const backupDir = join(source, "..", ".design", "deploy-backups", new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"))
mkdirSync(backupDir, { recursive: true })
for (const file of ["desktop/main.js", "desktop/startup.html", "startup-overlay.css", "desktop-shell.js", "script.js", "neon-page-rebuild.css", "neon-auth.css", "neon-canvas-surface.css", "index.html", "neon-workbench.html", "neon-workbench.js", "neon-workbench.css", "neon-host-bridge.js"]) {
  const target = join(runtime, file)
  if (existsSync(target)) {
    mkdirSync(dirname(join(backupDir, file)), { recursive: true })
    copyFileSync(target, join(backupDir, file))
  }
}
writeFileSync(join(runtime, "desktop/startup.html"), startupHtml.replace("/* __NEON_STARTUP_TOKENS__ */", `:root {\n${startupTokens}\n}`), "utf8")
copyFileSync(join(source, "design-sources/startup-overlay.css"), join(runtime, "startup-overlay.css"))
writeFileSync(desktopMainPath, desktopMain, "utf8")
copyFileSync(join(source, "dist/workbench.js"), join(runtime, "neon-workbench.js"))
copyFileSync(join(source, "dist/neon-workbench.css"), join(runtime, "neon-workbench.css"))
copyFileSync(join(source, "host-bridge.js"), join(runtime, "neon-host-bridge.js"))
const sourceCss = join(source, "design-sources/neon-page-rebuild.css")
if (existsSync(sourceCss)) copyFileSync(sourceCss, join(runtime, "neon-page-rebuild.css"))
const authCss = join(source, "design-sources/neon-auth.css")
if (existsSync(authCss)) copyFileSync(authCss, join(runtime, "neon-auth.css"))
const canvasSurfaceCss = join(source, "design-sources/neon-canvas-surface.css")
if (existsSync(canvasSurfaceCss)) copyFileSync(canvasSurfaceCss, join(runtime, "neon-canvas-surface.css"))
const sourceScript = join(source, "design-sources/script-before-save-bridge.js")
if (existsSync(sourceScript)) {
  let canonicalScript = readFileSync(sourceScript, "utf8")
  if (!canonicalScript.includes("saveForNavigation: async function")) {
    canonicalScript = canonicalScript.replace("window.CanvasWorkspace = {", `window.CanvasWorkspace = {\n  saveForNavigation: async function () {\n    if (canvasState.isRestoring || canvasState.boardOpening) throw new Error("画布正在恢复，请完成后重试。");\n    await saveCanvasBoardNow();\n    if (canvasPagedStore.getPendingOperations().length || canvasState.hasUnsavedChanges) {\n      throw new Error("画布尚未保存成功，请重试后再返回。");\n    }\n  },`)
  }
  writeFileSync(join(runtime, "script.js"), canonicalScript, "utf8")
}
const runtimeServerPath = join(runtime, "server.js")
if (existsSync(runtimeServerPath)) {
  let runtimeServer = readFileSync(runtimeServerPath, "utf8")
  if (runtimeServer.includes("NEON_CANVAS_ROUTE")) {
    copyFileSync(runtimeServerPath, join(backupDir, "server-diagnostic.js"))
    runtimeServer = runtimeServer.replace(/ console\.log\("NEON_CANVAS_ROUTE", req\.method, req\.url, requestPath, Boolean\(canvasStorageComponent\?\.handle\)\);/, "")
    writeFileSync(runtimeServerPath, runtimeServer, "utf8")
  }
}
const shellPath = join(runtime, "desktop-shell.js")
let shell = readFileSync(shellPath, "utf8")
if (!shell.includes("openInlineApp: showInlineApp")) {
  if (!existsSync(join(source, "design-sources/desktop-shell-before-bridge.js"))) writeFileSync(join(source, "design-sources/desktop-shell-before-bridge.js"), shell)
  shell = shell.replace("setSession: activateSession,", "openInlineApp: showInlineApp,\n    setSession: activateSession,")
  writeFileSync(shellPath, shell, "utf8")
}
const scriptPath = join(runtime, "script.js")
const canvasScript = readFileSync(scriptPath, "utf8")
if (!canvasScript.includes("saveForNavigation: async function")) throw new Error("画布脚本缺少导航保存桥接，已停止部署。")
const storagePath = join(runtime, "canvas-storage-http-api.js")
let storage = readFileSync(storagePath, "utf8")
const deletedResourceGuard = "if (resource.deletedAt) continue;"
if (!storage.includes(deletedResourceGuard)) {
  const needle = "            if (!board.projectId) {"
  if (!storage.includes(needle)) throw new Error("画布列表入口不匹配，已停止部署。")
  copyFileSync(storagePath, join(backupDir, "canvas-storage-http-api.js"))
  storage = storage.replace(needle, `            // Deleted resource tombstones must not invalidate the entire board list.\n            ${deletedResourceGuard}\n${needle}`)
  storage = storage.replace('["forbidden", "share_password_required"].includes(error?.code)', '["forbidden", "share_password_required", "resource_not_found"].includes(error?.code)')
  writeFileSync(storagePath, storage, "utf8")
}
writeFileSync(join(runtime, "neon-workbench.html"), `<!doctype html>
<html lang="zh-CN" class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI OS 工作台</title><link rel="stylesheet" href="./neon-workbench.css?v=20261002-neon-ui"></head><body><div id="root"></div><script src="./neon-workbench.js?v=20261002-neon-ui"></script></body></html>`, "utf8")
const indexPath = join(runtime, "index.html")
let html = readFileSync(indexPath, "utf8")
if (!existsSync(join(source, "design-sources/runtime-index-before-isolation.html"))) writeFileSync(join(source, "design-sources/runtime-index-before-isolation.html"), html)
html = html
  .replace(/(<link rel="stylesheet" href="\.\/startup-overlay\.css)[^"]*/g, "$1?v=20261002-neon-startup")
  .replace(/<link rel="stylesheet" href="\.\/neon-auth\.css[^"]*" \/>/g, "")
  .replace(/<link rel="stylesheet" href="\.\/neon-canvas-surface\.css[^"]*" \/>/g, "")
  .replace(/<link rel="stylesheet" href="\.\/neon-workbench\.css[^"]*" \/>/g, "")
  .replace(/<style>#aiOsNeonRoot[\s\S]*?<\/style>/g, "")
  .replace(/<div id="aiOsNeonRoot" hidden><\/div>/g, "")
  .replace(/<script src="\.\/(?:neon-workbench|neon-host-bridge)\.js[^"]*"><\/script>/g, "")
  .replace(/\\n(?=\s*<(?:style|\/head|div|\/body))/g, "\n")
  .replace(/(<div class="ai-os-desktop" id="aiOsDesktop" hidden>)\\n/g, "$1\n")
  .replace("</head>", '<link rel="stylesheet" href="./neon-canvas-surface.css?v=20261002-neon-canvas" />\n<link rel="stylesheet" href="./neon-auth.css?v=20261002-neon-auth" />\n</head>')
  .replace("</body>", '<script src="./neon-host-bridge.js?v=20261002-neon-ui"></script>\n</body>')
writeFileSync(indexPath, html, "utf8")
console.log("新工作台已部署为独立同源页面，宿主未加载新工作台的全局样式。")
