const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const net = require("node:net")
const { pathToFileURL } = require("node:url")
const { chromium, _electron: electron } = require("playwright")
const root = path.resolve(__dirname, "..")
const runtime = path.join(root, "AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64")
const output = path.join(root, ".design/startup-review-20261002")
fs.mkdirSync(output, { recursive: true })

function inspectStartup() {
  const css = element => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, image: style.backgroundImage }
  }
  const firstFrame = window.__startupFirstFrame
  return {
    url: location.href,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    body: css(document.body),
    mark: css(document.querySelector(".mark")),
    progress: css(document.querySelector("#progress")),
    scrollWidth: document.documentElement.scrollWidth,
    width: innerWidth,
    firstFrame,
  }
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

let browser, app
;(async () => {
  const errors = [], views = []
  browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" })
  const page = await browser.newPage({ colorScheme: "light" })
  page.on("pageerror", error => errors.push(error.message))
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      const style = getComputedStyle(document.body)
      window.__startupFirstFrame = { background: style.backgroundColor, image: style.backgroundImage }
    })
  })
  for (const width of [390, 486, 768, 1440, 1728]) {
    await page.setViewportSize({ width, height: width === 486 ? 326 : 900 })
    await page.goto(pathToFileURL(path.join(runtime, "resources/app/desktop/startup.html")).href)
    await page.waitForFunction(() => window.__startupFirstFrame)
    const view = await page.evaluate(inspectStartup)
    assert.equal(view.scheme, "dark", "系统浅色偏好不能改变桌面启动页")
    for (const key of ["body", "mark", "progress", "firstFrame"]) assert.equal(view[key].image, "none", `${width} 启动层 ${key} 仍有渐变`)
    assert.equal(view.firstFrame.background, view.body.background, "首次绘制与最终启动背景不同")
    assert.ok(view.scrollWidth <= width, `${width} 启动页横向溢出`)
    views.push(view)
    await page.screenshot({ path: path.join(output, `local-startup-${width}.png`) })
  }
  // Test the web gate without the later auth override: the base CSS itself
  // must be dark for pending, login and ready.
  const overlay = fs.readFileSync(path.join(runtime, "resources/app/startup-overlay.css"), "utf8")
  const host = fs.readFileSync(path.join(runtime, "resources/app/index.html"), "utf8")
  const gate = host.match(/<section class="ai-os-startup-gate"[\s\S]*?<\/section>/)?.[0]
  assert.ok(gate, "网页启动遮罩入口缺失")
  for (const state of ["pending", "login", "ready"]) {
    await page.setContent(`<!doctype html><html data-ai-auth="${state}"><head><style>${overlay}</style></head><body>${gate}</body></html>`)
    const style = await page.locator("#aiOsStartupGate").evaluate(element => ({ background: getComputedStyle(element).backgroundColor, image: getComputedStyle(element).backgroundImage }))
    assert.equal(style.image, "none", `${state} 网页启动遮罩仍有渐变`)
    assert.notEqual(style.background, "rgb(238, 243, 248)", "网页遮罩仍为旧浅色")
  }
  await browser.close()
  browser = null

  // Launch the actual packaged desktop executable with separate data and port.
  // The operator's running app, profile and login session remain independent.
  const isolatedRoot = fs.mkdtempSync(path.join(output, "native-portable-"))
  fs.writeFileSync(path.join(isolatedRoot, "ai-os-portable.json"), JSON.stringify({ product: "AI OS", portable: true, dataDirectory: "data" }))
  const port = await availablePort()
  app = await electron.launch({
    executablePath: path.join(runtime, "AI OS Runtime.exe"),
    args: ["--hidden", "--initialize"],
    env: { ...process.env, AI_OS_PORTABLE_ROOT: isolatedRoot, PORT: String(port) },
    timeout: 25000,
  })
  const splash = await app.firstWindow()
  splash.on("pageerror", error => errors.push(error.message))
  await splash.waitForFunction(() => document.querySelector("#status"))
  const nativeStartup = await splash.evaluate(inspectStartup)
  assert.ok(nativeStartup.url.endsWith("/desktop/startup.html"), "未检查桌面本地启动页")
  assert.equal(nativeStartup.scheme, "dark")
  for (const key of ["body", "mark", "progress"]) assert.equal(nativeStartup[key].image, "none", `原生启动 ${key} 仍有渐变`)
  const nativeWindows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ title: window.getTitle(), background: window.getBackgroundColor(), url: window.webContents.getURL() })))
  for (const window of nativeWindows) assert.equal(window.background.toLowerCase(), "#080a0e", "原生窗口首次填充仍为浅色")
  await splash.screenshot({ path: path.join(output, "native-startup.png") }).catch(error => {
    if (!splash.isClosed()) throw error
  })
  const main = app.windows().find(page => page !== splash) || await app.waitForEvent("window", { predicate: page => page !== splash, timeout: 20000 })
  main.on("pageerror", error => errors.push(error.message))
  await main.locator("#aiOsAuthGate").waitFor({ state: "visible" })
  await main.locator("#aiOsStartupGate").waitFor({ state: "hidden" })
  const mainWindow = await app.browserWindow(main)
  const mainBackground = await mainWindow.evaluate(window => window.getBackgroundColor())
  assert.equal(mainBackground.toLowerCase(), "#080a0e", "主窗口衔接仍为浅色")
  const login = await main.evaluate(() => ({ auth: document.documentElement.dataset.aiAuth, url: location.href }))
  assert.equal(login.auth, "login")
  await main.screenshot({ path: path.join(output, "native-login.png") })
  assert.deepEqual(errors, [])
  const report = { date: new Date().toISOString(), evidence: "真实打包桌面程序使用隔离数据目录和独立端口；验证本地启动与未登录入口，未执行真实账户登录。", views, nativeStartup, nativeWindows, mainBackground, login, errors }
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ widths: views.map(view => view.width), firstPaint: "纯色深色", nativeStartup, mainBackground, login, errors }, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (app) await app.close()
  if (browser) await browser.close()
})
