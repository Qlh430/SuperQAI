const { chromium } = require("playwright")
const fs = require("node:fs")
const path = require("node:path")
let browser
;(async () => {
  browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  const host = "http://127.0.0.1:3199/bridge-qa.html"
  await page.route(host, route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="aiOsDesktop" hidden></div><div id="canvasView">模拟画布引擎</div></body></html>' }))
  await page.route("**/neon-workbench.html*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><head><meta charset='UTF-8'></head><body>模拟新工作台 iframe</body></html>" }))
  await page.route("**/api/canvas/boards*", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ boards: [{ id: "b1", resourceId: "r1" }] }) }))
  await page.goto(host)
  await page.evaluate(() => {
    window.__session = null; window.__opened = []; window.__saveFails = false
    window.AiOsDesktop = { getSession: () => window.__session, openInlineApp: async () => {} }
    window.AiOsModuleLoader = { ensure: async () => ({ ok: true }) }
    window.AiOsLegacyWorkbench = { getView: () => document.getElementById("canvasView") }
    window.CanvasWorkspace = { saveForNavigation: async () => { if (window.__saveFails) throw new Error("模拟保存失败") }, openBoardByResourceId: async id => { window.__opened.push(id); return true } }
  })
  await page.addScriptTag({ url: "http://127.0.0.1:3199/neon-host-bridge.js" })
  if (await page.locator("#aiOsNeonFrame").count()) throw new Error("未登录时创建了工作台 iframe")
  await page.evaluate(() => { window.__session = { user: { id: "mock-qa" } }; document.getElementById("aiOsDesktop").hidden = false; window.dispatchEvent(new Event("ai-os-session")) })
  await page.locator("#aiOsNeonFrame").waitFor()
  const frame = page.frames().find(frame => frame.url().includes("neon-workbench.html"))
  if (!frame) throw new Error("未创建独立工作台")
  await page.evaluate(() => window.postMessage({ type: "neon:action", action: "canvas", params: { boardId: "b1" } }, location.origin))
  await page.waitForTimeout(50)
  if ((await page.evaluate(() => window.__opened)).length) throw new Error("接受了未授权消息来源")
  await frame.evaluate(() => parent.postMessage({ type: "neon:action", action: "canvas", params: { boardId: "b1" } }, location.origin))
  await page.getByText("模拟画布引擎").waitFor()
  if ((await page.evaluate(() => window.__opened))[0] !== "r1") throw new Error("画布标识转换错误")
  await page.evaluate(() => { window.__saveFails = true })
  await page.getByRole("button", { name: "保存并返回工作台" }).click()
  await page.getByText("保存失败，点击重试返回").waitFor()
  if (!(await page.locator("#aiOsNeonFrame").evaluate(element => element.hidden))) throw new Error("保存失败仍然返回")
  await page.evaluate(() => { window.__saveFails = false })
  await page.getByRole("button", { name: "保存并返回工作台" }).click()
  await page.locator("#aiOsNeonFrame").waitFor({ state: "visible" })
  await page.evaluate(() => { window.__session = null; document.getElementById("aiOsDesktop").hidden = true })
  await page.locator("#aiOsNeonFrame").waitFor({ state: "detached" })
  if (!await page.locator("#canvasView").count()) throw new Error("退出会话销毁画布引擎DOM")
  await page.evaluate(() => {
    window.__session = { user: { id: "mock-qa-2" } }
    document.getElementById("aiOsDesktop").hidden = false
    window.AiOsModuleLoader.ensure = () => new Promise(resolve => { window.__resolveModule = resolve })
    window.dispatchEvent(new Event("ai-os-session"))
  })
  await page.locator("#aiOsNeonFrame").waitFor()
  await page.waitForFunction(() => document.getElementById("aiOsNeonFrame")?.contentWindow?.location.pathname.includes("neon-workbench.html"))
  const secondFrame = page.frames().find(frame => frame.url().includes("neon-workbench.html"))
  await secondFrame.evaluate(() => parent.postMessage({ type: "neon:action", action: "canvas", params: { boardId: "b1" } }, location.origin))
  await page.waitForFunction(() => Boolean(window.__resolveModule))
  await page.evaluate(() => {
    window.__session = { user: { id: "mock-qa-3" } }
    window.dispatchEvent(new Event("ai-os-session"))
    window.__resolveModule({ ok: true })
    window.AiOsModuleLoader.ensure = async () => ({ ok: true })
  })
  await page.waitForTimeout(80)
  if (await page.locator("#neonEngineSurface").count()) throw new Error("旧会话异步加载仍打开画布")
  await page.waitForFunction(() => document.getElementById("aiOsNeonFrame")?.contentWindow?.location.pathname.includes("neon-workbench.html"))
  const thirdFrame = page.frames().find(frame => frame.url().includes("neon-workbench.html"))
  await thirdFrame.waitForLoadState()
  await thirdFrame.evaluate(() => parent.postMessage({ type: "neon:action", action: "canvas", params: { boardId: "b1" } }, location.origin))
  await page.getByRole("button", { name: "保存并返回工作台" }).waitFor()
  if (await page.getByRole("button", { name: "保存并返回工作台" }).innerText() !== "返回工作台") throw new Error("画布再次打开残留保存错误提示")
  await page.evaluate(() => { window.CanvasWorkspace.saveForNavigation = () => new Promise(resolve => { window.__resolveSave = resolve }) })
  await page.getByRole("button", { name: "保存并返回工作台" }).click()
  await page.waitForFunction(() => Boolean(window.__resolveSave))
  await page.evaluate(() => {
    window.__session = null
    document.getElementById("aiOsDesktop").hidden = true
    window.dispatchEvent(new Event("ai-os-session"))
    window.__resolveSave()
  })
  await page.locator("#aiOsNeonFrame").waitFor({ state: "detached" })
  await page.waitForTimeout(80)
  if (!await page.locator("#canvasView").count() || await page.locator("#neonEngineSurface").count()) throw new Error("保存中退出会话清理不完整")
  const report = { evidence: "宿主与引擎均为模拟环境，未访问真实账户或修改真实画布", checks: ["未登录不挂载", "来源验证", "boardId 转 resourceId", "进入画布", "保存失败阻止返回", "保存成功返回", "退出会话卸载", "退出保留引擎DOM", "异步加载中换账户终止旧操作", "再次打开重置返回提示", "保存中退出安全清理"], errors }
  fs.writeFileSync(path.join(__dirname, "acceptance/bridge-report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await browser.close()
  if (errors.length) process.exitCode = 1
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1 })

