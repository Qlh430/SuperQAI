const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const output = path.join(__dirname, "../.planning/agent-skill-square-20261104/ui");
fs.mkdirSync(output, { recursive: true });
const publicSkill = { id: "product-plan", label: "商业产品摄影 · 十种创意方案", description: "使用十种摄影方法规划专业产品图，整理中文提示词与参考素材。", category: "image", categoryLabel: "图像", scope: "public", enabled: true, featured: true };
const personalSkill = { ...publicSkill, id: "private-plan", label: "我的私人摄影流程", scope: "personal", featured: false };
const h3Skill = { ...publicSkill, id: "h3-commerce-video", label: "H3 带货视频", scope: "system", featured: false, metadata: { version: "0.2.11" } };
let showH3InLibrary = false;
let libraryError = false;
const calls = [];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/square-acceptance-host", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<style>html,body{margin:0;width:100%;height:100%;background:#111;color:white}iframe{border:0;width:100%;height:100%}</style><button id="more" onclick="document.querySelector('iframe').style.display='block';document.querySelector('iframe').contentWindow.postMessage({type:'neon:skill-square',requestId:'qa-overlay',boardId:'qa-board'},location.origin)">更多 · 浏览全部 Skill</button><script>window.actions=[];addEventListener("message",e=>{if(e.data?.type==="neon:action"){window.actions.push(e.data);if(['useCanvasSkill','closeSkillSquare'].includes(e.data.action)){document.querySelector('iframe').contentWindow.postMessage({type:'neon:close-skill-square',requestId:'qa-overlay'},location.origin);document.querySelector('iframe').style.display='none'}}})</script><iframe title="测试工作台" src="/neon-workbench.html#home"></iframe>` }));
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    calls.push({ path: url.pathname, method: request.method() });
    let body = {};
    if (url.pathname === "/api/auth/session") body = { user: { id: "qa-square", displayName: "验收账户", role: "superadmin" } };
    if (url.pathname === "/api/skills/library") {
      if (libraryError) return route.fulfill({ status: 503, json: { error: "Skill 注册表暂时不可读取，请重试。" } });
      body = { skills: [publicSkill, personalSkill, ...(showH3InLibrary ? [h3Skill] : [])] };
    }
    if (url.pathname === "/api/skills/detail") body = { ...(url.searchParams.get("skill_id") === "private-plan" ? personalSkill : publicSkill), instructions: "# 专业摄影\n\n## 输入要求\n提供同一张产品图片。\n\n## 使用说明\n先分析产品，再规划十种方向。\n\n<script>不应执行</script>", media: [], references: [{ path: "references/method.md" }] };
    if (url.pathname === "/api/skills/detail" && url.searchParams.get("skill_id") === h3Skill.id) {
      assert.equal(url.searchParams.get("scope"), "public");
      body = { ...body, ...h3Skill, references: Array.from({ length: 6 }, (_, index) => ({ path: `references/h3-case-${index + 1}.md` })) };
    }
    if (url.pathname === "/api/skills/reference") body = { path: "references/method.md", content: "# 摄影方法\n完整参考正文。" };
    if (url.pathname === "/api/skills/mine") body = { skills: [personalSkill] };
    if (url.pathname === "/api/skills/public") body = { skills: [publicSkill] };
    if (url.pathname === "/api/skills") body = { groups: [] };
    if (url.pathname === "/api/preferences") body = { preferences: {} };
    if (url.pathname === "/api/canvas/boards") body = { boards: [{ id: "qa-board", title: "独立验收画布", nodeCount: 1, isOwner: true }] };
    if (url.pathname === "/api/canvas/projects") body = { projects: [] };
    return route.fulfill({ json: body });
  });
  try {
    await page.goto("http://127.0.0.1:33200/square-acceptance-host", { waitUntil: "networkidle" });
    const frame = page.frameLocator("iframe");
    const results = [];
    await frame.getByRole("button", { name: "刷新数据", exact: true }).waitFor();
    assert.equal(await frame.getByRole("button", { name: "Skill 广场", exact: true }).count(), 0);
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 });
      await page.getByRole("button", { name: "更多 · 浏览全部 Skill", exact: true }).click();
      await frame.getByRole("dialog", { name: "Skill 广场", exact: true }).waitFor();
      await frame.getByRole("button", { name: "查看 Skill 商业产品摄影 · 十种创意方案" }).waitFor();
      await frame.getByRole("button", { name: "查看 Skill H3 带货视频" }).waitFor();
      await frame.getByRole("tab", { name: "精选", exact: true }).click();
      assert.equal(await frame.getByRole("button", { name: "查看 Skill 我的私人摄影流程" }).count(), 0);
      assert.equal(await frame.locator("body").evaluate(body => body.scrollWidth <= innerWidth), true);
      const bounds = await frame.getByRole("dialog", { name: "Skill 广场", exact: true }).boundingBox();
      assert.ok(bounds && bounds.width <= width && bounds.height <= 960);
      await page.screenshot({ path: path.join(output, `home-${width}.png`) });
      await frame.getByRole("button", { name: "查看 Skill 商业产品摄影 · 十种创意方案" }).click();
      await frame.getByText("暂无案例素材", { exact: true }).waitFor();
      assert.equal(await frame.locator("body").evaluate(body => body.scrollWidth <= innerWidth), true);
      await frame.getByText("查看技能说明", { exact: true }).click();
      await frame.getByRole("button", { name: "references/method.md", exact: true }).click();
      await frame.getByText("完整参考正文。").waitFor();
      await page.screenshot({ path: path.join(output, `detail-${width}.png`) });
      await frame.getByRole("button", { name: "使用此 Skill", exact: true }).click();
      await page.waitForFunction(() => window.actions.at(-1)?.action === "useCanvasSkill");
      const action = await page.evaluate(() => window.actions.at(-1));
      assert.deepEqual(action.params, { requestId: "qa-overlay", skillId: "product-plan" });
      await frame.getByRole("dialog", { name: "Skill 广场", exact: true }).waitFor({ state: "detached" });
      results.push({ width, modal: true, detail: true, useSelectsSkillWithoutCanvasNavigation: true });
    }
    showH3InLibrary = true;
    await page.getByRole("button", { name: "更多 · 浏览全部 Skill", exact: true }).click();
    const h3 = frame.getByRole("button", { name: "查看 Skill H3 带货视频" });
    await h3.click();
    await frame.getByText("来源与兼容性", { exact: true }).click();
    await frame.getByText(/内置.*0\.2\.11/).waitFor();
    await frame.getByRole("button", { name: "使用此 Skill", exact: true }).click();
    await page.waitForFunction(() => window.actions.at(-1)?.params?.skillId === "h3-commerce-video");
    await page.getByRole("button", { name: "更多 · 浏览全部 Skill", exact: true }).click();
    await frame.getByRole("textbox", { name: "搜索名称或专业方向" }).fill("没有这个");
    await frame.getByText("没有匹配的 Skill", { exact: true }).waitFor();
    await frame.getByRole("tab", { name: "我的 Skill", exact: true }).click();
    await frame.getByRole("textbox", { name: "搜索名称或专业方向" }).fill("");
    await frame.getByRole("button", { name: "查看 Skill 我的私人摄影流程" }).waitFor();
    await frame.getByRole("button", { name: "管理我的 Skill", exact: true }).waitFor();
    await frame.getByRole("button", { name: "管理我的 Skill", exact: true }).click();
    await frame.getByRole("dialog", { name: "我的 Skill 管理", exact: true }).getByRole("button", { name: "选择文件", exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "management.png") });
    await frame.getByRole("dialog", { name: "我的 Skill 管理", exact: true }).getByRole("button", { name: "关闭弹窗", exact: true }).click();
    libraryError = true;
    await frame.getByRole("button", { name: "刷新 Skill", exact: true }).click();
    await frame.getByRole("alert").filter({ hasText: "Skill 注册表暂时不可读取" }).waitFor();
    assert.equal(calls.some(call => /\/api\/(?:images|canvas-agent\/turn)/.test(call.path)), false);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ api: "mock", results, errors, action: "useCanvasSkill + requestId; no canvas creation or generation" }, null, 2));
    console.log("PASS: canvas Skill modal responsive/search/category/private/detail/reference/error/use; mocked APIs only");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
