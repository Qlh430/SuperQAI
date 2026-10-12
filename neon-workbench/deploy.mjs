import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"

// Copy individual files: Node's native recursive copy can terminate on the
// portable Windows drive before reporting an exception.
function copyDirectory(input, target) {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(input, { withFileTypes: true })) {
    if (entry.isDirectory()) copyDirectory(join(input, entry.name), join(target, entry.name))
    else if (entry.isFile()) copyFileSync(join(input, entry.name), join(target, entry.name))
    else throw new Error(`部署资源含不支持的文件类型：${entry.name}`)
  }
}

export function patchAudioServerComposition(text) {
  const needle = "const createProviderHttpApiComponent = () => createProviderHttpApi({";
  if (text.split(needle).length !== 2 || !text.includes("const assetLibrary = createAssetLibraryService")) throw new Error("音频服务组合入口不匹配，已停止部署。");
  const cleaned = text.replace(/  \/\* NEON_AUDIO_OUTPUT_PERSISTENCE_START \*\/\r?\n[\s\S]*?  \/\* NEON_AUDIO_OUTPUT_PERSISTENCE_END \*\/\r?\n/g, "");
  const hook = [
    "  /* NEON_AUDIO_OUTPUT_PERSISTENCE_START */",
    '  persistGeneratedAudio: require("../audio-output-persistence").createAudioOutputPersistence({',
    "    outputDir: OUTPUT_DIR, fs, crypto,",
    '    registerMedia: (userId, saved, contentType) => assetLibrary.registerMedia(userId, saved, contentType, { source: "generated" }),',
    "  }),",
    "  /* NEON_AUDIO_OUTPUT_PERSISTENCE_END */",
  ].join("\n");
  if (/persistGeneratedAudio\s*:/.test(cleaned)) throw new Error("音频服务已有未识别的保存接线，入口不匹配，已停止部署。");
  return cleaned.replace(needle, `${needle}\n${hook}`);
}

// Qwen-image2.1 的图像编辑 / 生图各有一份模板，服务端用同一个任务服务处理。
// 组合根在运行时是只读的构建产物，这里把处理器接到 media-generation-http-api。
export function patchQwenImage21Composition(text) {
  let patched = text;
  const workflowNeedle = "    qwenEditAngle: QWEN_EDIT_ANGLE_WORKFLOW_FILE,";
  if (!patched.includes("qwenImage21Edit:")) {
    if (patched.split(workflowNeedle).length !== 2) throw new Error("Qwen-image2.1 workflowFiles 入口不匹配，已停止部署。");
    patched = patched.replace(workflowNeedle, `${workflowNeedle}\n    qwenImage21Edit: WORKFLOW_DIR + "/qwen-image21-edit.json",`);
  }
  if (!patched.includes("qwenImage21Generate:")) {
    if (patched.split(workflowNeedle).length !== 2) throw new Error("Qwen-image2.1 workflowFiles 入口不匹配，已停止部署。");
    patched = patched.replace(workflowNeedle, `${workflowNeedle}\n    qwenImage21Generate: WORKFLOW_DIR + "/qwen-image21-generate.json",`);
  }
  const handlerNeedle = "    handleUpscale: getComfyWorkflowTaskService().handleUpscale,";
  if (!patched.includes("handleQwenImage21: getComfyWorkflowTaskService().handleQwenImage21,")) {
    if (patched.split(handlerNeedle).length !== 2) throw new Error("Qwen-image2.1 组合入口不匹配，已停止部署。");
    patched = patched.replace(handlerNeedle, `    handleQwenImage21: getComfyWorkflowTaskService().handleQwenImage21,\n${handlerNeedle}`);
  }
  return patched;
}
const source = dirname(fileURLToPath(import.meta.url))
const runtime = resolve(source, "../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app")
if (!existsSync(join(runtime, "desktop-shell.js"))) throw new Error("目标运行时不存在，已停止部署。")
const compositionPath = join(runtime, "server-components/composition.js")
const audioComposition = patchQwenImage21Composition(
  patchAudioServerComposition(readFileSync(compositionPath, "utf8")),
)
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
execFileSync(process.execPath, [join(source, "build-document-reader.mjs")], { cwd: source, stdio: "inherit" })
const backupDir = join(source, "..", ".design", "deploy-backups", new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"))
mkdirSync(backupDir, { recursive: true })
copyFileSync(join(runtime, "static-http-api.js"), join(backupDir, "static-http-api.js"))
for (const file of ["desktop/main.js", "desktop/startup.html", "startup-overlay.css", "desktop-shell.js", "script.js", "neon-page-rebuild.css", "neon-auth.css", "neon-canvas-surface.css", "node-action-bar.js", "flora-node-shell.css", "flora-node-shell.js", "flora-generator-composer.js", "flora-generator-parameters.js", "flora-generation-history.js", "flora-generation-history.css", "canvas-audio-generator.js", "canvas-audio-generator.css", "server-components/composition.js", "image-model-picker.js", "module-manifest.js", "canvas-image-toolbar.js", "index.html", "neon-workbench.html", "neon-workbench.js", "neon-workbench.css", "neon-host-bridge.js"]) {
  const target = join(runtime, file)
  if (existsSync(target)) {
    mkdirSync(dirname(join(backupDir, file)), { recursive: true })
    copyFileSync(target, join(backupDir, file))
  }
}
copyFileSync(join(source, "design-sources/static-http-api.cjs"), join(runtime, "static-http-api.js"))
writeFileSync(join(runtime, "desktop/startup.html"), startupHtml.replace("/* __NEON_STARTUP_TOKENS__ */", `:root {\n${startupTokens}\n}`), "utf8")
copyFileSync(join(source, "design-sources/startup-overlay.css"), join(runtime, "startup-overlay.css"))
writeFileSync(desktopMainPath, desktopMain, "utf8")
copyFileSync(join(source, "dist/workbench.js"), join(runtime, "neon-workbench.js"))
copyFileSync(join(source, "dist/neon-workbench.css"), join(runtime, "neon-workbench.css"))
copyFileSync(join(source, "host-bridge.js"), join(runtime, "neon-host-bridge.js"))
const providerApiTarget = join(runtime, "provider-http-api.js")
copyFileSync(providerApiTarget, join(backupDir, "provider-http-api.js"))
copyFileSync(join(source, "design-sources/provider-http-api.js"), providerApiTarget)
for (const moduleName of ["provider-test-result.js", "provider-protocol-engine.js", "media-protocol-adapters.js", "midjourney-parameter-rules.js", "flora-midjourney-settings.js", "provider-protocol-registry.js", "provider-model-rules.js", "audio-output-persistence.js", "minimax-h3-workflow.js", "minimax-h3-task-service.js", "canvas-h3-node-renderer.js", "canvas-text-node-renderer.js", "canvas-comfy-node-renderer.js", "comfy-workflow-task-service.js", "media-generation-http-api.js"]) {
  const target = join(runtime, moduleName)
  if (existsSync(target)) copyFileSync(target, join(backupDir, moduleName))
  copyFileSync(join(source, "design-sources", moduleName), target)
}
for (const file of ["flora-text-tools.js", "canvas-file-import.js", "canvas-document-reader.js", "canvas-pdf-worker.js"]) {
  if (existsSync(join(runtime, file))) copyFileSync(join(runtime, file), join(backupDir, file))
  const input = file === "canvas-document-reader.js" ? join(source, "dist", file) : file === "canvas-pdf-worker.js" ? join(source, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs") : join(source, "design-sources", file)
  copyFileSync(input, join(runtime, file))
}
for (const [directory, input] of [["canvas-pdf-cmaps", "cmaps"], ["canvas-pdf-fonts", "standard_fonts"]]) {
  if (existsSync(join(runtime, directory))) copyDirectory(join(runtime, directory), join(backupDir, directory))
  copyDirectory(join(source, "node_modules/pdfjs-dist", input), join(runtime, directory))
}
// ComfyUI 模板跟着运行时发货，但正在跑的服务读的是便携数据目录里的那份，
// 所以种子和线上文件都要同步。旧文件属于用户数据，先备份再覆盖。
// MiniMax H3：全能参考 + 文/图/首尾帧；Qwen-image2.1：图像编辑 + 生图。
const portableRoot = resolve(source, "../AI-OS-Portable-1.0.5-win-x64")
for (const fileName of [
  "minimax-h3-video.json",
  "minimax-h3-video-frames.json",
  "qwen-image21-edit.json",
  "qwen-image21-generate.json",
]) {
  const workflowSource = join(source, "design-sources/workflows", fileName)
  if (!existsSync(workflowSource)) continue
  for (const [backupName, target] of [
    [`workflows/${fileName}`, join(runtime, "workflows", fileName)],
    [`data-workflows/${fileName}`, join(portableRoot, "data/workflows", fileName)],
  ]) {
    if (existsSync(target)) {
      mkdirSync(dirname(join(backupDir, backupName)), { recursive: true })
      copyFileSync(target, join(backupDir, backupName))
    }
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(workflowSource, target)
  }
}
writeFileSync(compositionPath, audioComposition, "utf8")
for (const file of ["flora-generation-history.js", "flora-generation-history.css", "canvas-audio-generator.js", "canvas-audio-generator.css"]) copyFileSync(join(source, "design-sources", file), join(runtime, file))
// Board label storage is a versioned host extension. Back up every target
// before copying; the running worker is left alive until the user reopens.
for (const file of ["canvas-node-tag-rules.js", "flora-node-tags.js", "flora-node-tags.css", "flora-connection-interaction.js", "canvas-schema.js", "canvas-db-worker.js", "canvas-storage-http-api.js", "canvas-scene-rules.js", "canvas-scene-layer.js"]) {
  if (existsSync(join(runtime, file))) copyFileSync(join(runtime, file), join(backupDir, file))
  copyFileSync(join(source, "design-sources", file), join(runtime, file))
}
const sourceCss = join(source, "design-sources/neon-page-rebuild.css")
if (existsSync(sourceCss)) copyFileSync(sourceCss, join(runtime, "neon-page-rebuild.css"))
const authCss = join(source, "design-sources/neon-auth.css")
if (existsSync(authCss)) copyFileSync(authCss, join(runtime, "neon-auth.css"))
const canvasSurfaceCss = join(source, "design-sources/neon-canvas-surface.css")
if (existsSync(canvasSurfaceCss)) copyFileSync(canvasSurfaceCss, join(runtime, "neon-canvas-surface.css"))
const nodeActionBarScript = join(source, "design-sources/node-action-bar.js")
copyFileSync(nodeActionBarScript, join(runtime, "node-action-bar.js"))
const floraNodeShellCss = join(source, "design-sources/flora-node-shell.css")
if (existsSync(floraNodeShellCss)) copyFileSync(floraNodeShellCss, join(runtime, "flora-node-shell.css"))
const floraNodeShellScript = join(source, "design-sources/flora-node-shell.js")
if (existsSync(floraNodeShellScript)) copyFileSync(floraNodeShellScript, join(runtime, "flora-node-shell.js"))
copyFileSync(join(source, "design-sources/flora-generator-composer.js"), join(runtime, "flora-generator-composer.js"))
copyFileSync(join(source, "design-sources/flora-generator-parameters.js"), join(runtime, "flora-generator-parameters.js"))
copyFileSync(join(source, "design-sources/image-model-picker.js"), join(runtime, "image-model-picker.js"))
const manifestPath = join(runtime, "module-manifest.js")
writeFileSync(manifestPath, readFileSync(manifestPath, "utf8")
  .replace(/image-model-picker\.js\?v=[^"']*/g, "image-model-picker.js?v=20261009-reference-material-sections")
  .replace(/scripts: \[(?:"\.\/(?:midjourney-parameter-rules|flora-midjourney-settings)\.js[^"\]]*",\s*)*"\.\/script\.js\?v=[^"]*"\]/g,
    'scripts: ["./midjourney-parameter-rules.js?v=20261010-offscreen-refs-footer", "./flora-midjourney-settings.js?v=20261010-offscreen-refs-footer", "./script.js?v=20261010-offscreen-refs-footer"]')
  .replace(/canvas-text-node-renderer\.js\?v=[^"']*/g, "canvas-text-node-renderer.js?v=20261008-text-tools-import"), "utf8")
writeFileSync(manifestPath, readFileSync(manifestPath, "utf8")
  .replace(/canvas-scene-layer\.js\?v=[^"']*/g, "canvas-scene-layer.js?v=20261009-canvas-scale")
  // H3 字段分组依赖节点渲染器的 data-h3-param，必须一起换版本。
  .replace(/canvas-h3-node-renderer\.js\?v=[^"']*/g, "canvas-h3-node-renderer.js?v=20261010-h3-modes-mention")
  // 图片生成节点只保留 Qwen-image2.1，渲染器与其它 ComfyUI 子模块一起换版本。
  .replace(/canvas-comfy-(?:node-renderer|rules|outpaint-ui|qwen-ui)\.js\?v=[^"']*/g,
    (match) => `${match.split("?")[0]}?v=20261010-qwen-image21`), "utf8")
copyFileSync(join(source, "design-sources/canvas-image-toolbar.js"), join(runtime, "canvas-image-toolbar.js"))
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
<html lang="zh-CN" class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI OS 工作台</title><link rel="stylesheet" href="./neon-workbench.css?v=20261008-node-tags"></head><body><div id="root"></div><script src="./neon-workbench.js?v=20261008-node-tags"></script></body></html>`, "utf8")
const indexPath = join(runtime, "index.html")
let html = readFileSync(indexPath, "utf8")
if (!existsSync(join(source, "design-sources/runtime-index-before-isolation.html"))) writeFileSync(join(source, "design-sources/runtime-index-before-isolation.html"), html)
html = html
  .replace(/^[\t ]*<button\b[^>]*data-(?:canvas|connect)-node="midjourney"[^>]*>[\s\S]*?<\/button>\r?\n/gm, "")
  .replace(/(<link rel="stylesheet" href="\.\/startup-overlay\.css)[^"]*/g, "$1?v=20261002-neon-startup")
  .replace(/<link rel="stylesheet" href="\.\/neon-auth\.css[^"]*" \/>/g, "")
  .replace(/<link rel="stylesheet" href="\.\/neon-canvas-surface\.css[^"]*" \/>/g, "")
  .replace(/<link rel="stylesheet" href="\.\/flora-node-shell\.css[^"]*" \/>/g, "")
  .replace(/<link rel="stylesheet" href="\.\/(?:flora-generation-history|canvas-audio-generator)\.css[^"]*" \/>/g, "")
  .replace(/<link rel="stylesheet" href="\.\/flora-node-tags\.css[^"]*" \/>/g, "")
  .replace(/<link rel="stylesheet" href="\.\/neon-workbench\.css[^"]*" \/>/g, "")
  .replace(/<style>#aiOsNeonRoot[\s\S]*?<\/style>/g, "")
  .replace(/<div id="aiOsNeonRoot" hidden><\/div>/g, "")
  .replace(/<script src="\.\/(?:neon-workbench|neon-host-bridge|node-action-bar|flora-node-shell|flora-generator-composer|flora-generator-parameters|flora-generation-history|canvas-audio-generator)\.js[^"]*"><\/script>/g, "")
  .replace(/<script src="\.\/(?:flora-node-tags|canvas-node-tag-rules|flora-connection-interaction|flora-text-tools|canvas-file-import)\.js[^"]*"><\/script>/g, "")
  .replace(/<script src="\.\/(?:midjourney-parameter-rules|flora-midjourney-settings)\.js[^"]*"><\/script>/g, "")
  .replace(/<script src="\.\/script\.js\?v=[^"]*"><\/script>/g, '<script src="./script.js?v=20261009-midjourney-entry"></script>')
  .replace(/image-model-picker\.js\?v=[^"]*/g, 'image-model-picker.js?v=20261008-node-tags')
  .replace(/module-manifest\.js\?v=[^"]*/g, 'module-manifest.js?v=20261008-node-tags')
  .replace('<script src="./module-manifest.js', '<script src="./canvas-node-tag-rules.js?v=20261008-node-tags"></script>\n    <script src="./flora-node-tags.js?v=20261008-node-tags"></script>\n    <script src="./node-action-bar.js?v=20261006-asset-upload"></script>\n    <script src="./flora-generation-history.js?v=20261008-node-tags"></script>\n    <script src="./canvas-audio-generator.js?v=20261008-node-tags"></script>\n    <script src="./flora-generator-parameters.js?v=20261008-node-tags"></script>\n    <script src="./flora-generator-composer.js?v=20261008-node-tags"></script>\n    <script src="./flora-node-shell.js?v=20261008-node-tags"></script>\n    <script src="./module-manifest.js')
  .replace(/\\n(?=\s*<(?:style|\/head|div|\/body))/g, "\n")
  .replace(/(<div class="ai-os-desktop" id="aiOsDesktop" hidden>)\\n/g, "$1\n")
  .replace("</head>", '<link rel="stylesheet" href="./neon-canvas-surface.css?v=20261002-neon-canvas" />\n<link rel="stylesheet" href="./canvas-audio-generator.css?v=20261008-node-tags" />\n<link rel="stylesheet" href="./flora-generation-history.css?v=20261008-node-tags" />\n<link rel="stylesheet" href="./flora-node-shell.css?v=20261008-node-tags" />\n<link rel="stylesheet" href="./flora-node-tags.css?v=20261008-node-tags" />\n<link rel="stylesheet" href="./neon-auth.css?v=20261002-neon-auth" />\n</head>')
  .replace("</body>", '<script src="./neon-host-bridge.js?v=20261008-node-tags"></script>\n</body>')
  .replace('<script src="./canvas-node-tag-rules.js', '<script src="./flora-connection-interaction.js?v=20261008-material-image"></script>\n    <script src="./canvas-node-tag-rules.js')
  .replace(/flora-node-shell\.css\?v=[^"]*/g, 'flora-node-shell.css?v=20261008-empty-video')
  .replace(/flora-generator-composer\.js\?v=[^"]*/g, 'flora-generator-composer.js?v=20261008-canvas-performance')
  .replace('<script src="./flora-node-shell.js', '<script src="./flora-text-tools.js?v=20261008-text-tools-import"></script>\n<script src="./canvas-file-import.js?v=20261008-text-tools-import"></script>\n<script src="./flora-node-shell.js')
  .replace(/flora-node-shell\.js\?v=[^"]*/g, 'flora-node-shell.js?v=20261008-canvas-performance')
  .replace(/neon-canvas-surface\.css\?v=[^"]*/g, 'neon-canvas-surface.css?v=20261008-material-image')
  .replace('<script src="./script.js', '<script src="./midjourney-parameter-rules.js?v=20261009-reference-material-sections"></script>\n<script src="./flora-midjourney-settings.js?v=20261009-reference-material-sections"></script>\n<script src="./script.js')
  // 操作区定位与参考带改动的缓存版本：script.js / 组合器 / 节点壳体一起换版本，
  // 否则宿主与画布会继续命中旧缓存。
  .replace(/(?:script|image-model-picker|flora-generator-parameters|flora-generator-composer)\.js\?v=[^"]*/g, match => match.split('?')[0] + '?v=20261010-qwen-image21')
  .replace(/flora-node-shell\.(?:css|js)\?v=[^"]*/g, match => match.split('?')[0] + '?v=20261010-qwen-image21')
  .replace(/flora-generator-composer\.js\?v=[^"]*/g, 'flora-generator-composer.js?v=20261011-canvas-observer')
writeFileSync(indexPath, html, "utf8")
console.log("新工作台已部署为独立同源页面，宿主未加载新工作台的全局样式。")
