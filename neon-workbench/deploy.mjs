import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, resolve, join, relative as relativePath, isAbsolute, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { compileStartupHtml } from "./component-deploy.mjs"
const { patchAuthService, patchDesktopShell } = createRequire(import.meta.url)("./design-sources/auth-onboarding-patches.cjs")
const { patchAssetComposition, patchAssetManifest, patchAssetServer, patchMediaLifecycleComposition } = createRequire(import.meta.url)("./design-sources/asset-history-deploy-patches.cjs")

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
  const withPersistence = cleaned.replace(needle, `${needle}\n${hook}`);
  const endMarker = "  /* NEON_AUDIO_OUTPUT_PERSISTENCE_END */";
  if (withPersistence.includes("aceStepTaskService:")) return withPersistence;
  if (withPersistence.split(endMarker).length !== 2) throw new Error("ACE-Step 服务接线入口不匹配，已停止部署。");
  const aceHook = [
    '  aceStepTaskService: require("../ace-step-task-service.cjs").createAceStepTaskService({',
    '    workflow: JSON.parse(fs.readFileSync(path.join(__dirname, "../workflows/ace-step-music.json"), "utf8")),',
    '    comfyClient: getComfyClient(),',
    '    persistAudio: require("../audio-output-persistence").createAudioOutputPersistence({',
    '      outputDir: OUTPUT_DIR, fs, crypto,',
    '      registerMedia: (userId, saved, contentType) => assetLibrary.registerMedia(userId, saved, contentType, { source: "generated" }),',
    '    }),',
    '  }),',
  ].join("\n");
  return withPersistence.replace(endMarker, `${aceHook}\n${endMarker}`);
}

export function patchQwenTtsComposition(text, { enabled = true } = {}) {
  const needle = 'const createProviderHttpApiComponent = () => createProviderHttpApi({';
  if (text.split(needle).length !== 2) throw new Error('Qwen-TTS 服务组合入口不匹配。');
  const cleaned = text.replace(/  \/\* NEON_QWEN_TTS_START \*\/\r?\n[\s\S]*?  \/\* NEON_QWEN_TTS_END \*\/\r?\n/g, '');
  if (!enabled) return cleaned;
  if (cleaned.includes('qwenTtsTaskService:')) throw new Error('已有未识别的 Qwen-TTS 接线，停止部署。');
  const hook = [
    '  /* NEON_QWEN_TTS_START */',
    '  qwenTtsTaskService: require("../qwen-tts-task-service.cjs").createQwenTtsTaskService({',
    '    workflow: JSON.parse(fs.readFileSync(path.join(__dirname, "../workflows/qwen-tts-three-in-one.json"), "utf8")),',
    '    comfyClient: getComfyClient(),',
    '    readReferenceAudio: require("../qwen-tts-reference.cjs").createQwenTtsReferenceReader({ outputDir: OUTPUT_DIR, assertOutputMediaRead, canonicalOutputMedia, fs }),',
    '    persistAudio: require("../audio-output-persistence").createAudioOutputPersistence({',
    '      outputDir: OUTPUT_DIR, fs, crypto,',
    '      registerMedia: (userId, saved, contentType) => assetLibrary.registerMedia(userId, saved, contentType, { source: "generated" }),',
    '    }),',
    '  }),',
    '  /* NEON_QWEN_TTS_END */',
  ].join('\n');
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
  const redrawHandler = "    handleQwenImage21Redraw: getComfyWorkflowTaskService().handleQwenImage21Redraw,";
  if (!patched.includes(redrawHandler)) {
    const qwenHandler = "    handleQwenImage21: getComfyWorkflowTaskService().handleQwenImage21,";
    if (patched.split(qwenHandler).length !== 2) throw new Error("Qwen-image2.1 重绘组合入口不匹配，已停止部署。");
    patched = patched.replace(qwenHandler, `${qwenHandler}\n${redrawHandler}`);
  }
  return patched;
}
const source = dirname(fileURLToPath(import.meta.url))
const dailyMode = process.argv.includes('--daily-workbench')
const backendMode = process.argv.includes('--workbench-backend')
let backendRuntime
if (backendMode) {
  const backendComponents = process.argv.find(arg => arg.startsWith('--components='))?.slice('--components='.length).split(',').filter(Boolean) || []
  if (process.argv.length !== 4 || !backendComponents.length || backendComponents.some(name => !['qwen-tts-backend', 'canvas-redraw-backend', 'media-naming-backend', 'minimax-h3-quality-backend'].includes(name))) throw new Error('后端独立部署仅允许显式后端组件，禁止叠加前端、候选或任意目标参数。')
  const { runningBackend, dailyPaths } = await import('./daily-workbench.mjs')
  await runningBackend(source)
  const portable = dailyPaths(source).portable
  const diagnostic = JSON.parse(readFileSync(join(portable, 'data/.logs/runtime-diagnostics.json'), 'utf8'))
  backendRuntime = diagnostic.appRoot
}
let dailyTarget
if (dailyMode) {
  if (process.argv.slice(2).some(arg => arg !== '--daily-workbench' && !arg.startsWith('--components='))) throw new Error('日常开发入口只接受前端组件白名单，不能叠加候选、发布或自定义目标参数。')
  const { assertDailyTarget, dailyPaths, dailyComponents } = await import('./daily-workbench.mjs')
  const names = dailyComponents(process.argv.find(arg => arg.startsWith('--components='))?.slice('--components='.length))
  dailyTarget = assertDailyTarget(source, dailyPaths(source).stage, names)
}
const releaseStage = process.argv.find(argument => argument.startsWith('--release-stage='))?.slice('--release-stage='.length)
if (releaseStage) {
  await createRequire(import.meta.url)('../release-tools/final-portable.cjs').runStage(releaseStage)
  process.exit(0)
}
// Preview deployment is an independent immutable runtime transaction. It must
// exit before the legacy in-place deployment or workflow seeding runs.
const previewMode = dailyMode ? 'build' : process.argv.find(argument => argument.startsWith('--dev-preview='))?.slice('--dev-preview='.length)
if (previewMode && previewMode !== 'build') {
  const { previewCli } = await import('./dev-preview-sync.mjs')
  const result = await previewCli(process.argv.slice(2), resolve(source, '../AI-OS-Portable-1.0.5-win-x64'))
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}
const previewBuildRuntime = dailyTarget?.stage || process.argv.find(argument => argument.startsWith('--preview-build-runtime='))?.slice('--preview-build-runtime='.length)
if (previewMode === 'build' && !previewBuildRuntime) throw new Error('开发预览构建必须指定独立运行时目录，已停止部署。')
if (previewMode !== 'build' && previewBuildRuntime) throw new Error('独立运行时参数仅允许与 --dev-preview=build 一起使用。')
const runtime = backendRuntime || (previewMode === 'build'
  ? resolve(previewBuildRuntime, 'resources/app')
  : resolve(source, "../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app"))
if (previewMode === 'build') {
  const previewRoot = resolve(previewBuildRuntime)
  const portableRoot = resolve(source, '../AI-OS-Portable-1.0.5-win-x64')
  const isWithin = (base, target) => {
    const rel = relativePath(base, target)
    return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)
  }
  if (isWithin(portableRoot, previewRoot) || isWithin(previewRoot, portableRoot)) throw new Error('开发预览构建目录不能与原工作台安装重叠。')
  for (const required of ['desktop-shell.js', 'script.js', 'server.js', 'package.json']) {
    if (!existsSync(join(runtime, required))) throw new Error(`开发预览构建目录缺少 ${required}，已停止部署。`)
  }
}
const selectedComponents = process.argv.slice(2).find(argument => argument.startsWith('--components=')) || (dailyMode ? '--components=workbench-frontend' : undefined)
if (previewMode === 'build' && !selectedComponents) throw new Error('开发预览仅允许显式白名单组件组装；禁止重跑旧的全量部署。')
if (selectedComponents) {
  const { deployComponents } = await import('./component-deploy.mjs')
  const verifyOnly = process.argv.includes('--verify-components')
  const result = await deployComponents({ source, runtime, names: selectedComponents.slice('--components='.length).split(','), build: !verifyOnly, verifyOnly, transforms: {
    "desktop-shell.js": text => {
      let shell = patchDesktopShell(text.replaceAll("AI OS", "BenDo"))
      if (!shell.includes("openInlineApp: showInlineApp")) {
        if (!shell.includes("setSession: activateSession,")) throw new Error("桌面品牌入口缺少宿主桥接锚点，已停止部署。")
        shell = shell.replace("setSession: activateSession,", "openInlineApp: showInlineApp,\n    setSession: activateSession,")
      }
      return shell
    },
    "server-components/composition.js": text => backendMode ? patchQwenTtsComposition(text) : patchQwenTtsComposition(patchMediaLifecycleComposition(patchAssetComposition(patchQwenImage21Composition(patchAudioServerComposition(text)))), {
      enabled: selectedComponents.slice('--components='.length).split(',').includes('qwen-tts-backend')
        || ['qwen-tts-task-service.cjs', 'qwen-tts-reference.cjs', 'workflows/qwen-tts-three-in-one.json'].every(file => existsSync(join(runtime, file))),
    }),
    "server.js": text => patchAssetServer(text.replaceAll("\r\n", "\n")),
  } })
  if (verifyOnly && result.changed.length) throw new Error('发布资源与当前源码不一致：' + result.changed.join(', '))
  const previewVersion = process.argv.find(argument => argument.startsWith('--preview-version='))?.slice('--preview-version='.length)
  if (previewVersion) {
    if (previewMode !== 'build' || !/^\d+\.\d+\.\d+$/.test(previewVersion)) throw new Error('预览版本仅允许用于独立运行时。')
    const A = createRequire(import.meta.url)('../release-tools/portable-baseline.cjs')
    const pkgFile = join(runtime,'package.json'), manifestFile = join(runtime,'ai-os-components.json')
    const backup = resolve(source,'../.design/deploy-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-preview-identity')
    mkdirSync(backup,{recursive:true})
    for (const name of ['package.json','ai-os-components.json']) if (existsSync(join(runtime,name))) copyFileSync(join(runtime,name),join(backup,name))
    const pkg = JSON.parse(readFileSync(pkgFile,'utf8'));pkg.version=previewVersion;writeFileSync(pkgFile,JSON.stringify(pkg,null,2)+'\n')
    const manifest = JSON.parse(readFileSync(manifestFile,'utf8'))
    manifest.version=previewVersion;manifest.runtime=previewVersion+'-win-x64';manifest.developmentPreview=true
    manifest.components=A.componentRecords(A.records(runtime).filter(file=>file.path!=='ai-os-components.json'),previewVersion)
    manifest.runtimeFiles=A.records(resolve(runtime,'../..')).filter(file=>file.path!=='resources/app/ai-os-components.json')
    writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n')
    result.previewVersion=previewVersion;result.identityBackup=backup
  }
  if (backendMode) Object.assign(result, { runtime, restartRequired: true, message: '后端文件已备份更新；正常退出并重开原 AI OS 后生效，刷新开发入口不能加载新后端。' })
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}
if (!existsSync(join(runtime, "desktop-shell.js"))) throw new Error("目标运行时不存在，已停止部署。")
// Validate onboarding patch locations before writing any runtime files.
const onboardingAuth = patchAuthService(readFileSync(join(runtime, "auth-service.js"), "utf8"))
const onboardingShell = patchDesktopShell(readFileSync(join(runtime, "desktop-shell.js"), "utf8"))
const compositionPath = join(runtime, "server-components/composition.js")
const audioComposition = patchQwenTtsComposition(patchMediaLifecycleComposition(patchAssetComposition(patchQwenImage21Composition(
  patchAudioServerComposition(readFileSync(compositionPath, "utf8")),
))))
const componentManifestPath = join(runtime, "server-components/manifest.js")
const componentManifest = patchAssetManifest(readFileSync(componentManifestPath, "utf8"))
const serverPath = join(runtime, "server.js")
const assetServer = patchAssetServer(readFileSync(serverPath, "utf8").replaceAll("\r\n", "\n"))
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
copyFileSync(join(runtime, "auth-service.js"), join(backupDir, "auth-service.js"))
writeFileSync(join(runtime, "auth-service.js"), onboardingAuth, "utf8")
copyFileSync(join(runtime, "static-http-api.js"), join(backupDir, "static-http-api.js"))
for (const file of ["desktop/main.js", "desktop/startup.html", "startup-overlay.css", "desktop-shell.js", "script.js", "neon-page-rebuild.css", "neon-auth.css", "neon-canvas-surface.css", "node-action-bar.js", "flora-node-shell.css", "flora-node-shell.js", "flora-generator-composer.js", "flora-generator-parameters.js", "flora-generation-history.js", "flora-generation-history.css", "canvas-audio-generator.js", "canvas-audio-generator.css", "server-components/composition.js", "image-model-picker.js", "module-manifest.js", "canvas-image-toolbar.js", "index.html", "neon-workbench.html", "neon-workbench.js", "neon-workbench.css", "neon-host-bridge.js"]) {
  const target = join(runtime, file)
  if (existsSync(target)) {
    mkdirSync(dirname(join(backupDir, file)), { recursive: true })
    copyFileSync(target, join(backupDir, file))
  }
}
copyFileSync(join(source, "design-sources/static-http-api.cjs"), join(runtime, "static-http-api.js"))
writeFileSync(join(runtime, "desktop/startup.html"), compileStartupHtml(source), "utf8")
copyFileSync(join(source, "design-sources/startup-overlay.css"), join(runtime, "startup-overlay.css"))
writeFileSync(desktopMainPath, desktopMain, "utf8")
copyFileSync(join(source, "dist/workbench.js"), join(runtime, "neon-workbench.js"))
copyFileSync(join(source, "dist/neon-workbench.css"), join(runtime, "neon-workbench.css"))
copyFileSync(join(source, "host-bridge.js"), join(runtime, "neon-host-bridge.js"))
const providerApiTarget = join(runtime, "provider-http-api.js")
copyFileSync(providerApiTarget, join(backupDir, "provider-http-api.js"))
copyFileSync(join(source, "design-sources/provider-http-api.js"), providerApiTarget)
for (const moduleName of ["qwen-tts-task-service.cjs", "qwen-tts-reference.cjs", "chat-http-api.js", "provider-test-result.js", "provider-protocol-engine.js", "media-protocol-adapters.js", "midjourney-parameter-rules.js", "flora-midjourney-settings.js", "provider-protocol-registry.js", "provider-model-rules.js", "audio-output-persistence.js", "ace-step-task-service.cjs", "minimax-h3-workflow.js", "minimax-h3-task-service.js", "comfyui-client.js", "canvas-h3-node-renderer.js", "canvas-text-node-renderer.js", "canvas-comfy-node-renderer.js", "comfy-workflow-task-service.js", "media-generation-http-api.js", "background-removal-ui.js", "background-removal-service.js", "canvas-feature-registry.js", ...readdirSync(join(source, "design-sources/canvas-features")).filter(name => name.endsWith('.js')).map(name => `canvas-features/${name}`)]) {
  const target = join(runtime, moduleName)
  mkdirSync(dirname(target), { recursive: true })
  mkdirSync(dirname(join(backupDir, moduleName)), { recursive: true })
  if (existsSync(target)) copyFileSync(target, join(backupDir, moduleName))
  copyFileSync(join(source, "design-sources", moduleName), target)
}
for (const file of ["flora-text-tools.js", "canvas-file-import.js", "canvas-document-reader.js", "canvas-pdf-worker.js", "canvas-asset-library.js"]) {
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
  "ace-step-music.json",
  "qwen-tts-three-in-one.json",
]) {
  const workflowSource = join(source, "design-sources/workflows", fileName)
  if (!existsSync(workflowSource)) continue
  const destinations = ["ace-step-music.json", "qwen-tts-three-in-one.json"].includes(fileName)
    ? [[`workflows/${fileName}`, join(runtime, "workflows", fileName)]]
    : [
      [`workflows/${fileName}`, join(runtime, "workflows", fileName)],
      [`data-workflows/${fileName}`, join(portableRoot, "data/workflows", fileName)],
    ];
  for (const [backupName, target] of destinations) {
    // 运行时发货模板可升级；用户已存在的data工作流由用户管理，组件升级不能覆盖。
    if (backupName.startsWith("data-workflows/") && (previewMode === 'build' || existsSync(target))) continue
    if (existsSync(target)) {
      mkdirSync(dirname(join(backupDir, backupName)), { recursive: true })
      copyFileSync(target, join(backupDir, backupName))
    }
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(workflowSource, target)
  }
}
writeFileSync(compositionPath, audioComposition, "utf8")
copyFileSync(componentManifestPath, join(backupDir, "server-components/manifest.js"))
writeFileSync(componentManifestPath, componentManifest, "utf8")
copyFileSync(serverPath, join(backupDir, "server.js"))
writeFileSync(serverPath, assetServer, "utf8")
for (const file of ["system-db.js", "resource-access.js", "resource-http-api.js", "curated-asset-service.js", "curated-asset-http-api.js", "canvas-project-service.js", "canvas-project-http-api.js", "project-share-access.js", "canvas-media-lifecycle.js", "canvas-media-gc-service.js", "canvas-media-references.js", "canvas-legacy-migrator.js", "image-thumbnail-store.js", "history-http-api.js"]) {
  if (existsSync(join(runtime, file))) copyFileSync(join(runtime, file), join(backupDir, file))
  copyFileSync(join(source, "design-sources", file), join(runtime, file))
}
for (const file of ["flora-generation-history.js", "flora-generation-history.css", "canvas-audio-generator.js", "canvas-audio-generator.css"]) copyFileSync(join(source, "design-sources", file), join(runtime, file))
// Board label storage is a versioned host extension. Back up every target
// before copying; the running worker is left alive until the user reopens.
for (const file of ["canvas-node-visuals.js", "canvas-node-tag-rules.js", "flora-node-tags.js", "flora-node-tags.css", "flora-connection-interaction.js", "canvas-schema.js", "canvas-db-worker.js", "canvas-storage-http-api.js", "canvas-scene-rules.js", "canvas-scene-layer.js", "canvas-virtualizer.js", "canvas-representation-manager.js", "canvas-representation-host.js"]) {
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
writeFileSync(manifestPath, readFileSync(manifestPath, "utf8")
  .replace(/(?:script|canvas-h3-node-renderer|canvas-text-node-renderer|canvas-comfy-node-renderer)\.js\?v=[^"']*/g,
    match => `${match.split("?")[0]}?v=20261015-cutout-fallback`), "utf8")
if (existsSync(sourceScript)) {
  let canonicalScript = readFileSync(sourceScript, "utf8")
  if (!canonicalScript.includes("saveForNavigation: async function")) {
    canonicalScript = canonicalScript.replace("window.CanvasWorkspace = {", `window.CanvasWorkspace = {\n  saveForNavigation: async function () {\n    if (canvasState.isRestoring || canvasState.boardOpening) throw new Error("画布正在恢复，请完成后重试。");\n    await saveCanvasBoardNow();\n    if (canvasPagedStore.getPendingOperations().length || canvasState.hasUnsavedChanges) {\n      throw new Error("画布尚未保存成功，请重试后再返回。");\n    }\n  },`)
  }
  canonicalScript += "\n" + readFileSync(join(source, "design-sources/canvas-script-production.js"), "utf8")
  canonicalScript += "\n" + readFileSync(join(source, "design-sources/canvas-asset-entry.js"), "utf8")
  writeFileSync(join(runtime, "script.js"), canonicalScript, "utf8")
}
// Four preparation-only content Skills join the existing host registry.
for (const entry of readdirSync(join(source, "design-sources/script-production-skills"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const target = join(runtime, "skills", entry.name)
  if (existsSync(target)) copyDirectory(target, join(backupDir, "skills", entry.name))
  copyDirectory(join(source, "design-sources/script-production-skills", entry.name), target)
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
let shell = onboardingShell
if (!shell.includes("openInlineApp: showInlineApp")) {
  if (!existsSync(join(source, "design-sources/desktop-shell-before-bridge.js"))) writeFileSync(join(source, "design-sources/desktop-shell-before-bridge.js"), shell)
  shell = shell.replace("setSession: activateSession,", "openInlineApp: showInlineApp,\n    setSession: activateSession,")
}
writeFileSync(shellPath, shell, "utf8")
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
// The host shows this page as a full-window iframe with a near-black backdrop,
// so a page that fails to boot looks like a dead black window with no way out.
// Ship a static Chinese fallback that reports the real reason and offers a reload.
writeFileSync(join(runtime, "neon-workbench.html"), `<!doctype html>
<html lang="zh-CN" class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI OS 工作台</title><link rel="stylesheet" href="./neon-workbench.css?v=20261008-node-tags">
<style>
  #neonBootFallback { display: none; position: fixed; inset: 0; z-index: 10; padding: clamp(16px, 4vw, 48px); overflow: auto; color: var(--foreground); background: var(--background); font-family: var(--font-sans, system-ui), "Microsoft YaHei", sans-serif; font-size: 14px; line-height: 1.75; }
  #neonBootFallback[data-visible="true"] { display: block; }
  #neonBootFallback h1 { margin: 0 0 12px; font-size: 20px; }
  #neonBootFallback p { margin: 0 0 16px; max-width: 46rem; color: var(--muted-foreground); }
  #neonBootFallback .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  #neonBootFallback button { min-height: 44px; border: 1px solid transparent; border-radius: var(--radius-pill); padding: 8px 20px; font: inherit; font-weight: 500; background: var(--primary); color: var(--primary-foreground); cursor: pointer; }
  #neonBootFallback button.secondary { background: var(--secondary); color: var(--secondary-foreground); border-color: var(--border); }
  #neonBootFallback button:hover { filter: brightness(1.08); }
  #neonBootFallback button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  #neonBootFallback pre { margin: 20px 0 0; max-width: 52rem; max-height: 180px; overflow: auto; border-radius: var(--radius); border: 1px solid var(--border); background: var(--card); color: var(--muted-foreground); padding: 12px 16px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
</head><body><div id="root"></div>
<div id="neonBootFallback" role="alert">
  <h1>工作台没有正常显示</h1>
  <p>工作台页面加载失败。可以重新加载当前页，或返回工作台概览后再打开需要的功能。如果仍然无法显示，请重新打开 AI OS，并记录下方错误信息。</p>
  <div class="actions">
  <button type="button" id="neonBootReload">重新加载工作台</button>
  <button type="button" class="secondary" id="neonBootDesktop">返回工作台概览</button>
  </div>
  <pre id="neonBootDetail" hidden></pre>
</div>
<script>
(function () {
  var root = document.getElementById("root");
  var fallback = document.getElementById("neonBootFallback");
  var detail = document.getElementById("neonBootDetail");
  var shown = false;
  // 启动兜底页只负责"工作台没起来"这一种情况。工作台一旦挂载过，
  // 后续任何错误（含渲染错误）都不再接管整页，避免把已经能用的界面
  // 换成一个写着错误码的黑页面。
  var everBooted = false;
  function booted() { return Boolean(root && root.childElementCount > 0); }
  function mounted() { everBooted = everBooted || booted(); return everBooted; }
  function show(reason) {
    if (shown || mounted()) return;
    shown = true;
    if (reason) { detail.hidden = false; detail.textContent = String(reason).slice(0, 600); }
    fallback.dataset.visible = "true";
    // 应用稍后恢复时不要让提示压在工作台上。
    setInterval(function () { if (booted()) fallback.dataset.visible = "false"; }, 1000);
  }
  window.addEventListener("error", function (event) { show((event && (event.message || (event.error && event.error.message))) || "页面脚本执行失败"); });
  window.addEventListener("unhandledrejection", function (event) { show((event && event.reason && (event.reason.message || event.reason)) || "页面脚本异常中断"); });
  var waited = 0;
  var timer = setInterval(function () {
    if (booted()) { clearInterval(timer); mounted(); return; }
    waited += 500;
    if (waited >= 12000) { clearInterval(timer); show("工作台脚本没有在 12 秒内启动，可能是文件缺失或缓存不一致。"); }
  }, 500);
  document.getElementById("neonBootReload").addEventListener("click", function () { location.reload(); });
  document.getElementById("neonBootDesktop").addEventListener("click", function () {
    if (window.parent === window) { location.replace("./neon-workbench.html?recovery=" + Date.now() + "#home"); return; }
    try { window.parent.postMessage({ type: "neon:action", action: "workbenchHome" }, location.origin); } catch (error) { location.replace("./neon-workbench.html#home"); }
  });
})();
</script>
<script src="./neon-workbench.js?v=20261008-node-tags"></script></body></html>`, "utf8")
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
  .replace(/<script src="\.\/(?:canvas-feature-registry|canvas-features\/[\w-]+)\.js[^"]*"><\/script>/g, "")
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
  // 视频素材节点：外置标题避让标签按钮，贴边媒体不再显示"已就绪"状态带，
  // 壳体与标签样式要一起换版本，否则宿主继续命中旧缓存。
  .replace(/flora-node-(?:shell|tags)\.css\?v=[^"]*/g, match => `${match.split("?")[0]}?v=20261013-media-node-chrome`)
  // 素材上传按节点出图（不再合成素材合集）：脚本本体一起换版本。
  .replace(/script\.js\?v=[^"]*/g, match => `${match.split("?")[0]}?v=20261013-material-per-node`)
  // 聊天历史标题按纯文本写入、工作台历史页容错：脚本与标签样式一起换版本。
  .replace(/script\.js(\?v=[^"]*)?/g, match => `${match.split("?")[0]}?v=20261013-history-text`)
  .replace(/flora-node-(?:shell|tags)\.css\?v=[^"]*/g, match => `${match.split("?")[0]}?v=20261013-history-text`)
html = html.replace(/(?:script|flora-node-shell|flora-generator-composer|flora-connection-interaction|neon-canvas-surface|background-removal-ui)\.(?:js|css)\?v=[^"']*/g,
  match => `${match.split("?")[0]}?v=20261015-group-hover`)
html = html.replace(/flora-connection-interaction\.js\?v=[^"']*/g, 'flora-connection-interaction.js?v=20261015-port-passage')
// 任务隔离、节点功能注册和壳体可用性一起更新；插件入口分别发货。
html = html.replace(/(?:script\.js|flora-node-shell\.(?:js|css)|background-removal-ui\.js)\?v=[^"']*/g, match => `${match.split('?')[0]}?v=20261015-feature-isolation`)
const featureScripts = ['canvas-feature-registry.js', ...readdirSync(join(source, 'design-sources/canvas-features')).filter(name => name.endsWith('.js')).map(name => `canvas-features/${name}`)]
html = html.replace('<script src="./module-manifest.js', featureScripts.map(file => `<script src="./${file}?v=20261015-feature-isolation"></script>`).join('\n') + '\n<script src="./module-manifest.js')
html = html.replace(/<script src="\.\/canvas-representation-(?:manager|host)\.js[^\"]*"><\/script>\s*/g, '')
// module-loader may request script.js before the final literal script tag.
// Representation constructors must exist before either loading path starts.
const representationAnchor = html.match(/<script\b[^>]*src=["'][^"']*(?:module-loader|script)\.js[^"']*["'][^>]*>/)?.[0]
if (!representationAnchor) throw new Error("表示层模块缺少加载锚点，已停止部署。")
html = html.replace(representationAnchor, `<script src="./canvas-node-visuals.js?v=20261016-content-intent"></script>\n<script src="./canvas-representation-manager.js?v=20261016-content-intent"></script>\n<script src="./canvas-representation-host.js?v=20261016-content-intent"></script>\n${representationAnchor}`)
html = html.replace(/(?:script\.js|flora-node-shell\.(?:js|css)|flora-connection-interaction\.js|canvas-text-node-renderer\.js|canvas-scene-layer\.js|canvas-virtualizer\.js)\?v=[^"']*/g, match => `${match.split('?')[0]}?v=20261016-dom-scaling-p3-final`)
writeFileSync(manifestPath, readFileSync(manifestPath, 'utf8')
  .replace(/(?:script|canvas-text-node-renderer|canvas-scene-layer|canvas-virtualizer)\.js\?v=[^"']*/g, match => `${match.split('?')[0]}?v=20261016-dom-scaling-p3-final`), 'utf8')
writeFileSync(indexPath, html, "utf8")
console.log("新工作台已部署为独立同源页面，宿主未加载新工作台的全局样式。")

