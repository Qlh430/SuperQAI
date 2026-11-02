import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { runningBackend } from './daily-workbench.mjs'

const address = 'http://127.0.0.1:33200/'
function isListening() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 33200 })
    socket.setTimeout(1500)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', error => { socket.destroy(); error.code === 'ECONNREFUSED' ? resolve(false) : reject(error) })
    socket.once('timeout', () => { socket.destroy(); reject(new Error('检查开发入口超时，请稍后重试。')) })
  })
}

export async function openDailyWorkbench({ upstream, listening = isListening,
  request = url => fetch(url, { signal: AbortSignal.timeout(5000) }), open, start } = {}) {
  if (!await listening()) { await start(); return 'started' }
  const page = await request(address)
  const ours = page.ok && page.headers.get('x-ai-os-frontend') === 'fixed-stage'
  await page.body?.cancel()
  if (!ours) throw new Error('33200 被其他程序占用，请先确认该程序；未停止任何进程。')
  const [existing, original] = await Promise.all([request(address + 'api/system/ready'), request(upstream + '/api/system/ready')])
  if (!existing.ok || !original.ok) throw new Error('已有开发入口的后端不可用，请关闭其命令窗口后重新打开。')
  const [a, b] = await Promise.all([existing.json(), original.json()])
  if (a.ok !== true || b.ok !== true || !Number.isInteger(b.pid) || a.pid !== b.pid) throw new Error('已有开发入口与原 AI OS 后端不一致，请关闭其命令窗口后重新打开。')
  await open()
  return 'reused'
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const source = path.dirname(fileURLToPath(import.meta.url))
    const upstream = await runningBackend(source)
    const result = await openDailyWorkbench({ upstream,
      open: () => new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${address}'`], { windowsHide: true, stdio: 'ignore' })
        child.once('error', reject)
        child.once('close', code => code === 0 ? resolve() : reject(new Error(`浏览器打开失败，请手动打开 ${address}`)))
      }),
      start: () => {
        const child = spawn(process.execPath, [path.join(source, 'node_modules/vite/bin/vite.js'), '--configLoader', 'native', '--mode', 'daily', '--open'], { cwd: source, stdio: 'inherit', windowsHide: true })
        child.once('error', error => { console.error(error.message); process.exitCode = 1 })
        child.once('close', code => { process.exitCode = code ?? 1 })
      },
    })
    if (result === 'reused') console.log('开发工作台已在运行，已打开浏览器，无需重复启动。')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
