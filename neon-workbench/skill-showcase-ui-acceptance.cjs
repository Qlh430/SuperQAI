"use strict";
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const output = path.resolve(__dirname, process.env.SKILL_SHOWCASE_QA_DIR || "../.planning/skill-showcase-20261105/ui");
const pickerOnly = process.argv.includes("--picker-only");
fs.mkdirSync(output, { recursive: true });
const clip = path.join(output, "isolated-test-pattern.mp4");
if (!fs.existsSync(clip)) execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x202824:s=320x180:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", clip]);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const cases = [{ id: "photo", url: "/output/fixture.png", type: "image/png", title: "隔离测试图片" },
  { id: "video", url: "/output/fixture.mp4", posterUrl: "/output/poster.png", type: "video/mp4", title: "隔离测试视频" }];
let presentation = { summary: "上传产品图，自动规划十种商业摄影创意", capabilities: "产品摄影策划与创意方向整理", inputs: "产品参考图、产品描述、品牌配色", outputs: "十个独立中文提示词节点，共用一张参考图", coverId: "photo", media: cases };
const skill = { id: "product-plan", label: "商业产品摄影 · 十种创意方案", description: "原始安装简介", category: "image", categoryLabel: "图像", scope: "public", enabled: true, featured: true };
const privateSkill = { ...skill, id: "private-plan", scope: "personal", label: "我的私人摄影流程", featured: false };
const categoryOptions = [{ id: "image", label: "图像创作" }, { id: "marketing", label: "商业广告" }, { id: "ecommerce", label: "电商设计" }, { id: "video", label: "视频创作" }];
const presented = entry => ({ ...entry, label: presentation.displayName || entry.label,
  categories: (presentation.categories?.length ? presentation.categories : ["image", "marketing"]).map(id => categoryOptions.find(item => item.id === id)) });
const calls = [], errors = [], results = [];
let libraryError = false, saveError = false, videoRequests = 0;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/showcase-acceptance-host", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<style>html,body{margin:0;width:100%;height:100%;background:#111;color:white}iframe{border:0;width:100%;height:100%}</style><button id="more" onclick="document.querySelector('iframe').style.display='block';document.querySelector('iframe').contentWindow.postMessage({type:'neon:skill-square',requestId:'qa-overlay',boardId:'qa-board'},location.origin)">更多 · 浏览全部 Skill</button><script>window.actions=[];window.canvas={nodes:['original'],zoom:0.75,selected:['original'],chat:['原对话']};addEventListener("message",e=>{if(e.data?.type==="neon:action"){window.actions.push(e.data);if(['useCanvasSkill','closeSkillSquare'].includes(e.data.action)){document.querySelector('iframe').contentWindow.postMessage({type:'neon:close-skill-square',requestId:'qa-overlay'},location.origin);document.querySelector('iframe').style.display='none'}}})</script><iframe title="测试工作台" src="/neon-workbench.html#home"></iframe>` }));
  await page.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url());
    calls.push({ path: url.pathname, query: url.search, method: req.method() });
    let body = {};
    if (url.pathname === "/api/auth/session") body = { user: { id: "qa-square", displayName: "隔离验收账户", role: "superadmin" } };
    if (url.pathname === "/api/skills/library") {
      if (libraryError) return route.fulfill({ status: 503, json: { error: "Skill 注册表暂时不可读取，请重试。" } });
      body = { skills: [{ ...presented(skill), presentation, coverId: presentation.coverId, coverMedia: presentation.media.find(item => item.id === presentation.coverId) }, presented(privateSkill),
        { ...skill, id: "system-code-helper", label: "系统基础代码助手", scope: "system" }] };
    }
    if (url.pathname === "/api/skills/detail") body = { ...presented(url.searchParams.get("skill_id") === "private-plan" ? privateSkill : skill), categoryOptions, presentation, canManagePresentation: true, coverId: presentation.coverId, instructions: "# 专业摄影\n\n## 输入要求\n原始文档输入说明。\n\n## 专业流程\n先分析材质，再规划十种方向。\n\n<script>不应执行</script>", media: presentation.media, references: [{ path: "references/method.md" }] };
    if (url.pathname === "/api/skills/presentation") {
      if (saveError) return route.fulfill({ status: 500, json: { error: "展示资料保存失败，原资料未被修改。" } });
      presentation = req.postDataJSON(); body = { ...skill, presentation, media: presentation.media, canManagePresentation: true };
    }
    if (url.pathname === "/api/upload-media") body = { url: "/output/fixture.png", mimeType: "image/png", asset: { id: "fixture-upload-resource" } };
    if (url.pathname === "/api/skills/media") {
      if (url.searchParams.get("media_id") === "video" && !url.searchParams.has("poster")) {
        videoRequests++; return route.fulfill({ contentType: "video/mp4", body: fs.readFileSync(clip) });
      }
      return route.fulfill({ contentType: "image/png", body: png });
    }
    if (url.pathname === "/api/skills/reference") body = { path: "references/method.md", content: "# 摄影方法\n完整参考正文。" };
    if (url.pathname === "/api/skills/mine") body = { skills: [privateSkill] };
    if (url.pathname === "/api/skills/public") body = { skills: [skill] };
    if (url.pathname === "/api/skills") body = { groups: [] };
    if (url.pathname === "/api/asset-library") body = { entries: [{ asset: { id: "fixture-asset", ownerUserId: "qa-square" }, resource: { id: "fixture-resource", ownerUserId: "qa-square", type: "image", title: "隔离验收素材", metadata: { url: "/output/library-picked.png" } }, access: {} }], folders: [], categories: [] };
    if (url.pathname === "/api/image-thumbnails") body = { item: { lightweight: true } };
    if (url.pathname === "/api/preferences") body = { preferences: {} };
    if (url.pathname === "/api/canvas/boards") body = { boards: [{ id: "qa-board", title: "独立验收画布", nodeCount: 1, isOwner: true }] };
    if (url.pathname === "/api/canvas/projects") body = { projects: [] };
    return route.fulfill({ json: body });
  });
  await page.route("**/output/*.png", route => route.fulfill({ contentType: "image/png", body: png }));
  try {
    await page.goto("http://127.0.0.1:33200/showcase-acceptance-host", { waitUntil: "networkidle" });
    const frame = page.frameLocator("iframe");
    await frame.getByRole("button", { name: "刷新数据", exact: true }).waitFor();
    for (const width of pickerOnly ? [] : [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 });
      await page.getByRole("button", { name: "更多 · 浏览全部 Skill", exact: true }).click();
      const dialog = frame.getByRole("dialog", { name: "Skill 广场", exact: true });
      await dialog.waitFor();
      const tile = frame.getByRole("button", { name: `查看 Skill ${skill.label}`, exact: true });
      await tile.waitFor();
      assert.equal(await frame.getByRole("button", { name: "查看 Skill 系统基础代码助手", exact: true }).count(), 0);
      assert.equal(await frame.getByRole("button", { name: `查看 Skill ${privateSkill.label}`, exact: true }).count(), 0);
      const filters = frame.getByLabel("Skill 分类", { exact: true });
      await filters.getByRole("button", { name: "商业广告", exact: true }).click();
      await tile.waitFor();
      assert.equal(await filters.getByRole("button", { name: "视频创作", exact: true }).count(), 0, "不展示空分类");
      const search = frame.getByRole("textbox", { name: "搜索名称或专业方向", exact: true });
      await search.fill("不存在的需求");
      await frame.getByText("没有匹配的 Skill", { exact: true }).waitFor();
      await search.fill("商业产品摄影");
      await tile.waitFor();
      await search.fill("");
      await tile.hover();
      await tile.focus();
      await page.screenshot({ path: path.join(output, `home-${width}.png`) });
      assert.equal(await frame.locator("body").evaluate(body => body.scrollWidth <= innerWidth), true);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.width <= width && bounds.height <= 960);
      const coverBounds = await tile.locator("div").first().boundingBox();
      const tileBounds = await tile.boundingBox();
      assert.ok(Math.abs(coverBounds.width / coverBounds.height - 16 / 9) < 0.02, JSON.stringify({ width, coverBounds, tileBounds, style: await tile.locator("div").first().evaluate(element => ({ aspect: getComputedStyle(element).aspectRatio, flexShrink: getComputedStyle(element).flexShrink, width: getComputedStyle(element).width, height: getComputedStyle(element).height })) }));
      assert.ok(Math.abs(coverBounds.width - tileBounds.width) < 2);
      await tile.click();
      await frame.getByText(presentation.summary, { exact: true }).waitFor();
      await frame.getByText("查看技能说明", { exact: true }).waitFor();
      assert.equal(await frame.getByText("先分析材质，再规划十种方向。", { exact: true }).isVisible(), false);
      if (width >= 1440) {
        const titleBounds = await frame.getByRole("heading", { name: skill.label, exact: true }).boundingBox();
        assert.ok(titleBounds.y + titleBounds.height < bounds.y + bounds.height - 70, "桌面首屏可见名称和简介");
      }
      await page.screenshot({ path: path.join(output, `detail-${width}.png`) });
      await frame.getByRole("button", { name: "查看案例原图", exact: true }).click();
      await frame.getByRole("dialog", { name: "隔离测试图片", exact: true }).getByRole("button", { name: "关闭弹窗", exact: true }).click();
      await frame.getByRole("dialog", { name: "隔离测试图片", exact: true }).waitFor({ state: "detached" });
      const countBefore = videoRequests;
      await frame.getByRole("button", { name: "下一个案例", exact: true }).click();
      assert.equal(videoRequests, countBefore, "选择视频不预先请求完整文件");
      await frame.getByRole("button", { name: "播放案例 隔离测试视频", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("iframe").contentDocument.querySelector("video")?.readyState >= 2);
      assert.ok(videoRequests > countBefore);
      await frame.getByRole("button", { name: "上一个案例", exact: true }).click();
      await frame.getByText("查看技能说明", { exact: true }).click();
      await frame.getByRole("button", { name: "references/method.md", exact: true }).click();
      await frame.getByText("完整参考正文。").waitFor();
      await frame.getByRole("button", { name: "使用此 Skill", exact: true }).click();
      await page.waitForFunction(() => window.actions.at(-1)?.action === "useCanvasSkill");
      assert.deepEqual(await page.evaluate(() => window.actions.at(-1).params), { requestId: "qa-overlay", skillId: "product-plan" });
      assert.deepEqual(await page.evaluate(() => window.canvas), { nodes: ["original"], zoom: 0.75, selected: ["original"], chat: ["原对话"] });
      await dialog.waitFor({ state: "detached" });
      results.push({ width, media: true, collapsedDocument: true, usePreservesHostState: true });
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole("button", { name: "更多 · 浏览全部 Skill", exact: true }).click();
    await frame.getByRole("tab", { name: "我的 Skill", exact: true }).click();
    await frame.getByRole("button", { name: "管理我的 Skill", exact: true }).click();
    const manager = frame.getByRole("dialog", { name: "我的 Skill 管理", exact: true });
    await manager.getByRole("button", { name: "展示资料", exact: true }).first().click();
    const editor = frame.getByRole("dialog", { name: "Skill 展示资料", exact: true });
    await editor.getByRole("textbox", { name: "显示名称", exact: true }).fill("商业摄影 · 中文名称验收");
    await editor.getByRole("button", { name: "图像创作", exact: true }).click();
    await editor.getByRole("button", { name: "商业广告", exact: true }).click();
    await editor.getByRole("textbox", { name: "一句话介绍", exact: true }).fill("更新后的真实展示简介");
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 });
      assert.equal(await frame.locator("body").evaluate(body => body.scrollWidth <= innerWidth), true);
      const bounds = await editor.boundingBox();
      assert.ok(bounds.width <= width && bounds.height <= 960);
      await page.screenshot({ path: path.join(output, `editor-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    saveError = true;
    await editor.getByRole("button", { name: "保存展示资料", exact: true }).click();
    await editor.getByRole("alert").filter({ hasText: "展示资料保存失败" }).waitFor();
    assert.equal(presentation.summary, "上传产品图，自动规划十种商业摄影创意");
    saveError = false;
    await editor.getByRole("button", { name: "从素材库选择", exact: true }).click();
    const picker = frame.getByRole("dialog", { name: "选择案例素材", exact: true });
    await picker.getByRole("button", { name: "隔离验收素材", exact: true }).click();
    await picker.getByRole("button", { name: "应用选择", exact: true }).click();
    assert.equal(calls.filter(call => call.path === "/api/asset-library" && call.method === "POST").length, 0, "选择已有素材不重复入库");
    await editor.locator('input[type="file"]').setInputFiles({ name: "隔离验收上传.png", mimeType: "image/png", buffer: png });
    await editor.getByRole("status").filter({ hasText: "文件已保存到素材库" }).waitFor();
    assert.equal(calls.filter(call => call.path === "/api/upload-media" && call.method === "POST").length, 1);
    assert.equal(calls.filter(call => call.path === "/api/asset-library" && call.method === "POST").length, 1);
    await editor.getByRole("button", { name: "保存展示资料", exact: true }).click();
    await editor.waitFor({ state: "detached" });
    assert.equal(presentation.summary, "更新后的真实展示简介");
    assert.equal(presentation.displayName, "商业摄影 · 中文名称验收");
    assert.deepEqual(presentation.categories, ["image", "marketing"]);
    assert.equal(presentation.media.length, 4);
    await manager.getByRole("button", { name: "关闭弹窗", exact: true }).click();
    await frame.getByRole("button", { name: "查看 Skill 商业摄影 · 中文名称验收", exact: true }).waitFor();
    libraryError = true;
    await frame.getByRole("button", { name: "刷新 Skill", exact: true }).click();
    await frame.getByRole("alert").filter({ hasText: "Skill 注册表暂时不可读取" }).waitFor();
    assert.equal(calls.some(call => /\/api\/(?:images|canvas-agent\/turn)/.test(call.path)), false);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ api: "mock, isolated media fixtures; no installed Skill changed", results, errors, videoRequests, management: "edit + permission-bound asset reuse + failed save preserves original + successful save", noGeneration: true }, null, 2));
    console.log(pickerOnly ? "PASS: showcase picker, upload, and management save (mock APIs)"
      : "PASS: showcase four widths, image original, video playback on demand, collapsed instructions, management, failure, same-canvas selection (mock APIs)");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
