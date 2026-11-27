const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const base = process.env.AI_OS_TEST_URL || "http://127.0.0.1:33200";
const output = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-skill-discovery-"));
const diag = JSON.parse(fs.readFileSync(path.join(__dirname, "../AI-OS-Portable-1.0.5-win-x64/data/.logs/runtime-diagnostics.json")));
const runtime = require(path.join(diag.appRoot, "canvas-agent-runtime.js"));
const registry = require(path.join(diag.appRoot, "skill-registry.js")).createSkillRegistry({
  dataDir: diag.dataDirectory, systemDir: path.join(diag.appRoot, "skills"), bundledCustomDir: path.join(diag.appRoot, "bundled-skills"),
});
const candidates = fs.readdirSync(path.join(diag.dataDirectory, "users"))
  .filter(name => /^[0-9a-f-]{36}-[0-9a-f]{20}$/.test(name)).map(name => name.slice(0, 36));
const owner = process.env.AI_OS_TEST_USER_ID || (candidates.length === 1 ? candidates[0] : "");
assert.ok(owner, "只读案例检查需要明确唯一的素材所属账户");
// Only read registry metadata and existing media. Browser API responses below
// are isolated fixtures; no login credentials or live user mutations are used.
const library = registry.listLibrary(owner);
const catalog = runtime.getPublicSkillMetadata(registry.loadAgentCatalog(owner));
const picker = catalog.filter(skill => skill.origin === "custom").map(skill => {
  const entry = library.find(item => item.id === skill.id);
  return entry ? { ...skill, ...entry } : skill;
});
const photo = library.find(skill => skill.id === "commercial-product-photography-10");
const showcase = library.find(skill => skill.id === "showcase-media-check-20261105");
const fashion = library.find(skill => skill.id === "fashion-ecommerce-ai-model-video");
assert.ok(photo && showcase && fashion);
const publicCases = [photo, showcase, fashion].map(skill => ({
  ...skill, id: `fixture-public-${skill.id}`, scope: "public", featured: skill.id === showcase.id,
}));
const allCases = [...library, ...publicCases];
const fixtureUser = { id: "isolated-skill-preview", displayName: "只读案例界面验收", role: "superadmin" };
const requests = [], errors = [], loaded = [], checks = [];
let catalogReads = 0, libraryReads = 0, disabled = false;
const reverseEveryOther = (items, count) => count % 2 ? [...items] : [...items].reverse();
const digest = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceFiles = [
  path.join(diag.dataDirectory, "skills.json"),
  ...["skill-installs.json", "skill-showcase.json"].map(file => path.join(registry.getPersonalSkillsDir(owner), "..", file)),
  ...[photo, showcase, fashion].map(skill => path.join(registry.getPersonalSkillsDir(owner), skill.id, "SKILL.md")),
];
const sourceHashes = sourceFiles.map(file => [file, digest(file)]);

async function routeApi(route) {
  const req = route.request(), url = new URL(req.url());
  requests.push({ path: url.pathname, method: req.method() });
  if (req.method() !== "GET") return route.fulfill({ status: 405, json: { error: "只读验收禁止写入" } });
  if (url.pathname === "/api/canvas-agent/skills") return route.fulfill({ json: {
    configured: true, agentSettings: { configured: true }, skills: catalog, pickerSkills: reverseEveryOther(picker, ++catalogReads),
  } });
  if (url.pathname === "/api/skills/media") {
    const skill = allCases.find(item => item.id === url.searchParams.get("skill_id"));
    const item = skill?.presentation.media.find(media => media.id === url.searchParams.get("media_id"));
    assert.ok(item, "只允许读取已注册案例");
    const mediaUrl = url.searchParams.has("poster") ? item.posterUrl : item.url;
    const file = mediaUrl
      ? path.join(diag.dataDirectory, decodeURIComponent(mediaUrl).replace(/^\//, ""))
      : registry.readMedia(skill.id, item.path, owner, { metadataOnly: true }).filePath;
    const bytes = fs.readFileSync(file);
    loaded.push({ skill: skill.id, media: item.id, bytes: bytes.length, sha256: digest(file) });
    return route.fulfill({ contentType: url.searchParams.has("poster") ? "image/png" : item.type, body: bytes });
  }
  let body = {};
  if (url.pathname === "/api/auth/session") body = { user: fixtureUser, authenticated: true };
  if (url.pathname === "/api/preferences") body = { preferences: { appearance: { theme: "neon", scale: 1, animations: "reduced" } } };
  if (url.pathname === "/api/skills/library") body = { skills: reverseEveryOther(allCases.map(item => ({
    ...item, enabled: disabled ? false : item.enabled,
  })), ++libraryReads) };
  if (url.pathname === "/api/skills/mine") body = { skills: reverseEveryOther(library, ++libraryReads) };
  if (url.pathname === "/api/skills/public") body = { skills: reverseEveryOther(publicCases, ++libraryReads) };
  if (url.pathname === "/api/skills") body = { groups: [{ id: "fixture-shared", label: "共享流程",
    skills: reverseEveryOther(publicCases.map(item => ({ ...item, scope: "shared", install: null })), ++libraryReads) }] };
  if (url.pathname === "/api/canvas/boards") body = { boards: [] };
  if (url.pathname === "/api/canvas/projects") body = { projects: [] };
  if (url.pathname === "/api/providers") body = { providers: [] };
  if (url.pathname === "/api/protocols") body = { protocols: [] };
  return route.fulfill({ json: body });
}

async function main() {
  const hostHtml = await (await fetch(base)).text();
  const styles = [...hostHtml.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0]).join("");
  assert.ok(styles.includes("neon-foundation.css"), "隔离画布复用当前宿主页的完整样式顺序");
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.setDefaultTimeout(5000);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", routeApi);
    await page.route("**/isolated-skill-discovery", route => route.fulfill({ contentType: "text/html", body: `${styles}<style>html,body,.canvas-workspace{margin:0;width:100%;height:100%;position:relative}.canvas-agent-panel{position:fixed}</style><main class="canvas-workspace"><div class="canvas-actions"></div><div id="canvasPlane"></div></main>` }));
    const mount = async () => {
      await page.evaluate(() => {
        window.AiOsDesktop = { getSession: () => ({ user: { id: "isolated-skill-preview" } }) };
        window.CanvasAgentCore = { normalizeAgentReferences: () => [] };
        window.CanvasAgentConversation = {}; window.CanvasAgentCapabilities = {}; window.CanvasAgentSkillContract = {};
        window.CanvasAgentBroker = { createBroker: () => ({ invalidate() {} }) };
        window.CanvasAgentMcpServer = {}; window.CanvasAgentToolAdapters = { create: () => ({}) };
        window.CanvasAgentCanvasApi = { getBoardId: () => "isolated-preview" };
        window.renderCanvasNodeIcons = () => {};
      });
      await page.addScriptTag({ url: `${base}/canvas-agent-ui.js` });
      if (await page.locator("#canvasAgentToggle").getAttribute("aria-expanded") !== "true") await page.locator("#canvasAgentToggle").click();
      await page.locator("#canvasAgentSkillBook").click();
      await page.locator("[data-agent-skill]").first().waitFor();
      await page.waitForLoadState("networkidle");
    };
    await page.goto(`${base}/isolated-skill-discovery`);
    await mount();
    const order = () => page.locator("[data-agent-skill]").evaluateAll(items => items.map(item => item.dataset.agentSkill));
    const expected = [fashion.id, photo.id, showcase.id, "ai-video-director"];
    assert.deepEqual(await order(), expected);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      for (const skill of [photo, showcase, fashion]) {
        const button = page.locator(`[data-agent-skill="${skill.id}"]`);
        for (const interaction of ["hover", "focus"]) {
          await page.mouse.move(1, 1);
          await page.locator("#canvasAgentSkillSearch").focus();
          if (interaction === "hover") await button.hover();
          else await button.focus();
          const tooltip = page.getByRole("tooltip", { name: skill.label, exact: true });
          await tooltip.waitFor();
          const type = skill.coverMedia.type.startsWith("video/") ? "video" : "img";
          await page.waitForFunction(type => {
            const media = document.querySelector(`#canvasAgentSkillPreview ${type}`);
            return type === "img" ? media?.naturalWidth > 0 : media?.readyState >= 2 && media.paused;
          }, type);
          assert.equal(await tooltip.locator(type).evaluate(item => getComputedStyle(item).objectFit), "contain");
          assert.equal(await tooltip.locator(".canvas-agent-skill-preview-cover > span").isHidden(), true);
          const bounds = await tooltip.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 960);
          if (type === "video") assert.equal(await tooltip.locator("video").evaluate(item => item.autoplay), false);
          if (interaction === "hover") await page.screenshot({ path: path.join(output, `${skill.id}-${width}.png`) });
        }
      }
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.locator(`[data-agent-skill="${fashion.id}"]`).click();
      await page.locator("#canvasAgentSkillBook").click();
      assert.deepEqual(await order(), expected);
      await page.locator("#canvasAgentSkillSearch").fill("摄影");
      assert.deepEqual(await order(), [photo.id]);
      await page.locator("#canvasAgentSkillSearch").fill("");
      assert.deepEqual(await order(), expected);
      await page.reload();
      await mount();
      assert.deepEqual(await order(), expected);
    }
    await page.locator("#canvasAgentSkillSearch").focus();
    await page.locator('[data-agent-skill="ai-video-director"]').focus();
    await page.getByRole("tooltip", { name: "AI 视频导演", exact: true }).getByText("暂无效果预览", { exact: true }).waitFor();
    checks.push("已部署33200脚本+现有案例文件：两项图片和服装视频悬停/聚焦/完整比例/暂停首帧", "快捷列表选择/搜索/接口重载/页面刷新顺序稳定", "合法随附导演流程保留，无案例使用空状态");

    await page.goto(`${base}/neon-workbench.html#skills`);
    const names = () => page.locator('button[aria-label^="查看 Skill "]').evaluateAll(items => items.map(item => item.getAttribute("aria-label").replace("查看 Skill ", "")));
    const expectedPublic = [showcase.label, fashion.label, photo.label];
    await page.getByRole("button", { name: `查看 Skill ${photo.label}`, exact: true }).waitFor();
    assert.deepEqual(await names(), expectedPublic, "公共广场精选优先，其余固定顺序");
    for (let attempt = 0; attempt < 3; attempt++) {
      const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/skills/library");
      await page.getByRole("button", { name: "刷新 Skill", exact: true }).click();
      await refreshed;
      assert.deepEqual(await names(), expectedPublic);
    }
    await page.getByRole("tab", { name: "我的 Skill", exact: true }).click();
    await page.getByRole("button", { name: `查看 Skill ${fashion.label}`, exact: true }).waitFor();
    assert.deepEqual(await names(), [fashion.label, photo.label, showcase.label]);
    disabled = true;
    const reloaded = page.waitForResponse(response => new URL(response.url()).pathname === "/api/skills/library");
    await page.getByRole("button", { name: "刷新 Skill", exact: true }).click();
    await reloaded;
    await page.getByText("已停用", { exact: true }).first().waitFor();
    assert.deepEqual(await names(), [fashion.label, photo.label, showcase.label]);
    await page.reload();
    await page.getByRole("button", { name: `查看 Skill ${photo.label}`, exact: true }).waitFor();
    assert.deepEqual(await names(), expectedPublic);
    await page.goto(`${base}/neon-workbench.html#settings`);
    await page.getByRole("tab", { name: "技能", exact: true }).click();
    await page.getByRole("heading", { name: "我的私人 Skill", exact: true }).waitFor();
    for (const heading of ["我的私人 Skill", "本机公共 Skill 库", "系统与共享 Skill"]) {
      const section = page.getByRole("heading", { name: heading, exact: true }).locator("xpath=ancestor::section[1]");
      const switches = await section.getByRole("switch").evaluateAll(items => items.map(item => item.getAttribute("aria-label").replace("启用技能 ", "")));
      assert.deepEqual(switches, [fashion.label, photo.label, showcase.label], heading);
    }
    checks.push("公共精选/私人广场/已安装管理列表稳定排序，启用状态变化不重排无关项");
    assert.deepEqual(errors, []);
    assert.equal(requests.some(item => item.method !== "GET"), false);
    assert.ok(loaded.some(item => item.skill === photo.id && item.bytes > 0));
    assert.ok(loaded.some(item => item.skill === showcase.id && item.media === showcase.coverId && item.bytes > 0));
    assert.deepEqual(sourceHashes.filter(([file, before]) => digest(file) !== before), []);
    const report = { frontend: base, backend: "隔离模拟API；元数据和媒体来自当前运行时只读快照，未使用真实登录会话", checks, loaded, errors, mutations: [], sourceFilesUnchanged: true };
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, output, checks, mediaReads: loaded.length, errors, mutations: [] }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); console.error("evidence:", output); process.exitCode = 1; });
