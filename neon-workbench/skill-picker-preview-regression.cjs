const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");
const app = process.env.AI_OS_TEST_APP_DIR || path.resolve(__dirname, "../host-sources/app");
const output = process.env.AI_OS_TEST_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-skill-picker-"));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const videoPath = path.resolve(__dirname, "../AI-OS-Portable-1.0.5-win-x64/data/output/minimax_h3_1791456128166_2ef47959.mp4");
test("快捷列表图片及视频悬停、焦点、稳定排序、改名刷新与更多保留当前画布", async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(2500);
    const errors = [], media = [], mutations = [];
    page.on("pageerror", error => errors.push(error.message));
    let label = "商业产品摄影 · 十种创意方案与多平台视觉素材";
    let catalogLoads = 0;
    let conversation = { boardId: "isolated-board", conversationId: "isolated-session", items: [], generationSettings: { mode: "agent" } };
    const skill = () => ({ id: "product-plan", name: "product-plan", label, description: "原始专业说明", scope: "personal", origin: "custom",
      categories: [{ id: "image", label: "图像创作" }, { id: "marketing", label: "商业广告" }],
      presentation: { summary: "上传产品图，规划十种创意", media: [{ id: "clip", type: "video/mp4" }], coverId: "clip" } });
    await page.route("**/*", route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() !== "GET") mutations.push(url.pathname);
      if (url.pathname === "/api/canvas-agent/conversation") {
        if (req.method() === "POST") conversation = req.postDataJSON().conversation;
        return route.fulfill({ json: conversation });
      }
      if (url.pathname === "/api/canvas-agent/skills") {
        const skills = [skill(),
          { ...skill(), id: "photo-plan", label: "商业产品摄影 · 十种创意方案", coverMedia: { id: "photo", type: "image/png", url: "/output/existing-photo.png" } },
          { ...skill(), id: "showcase-plan", label: "展示素材验收专用", scope: "public", coverId: "image-b",
            presentation: { media: [{ id: "image-a", type: "image/png" }, { id: "image-b", type: "image/png" }], coverId: "image-b" } },
          { id: "empty-plan", name: "empty-plan", label: "无案例流程", description: "没有上传效果案例", origin: "custom", scope: "personal", categories: [{ id: "productivity", label: "效率工具" }] }];
        if (++catalogLoads % 2 === 0) skills.reverse();
        return route.fulfill({ json: { configured: true, agentSettings: { configured: true }, skills, pickerSkills: skills } });
      }
      if (url.pathname === "/api/skills/media") {
        media.push(url.search);
        return url.searchParams.get("media_id") !== "clip" || url.searchParams.has("thumbnail") || url.searchParams.has("poster")
          ? route.fulfill({ contentType: "image/png", body: png })
          : route.fulfill({ contentType: "video/mp4", body: fs.readFileSync(videoPath) });
      }
      return route.fulfill({ contentType: "text/html", body: '<main class="canvas-workspace"><div class="canvas-actions"></div><div id="canvasPlane"></div></main>' });
    });
    await page.goto("http://127.0.0.1:33199/isolated-picker");
    const initializePicker = async () => {
      await page.addStyleTag({ content: fs.readFileSync(path.join(app, "canvas-agent.css"), "utf8") + fs.readFileSync(path.join(app, "neon-bridge.css"), "utf8") + `
      :root{--background:#090b0d;--card:#111418;--popover:#111418;--secondary:#14191a;--foreground:#f2f5f3;--primary-foreground:#101612;--muted-foreground:#a2aba6;--border:#2a302d;--primary:#74ee7d;--ring:#a4ff81;--input:#14191a;--radius:12px;--shadow-lg:0 8px 24px #0006}
      html,body,.canvas-workspace{margin:0;width:100%;height:100%;position:relative;background:var(--background);font:13px Arial} .canvas-agent-panel{position:fixed}
    ` });
    await page.evaluate(() => {
      window.AiOsDesktop = { getSession: () => ({ user: { id: "isolated-user" } }) };
      window.getActiveCanvasBoardInfo = () => ({ id: "isolated-board" });
      window.CanvasAgentCore = { normalizeAgentReferences: () => [] };
      window.CanvasAgentCapabilities = {}; window.CanvasAgentSkillContract = {};
      window.CanvasAgentBroker = { createBroker: () => ({ invalidate() {} }) };
      window.CanvasAgentMcpServer = {}; window.CanvasAgentToolAdapters = { create: () => ({}) };
      window.CanvasAgentCanvasApi = { getBoardId: () => "isolated-board" };
      window.renderCanvasNodeIcons = () => {};
      window.canvas = { nodes: ["original"], zoom: 0.61, selected: ["original"], chat: ["原对话"] };
      window.moreCount = 0; addEventListener("neon:request-skill-square", () => moreCount++);
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(app, "canvas-agent-conversation.js"), "utf8") });
    await page.addScriptTag({ content: fs.readFileSync(path.join(app, "canvas-agent-ui.js"), "utf8") });
    await page.waitForFunction(() => document.querySelector("#canvasAgentSessionId")?.textContent === "isolated-session");
    };
    await initializePicker();
    await page.locator("#canvasAgentToggle").click();
    await page.locator("#canvasAgentSkillBook").click();
    const more = page.getByRole("button", { name: "更多", exact: true });
    const header = page.locator("#canvasAgentSkillPopover header");
    await more.waitFor();
    assert.equal(await page.locator("#canvasAgentSkillHint").count(), 0, "已安装数量提示已移除");
    assert.equal(await more.evaluate(element => element.parentElement === document.querySelector("#canvasAgentSkillPopover header")), true, "更多选择位于快捷选择右上角");
    const headerBounds = await header.boundingBox();
    const moreBounds = await more.boundingBox();
    assert.ok(headerBounds && moreBounds && moreBounds.x + moreBounds.width <= headerBounds.x + headerBounds.width, "更多选择不溢出标题栏");
    const headerLayout = await page.evaluate(() => {
      const header = document.querySelector(".canvas-agent-skill-header");
      const title = header.querySelector(":scope > span").getBoundingClientRect();
      const search = header.querySelector("#canvasAgentSkillSearch").closest(".canvas-agent-skill-search-wrap").getBoundingClientRect();
      const moreButton = header.querySelector("#canvasAgentSkillMore");
      const more = moreButton.getBoundingClientRect();
      const centerY = rect => rect.top + rect.height / 2;
      return {
        title: { x: title.x, y: title.y, w: title.width, h: title.height },
        search: { x: search.x, y: search.y, w: search.width, h: search.height },
        more: { x: more.x, y: more.y, w: more.width, h: more.height },
        searchMoreGap: more.left - search.right,
        moreMarginLeft: getComputedStyle(moreButton).marginLeft,
        headerGap: getComputedStyle(header).gap,
        rowCenterDelta: Math.max(Math.abs(centerY(title) - centerY(search)), Math.abs(centerY(search) - centerY(more))),
      };
    });
    assert.ok(headerLayout.searchMoreGap >= 6 && headerLayout.searchMoreGap <= 8, JSON.stringify(headerLayout));
    assert.ok(headerLayout.rowCenterDelta <= 1, JSON.stringify(headerLayout));
    await page.locator("#canvasAgentGenerationButton").click();
    assert.equal(await page.locator("#canvasAgentGenerationPopover").isVisible(), true,
      "滑杆入口打开生成参数");
    assert.equal(await page.locator("#canvasAgentGenerationButton").getAttribute("aria-expanded"), "true");
    await page.locator("#canvasAgentGenerationButton").click();
    assert.equal(await page.locator("#canvasAgentGenerationPopover").isVisible(), false);
    const toolbar = await page.locator(".canvas-agent-composer-tools > button").evaluateAll(buttons => buttons.map(button => button.id));
    assert.deepEqual(toolbar, [
      "canvasAgentModeButton",
      "canvasAgentSkillBook",
      "canvasAgentGenerationButton",
    ], "底部工具入口按模式、Skill、生成偏好排列");
    assert.equal(await page.locator("#canvasAgentGenerationButton").getAttribute("title"), "生成偏好");
    await page.locator("#canvasAgentSkillBook").click();
    const order = () => page.locator("[data-agent-skill]").evaluateAll(items => items.map(item => item.dataset.agentSkill));
    const expectedOrder = ["photo-plan", "product-plan", "empty-plan", "showcase-plan"];
    for (const [id, title, mediaId, scope] of [
      ["photo-plan", "商业产品摄影 · 十种创意方案", "photo", null],
      ["showcase-plan", "展示素材验收专用", "image-b", "public"],
    ]) {
      const button = page.locator(`[data-agent-skill="${id}"]`);
      for (const interaction of ["hover", "focus"]) {
        await page.mouse.move(1, 1);
        if (interaction === "hover") await button.hover();
        else await button.focus();
        const preview = page.getByRole("tooltip", { name: title, exact: true });
        await preview.waitFor();
        await page.waitForFunction(() => document.querySelector("#canvasAgentSkillPreview img")?.naturalWidth > 0);
        const query = new URL(await preview.locator("img").getAttribute("src"), page.url()).searchParams;
        assert.equal(query.get("media_id"), mediaId, "读取实际选定封面");
        assert.equal(query.get("scope"), scope, "保留私人和公共案例的鉴权范围");
        assert.equal(await preview.locator(".canvas-agent-skill-preview-cover > span").isHidden(), true);
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "选择 Skill", exact: true }).click();
      }
    }
    assert.deepEqual(await order(), expectedOrder, "按中文名称和稳定标识排序，不依赖接口返回顺序");
    for (let attempt = 0; attempt < 3; attempt++) {
      assert.deepEqual(await order(), expectedOrder, "重载接口时顺序不变");
      await page.locator('[data-agent-skill="showcase-plan"]').click();
      await page.getByRole("button", { name: "选择 Skill", exact: true }).click();
      assert.deepEqual(await order(), expectedOrder, "当前选中与最近使用不改变固定顺序");
      await page.locator("#canvasAgentSkillSearch").fill("商业");
      assert.deepEqual(await order(), expectedOrder.slice(0, 2), "搜索保留相对顺序");
      await page.locator("#canvasAgentSkillSearch").fill("");
      assert.deepEqual(await order(), expectedOrder);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "选择 Skill", exact: true }).click();
    }
    await page.reload();
    await initializePicker();
    if (await page.locator("#canvasAgentToggle").getAttribute("aria-expanded") !== "true") await page.locator("#canvasAgentToggle").click();
    await page.locator("#canvasAgentSkillBook").click();
    assert.deepEqual(await order(), expectedOrder, "完整刷新与重新读取 Skill 后顺序不变");
    await page.keyboard.press("Escape");
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 });
      await page.getByRole("button", { name: "选择 Skill", exact: true }).click();
      const button = page.locator('[data-agent-skill="product-plan"]');
      await button.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const item = document.querySelector('[data-agent-skill="product-plan"]');
        return item && item.getBoundingClientRect().height > 0;
      });
      assert.equal(await button.locator("small").count(), 0, "快捷列表不展示 Skill 简介");
      assert.equal(await button.locator("strong").textContent(), label, "名称独占第一行");
      const skillLayout = await page.evaluate(() => {
        const element = document.querySelector('#canvasAgentSkills [data-agent-skill="product-plan"]');
        const search = document.querySelector("#canvasAgentSkillSearch");
        const searchWrap = search.closest(".canvas-agent-skill-search-wrap");
        const searchRect = searchWrap.getBoundingClientRect();
        const list = document.querySelector("#canvasAgentSkills");
        const rect = element.getBoundingClientRect();
        return {
          rowHeight: rect.height,
          visibleText: element.innerText.trim(),
          searchWidth: searchRect.width,
          searchHeight: searchRect.height,
          searchGapToMore: document.querySelector("#canvasAgentSkillMore").getBoundingClientRect().left - searchRect.right,
          listOverflowY: getComputedStyle(list).overflowY,
          listMaxHeight: parseFloat(getComputedStyle(list).maxHeight),
        };
      });
      assert.equal(skillLayout.rowHeight, 38, JSON.stringify({ width, skillLayout }));
      assert.equal(skillLayout.visibleText, label, JSON.stringify({ width, skillLayout }));
      assert.ok(skillLayout.searchWidth >= 120, JSON.stringify({ width, skillLayout }));
      assert.ok(skillLayout.searchHeight >= 25 && skillLayout.searchHeight <= 27, JSON.stringify({ width, skillLayout }));
      assert.ok(skillLayout.searchGapToMore >= 6 && skillLayout.searchGapToMore <= 8, JSON.stringify({ width, skillLayout }));
      assert.equal(skillLayout.listOverflowY, "auto");
      assert.ok(skillLayout.listMaxHeight < 500, JSON.stringify({ width, skillLayout }));
      await page.screenshot({ path: path.join(output, `skills-${width}.png`) });
      await page.locator("#canvasAgentSkillSearch").fill("没有上传效果案例");
      assert.deepEqual(await order(), ["empty-plan"], "搜索仍匹配隐藏的 Skill 描述数据");
      await page.locator("#canvasAgentSkillSearch").fill("");
      await button.hover();
      const originalBounds = await button.boundingBox();
      const hoverColors = await button.evaluate(element => ({
        foreground: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
        primaryForeground: getComputedStyle(document.documentElement).getPropertyValue("--primary-foreground").trim(),
        primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
      }));
      assert.notEqual(hoverColors.background, "rgb(0, 255, 65)", "悬停不再使用整块高亮绿色");
      assert.notEqual(hoverColors.foreground, hoverColors.background);
      assert.ok(hoverColors.foreground !== hoverColors.background);
      const preview = page.getByRole("tooltip", { name: label, exact: true });
      await preview.waitFor();
      await preview.getByText("上传产品图，规划十种创意", { exact: true }).waitFor();
      await preview.getByText("图像创作 · 商业广告", { exact: true }).waitFor();
      const bounds = await preview.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 960, JSON.stringify({ width, bounds }));
      assert.deepEqual(await button.boundingBox(), originalBounds, "预览不改变列表布局");
      const video = preview.locator("video");
      await video.waitFor();
      assert.equal(await video.evaluate(item => getComputedStyle(item).objectFit), "contain", "Skill 悬停预览完整显示竖版封面");
      assert.equal(await preview.locator(".canvas-agent-skill-preview-cover").evaluate(cover => {
        const image = document.createElement("img");
        cover.append(image);
        const fit = getComputedStyle(image).objectFit;
        image.remove();
        return fit;
      }), "contain", "图片封面同样使用等比完整展示");
      assert.equal(await video.evaluate(item => getComputedStyle(item.parentElement).backgroundColor), "rgb(20, 25, 26)", "封面空余区域填充深色背景");
      await page.waitForFunction(() => {
        const item = document.querySelector("#canvasAgentSkillPreview video");
        return item?.readyState >= 2 && item.paused && item.muted;
      });
      assert.equal(await video.evaluate(item => item.hasAttribute("autoplay")), false, "预览视频不自动播放");
      assert.equal(await preview.locator(".canvas-agent-skill-preview-cover > span").isHidden(), true, "成功读取封面后不残留加载提示");
      assert.ok(media.filter(query => query.includes("media_id=clip")).every(query => !query.includes("thumbnail=1") && !query.includes("poster=1")), "无封面视频读取原视频静态首帧");
      await page.mouse.move(1, 1);
      await preview.waitFor({ state: "detached" });
      const empty = page.locator('[data-agent-skill="empty-plan"]');
      await empty.focus();
      await page.getByRole("tooltip", { name: "无案例流程", exact: true }).getByText("暂无效果预览", { exact: true }).waitFor();
      await button.focus();
      const focusColors = await button.evaluate(element => ({
        foreground: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
      }));
      assert.notEqual(focusColors.background, "rgb(0, 255, 65)", "键盘焦点不使用整块高亮绿色");
      assert.notEqual(focusColors.foreground, focusColors.background);
      await preview.waitFor();
      await page.screenshot({ path: path.join(output, `picker-${width}.png`) });
      await page.keyboard.press("Escape");
      await preview.waitFor({ state: "detached" });
      assert.equal(await page.locator("#canvasAgentSkillPopover").isVisible(), false);
    }
    label = "中文显示名称已更新";
    await page.getByRole("button", { name: "选择 Skill", exact: true }).click();
    await page.locator("[data-agent-skill] strong").filter({ hasText: label }).waitFor();
    await page.locator('[data-agent-skill="product-plan"]').click();
    const activeColors = await page.locator('[data-agent-skill="product-plan"]').evaluate(element => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    assert.notEqual(activeColors.background, "rgb(0, 255, 65)", "选中态不使用整块高亮绿色");
    assert.notEqual(activeColors.foreground, activeColors.background);
    assert.equal(await page.locator("#canvasAgentMode").textContent(), label);
    assert.equal(await page.getByRole("tooltip").count(), 0);
    await page.getByRole("button", { name: "选择 Skill", exact: true }).click();
    await more.click();
    assert.equal(await page.evaluate(() => moreCount), 1);
    assert.deepEqual(await page.evaluate(() => canvas), { nodes: ["original"], zoom: 0.61, selected: ["original"], chat: ["原对话"] });
    assert.ok(mutations.length && mutations.every(url => url === "/api/canvas-agent/conversation"));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
