const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { chromium } = require("playwright")

const base = process.env.AI_OS_TEST_URL || "http://127.0.0.1:33200"
const user = { id: "case-picker-qa", displayName: "案例验收账户", role: "superadmin" }
const skill = { id: "case-picker-fixture", label: "摄影案例验收", category: "image", categoryLabel: "图像创作",
  scope: "public", enabled: true, featured: true }
const categories = [{ id: "product", name: "产品摄影" }, { id: "portrait", name: "人物摄影" }]
const shapes = [[900, 1500], [1536, 768], [1024, 1024], [1280, 720]]
const entries = Array.from({ length: 60 }, (_, index) => {
  const title = ["竖版静物", "横版布光", "方形产品", "产品系列"][Math.min(index, 3)] + (index > 2 ? ` ${index}` : "")
  const [width, height] = shapes[index % shapes.length]
  return {
    asset: { id: `asset-${index}`, ownerUserId: user.id, categoryId: index % 2 ? "portrait" : "product", name: title },
    resource: { id: `resource-${index}`, ownerUserId: user.id, type: "image", title,
      metadata: { url: `/output/case-picker-${index}.png`, thumbnailUrl: `/output/case-picker-${index}-thumb.png`, width, height } },
    access: {},
  }
})
const initial = [
  { id: "saved-photo", title: "既有自定义标题", type: "image/png", url: entries[0].resource.metadata.url },
  { id: "saved-package", title: "既有包内案例", type: "image/png", path: "examples/cover.png" },
]
let presentation = { summary: "独立的产品摄影案例", capabilities: "", inputs: "", outputs: "", coverId: "saved-photo", media: initial }
const requests = []
const evidence = process.env.CASE_PICKER_QA_DIR
const saveImage = (page, name) => evidence && page.screenshot({ path: path.join(evidence, `${name}.png`) })
const card = (picker, index) => picker.locator(`[data-case-asset="asset-${index}"]`)
const selectAsset = (picker, index) => card(picker, index).getByRole("button", { name: entries[index].resource.title, exact: true })

async function setup(page) {
  if (process.argv.includes("--source")) {
    await page.route("**/neon-workbench.js*", route => route.fulfill({
      contentType: "application/javascript", path: path.join(__dirname, "dist/workbench.js"),
    }))
    await page.route("**/neon-workbench.css*", route => route.fulfill({
      contentType: "text/css", path: path.join(__dirname, "dist/neon-workbench.css"),
    }))
  }
  await page.route("**/case-picker-qa", route => route.fulfill({ contentType: "text/html; charset=utf-8", body:
    `<style>body{margin:0}iframe{display:block;width:100%;height:100dvh;border:0}</style><button id="open" style="position:absolute;z-index:1" onclick="this.hidden=true;frames[0].postMessage({type:'neon:skill-square',requestId:'case-picker-qa',boardId:'qa-board'},location.origin)">打开验收 Skill 广场</button><iframe title="验收工作台" src="/neon-workbench.html#home"></iframe>` }))
  await page.route("**/api/**", route => {
    const req = route.request()
    const pathname = new URL(req.url()).pathname
    requests.push([req.method(), pathname])
    if (pathname === "/api/auth/session") return route.fulfill({ json: { user, authenticated: true } })
    if (pathname === "/api/skills/library") return route.fulfill({ json: { skills: [{ ...skill, presentation }] } })
    if (pathname === "/api/skills/detail") return route.fulfill({ json: { ...skill, presentation, media: presentation.media, references: [], instructions: "", canManagePresentation: true } })
    if (pathname === "/api/asset-library") return route.fulfill({ json: { entries, categories, folders: [] } })
    if (pathname === "/api/skills/presentation") {
      presentation = req.postDataJSON()
      return route.fulfill({ json: { ...skill, presentation, media: presentation.media } })
    }
    if (pathname === "/api/image-thumbnails") return route.fulfill({ json: { item: { lightweight: true } } })
    if (pathname === "/api/skills/media") return route.fulfill({ contentType: "image/svg+xml", body: photo(0, true) })
    return route.fulfill({ json: { boards: [], projects: [], preferences: {}, models: [], providers: [], groups: [] } })
  })
  await page.route(/\/output\/case-picker-(\d+)(-thumb)?\.png/, route => {
    const match = route.request().url().match(/case-picker-(\d+)(-thumb)?\.png/)
    if (match[1] === "4" && match[2]) return route.fulfill({ status: 404, body: "" })
    return route.fulfill({ contentType: "image/svg+xml", body: photo(Number(match[1]), !match[2]) })
  })
}

function photo(index, original) {
  const [width, height] = shapes[index % shapes.length].map(size => original ? size : size / 4)
  const colors = ["#d5c3a7", "#7b8d90", "#b2765d", "#c0a486"]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 200 200" preserveAspectRatio="none">
    <defs><linearGradient id="light" x2="100%" y2="100%"><stop stop-color="${colors[index % 4]}"/><stop offset="1" stop-color="#292b27"/></linearGradient></defs>
    <rect width="200" height="200" fill="url(#light)"/><ellipse cx="105" cy="163" rx="75" ry="13" fill="#221f1b" opacity=".34"/>
    <rect x="65" y="57" width="70" height="104" rx="12" fill="#efe5d7"/><rect x="84" y="41" width="32" height="20" rx="3" fill="#514638"/>
    <rect x="77" y="96" width="46" height="40" fill="${colors[(index + 2) % 4]}"/><path d="M13 12h18M13 12v18m174 158h-18m18 0v-18" stroke="#fff" stroke-width="2"/></svg>`
}

async function openEditor(page) {
  await page.goto(`${base}/case-picker-qa`, { waitUntil: "domcontentloaded" })
  const frame = page.frameLocator("iframe")
  await frame.getByRole("button", { name: "刷新数据", exact: true }).waitFor()
  await page.getByRole("button", { name: "打开验收 Skill 广场" }).click()
  await frame.getByRole("button", { name: `查看 Skill ${skill.label}` }).click()
  await frame.getByRole("button", { name: "编辑展示资料" }).click()
  return { frame, editor: frame.getByRole("dialog", { name: "Skill 展示资料", exact: true }) }
}

async function geometry(page, picker, width) {
  await page.setViewportSize({ width, height: 920 })
  await card(picker, 0).waitFor()
  await picker.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))))
  const bounds = await picker.boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 921)
  if (width >= 1440) assert.ok(bounds.width >= 900 && bounds.width <= 1100, JSON.stringify({
    width, bounds, style: await picker.evaluate(element => ({ width: getComputedStyle(element).width, max: getComputedStyle(element).maxWidth, frameWidth: innerWidth })),
  }))
  const list = picker.getByLabel("案例素材列表")
  const read = await list.evaluate(element => {
    const first = element.querySelector("[data-case-asset]")
    return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, height: first.getBoundingClientRect().height,
      scrollWidth: element.scrollWidth, listWidth: element.clientWidth, count: element.querySelectorAll("[data-case-asset]").length,
      columns: getComputedStyle(first.parentElement).gridTemplateColumns.split(" ").length }
  })
  assert.equal(read.count, 60)
  assert.ok(read.scrollHeight > read.clientHeight && read.scrollWidth <= read.listWidth + 1)
  assert.equal(read.columns, width >= 1440 ? 4 : width >= 768 ? 3 : 2)
  assert.ok(read.height >= (width >= 1440 ? 220 : 185))
  for (const [index, [imageWidth, imageHeight]] of shapes.entries()) {
    const image = card(picker, index).locator("img")
    await image.evaluate(img => img.decode())
    const size = await image.evaluate(img => ({
      width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height,
      ratio: img.naturalWidth / img.naturalHeight, fit: getComputedStyle(img).objectFit,
    }))
    assert.equal(size.fit, "contain")
    assert.ok(Math.abs(size.ratio - imageWidth / imageHeight) < .02)
    assert.ok(width < 1440 || size.height >= 150 && size.height <= 190)
  }
  await saveImage(page, `gallery-${width}`)
  return { width, dialogWidth: bounds.width, ...read }
}

async function main() {
  if (evidence) fs.mkdirSync(evidence, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" })
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } })
  page.setDefaultTimeout(7000)
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  try {
    await setup(page)
    const { frame, editor } = await openEditor(page)
    await editor.getByRole("button", { name: "从素材库选择" }).click()
    const picker = frame.getByRole("dialog", { name: "选择案例素材", exact: true })
    const first = picker.locator('img[src*="case-picker-0-thumb"]').first()
    await first.waitFor()
    const measure = await first.evaluate(img => {
      const rect = img.getBoundingClientRect()
      const card = img.closest("article,button")
      const grid = card?.parentElement
      return { height: rect.height, fit: getComputedStyle(img).objectFit, cardHeight: card?.getBoundingClientRect().height,
        rows: grid ? getComputedStyle(grid).gridTemplateRows : "", dialogWidth: img.closest('[role="dialog"]').getBoundingClientRect().width }
    })
    assert.ok(measure.height >= 150 && measure.fit === "contain", `桌面长列表缩略图必须完整、至少 150px 高：${JSON.stringify(measure)}`)
    const results = []
    for (const width of [390, 768, 1440, 1728]) results.push(await geometry(page, picker, width))
    await page.setViewportSize({ width: 1440, height: 920 })
    const fallback = card(picker, 4).locator('img[src="/output/case-picker-4.png"]')
    await fallback.waitFor()
    await fallback.evaluate(img => img.decode())
    assert.equal(await selectAsset(picker, 0).getAttribute("aria-pressed"), "true")
    assert.equal(await selectAsset(picker, 1).getAttribute("aria-pressed"), "false")
    await selectAsset(picker, 1).click()
    await selectAsset(picker, 0).click()
    assert.equal(await selectAsset(picker, 0).getAttribute("aria-pressed"), "false")
    await selectAsset(picker, 0).click()
    const search = picker.getByRole("textbox", { name: "搜索我的素材" })
    const filter = picker.getByRole("combobox", { name: "素材分类" })
    await filter.selectOption("product")
    assert.equal(await card(picker, 1).count(), 0)
    await search.fill("方形")
    assert.equal(await picker.locator("[data-case-asset]").count(), 1)
    await selectAsset(picker, 2).click()
    await search.fill("没有这种素材")
    await picker.getByText("没有匹配的案例素材。").waitFor()
    await search.fill("")
    await filter.selectOption("")
    for (const index of [0, 1, 2]) assert.equal(await selectAsset(picker, index).getAttribute("aria-pressed"), "true")
    await selectAsset(picker, 1).hover()
    await selectAsset(picker, 1).focus()
    assert.ok(await selectAsset(picker, 1).evaluate(button => button === document.activeElement))
    const list = picker.getByLabel("案例素材列表")
    const enlarge = card(picker, 29).getByRole("button", { name: /^预览/ })
    await enlarge.scrollIntoViewIfNeeded()
    const offset = await list.evaluate(element => element.scrollTop)
    assert.ok(offset > 300)
    await enlarge.click()
    const photoDialog = name => frame.getByRole("dialog", { name, exact: true })
    for (const [step, index] of [29, 30, 29].entries()) {
      const preview = photoDialog(entries[index].resource.title)
      const image = preview.getByRole("img", { name: entries[index].resource.title, exact: true })
      await image.waitFor()
      await image.evaluate(img => img.decode())
      assert.equal(await image.getAttribute("src"), entries[index].resource.metadata.url)
      assert.equal(await image.evaluate(img => getComputedStyle(img).objectFit), "contain")
      if (index === 30) {
        await saveImage(page, "original-preview")
        await preview.getByRole("button", { name: "上一张" }).click()
      } else if (step === 0) await preview.getByRole("button", { name: "下一张" }).click()
    }
    await page.keyboard.press("Escape")
    await photoDialog(entries[29].resource.title).waitFor({ state: "detached" })
    assert.ok(Math.abs(await list.evaluate(element => element.scrollTop) - offset) <= 2)
    for (const index of [0, 1, 2]) assert.equal(await selectAsset(picker, index).getAttribute("aria-pressed"), "true")
    assert.equal(await selectAsset(picker, 29).getAttribute("aria-pressed"), "false", "预览不会选择素材")
    await picker.getByRole("button", { name: "应用选择" }).click()
    await picker.waitFor({ state: "detached" })
    await editor.getByRole("button", { name: "从素材库选择" }).click()
    assert.equal(await selectAsset(picker, 2).getAttribute("aria-pressed"), "true")
    await selectAsset(picker, 2).click()
    await picker.getByRole("button", { name: "取消", exact: true }).click()
    await editor.getByRole("button", { name: "保存展示资料" }).click()
    await editor.waitFor({ state: "detached" })
    assert.deepEqual(presentation.media.slice(0, 2), initial)
    assert.deepEqual(presentation.media.slice(2).map(({ id, url }) => [id, url]),
      [1, 2].map(index => [`asset-${index}`, entries[index].resource.metadata.url]))
    assert.equal(presentation.coverId, initial[0].id)
    const reopened = await openEditor(page)
    await reopened.editor.getByRole("button", { name: "从素材库选择" }).click()
    for (const index of [0, 1, 2]) assert.equal(await selectAsset(picker, index).getAttribute("aria-pressed"), "true")
    assert.equal(requests.filter(([method, url]) => method === "POST" && url === "/api/asset-library").length, 0)
    assert.deepEqual(errors, [])
    const report = { passed: true, geometry: results, originalAndMultiselect: true, reloadPreservesReferences: true, errors }
    if (evidence) fs.writeFileSync(path.join(evidence, "gallery-report.json"), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally { await browser.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
