import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
const modules = Object.create(null)
const modulePairs = names => names.map(name => [`design-sources/${name}`, name])
modules.cutout = modulePairs(["background-removal-ui.js", "background-removal-service.js", "canvas-features/tool-cutout.js"])
modules.h3 = [
  ...modulePairs(["comfyui-client.js", "minimax-h3-workflow.js", "minimax-h3-task-service.js", "canvas-h3-node-renderer.js", "flora-node-shell.css"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
]
modules.chat = modulePairs(["provider-protocol-engine.js", "chat-http-api.js"])
modules.naming = [["dist/workbench.js", "neon-workbench.js"], ["host-bridge.js", "neon-host-bridge.js"]]
modules["workbench-frontend"] = [...modules.naming, ["dist/neon-workbench.css", "neon-workbench.css"]]
modules["brand-display"] = [
  ["design-sources/desktop-startup.html", "desktop/startup.html"],
  ["design-sources/desktop-shell-before-bridge.js", "desktop-shell.js"],
  ["../host-sources/app/neon-bridge.css", "neon-bridge.css"],
]
modules["media-naming"] = [
  ...modulePairs(["resource-access.js", "curated-asset-service.js", "canvas-media-gc-service.js", "audio-output-persistence.js", "flora-generation-history.js", "comfy-workflow-task-service.js", "minimax-h3-task-service.js"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ...["asset-library-service.js", "asset-library-http-api.js", "server.js", "media-http-api.js", "image-generation-http-api.js", "image-job-http-api.js", "image-job-manager.js", "server-components/composition.js", "canvas-media-node-renderer.js", "canvas-asset-collection-rules.js", "runninghub-outpaint-service.js"].map(name => [`../host-sources/app/${name}`, name]),
  ...modulePairs(["resource-http-api.js"]),
  ["dist/workbench.js", "neon-workbench.js"],
  ["dist/neon-workbench.css", "neon-workbench.css"],
]
modules["media-naming-backend"] = [
  ["../host-sources/app/asset-library-service.js", "asset-library-service.js"],
  ["design-sources/resource-http-api.js", "resource-http-api.js"],
  ["design-sources/curated-asset-service.js", "curated-asset-service.js"],
]
modules["minimax-h3-quality-backend"] = modulePairs(["minimax-h3-workflow.js"])
modules["canvas-feature-core"] = modulePairs(["canvas-feature-registry.js"])
modules["canvas-node-catalog"] = [["../host-sources/app/canvas-node-catalog.js", "canvas-node-catalog.js"]]
modules["canvas-light-visual"] = modulePairs(["canvas-representation-host.js"])
modules["canvas-text-scroll"] = modulePairs(["canvas-representation-host.js", "canvas-node-visuals.js"])
modules["canvas-fullscreen-original-preview"] = [["design-sources/script-before-save-bridge.js", "script.js"]]
modules["canvas-asset-library"] = modulePairs(["canvas-asset-library.js", "neon-page-rebuild.css"])
modules["startup-gate"] = [
  ["../host-sources/app/startup-overlay.js", "startup-overlay.js"],
  ["design-sources/startup-overlay.css", "startup-overlay.css"],
]
// Keep generator empty-state icon previews isolated from unrelated canvas fixes.
modules["generator-empty-placeholder"] = modulePairs(["canvas-node-visuals.js", "flora-generator-composer.js", "flora-node-shell.css"])
modules["audio-node-appearance"] = [
  ...modulePairs(["canvas-node-visuals.js", "canvas-audio-generator.js", "canvas-audio-generator.css", "flora-generator-composer.js", "flora-generator-parameters.js", "flora-node-shell.js", "flora-node-shell.css"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
]
modules["canvas-redraw-frontend"] = [
  ...modulePairs(["flora-node-shell.js", "script-before-save-bridge.js", "neon-canvas-surface.css"])
    .map(pair => pair[0].endsWith("/script-before-save-bridge.js") ? [pair[0], "script.js"] : pair),
]
modules["ace-step-backend"] = [
  ...modulePairs(["provider-http-api.js", "comfyui-client.js", "ace-step-task-service.cjs"]),
  ["../host-sources/app/server-components/composition.js", "server-components/composition.js"],
  ["design-sources/workflows/ace-step-music.json", "workflows/ace-step-music.json"],
]
modules["qwen-tts-backend"] = [
  ...modulePairs(["provider-http-api.js", "audio-output-persistence.js", "qwen-tts-task-service.cjs", "qwen-tts-reference.cjs", "workflows/qwen-tts-three-in-one.json"]),
  ["../host-sources/app/server-components/composition.js", "server-components/composition.js"],
]
modules["canvas-redraw-backend"] = [
  ...modulePairs(["comfy-workflow-task-service.js", "media-generation-http-api.js", "workflows/qwen-image21-redraw.json"]),
  ["../host-sources/app/server-components/composition.js", "server-components/composition.js"],
  ["../host-sources/app/server-config.js", "server-config.js"],
  ["../host-sources/app/server.js", "server.js"],
]
modules["canvas-media-stability"] = [
  ...modulePairs(["canvas-representation-host.js", "canvas-representation-manager.js", "canvas-node-visuals.js", "flora-connection-interaction.js", "flora-node-shell.js", "flora-node-shell.css", "neon-canvas-surface.css"]),
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["dist/neon-workbench.css", "neon-workbench.css"],
]
modules["v302-targeted-fixes"] = [
  ...modulePairs(["canvas-representation-host.js", "canvas-node-visuals.js", "flora-node-shell.js", "flora-node-shell.css", "neon-canvas-surface.css", "flora-connection-interaction.js", "flora-generator-composer.js", "script-before-save-bridge.js", "background-removal-ui.js"])
    .map(pair => pair[0].endsWith("/script-before-save-bridge.js") ? [pair[0], "script.js"] : pair),
  ["dist/neon-workbench.css", "neon-workbench.css"],
  ["../host-sources/app/canvas-note-node-renderer.js", "canvas-note-node-renderer.js"],
  ["../host-sources/app/core/canvas-node-registry.js", "core/canvas-node-registry.js"],
]
// Group visual/auto-fit hotfix: deploy only the group rendering files and the
// canonical canvas bridge assembled in the same way as deploy.mjs.
modules["canvas-group-visual"] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["design-sources/canvas-node-visuals.js", "canvas-node-visuals.js"],
  ["design-sources/canvas-scene-layer.js", "canvas-scene-layer.js"],
  ["design-sources/canvas-representation-host.js", "canvas-representation-host.js"],
  ["design-sources/neon-canvas-surface.css", "neon-canvas-surface.css"],
]
modules["canvas-final-adjustments"] = [
  ["design-sources/script-before-save-bridge.js", "script.js"],
  ["design-sources/canvas-text-node-renderer.js", "canvas-text-node-renderer.js"],
  ["design-sources/canvas-node-visuals.js", "canvas-node-visuals.js"],
  ["design-sources/canvas-scene-layer.js", "canvas-scene-layer.js"],
  ["design-sources/canvas-representation-host.js", "canvas-representation-host.js"],
  ["design-sources/flora-connection-interaction.js", "flora-connection-interaction.js"],
  ["design-sources/flora-node-shell.css", "flora-node-shell.css"],
  ["../host-sources/app/canvas-note-node-renderer.js", "canvas-note-node-renderer.js"],
  ["../host-sources/app/styles.css", "styles.css"],
]
modules["canvas-interaction-final"] = [
  ...modulePairs(["script-before-save-bridge.js", "canvas-representation-host.js", "canvas-feature-registry.js", "flora-node-shell.js", "flora-node-shell.css", "startup-overlay.css", "canvas-node-visuals.js", "canvas-scene-layer.js"])
    .map(pair => pair[0].endsWith("/script-before-save-bridge.js") ? [pair[0],"script.js"] : pair),
  ["design-sources/desktop-startup.html", "desktop/startup.html"],
  ["design-sources/neon-auth.css", "neon-auth.css"],
  ["../host-sources/app/canvas-agent-capabilities.js", "canvas-agent-capabilities.js"],
  ["../host-sources/app/canvas-agent-tool-adapters.js", "canvas-agent-tool-adapters.js"],
]
modules["canvas-agent-context"] = [
  ["../host-sources/app/canvas-agent-core.js", "canvas-agent-core.js"],
  ["../host-sources/app/module-manifest.js", "module-manifest.js"],
]
modules["release-host-sync"] = [
  "backup-service.js", "canvas-image-info.js", "desktop/main.js",
  "desktop/portable-setup.js", "desktop/portable-setup.html",
  "desktop/rollback-retention.js", "desktop/update-install.js", "desktop/updater.js",
].map(name => [`../host-sources/app/${name}`, name])
// Only fixed owner inputs may cross the workbench source root.
const hostInputs = new Set(["../host-sources/app/canvas-note-node-renderer.js", "../host-sources/app/core/canvas-node-registry.js", "../host-sources/app/canvas-node-catalog.js", "../host-sources/app/styles.css", "../host-sources/app/canvas-agent-capabilities.js", "../host-sources/app/canvas-agent-tool-adapters.js", "../host-sources/app/canvas-agent-core.js", "../host-sources/app/module-manifest.js"])
hostInputs.add("../host-sources/app/startup-overlay.js")
hostInputs.add("../host-sources/app/neon-bridge.css")
hostInputs.add("../host-sources/app/server-components/composition.js")
hostInputs.add("../host-sources/app/server-config.js")
hostInputs.add("../host-sources/app/server.js")
for (const [input] of modules["media-naming"]) if (input.startsWith("../host-sources/app/")) hostInputs.add(input)
for (const [input] of modules["release-host-sync"]) hostInputs.add(input)
export function startupLogo(source) {
  const file = checkedPath(path.resolve(source,"../host-sources/app"),"assets/branding/bendo-logo.svg",{required:true})
  const svg = fs.readFileSync(file,"utf8").trim()
  if (!svg.startsWith('<svg ') || /<script|<image|href=|onload=/i.test(svg)) throw new Error("启动品牌 SVG 必须为受控本地矢量。")
  return svg.replace('<svg ', '<svg width="40" height="40" fill="currentColor" ')
}
export function injectStartupLogo(html, source) {
  const logo = startupLogo(source)
  return html
    .replaceAll('<!-- __BENDO_STARTUP_LOGO__ -->', logo)
    .replace(/(<span class="ai-os-startup-brand-mark" aria-hidden="true">)[\s\S]*?(<\/span>)/, `$1${logo}$2`)
    .replace(/(<span class="ai-os-brand-mark" aria-hidden="true">)[\s\S]*?(<\/span>)/, `$1${logo}$2`)
}
export function compileStartupHtml(source) {
  const css = fs.readFileSync(checkedPath(source,"src/index.css",{required:true}),"utf8")
  const tokens = ["background","foreground","primary","primary-foreground","secondary","muted-foreground","radius"].map(name=>{
    const value=css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
    if(!value)throw new Error(`启动页缺少令牌 ${name}`)
    return `--${name}: ${value};`
  }).join("\n")
  const html=fs.readFileSync(checkedPath(source,"design-sources/desktop-startup.html",{required:true}),"utf8")
  if(!html.includes('/* __NEON_STARTUP_TOKENS__ */')||!html.includes('<!-- __BENDO_STARTUP_LOGO__ -->'))throw new Error('启动页构建契约不完整。')
  return injectStartupLogo(html.replace('/* __NEON_STARTUP_TOKENS__ */',`:root {\n${tokens}\n}`), source)
}
export function patchBrandDisplay(text) {
  return text
    .replaceAll("<title>AI OS</title>", "<title>BenDo</title>")
    .replaceAll("AI OS 正在启动", "BenDo 正在启动")
    .replaceAll("<strong>AI OS</strong>", "<strong>BenDo</strong>")
    .replaceAll("正在准备 AI OS", "正在准备 BenDo")
    .replaceAll("登录 AI OS", "登录 BenDo")
    .replaceAll("AI OS 工作台", "BenDo 工作台")
    .replaceAll("请重新打开 AI OS", "请重新打开 BenDo")
    .replaceAll("AI OS", "BenDo")
}
function inputPath(source, input, options) {
  return hostInputs.has(input)
    ? checkedPath(path.resolve(source, "../host-sources/app"), input.slice("../host-sources/app/".length), options)
    : checkedPath(source, input, options)
}
for (const name of ["tool-crop", "tool-outpaint", "tool-angle", "tool-upscale", "node-image", "node-video", "node-audio", "node-text", "node-script", "node-upload"]) modules[name] = modulePairs([`canvas-features/${name}.js`])
modules["node-note"] = [
  ["design-sources/canvas-features/node-note.js", "canvas-features/node-note.js"],
  ["../host-sources/app/canvas-note-node-renderer.js", "canvas-note-node-renderer.js"],
  ["design-sources/flora-node-shell.js", "flora-node-shell.js"],
  ["design-sources/flora-node-shell.css", "flora-node-shell.css"],
  ["../host-sources/app/styles.css", "styles.css"],
]

const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
export function componentTargets(names) {
  if (!Array.isArray(names) || !names.length || names.some(name => !Object.hasOwn(modules, name))) throw new Error("请选择有效的白名单组件。")
  return [...new Set(names.flatMap(name => modules[name].map(pair => pair[1])))]
}
function unsharedTarget(file) {
  if (fs.existsSync(file) && fs.statSync(file).nlink !== 1) throw new Error(`目标文件含硬链接或无法确认独占，禁止修改共享内容：${file}`)
  return file
}
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function noLinks(absolute) {
  let cursor = path.parse(absolute).root
  for (const segment of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment)
    let stat
    try { stat = fs.lstatSync(cursor) }
    catch (error) { if (error.code === "ENOENT") break; throw error }
    if (stat.isSymbolicLink()) throw new Error(`部署路径不能包含目录链接或符号链接：${cursor}`)
    if (cursor !== absolute && !stat.isDirectory()) throw new Error(`部署路径中的父目录类型不正确：${cursor}`)
  }
}

function checkedPath(root, relative, { required = false, directory = false, label = "部署文件" } = {}) {
  const absolute = path.resolve(root, relative)
  if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error(`${label}超出允许目录。`)
  noLinks(absolute)
  if (fs.existsSync(absolute)) {
    const stat = fs.statSync(absolute)
    if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`${label}类型不正确：${absolute}`)
  } else if (required) throw new Error(`${label}不存在：${absolute}`)
  return absolute
}

function patchUrls(text, versions) {
  let result = text
  for (const [file, version] of versions) {
    // Restrict to exact local URL string literals; leave other components and queries untouched.
    const pattern = new RegExp(`(["'\\x60])((?:\\./|/)?${escapeRegExp(file)})(?:\\?([^"'\\x60#]*))?(#[^"'\\x60]*)?\\1`, "g")
    result = result.replace(pattern, (_match, quote, url, query, fragment = "") => {
      const parameters = new URLSearchParams(query || "")
      parameters.set("v", version)
      return `${quote}${url}?${parameters}${fragment}${quote}`
    })
  }
  return result
}

function buildProject(source) {
  const options = { cwd: source, windowsHide: true, stdio: "inherit" }
  try {
    // Invoke the pinned local toolchain directly. Spawning npm/cmd is blocked
    // by the current Windows portable environment with EPERM, while the same
    // Node entry points are allowed and keep the build reproducible.
    execFileSync(process.execPath, [path.join(source, "node_modules/typescript/bin/tsc"), "-b"], options)
    execFileSync(process.execPath, [path.join(source, "node_modules/vite/bin/vite.js"), "build", "--configLoader", "native"], options)
    execFileSync(process.execPath, [path.join(source, "build-document-reader.mjs")], options)
  } catch (error) {
    throw new Error(`组件构建失败，运行时未修改：${error.message}`, { cause: error })
  }
}

/** Update only explicitly selected components after the initial full canvas migration. */
export function ensureCanvasNavigationBridge(script) {
  const source = String(script)
  const marker = "saveForNavigation: async function"
  if (source.includes(marker)) return source
  const anchor = "window.CanvasWorkspace = {"
  if (source.split(anchor).length !== 2) throw new Error("画布导航保存桥接入口不匹配，已停止部署。")
  return source.replace(anchor, `${anchor}\n  saveForNavigation: async function () {\n    if (canvasState.isRestoring || canvasState.boardOpening) throw new Error("画布正在恢复，请完成后重试。");\n    await saveCanvasBoardNow();\n    if (canvasPagedStore.getPendingOperations().length || canvasState.hasUnsavedChanges) {\n      throw new Error("画布尚未保存成功，请重试后再返回。");\n    }\n  },`)
}
export async function deployComponents({ source, runtime, names, build = true, transforms = {}, verifyOnly = false } = {}) {
  if (!Array.isArray(names) || names.length === 0 || names.some(name => typeof name !== "string" || !Object.hasOwn(modules, name))) throw new Error("请选择有效的白名单组件；未知组件禁止部署。")
  if (typeof source !== "string" || typeof runtime !== "string" || !source || !runtime) throw new Error("组件部署必须提供源码目录与运行时目录。")
  source = path.resolve(source)
  runtime = path.resolve(runtime)
  if (source === runtime || source.startsWith(runtime + path.sep) || runtime.startsWith(source + path.sep)) throw new Error("源码目录与运行时目录必须相互独立。")
  checkedPath(source, ".", { required: true, directory: true, label: "源码目录" })
  checkedPath(runtime, ".", { required: true, directory: true, label: "运行时目录" })
  const components = [...new Set(names)]
  const pairs = [...new Map(components.flatMap(name => modules[name]).map(pair => [pair[1], pair])).values()]
  const needsCanvas = components.some(name => name === "cutout" || name.startsWith("tool-") || name.startsWith("node-") || name === "canvas-feature-core")
  if (needsCanvas) {
    try {
      checkedPath(runtime, "script.js", { required: true })
      checkedPath(runtime, "canvas-feature-registry.js", { required: true })
    } catch (error) { throw new Error(`缺少已安装的画布共享核心，请先通过 deploy.mjs 执行一次完整部署：${error.message}`, { cause: error }) }
  }
  const metadataFiles = ["index.html", "module-manifest.js", ...(components.some(name => ["naming", "media-naming", "workbench-frontend", "brand-display"].includes(name)) ? ["neon-workbench.html"] : [])]
  for (const file of metadataFiles) unsharedTarget(checkedPath(runtime, file, { required: true, label: "运行时入口文件" }))
  // Validate static inputs before a build; dist/workbench.js is produced by that build.
  for (const [input, target] of pairs) {
    inputPath(source, input, { required: !(build && input.startsWith("dist/")), label: "组件源文件" })
    unsharedTarget(checkedPath(runtime, target, { label: "组件目标文件" }))
  }
  const backupRoot = path.resolve(source, "..", ".design", "deploy-backups")
  noLinks(backupRoot)
  if (build) {
    checkedPath(source, "package.json", { required: true, label: "构建配置" })
    buildProject(source)
  }

  // Prepare every byte and validate every path again before the first runtime mutation.
  const plan = new Map(), versions = new Map(), sourceVersions = new Map()
  for (const [input, target] of pairs) {
    const from = inputPath(source, input, { required: true, label: "组件源文件" })
    const to = unsharedTarget(checkedPath(runtime, target, { label: "组件目标文件" }))
    let contents = fs.readFileSync(from)
    if (input === "design-sources/script-before-save-bridge.js" && target === "script.js") {
      let canonical = ensureCanvasNavigationBridge(contents.toString("utf8"))
      canonical += "\n" + fs.readFileSync(checkedPath(source, "design-sources/canvas-script-production.js", { required: true }), "utf8")
      canonical += "\n" + fs.readFileSync(checkedPath(source, "design-sources/canvas-asset-entry.js", { required: true }), "utf8")
      contents = Buffer.from(canonical, "utf8")
    }
    if (target === "script.js" && !contents.toString("utf8").includes("saveForNavigation: async function")) throw new Error("新画布脚本缺少导航保存桥接，已停止部署。")
    if(input === "design-sources/desktop-startup.html") contents=Buffer.from(compileStartupHtml(source))
    if (transforms[target]) contents = Buffer.from(transforms[target](contents.toString("utf8")))
    if (target === "desktop-shell.js" && components.includes("brand-display")) contents = Buffer.from(patchBrandDisplay(contents.toString("utf8")))
    const digest = hash(contents)
    sourceVersions.set(target, digest.slice(0, 16))
    const previous = fs.existsSync(to) ? fs.readFileSync(to) : null
    if (previous && hash(previous) === digest) continue
    plan.set(target, { to, contents, previous })
    versions.set(target, digest.slice(0, 16))
  }
  for (const file of [...metadataFiles].sort((a, b) => a === 'module-manifest.js' ? -1 : b === 'module-manifest.js' ? 1 : 0)) {
    const to = checkedPath(runtime, file, { required: true, label: "运行时入口文件" })
    const previous = fs.readFileSync(to)
    const current = plan.get(file)?.contents || previous
    let patched = patchUrls(current.toString("utf8"), sourceVersions.has(file) ? sourceVersions : versions)
    if (components.includes("brand-display")) patched = patchBrandDisplay(patched)
    if(file === 'index.html' && components.includes('canvas-interaction-final')) {
      const marker=/<span class="ai-os-startup-brand-mark" aria-hidden="true">[\s\S]*?<\/span>/
      if(!marker.test(patched))throw new Error('缺少启动门品牌入口，停止部署。')
      patched=injectStartupLogo(patched, source)
    }
    if (patched !== previous.toString("utf8")) {
      const contents = Buffer.from(patched)
      plan.set(file, { to, contents, previous })
      if (file === "module-manifest.js") versions.set(file, hash(contents).slice(0, 16))
    } else {
      plan.delete(file)
      versions.delete(file)
    }
  }
  // A changed manifest is itself cached by index.html. Revisit only this matching URL.
  if (versions.has("module-manifest.js")) {
    const to = checkedPath(runtime, "index.html", { required: true })
    const previous = fs.readFileSync(to)
    const current = plan.get("index.html")?.contents || previous
    const patched = Buffer.from(patchUrls(current.toString("utf8"), new Map([["module-manifest.js", versions.get("module-manifest.js")]])))
    if (!patched.equals(previous)) plan.set("index.html", { to, contents: patched, previous })
    else plan.delete("index.html")
  }
  if (!plan.size) return { components, changed: [], backupDir: null, restartRequired: false }
  if (verifyOnly) return { components, changed: [...plan.keys()], backupDir: null, restartRequired: false }

  let stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
  let backupDir = path.join(backupRoot, `${stamp}-components`)
  for (let suffix = 1; fs.existsSync(backupDir); suffix++) backupDir = path.join(backupRoot, `${stamp}-${suffix}-components`)
  noLinks(backupDir)
  fs.mkdirSync(backupDir, { recursive: true })
  // Finish every backup before writing any selected runtime module.
  for (const [file, entry] of plan) {
    if (!entry.previous) continue
    const backup = checkedPath(backupDir, file)
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    fs.writeFileSync(backup, entry.previous)
  }
  fs.writeFileSync(path.join(backupDir, "component-deploy.json"), JSON.stringify({ components, files: [...plan].map(([file, entry]) => ({ file, existed: Boolean(entry.previous), sha256: hash(entry.contents) })) }, null, 2))
  const touched = []
  try {
    for (const [file, entry] of plan) {
      unsharedTarget(checkedPath(runtime, file))
      fs.mkdirSync(path.dirname(entry.to), { recursive: true })
      touched.push([file, entry])
      fs.writeFileSync(entry.to, entry.contents)
      if (hash(fs.readFileSync(entry.to)) !== hash(entry.contents)) throw new Error(`组件写入校验失败：${file}`)
    }
  } catch (error) {
    const failures = []
    for (const [file, entry] of touched.reverse()) {
      try {
        if (entry.previous) fs.copyFileSync(path.join(backupDir, file), entry.to)
        else fs.rmSync(entry.to, { force: true })
      } catch (restoreError) { failures.push(`${file}：${restoreError.message}`) }
    }
    const message = failures.length ? `部分文件恢复失败：${failures.join("；")}。备份：${backupDir}` : "已从备份回滚全部运行时改动。"
    throw new Error(`组件部署失败，${message} 原因：${error.message}`, { cause: error })
  }
  const backend = new Set(["background-removal-service.js", "comfyui-client.js", "minimax-h3-workflow.js", "minimax-h3-task-service.js", "provider-protocol-engine.js", "provider-http-api.js", "ace-step-task-service.cjs", "asset-library-service.js", "resource-http-api.js", "curated-asset-service.js", "server-components/composition.js", "workflows/ace-step-music.json", "provider-protocol-engine.js", "chat-http-api.js", "canvas-feature-registry.js", "canvas-agent-capabilities.js", "canvas-agent-tool-adapters.js", "core/canvas-node-registry.js", "desktop/startup.html"])
  return { components, changed: [...plan.keys()], backupDir, restartRequired: [...plan.keys()].some(file => backend.has(file)) }
}
