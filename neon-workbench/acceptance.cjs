const { chromium } = require("playwright")
const fs = require("node:fs")
const path = require("node:path")
const baseUrl = process.env.AI_OS_TEST_URL || "http://127.0.0.1:3199"
const output = path.join(__dirname, "acceptance")
fs.mkdirSync(output, { recursive: true })
const image = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#171817"/><circle cx="320" cy="240" r="100" fill="#D5FF40"/></svg>')
const user = { id: "qa", username: "qa", displayName: "验收账户", role: "superadmin", status: "active" }
const boards = [{ id: "b1", title: "新品视觉探索", projectId: "p1", resourceId: "r1", nodeCount: 6, updatedAt: "2026-09-30T08:00:00Z" }]
const projects = [{ id: "p1", name: "秋季新品", canvasCount: 1 }]
const records = { images: [{ id: "i1", prompt: "一张产品场景图片", model: "示例模型", createdAt: Date.now(), images: [{ src: image, savedUrl: image }] }], chat: [{ id: "c1", title: "讨论产品创意", model: "示例模型", updatedAt: Date.now(), messages: [{ role: "user", content: "讨论产品创意" }, { role: "assistant", content: "先明确目标用户和产品使用场景。" }] }] }
let requests = []
let resourcesFail = false
let creativeFail = false
let creativeDelay = false
let mockModels = [{ id: "mock-model", displayName: "验收示例模型" }]
function fixture(url, method, body) {
  if (url.pathname === "/api/auth/session") return { user, authenticated: true }
  if (url.pathname === "/api/preferences") return { preferences: { appearance: { theme: "neon", scale: 1, animations: "reduced" } } }
  if (url.pathname === "/api/canvas/projects") {
    if (method === "POST") projects.push({ id: "p2", name: body.name, canvasCount: 0 })
    return { projects }
  }
  if (url.pathname === "/api/canvas/boards") return { boards, trash: [{ id: "trash1", title: "已删除测试画布", nodeCount: 1 }] }
  if (url.pathname === "/api/resources") return { resources: [{ resource: { id: "r1", title: "参考图片", type: "image", ownerUserId: "qa" }, preview: { kind: "image", url: image }, access: { capabilities: { share: true, delete: true } } }] }
  if (url.pathname.startsWith("/api/history/")) {
    const type = url.pathname.endsWith("chat") ? "chat" : "images"
    if (method === "POST") records[type].unshift(body.record)
    return { records: records[type] }
  }
  if (["/api/models", "/api/image-models"].includes(url.pathname)) return { models: mockModels }
  if (url.pathname === "/api/images") return { model: "mock-model", data: [{ url: image, width: 640, height: 480 }] }
  if (url.pathname === "/api/chat") return { choices: [{ message: { content: "这是模拟接口返回的验收回复。" } }] }
  if (url.pathname === "/api/providers") {
    if (method === "POST") mockModels = body.models.map(model => ({ id: model.id, displayName: model.id }))
    return { providers: [{ id: "test", name: "示例连接", baseUrl: "https://example.invalid/v1", providerProtocol: "openai", enabled: true, models: mockModels }] }
  }
  if (url.pathname === "/api/admin/users") return { users: [user] }
  if (url.pathname === "/api/users/directory") return { users: [user] }
  if (url.pathname === "/api/providers/auto-fallback") return { enabled: true }
  if (url.pathname === "/api/providers/agent-settings") return { settings: { primary: { providerId: "test", modelId: "mock-model" }, candidates: [] }, models: [{ providerId: "test", modelId: "mock-model", modelName: "验收助手模型", providerName: "示例连接" }], unavailable: [] }
  if (url.pathname === "/api/skills" || url.pathname === "/api/skills/enabled") return { groups: [{ id: "tools", label: "创作能力", skills: [{ id: "image-edit", label: "图片编辑", description: "编辑与整理创作图片", enabled: true }] }] }
  if (url.pathname === "/api/comfyui/settings") return { config: { mode: "remote", baseUrl: "http://127.0.0.1:8188", port: 8188 }, runtime: { state: "stopped", message: "验收引擎已停止" } }
  if (url.pathname === "/api/system/backup/status") return { snapshots: [{ createdAt: "2026-09-30T08:00:00Z", sizeBytes: 1024 * 1024 }] }
  if (url.pathname === "/api/system/health") return { ok: true, version: "1.0.5", uptime: 120, port: 3199 }
  return {}
}
let browser
;(async () => {
  browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" })
  const results = [], errors = []
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on("pageerror", error => errors.push(error.message))
  await page.route("**/api/**", async route => {
    const request = route.request()
    let body = {}
    try { body = request.postDataJSON() || {} } catch {}
    requests.push({ path: new URL(request.url()).pathname, method: request.method() })
    if (["/api/images", "/api/chat"].includes(new URL(request.url()).pathname)) {
      if (creativeFail) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "模拟生成失败，请检查配置。" }) })
      if (creativeDelay) await new Promise(resolve => setTimeout(resolve, 5000))
    }
    if (resourcesFail && new URL(request.url()).pathname === "/api/resources") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "素材读取失败，请重试。" }) })
    } else await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture(new URL(request.url()), request.method(), body)) })
  })
  for (const width of [375, 390, 768, 1280, 1440, 1728]) {
    await page.setViewportSize({ width, height: 960 })
    for (const route of ["home", "projects", "assets", "history", "settings", "account", "image", "chat"]) {
      await page.goto(`${baseUrl}/neon-workbench.html#${route}`, { waitUntil: "domcontentloaded" })
      await page.locator("h1:visible").waitFor()
      await page.waitForTimeout(120)
      const geometry = await page.evaluate(() => {
        const bad = [...document.querySelectorAll("body *")].filter(e => {
          const r = e.getBoundingClientRect(), style = getComputedStyle(e)
          return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && (r.right > innerWidth + 2 || r.left < -2) && e.tagName !== "OPTION"
        }).slice(0, 6).map(e => ({ tag: e.tagName, text: e.textContent.slice(0, 40), right: e.getBoundingClientRect().right }))
        return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: bad }
      })
      results.push({ width, route, ...geometry })
      await page.screenshot({ path: path.join(output, `${width}-${route}.png`) })
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`${baseUrl}/neon-workbench.html#home`)
  await page.getByRole("button", { name: "新建项目", exact: true }).click()
  await page.getByRole("textbox", { name: "项目名称" }).fill("新建项目验收")
  await page.getByRole("button", { name: "创建项目", exact: true }).click()
  await page.getByRole("button", { name: "重命名项目 新建项目验收", exact: true }).waitFor()
  await page.getByRole("tab", { name: "回收站" }).click()
  await page.getByText("已删除测试画布", { exact: true }).waitFor()
  await page.goto(`${baseUrl}/neon-workbench.html#image`)
  await page.getByRole("textbox").fill("验收生图提示词")
  await page.getByRole("button", { name: "生成图片", exact: true }).click()
  await page.getByRole("button", { name: "预览生成图片 1" }).waitFor()
  await page.goto(`${baseUrl}/neon-workbench.html#chat`)
  await page.getByRole("textbox", { name: "对话消息" }).fill("验收消息")
  await page.getByRole("button", { name: "发送消息" }).click()
  await page.getByText("这是模拟接口返回的验收回复。").waitFor()
  await page.getByRole("button", { name: "概览", exact: true }).click()
  await page.getByRole("heading", { name: "今天想创作什么？" }).waitFor()
  const checks = []
  await page.getByRole("button", { name: "项目", exact: true }).click()
  await page.getByRole("textbox", { name: "搜索画布名称" }).fill("新品")
  await page.getByRole("combobox", { name: "项目筛选" }).selectOption("p1")
  await page.getByRole("button", { name: "刷新数据" }).click()
  await page.getByRole("button", { name: "刷新数据" }).waitFor({ state: "visible" })
  await page.waitForFunction(() => !document.querySelector('[aria-label="刷新数据"]').disabled)
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("tab", { name: "技能", exact: true }).click()
  await page.getByRole("button", { name: "刷新数据" }).click()
  await page.waitForFunction(() => !document.querySelector('[aria-label="刷新数据"]').disabled)
  if (await page.getByRole("tab", { name: "技能", exact: true }).getAttribute("aria-selected") !== "true") throw new Error("刷新重置设置页签")
  await page.getByRole("button", { name: "项目", exact: true }).click()
  if (await page.getByRole("textbox", { name: "搜索画布名称" }).inputValue() !== "新品" || await page.getByRole("combobox", { name: "项目筛选" }).inputValue() !== "p1") throw new Error("刷新或导航丢失筛选")
  checks.push("刷新及往返保留搜索、筛选、设置页签")
  resourcesFail = true
  await page.getByRole("button", { name: "刷新数据" }).click()
  await page.waitForFunction(() => !document.querySelector('[aria-label="刷新数据"]').disabled)
  await page.getByRole("button", { name: "素材库", exact: true }).click()
  await page.getByText("素材读取失败，请重试。", { exact: true }).waitFor()
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("heading", { name: "设置", exact: true }).waitFor()
  await page.getByRole("button", { name: "账户管理", exact: true }).click()
  await page.getByRole("heading", { name: "账户管理", exact: true }).waitFor()
  resourcesFail = false
  await page.getByRole("button", { name: "素材库", exact: true }).click()
  await page.getByRole("button", { name: "重新加载" }).click()
  await page.getByRole("button", { name: "预览素材 参考图片" }).waitFor()
  checks.push("素材接口故障隔离及重试恢复")
  await page.getByRole("button", { name: "历史记录", exact: true }).click()
  await page.getByRole("button").filter({ hasText: "讨论产品创意" }).click()
  await page.getByRole("dialog").getByText("先明确目标用户和产品使用场景。", { exact: true }).waitFor()
  await page.evaluate(() => { location.hash = "projects" })
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  checks.push("历史对话完整显示、导航关闭弹窗")
  await page.getByRole("button", { name: "历史记录", exact: true }).click()
  await page.getByRole("button").filter({ hasText: "一张产品场景图片" }).click()
  await page.getByRole("dialog").getByRole("img", { name: "生成结果 1" }).waitFor()
  await page.getByRole("button", { name: "关闭弹窗" }).click()
  checks.push("历史生图显示生成结果")
  await page.getByRole("button", { name: "在线生图", exact: true }).click()
  await page.getByRole("textbox", { name: "画面描述" }).fill("配置往返仍保留的生图草稿")
  await page.getByRole("combobox", { name: "生成模型" }).selectOption("mock-model")
  await page.getByRole("button", { name: "配置模型服务", exact: true }).click()
  await page.getByRole("tab", { name: "模型服务", exact: true }).click()
  await page.getByRole("button", { name: "管理连接与模型" }).click()
  await page.getByRole("textbox", { name: "手动添加模型 ID", exact: true }).fill("updated-model")
  await page.getByRole("dialog").getByRole("button", { name: "添加", exact: true }).click()
  await page.getByRole("button", { name: "移除 mock-model", exact: true }).click()
  await page.getByRole("button", { name: "保存设置", exact: true }).click()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await page.getByRole("button", { name: "返回在线生图", exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="生成模型"] option')].some(option => option.value === "updated-model"))
  if (await page.getByRole("combobox", { name: "生成模型" }).inputValue() !== "mock-model" || await page.getByRole("textbox", { name: "画面描述" }).inputValue() !== "配置往返仍保留的生图草稿") throw new Error("配置更新未同步模型或草稿丢失")
  await page.getByText("所选模型已移除或不支持生图，请重新选择。", { exact: true }).waitFor()
  await page.getByRole("combobox", { name: "生成模型" }).selectOption("updated-model")
  checks.push("配置保存同步模型、移除的模型提示重选、返回保留生图草稿")
  creativeFail = true
  await page.getByRole("button", { name: "生成图片", exact: true }).click()
  await page.getByText("模拟生成失败，请检查配置。", { exact: true }).waitFor()
  if (await page.getByRole("textbox", { name: "画面描述" }).inputValue() !== "配置往返仍保留的生图草稿") throw new Error("生图失败丢失提示词")
  creativeFail = false
  creativeDelay = true
  await page.getByRole("button", { name: "生成图片", exact: true }).click()
  await page.getByRole("button", { name: "停止等待", exact: true }).click()
  await page.waitForFunction(() => !document.querySelector("textarea").disabled)
  if (await page.getByRole("textbox", { name: "画面描述" }).inputValue() !== "配置往返仍保留的生图草稿") throw new Error("停止生图丢失提示词")
  await page.getByRole("button", { name: "历史记录", exact: true }).click()
  await page.getByRole("button", { name: "AI 对话", exact: true }).click()
  await page.getByRole("textbox", { name: "对话消息" }).fill("失败与取消后保留的对话草稿")
  await page.getByRole("button", { name: "配置模型服务", exact: true }).click()
  await page.getByRole("button", { name: "返回AI 对话", exact: true }).click()
  if (await page.getByRole("textbox", { name: "对话消息" }).inputValue() !== "失败与取消后保留的对话草稿") throw new Error("设置往返丢失对话草稿")
  creativeFail = true
  await page.getByRole("button", { name: "发送消息", exact: true }).click()
  await page.getByText("模拟生成失败，请检查配置。", { exact: true }).waitFor()
  if (await page.getByRole("textbox", { name: "对话消息" }).inputValue() !== "失败与取消后保留的对话草稿") throw new Error("对话失败丢失草稿")
  creativeFail = false
  const chatRequestsBeforeStop = requests.filter(request => request.path === "/api/chat").length
  await page.getByRole("button", { name: "发送消息", exact: true }).click()
  await page.getByRole("button", { name: "停止等待", exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('textarea[aria-label="对话消息"]').disabled)
  await page.waitForTimeout(150)
  if (await page.getByRole("textbox", { name: "对话消息" }).inputValue() !== "失败与取消后保留的对话草稿") throw new Error(`停止对话丢失草稿：${await page.getByRole("textbox", { name: "对话消息" }).inputValue()}`)
  if (requests.filter(request => request.path === "/api/chat").length !== chatRequestsBeforeStop + 1) throw new Error("停止等待意外再次提交对话")
  creativeDelay = false
  checks.push("生图与对话失败、停止等待保留输入；对话设置往返保留草稿")
  await page.getByRole("button", { name: "历史记录", exact: true }).click()
  await page.setViewportSize({ width: 390, height: 892 })
  await page.getByRole("button", { name: "打开导航" }).click()
  await page.getByRole("dialog", { name: "工作空间导航" }).waitFor()
  await page.waitForTimeout(250)
  for (let index = 0; index < 14; index++) {
    await page.keyboard.press("Tab")
    // Base UI focus guards can hold focus for one task before wrapping it.
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement), { timeout: 1000 })
  }
  await page.screenshot({ path: path.join(output, "390-navigation-focus.png") })
  await page.keyboard.press("Escape")
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  if (!await page.getByRole("button", { name: "打开导航" }).evaluate(button => button === document.activeElement)) throw new Error("导航关闭后焦点未返回")
  checks.push("移动导航焦点约束、Escape关闭、焦点返回")
  await page.getByRole("button", { name: "打开导航" }).click()
  await page.getByRole("button", { name: "项目", exact: true }).click()
  await page.getByRole("heading", { name: "项目与画布" }).waitFor()
  await page.goto(`${baseUrl}/neon-workbench.html#settings`)
  for (const tab of ["模型服务", "智能助手", "技能", "工作流", "备份", "系统"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click()
    await page.waitForTimeout(150)
    await page.screenshot({ path: path.join(output, `390-settings-${tab}.png`) })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    if (overflow) throw new Error(`设置子页横向溢出：${tab}`)
  }
  await page.getByRole("tab", { name: "模型服务", exact: true }).click()
  await page.getByRole("button", { name: "管理连接与模型" }).click()
  await page.getByRole("dialog").waitFor()
  const dialogGeometry = await page.getByRole("dialog").boundingBox()
  if (dialogGeometry.x < 0 || dialogGeometry.y < 0 || dialogGeometry.width > 390 || dialogGeometry.y + dialogGeometry.height > 894) throw new Error("移动端编辑弹窗超出视口")
  await page.getByRole("button", { name: "关闭弹窗" }).click()
  await page.goto(`${baseUrl}/neon-workbench.html#assets`)
  await page.getByRole("button", { name: "预览素材 参考图片" }).click()
  await page.getByRole("button", { name: "共享设置" }).click()
  await page.getByRole("combobox", { name: "共享可见范围" }).selectOption("all")
  await page.getByRole("button", { name: "保存共享设置" }).click()
  await page.getByText("共享权限已保存。").waitFor()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  const stress = []
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 600 })
    for (const route of ["home", "projects", "assets", "history", "settings", "account", "image", "chat"]) {
      await page.goto(`${baseUrl}/neon-workbench.html?review=${width}-${route}#${route}`)
      await page.locator("h1:visible").waitFor().catch(async error => { throw new Error(`压力页面 ${width} ${route}：${(await page.locator("body").innerText()).slice(0, 600)}；${error.message}`) })
      await page.evaluate(() => { document.documentElement.style.fontSize = "28px" })
      await page.waitForTimeout(60)
      const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
      stress.push({ route, ...geometry })
      if (geometry.scrollWidth > width) throw new Error(`175%缩放横向溢出：${route} ${width}`)
      await page.screenshot({ path: path.join(output, `stress-${width}-${route}.png`) })
    }
  }
  checks.push("八页短视口及175%界面缩放检查")
  await page.unroute("**/api/**")
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(600)
  const login = await page.evaluate(() => ({ auth: document.documentElement.dataset.aiAuth, frame: Boolean(document.getElementById("aiOsNeonFrame")), literalNewline: document.body.innerText.includes("\\n"), newCssLoaded: [...document.styleSheets].some(sheet => sheet.href?.includes("neon-workbench")) }))
  const report = { date: new Date().toISOString(), evidence: "独立页面使用模拟 API；真实运行时仅验证未登录入口。", results, stress, checks, errors, login, interactions: "项目创建、回收站、模拟生图与历史保存、模拟对话、返回概览、移动导航、设置六个子页、移动端编辑弹窗、素材共享已执行", requests }
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ errors, overflow: results.filter(r => r.overflow.length), login, screenshots: results.length }, null, 2))
  await browser.close()
  if (errors.length || results.some(result => result.overflow.length)) process.exitCode = 1
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1 })
