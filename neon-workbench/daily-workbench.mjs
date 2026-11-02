import fs from 'node:fs'
import path from 'node:path'
import { componentTargets } from './component-deploy.mjs'

// Reuse existing frontend groups; groups containing Node/backend code stay out.
const frontendGroups = [
  'workbench-frontend', 'canvas-light-visual', 'canvas-text-scroll', 'canvas-fullscreen-original-preview', 'generator-empty-placeholder',
  'audio-node-appearance', 'canvas-media-stability', 'canvas-asset-library', 'canvas-group-visual',
  'canvas-final-adjustments', 'canvas-redraw-frontend', 'startup-gate', 'brand-display',
  ...['tool-crop', 'tool-outpaint', 'tool-angle', 'tool-upscale', 'node-image',
    'node-video', 'node-audio', 'node-text', 'node-note', 'node-script', 'node-upload'],
]
const entries = ['index.html', 'module-manifest.js', 'neon-workbench.html']
const frontendFiles = new Set([...entries, ...componentTargets(frontendGroups)])

export function dailyComponents(value = 'workbench-frontend') {
  const names = value.split(',')
  if (!names.length || names.some(name => !frontendGroups.includes(name))) throw new Error('日常开发只允许已有前端白名单组件；后端及桌面改动请单独处理。')
  return [...new Set(names)]
}

export function dailyPaths(source) {
  const project = path.resolve(source, '..')
  const stage = path.resolve(project, '../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1')
  return { stage, runtime: path.join(stage, 'resources/app'), portable: path.join(project, 'AI-OS-Portable-1.0.5-win-x64') }
}

function safeFile(root, relative, required = true) {
  const target = path.resolve(root, relative)
  const rel = path.relative(root, target)
  if (path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep)) throw new Error('开发文件超出固定目录。')
  let cursor = path.parse(target).root
  for (const part of target.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part)
    let info
    try { info = fs.lstatSync(cursor) }
    catch (error) { if (error.code === 'ENOENT' && !required) return target; throw error }
    if (info.isSymbolicLink()) throw new Error(`开发路径不能含目录联接或符号链接：${cursor}`)
    if (cursor !== target && !info.isDirectory()) throw new Error('开发路径的父目录类型无效。')
    if (cursor === target && (!info.isFile() || info.nlink !== 1)) throw new Error(`开发文件不是独占普通文件（硬链接/共享文件禁止更新）：${cursor}`)
  }
  return target
}

export function assertDailyTarget(source, target, names = dailyComponents()) {
  const expected = dailyPaths(source)
  if (path.resolve(target) !== expected.stage) throw new Error('日常开发只允许固定独立 stage 目录，禁止写入候选、源码或用户数据。')
  dailyComponents(names.join(','))
  for (const file of ['desktop-shell.js', 'script.js', 'server.js', 'package.json', ...entries]) safeFile(expected.runtime, file)
  for (const file of frontendFiles) safeFile(expected.runtime, file, false)
  for (const file of componentTargets(names)) safeFile(expected.runtime, file, false)
  return expected
}

export async function runningBackend(source) {
  const { portable } = dailyPaths(source)
  const diagnostic = JSON.parse(fs.readFileSync(path.join(portable, 'data/.logs/runtime-diagnostics.json'), 'utf8'))
  const active = fs.readFileSync(path.join(portable, '.ai-runtime/.active-runtime'), 'utf8').trim()
  const expectedApp = path.join(portable, '.ai-runtime/versions', active, 'resources/app')
  if (path.resolve(diagnostic.appRoot) !== expectedApp || path.resolve(diagnostic.dataDirectory) !== path.join(portable, 'data')) throw new Error('正在运行的 AI OS 与当前活动版/原数据目录不一致，停止开发入口。')
  const url = new URL(diagnostic.localUrl)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password) throw new Error('原 AI OS 服务地址无效。')
  if (url.port === '33200') throw new Error('原服务占用了开发入口端口，请先处理端口冲突。')
  let readiness
  try {
    process.kill(diagnostic.pid, 0)
    process.kill(diagnostic.serverPid, 0)
    const response = await fetch(new URL('/api/system/ready', url), { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('服务尚未就绪')
    readiness = await response.json()
  } catch (error) { throw new Error(`请先正常打开原 AI OS.exe，开发入口只连接其已有后端：${error.message}`) }
  if (readiness.ok !== true || readiness.pid !== diagnostic.serverPid) throw new Error('原服务 PID 与运行诊断不一致，停止开发入口。')
  return url.origin
}

// Static frontend overlay only. Everything else, including auth/output/ranges/SSE/WS,
// passes through Vite's existing HTTP proxy to the one desktop-owned backend.
export function dailyViteConfig({ source, runtime, upstream, port = 33200 }) {
  return {
    configFile: false, root: source, publicDir: false, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'ai-os-fixed-frontend',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          let file
          try { file = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).slice(1) || 'index.html' }
          catch { res.writeHead(400); res.end('开发资源路径无效。'); return }
          if (!frontendFiles.has(file)) return next()
          if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
          try {
            const bytes = fs.readFileSync(safeFile(runtime, file))
            const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)]
            res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store, max-age=0', 'Content-Length': bytes.length, 'X-AI-OS-Frontend': 'fixed-stage' })
            res.end(req.method === 'HEAD' ? undefined : bytes)
          } catch { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('固定开发资源缺失或安全检查失败，请检查开发目录；未回退到旧资源。') }
        })
      },
    }],
    server: {
      host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null,
      proxy: { '/': { target: upstream, changeOrigin: true, ws: true } },
    },
  }
}
