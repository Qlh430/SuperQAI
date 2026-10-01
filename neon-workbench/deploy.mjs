import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
const source = dirname(fileURLToPath(import.meta.url))
const runtime = resolve(source, "../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app")
if (!existsSync(join(runtime, "desktop-shell.js"))) throw new Error("目标运行时不存在，已停止部署。")
execFileSync(process.execPath, [join(source, "node_modules/typescript/bin/tsc"), "-b"], { cwd: source, stdio: "inherit" })
execFileSync(process.execPath, [join(source, "node_modules/vite/bin/vite.js"), "build"], { cwd: source, stdio: "inherit" })
copyFileSync(join(source, "dist/workbench.js"), join(runtime, "neon-workbench.js"))
copyFileSync(join(source, "dist/neon-workbench.css"), join(runtime, "neon-workbench.css"))
copyFileSync(join(source, "host-bridge.js"), join(runtime, "neon-host-bridge.js"))
const backupDir = join(source, "..", ".design", "deploy-backups", new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"))
mkdirSync(backupDir, { recursive: true })
for (const file of ["desktop-shell.js", "script.js", "neon-page-rebuild.css", "index.html", "neon-workbench.html"]) {
  const target = join(runtime, file)
  if (existsSync(target)) copyFileSync(target, join(backupDir, file))
}
const sourceCss = join(source, "design-sources/neon-page-rebuild.css")
if (existsSync(sourceCss)) copyFileSync(sourceCss, join(runtime, "neon-page-rebuild.css"))
const sourceScript = join(source, "design-sources/script-before-save-bridge.js")
if (existsSync(sourceScript)) {
  let canonicalScript = readFileSync(sourceScript, "utf8")
  if (!canonicalScript.includes("saveForNavigation: async function")) {
    canonicalScript = canonicalScript.replace("window.CanvasWorkspace = {", `window.CanvasWorkspace = {\n  saveForNavigation: async function () {\n    if (canvasState.isRestoring || canvasState.boardOpening) throw new Error("画布正在恢复，请完成后重试。");\n    await saveCanvasBoardNow();\n    if (canvasPagedStore.getPendingOperations().length || canvasState.hasUnsavedChanges) {\n      throw new Error("画布尚未保存成功，请重试后再返回。");\n    }\n  },`)
  }
  writeFileSync(join(runtime, "script.js"), canonicalScript, "utf8")
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
writeFileSync(join(runtime, "neon-workbench.html"), `<!doctype html>
<html lang="zh-CN" class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI OS 工作台</title><link rel="stylesheet" href="./neon-workbench.css?v=20260930-independent"></head><body><div id="root"></div><script src="./neon-workbench.js?v=20260930-independent"></script></body></html>`, "utf8")
const indexPath = join(runtime, "index.html")
let html = readFileSync(indexPath, "utf8")
if (!existsSync(join(source, "design-sources/runtime-index-before-isolation.html"))) writeFileSync(join(source, "design-sources/runtime-index-before-isolation.html"), html)
html = html
  .replace(/<link rel="stylesheet" href="\.\/neon-workbench\.css[^"]*" \/>/g, "")
  .replace(/<style>#aiOsNeonRoot[\s\S]*?<\/style>/g, "")
  .replace(/<div id="aiOsNeonRoot" hidden><\/div>/g, "")
  .replace(/<script src="\.\/(?:neon-workbench|neon-host-bridge)\.js[^"]*"><\/script>/g, "")
  .replace(/\\n(?=\s*<(?:style|\/head|div|\/body))/g, "\n")
  .replace(/(<div class="ai-os-desktop" id="aiOsDesktop" hidden>)\\n/g, "$1\n")
  .replace("</body>", '<script src="./neon-host-bridge.js?v=20260930-independent"></script>\n</body>')
writeFileSync(indexPath, html, "utf8")
console.log("新工作台已部署为独立同源页面，宿主未加载新工作台的全局样式。")
