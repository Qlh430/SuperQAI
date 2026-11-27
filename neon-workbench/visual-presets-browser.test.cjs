"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = "http://127.0.0.1:33200";
const output = path.resolve(__dirname, "../.design/image-generation-agent-context-20261116");
const presetCategoryConfig = JSON.parse(fs.readFileSync(
  path.join(__dirname, "design-sources/visual-preset-categories.json"),
  "utf8",
));
const presetConfig = JSON.parse(fs.readFileSync(
  path.join(__dirname, "design-sources/visual-presets.json"),
  "utf8",
));
const presetLibrary = JSON.parse(fs.readFileSync(
  path.join(__dirname, "design-sources/visual-preset-library.json"),
  "utf8",
));
const { extendCategories, extendPresets } = require("./visual-presets-build.cjs");
const { effects } = JSON.parse(fs.readFileSync(path.join(__dirname, "design-sources/visual-preset-effects.json"), "utf8"));
const presetCategories = extendCategories(presetCategoryConfig, presetLibrary.entries).categories;
const runtimePresets = extendPresets(
  presetConfig.presets,
  presetLibrary.entries,
  path.join(__dirname, "public/visual-presets"),
  null,
  null,
  effects,
);
assert.equal(presetCategories.length, 5);
assert.equal(presetCategories.find(category => category.id === "characterDesign").groups.length, 32);
assert.deepEqual(
  presetCategories.find(category => category.id === "characterDesign").tabs.map(tab => tab.label),
  ["基础", "妆容与穿搭", "五官", "体型", "发型", "风格"],
);
assert.deepEqual(presetCategories.find(category => category.id === "stylePreset").tabs.map(tab => tab.label),
  ["真人风格", "MV 风格", "2D 风格", "3D 风格"]);
assert.deepEqual(presetCategories.find(category => category.id === "filterPreset").tabs.map(tab => tab.label),
  ["通用", "人像质感"]);
assert.deepEqual(presetCategories.find(category => category.id === "cameraControl").tabs.map(tab => tab.label),
  ["相机", "镜头", "焦距", "光圈"]);
for (const tag of ["真人风格", "MV 风格", "2D 风格", "3D 风格"]) {
  assert.equal(runtimePresets.filter(preset => preset.group === "stylePreset" && preset.tags.includes(tag)).length, 20);
}
assert.equal(runtimePresets.filter(preset => preset.group === "filterPreset" && preset.tags.includes("general")).length, 12);
assert.equal(runtimePresets.filter(preset => preset.group === "filterPreset" && preset.tags.includes("portrait")).length, 6);
assert.equal(runtimePresets.filter(preset => preset.group === "functionPreset").length, 12);
assert.equal(runtimePresets.filter(preset => preset.group === "camera" && preset.libraryId?.startsWith("CAM")).length, 6);
assert.equal(runtimePresets.filter(preset => preset.group === "lens" && preset.libraryId?.startsWith("LEN")).length, 6);
const previewManifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, "design-sources/visual-preset-previews.json"),
  "utf8",
));
const focal50 = presetConfig.presets.find(preset => preset.id === "focal-50");
const focal50Asset = path.resolve("Q:/assets", focal50.thumbnail.slice(6));
const focal50Hash = crypto.createHash("sha256").update(fs.readFileSync(focal50Asset)).digest("hex");
assert.equal(previewManifest.images[focal50.thumbnail]?.sha256, focal50Hash,
  "50mm 预览必须映射到 Q:\\assets 中当前的同名资源");
assert.equal(presetConfig.presets.some(preset => preset.id === "aperture-f16"), false,
  "没有 f/16 配置项时不得将该素材映射到其他光圈预设");
const apertureF14 = presetConfig.presets.find(preset => preset.id === "aperture-f1-4");
assert.ok(fs.existsSync(path.resolve("Q:/assets", apertureF14.thumbnail.slice(6))),
  "f/1.4 预览资源必须与 Q:\\assets 中的实际文件名一致");
fs.mkdirSync(output, { recursive: true });

function expectedGroups(category, tabId = "") {
  if (category.tabs) {
    const tab = category.tabs.find(item => item.id === tabId);
    if (!tab?.groups) return [];
    return tab.groups.map(value => typeof value === "string"
      ? category.groups.find(group => group.id === value)?.label || value
      : value.label || value.id);
  }
  if (category.groups) return category.groups.map(group => group.label);
  const items = runtimePresets.filter(preset => preset.group === category.id)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  return [...new Set(items.map(preset => preset.tags?.[0]).filter(Boolean))];
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const errors = [];
  const mutations = [];
  const generationRequests = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    window.NeonCanvasPerformanceFlags = {
      representationManager: false, detailHydration: false, detailCulling: false,
    };
  });
  page.on("pageerror", error => errors.push(error.message));
  // Program files come from the real workbench. Business writes and generation stay isolated.
  await page.route("**/api/**", route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== "GET") mutations.push(pathname);
    if (pathname === "/api/canvas-agent/skills") {
      const skills = [
        {
          id: "qa-product-skill",
          name: "qa-product-skill",
          label: "产品摄影方案",
          description: "仅用于确认描述字段仍可被搜索",
          scope: "personal",
          origin: "custom",
        },
        {
          id: "qa-editorial-skill",
          name: "qa-editorial-skill",
          label: "品牌视觉编辑",
          description: "将品牌策略整理为视觉内容",
          scope: "personal",
          origin: "custom",
        },
      ];
      return route.fulfill({ json: {
        configured: true,
        agentSettings: { configured: true, candidateCount: 1 },
        skills,
        pickerSkills: skills,
      } });
    }
    if (pathname === "/api/image-models") return route.fulfill({ json: {
      models: [{ id: "gpt-image-1", displayName: "隔离验收图片模型" }],
      defaultModel: "gpt-image-1", platforms: { "gpt-image-1": "openai" },
      resolutions: { "gpt-image-1": ["1"] },
    } });
    if (pathname === "/api/image-jobs" && request.method() === "POST") {
      generationRequests.push(request.postDataJSON());
      return route.fulfill({ status: 400, json: {
        error: "无法识别当前图片比例，api_key=sk-1234567890SECRET",
        code: "IMAGE_SIZE_NOT_SUPPORTED",
      } });
    }
    if (pathname.endsWith("/operations") && request.method() === "POST") {
      const body = request.postDataJSON();
      return route.fulfill({ json: {
        revision: Number(body.baseRevision || 0) + 1,
        results: (body.operations || []).map(operation => ({
          operationId: operation.operationId, status: "applied", entityRevision: 1,
        })),
      } });
    }
    return route.fulfill({ json: {
      authenticated: false, boards: [], projects: [], resources: [], records: [],
      models: [], imageModels: [], providers: [], preferences: {}, settings: {},
    } });
  });
  await page.routeWebSocket("**/*", socket => socket.close());
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator", "canvas-node-comfy"]);
      await loadImageModels();
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      document.body.append(surface);
      surface.append(document.querySelector("#canvasView"));
      document.querySelector("#canvasView").hidden = false;
      document.querySelector("#canvasView").classList.add("active");
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      canvasState.activeBoardId = "qa-visual-presets";
      showCanvasEditor();
      const node = addCanvasApiNode({ x: 280, y: 80 }, { prompt: "街边咖啡馆的商业人像", name: "视觉预设验收" });
      node.dataset.boardId = canvasState.activeBoardId;
      syncCanvasNodeModel(node);
      CanvasFloraNodeShell.mount(node);
      selectCanvasNode(node);
      FloraGeneratorComposer.mount(node, node.querySelector(".flora-node-shell"));
      window.presetTestNodeId = node.dataset.id;
      window.presetChanges = 0;
      window.presetChangeLog = [];
      window.addEventListener("flora-visual-presets-change", event => {
        window.presetChanges++;
        window.presetChangeLog.push(event.detail.presets);
      });
    });
    const entries = page.locator(".flora-visual-presets-entries:visible");
    await entries.waitFor();
    assert.equal(await entries.locator("button").count(), 5);
    const entryContract = await entries.evaluate(element => {
      const host = element.closest(".flora-visual-presets");
      const settings = element.closest(".flora-generator-settings");
      const controls = settings?.querySelector(".canvas-node-controls");
      const footer = settings?.closest(".flora-generator-footer");
      const actions = footer?.querySelector(".flora-generator-actions");
      const run = actions?.querySelector(".canvas-node-run");
      const rect = element.getBoundingClientRect();
      const controlRect = controls?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const runRect = run?.getBoundingClientRect();
      const footerStyle = footer && getComputedStyle(footer);
      const actionsStyle = actions && getComputedStyle(actions);
      return {
        inSettingsRow: Boolean(settings && host?.parentElement === settings),
        followsControls: Boolean(controls && host === controls.nextElementSibling),
        sameLine: Boolean(controlRect
          && Math.abs(rect.top + rect.height / 2 - controlRect.top - controlRect.height / 2) < 5),
        width: rect.width,
        labels: [...element.querySelectorAll("button")].map(button => ({
          text: button.textContent.trim(),
          title: button.title,
          label: button.getAttribute("aria-label"),
        })),
        runAtRightEdge: Boolean(runRect && footerRect && footerStyle
          && Math.abs(runRect.right - footerRect.right
            + parseFloat(footerStyle.paddingRight || "0")) < 3),
        runRight: runRect?.right,
        footerRight: footerRect?.right,
        actionsMarginLeft: actionsStyle?.marginLeft,
        footerWidth: footerRect?.width,
        footerScrollWidth: footer?.scrollWidth,
      };
    });
    assert.equal(entryContract.inSettingsRow, true, "预设入口必须在生成参数行内");
    assert.equal(entryContract.followsControls, true, "预设入口必须紧跟模型和尺寸控件");
    assert.equal(entryContract.sameLine, true, "预设入口必须与参数控件保持同一水平行");
    assert.ok(entryContract.labels.every(entry => !entry.text && entry.title && entry.label),
      "入口只显示图标，并提供中文 Tooltip 和可访问名称");
    assert.equal(entryContract.runAtRightEdge, true, `生成按钮必须贴齐操作区最右端：${JSON.stringify(entryContract)}`);
    const testNodeId = await page.evaluate(() => presetTestNodeId);
    const generationProbe = await page.evaluate(async id => {
      const node = getCanvasNode(id);
      const model = node.querySelector(".canvas-node-model");
      const size = node.querySelector(".canvas-node-size");
      const resolution = node.querySelector(".canvas-node-resolution");
      const customField = node.querySelector(".canvas-custom-size-field");
      const prompt = node.querySelector(".canvas-node-prompt");

      FloraVisualPresets.write(node, {});
      prompt.value = "无视觉预设的基线商业摄影";
      node.dataset.modelSelection = "exact";
      model.dataset.modelSelection = "exact";
      size.value = "auto";
      node.dataset.canvasSize = "auto";
      resolution.value = "1";
      node.dataset.canvasResolution = "1";
      const baseline = await runCanvasImageEdit(node);

      FloraVisualPresets.write(node, {
        characterDesign: {
          gender: "gender-female",
          age: "age-youth-18-25",
          ethnicity: "ethnicity-east-asian",
          era: "era-modern",
        },
      });
      prompt.value = "";
      node.dataset.modelSelection = "auto";
      model.dataset.modelSelection = "auto";
      size.value = "custom";
      size.dataset.previousSize = "1024x1024";
      node.dataset.canvasSize = "custom";
      customField.hidden = true;
      customField.querySelector('[data-size-axis="width"]').value = "";
      customField.querySelector('[data-size-axis="height"]').value = "";
      const roleOnly = await runCanvasImageEdit(node);
      FloraVisualPresets.write(node, { filterPreset: "FG02" });
      prompt.value = "骑行照片原有构图";
      node.dataset.modelSelection = "exact";
      model.dataset.modelSelection = "exact";
      size.value = "auto";
      node.dataset.canvasSize = "auto";
      setCanvasNodeStatus(node, "待执行");
      const filterWithoutReference = await runCanvasImageEdit(node);
      FloraVisualPresets.hydrate(node, {});
      prompt.value = "街边咖啡馆的商业人像";
      node.dataset.modelSelection = "auto";
      model.dataset.modelSelection = "auto";
      size.value = "auto";
      node.dataset.canvasSize = "auto";
      resolution.value = "1";
      node.dataset.canvasResolution = "1";
      setCanvasNodeStatus(node, "待执行");
      return { baseline, roleOnly, filterWithoutReference };
    }, testNodeId);
    assert.equal(generationRequests.length, 2, "无视觉预设与角色预设各形成一次被隔离拦截的请求；缺少原图的滤镜应在本地拦截");
    assert.equal(generationRequests[0].prompt.includes("[AI OS 视觉预设]"), false,
      "无预设时不拼入视觉配置内容");
    assert.match(generationRequests[0].prompt, /无视觉预设的基线商业摄影/);
    assert.equal(generationRequests[0].model, "gpt-image-1");
    assert.equal(generationRequests[0].size, "auto");
    assert.match(generationRequests[1].prompt, /女性化人物表达/);
    assert.match(generationRequests[1].prompt, /18-25 岁青年年龄段/);
    assert.match(generationRequests[1].prompt, /东亚面部特征参考/);
    assert.match(generationRequests[1].prompt, /时代语境：现代/);
    assert.equal(generationProbe.filterWithoutReference.code, "preset_reference_required");
    assert.match(generationProbe.filterWithoutReference.error, /连接.*图片/);
    assert.equal(generationRequests[1].model, undefined, "自动选择模式不被角色预设覆盖");
    assert.equal(generationRequests[1].size, "1024x1024", "恢复的 custom 选择必须序列化为有效尺寸");
    assert.deepEqual(generationRequests[1].reference_images, [], "角色缩略图不能变成图片参考输入");
    assert.equal(generationProbe.roleOnly.code, "request_parameters_unsupported",
      "上游参数错误映射为明确错误类别");
    assert.match(generationProbe.roleOnly.error, /无法识别当前图片比例/);
    assert.doesNotMatch(generationProbe.roleOnly.error, /1234567890SECRET/,
      "错误详情中的密钥必须脱敏");
    await page.evaluate(() => {
      presetChanges = 0;
      presetChangeLog = [];
    });
    const picker = page.locator(".flora-visual-presets-picker:popover-open");
    const open = id => entries.locator(`[data-preset-entry="${id}"]`).click();
    const choose = id => picker.locator(`[data-preset-id="${id}"]`).click();
    const save = () => picker.locator('[data-preset-action="save"]').click();
    const read = () => page.evaluate(() => FloraVisualPresets.read(getCanvasNode(presetTestNodeId)));
    const assertCompactSearch = async category => {
      const measured = await picker.locator(".flora-visual-presets-search-wrap").evaluate(element => {
        const input = element.querySelector("input");
        const icon = element.querySelector("svg");
        const rect = element.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        const style = getComputedStyle(input);
        return {
          wrapper: { width: rect.width, height: rect.height },
          input: { width: inputRect.width, height: inputRect.height },
          icon: { width: iconRect.width, height: iconRect.height },
          fontSize: style.fontSize,
          borderWidth: style.borderWidth,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
        };
      });
      assert.deepEqual(measured.wrapper, { width: 156, height: 26 }, `${category} 搜索外框规格统一`);
      assert.deepEqual(measured.input, { width: 156, height: 26 }, `${category} 搜索输入规格统一`);
      assert.deepEqual(measured.icon, { width: 12, height: 12 }, `${category} 搜索图标规格统一`);
      assert.equal(measured.fontSize, "11px", `${category} 搜索字号统一`);
      assert.equal(measured.borderWidth, "1px", `${category} 搜索边框统一`);
      assert.equal(measured.borderRadius, "6px", `${category} 搜索圆角统一`);
      assert.equal(measured.boxShadow, "none", `${category} 搜索框无明显光晕`);
      console.log(`${category}搜索框: ${measured.wrapper.width}x${measured.wrapper.height}, icon ${measured.icon.width}x${measured.icon.height}, ${measured.fontSize}`);
    };

    await open("characterDesign");
    let placement = await picker.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const anchor = document.querySelector('[data-preset-entry="characterDesign"]').getBoundingClientRect();
      return {
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        anchorLeft: anchor.left, anchorRight: anchor.right, anchorTop: anchor.top,
        width: rect.width, viewportWidth: innerWidth, viewportHeight: innerHeight,
      };
    });
    assert.ok(placement.width >= 740 && placement.width <= 760);
    assert.ok(placement.left >= 0 && placement.right <= placement.viewportWidth);
    assert.ok(placement.top >= 0 && placement.bottom <= placement.viewportHeight);
    assert.ok(placement.left <= placement.anchorRight && placement.right >= placement.anchorLeft,
      "角色面板应靠近触发图标展开");
    await assertCompactSearch("角色设计");
    assert.equal(await picker.locator(".flora-visual-presets-search-wrap svg").count(), 1,
      "搜索框应显示现有 Lucide 搜索图标");
    assert.equal(await entries.locator('[data-preset-entry="characterDesign"]').getAttribute("aria-expanded"), "true");
    assert.equal(await entries.locator('[data-preset-entry="characterDesign"]').evaluate(button => button.classList.contains("is-open")), true);
    const characterBody = picker.locator(".flora-visual-presets-picker-body");
    assert.equal(await picker.locator("[data-preset-tab]").count(), 6);
    assert.deepEqual(await picker.locator("[data-preset-tab]").allTextContents(),
      ["基础", "妆容与穿搭", "五官", "体型", "发型", "风格"]);
    assert.deepEqual(
      await picker.locator(".flora-visual-presets-group-label").allTextContents(),
      expectedGroups(presetCategories.find(category => category.id === "characterDesign"), "basic"),
    );
    await picker.locator('[data-preset-tab="look"]').click();
    assert.deepEqual(
      await picker.locator(".flora-visual-presets-group-label").allTextContents(),
      expectedGroups(presetCategories.find(category => category.id === "characterDesign"), "look"),
    );
    assert.equal(await picker.getByRole("searchbox").inputValue(), "");
    await picker.locator('[data-preset-tab="face"]').click();
    assert.deepEqual(
      await picker.locator(".flora-visual-presets-group-label").allTextContents(),
      expectedGroups(presetCategories.find(category => category.id === "characterDesign"), "face"),
    );
    await picker.locator('[data-preset-tab="basic"]').click();
    const previewSize = await page.evaluate(async thumbnail => {
      const image = new Image();
      image.src = thumbnail;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, runtimePresets.find(preset => preset.id === "age-child-6-12")?.thumbnail);
    assert.ok(Math.max(previewSize.width, previewSize.height) <= 320,
      "角色设计预览最长边不得超过 320px");
    await open("characterDesign");
    assert.equal(await picker.count(), 0, "再次点击当前入口应关闭浮层");
    assert.equal(await page.evaluate(() => presetChanges), 0, "未修改选择就关闭不能产生节点保存事件");
    await open("characterDesign");
    assert.equal(await picker.locator("[data-preset-tab]").count(), 6);
    await picker.locator('[data-preset-tab="look"]').click();
    assert.equal(await picker.locator('[data-preset-id="gender-female"]').count(), 0,
      "妆容与穿搭页不显示基础属性");
    await picker.locator('[data-preset-tab="basic"]').click();
    const characterSearch = picker.getByRole("searchbox");
    await characterSearch.fill("设计师");
    assert.equal(await characterSearch.evaluate(element => element === document.activeElement), true);
    assert.deepEqual(await picker.locator(".flora-visual-presets-group-label").allTextContents(), ["职业身份"]);
    await characterSearch.fill("");
    await choose("gender-female");
    await choose("age-youth-18-25");
    await choose("ethnicity-east-asian");
    await choose("profession-designer");
    await save();
    assert.equal((await read()).characterDesign.profession, "profession-designer");
    await open("characterDesign");
    assert.equal(await picker.locator("[data-preset-tab]").count(), 6);
    await picker.locator('[data-preset-tab="look"]').click();
    assert.equal(await picker.locator('[data-preset-id="gender-female"]').count(), 0);
    assert.equal(await picker.locator(".flora-visual-presets-tag").count(), 4,
      "切换属性域不清除当前草稿中的其他域选择");
    await picker.locator('[data-preset-tab="basic"]').click();
    const selectedFooter = await picker.evaluate(element => {
      const footer = element.querySelector(".flora-visual-presets-picker-footer");
      const selection = footer?.querySelector(".flora-visual-presets-selection");
      const tags = selection?.querySelectorAll(".flora-visual-presets-tag") || [];
      const firstTag = tags[0];
      const label = firstTag?.querySelector(".flora-visual-presets-tag-label");
      const clear = firstTag?.querySelector(".flora-visual-presets-tag-clear");
      const actions = footer?.querySelector(".flora-visual-presets-picker-actions");
      const labelRect = label?.getBoundingClientRect();
      const clearRect = clear?.getBoundingClientRect();
      return {
        tags: tags.length,
        actions: actions?.querySelectorAll("[data-preset-action]").length || 0,
        separatedRows: Boolean(selection && actions && selection.parentElement === footer && actions.parentElement === footer),
        clearWidth: clearRect?.width || 0,
        clearHeight: clearRect?.height || 0,
        labelBeforeClear: Boolean(labelRect && clearRect && labelRect.right <= clearRect.left + 1),
        tagOverflow: firstTag ? firstTag.scrollWidth > firstTag.clientWidth : false,
      };
    });
    assert.equal(selectedFooter.tags, 4, "所有已选角色属性都显示为独立标签");
    assert.equal(selectedFooter.actions, 3, "重置、取消、保存始终位于独立操作区");
    assert.equal(selectedFooter.separatedRows, true, "已选标签区和固定操作按钮分成上下两层");
    assert.ok(selectedFooter.clearWidth >= 20 && selectedFooter.clearHeight >= 20,
      "标签移除按钮有完整点击区域");
    assert.equal(selectedFooter.labelBeforeClear, true, "标签文字不会覆盖右侧移除按钮");
    await picker.locator('[data-clear-preset="age-youth-18-25"]').click();
    assert.equal(await picker.count(), 1, "移除标签后预设面板继续保持打开");
    assert.equal(
      await picker.locator('[data-preset-id="age-youth-18-25"]').getAttribute("aria-pressed"),
      "false",
      "移除标签后对应年龄卡片立即取消选中",
    );
    assert.equal(await picker.locator(".flora-visual-presets-tag").count(), 3,
      "移除标签后其他已选项保留");
    assert.deepEqual((await read()).characterDesign, {
      gender: "gender-female",
      age: "age-youth-18-25",
      ethnicity: "ethnicity-east-asian",
      profession: "profession-designer",
    }, "未保存的标签删除保留已保存数据");
    await save();
    assert.deepEqual((await read()).characterDesign, {
      gender: "gender-female",
      ethnicity: "ethnicity-east-asian",
      profession: "profession-designer",
    }, "保存后只删除对应年龄属性");
    await open("characterDesign");
    await choose("age-youth-18-25");
    await save();
    await open("characterDesign");
    for (const preset of ["gender-female", "age-youth-18-25", "ethnicity-east-asian", "profession-designer"]) {
      assert.equal(await picker.locator(`[data-preset-id="${preset}"]`).getAttribute("aria-pressed"), "true");
    }
    const characterLayout = await picker.evaluate(element => {
      const body = element.querySelector(".flora-visual-presets-picker-body");
      const footer = element.querySelector(".flora-visual-presets-picker-footer");
      const bodyRect = body.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return {
        bodyOverflows: body.scrollHeight > body.clientHeight,
        footerVisible: footerRect.bottom <= element.getBoundingClientRect().bottom,
        bodyBeforeFooter: bodyRect.bottom <= footerRect.top,
      };
    });
    assert.equal(characterLayout.bodyOverflows, true, "角色分组内容应在面板内部滚动");
    assert.equal(characterLayout.footerVisible, true, "角色选择操作固定在面板底部");
    assert.equal(characterLayout.bodyBeforeFooter, true);
    await characterBody.evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.ok(await characterBody.evaluate(element => element.scrollTop > 0), "角色选项应能在面板内滚动");
    await characterBody.evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, "01-character.png") });
    await picker.locator('[data-preset-action="cancel"]').click();

    await open("characterDesign");
    await picker.locator('[data-preset-tab="look"]').click();
    await picker.getByRole("searchbox").fill("单色全白");
    await choose("LOOK-PALETTE-01");
    const palette = picker.locator('[data-preset-id="LOOK-PALETTE-01"] .flora-visual-presets-palette');
    assert.equal(await palette.locator(".flora-visual-presets-palette-swatch").count(), 4);
    assert.equal(
      await palette.locator(".flora-visual-presets-palette-swatch").first().evaluate(element => getComputedStyle(element).backgroundColor),
      "rgb(255, 255, 255)",
    );
    await page.screenshot({ path: path.join(output, "06-palette.png") });
    await picker.locator('[data-preset-action="cancel"]').click();
    assert.equal((await read()).characterDesign["LOOK-PALETTE"], undefined,
      "程序化色板预览关闭时不应提交未保存选择");

    await open("stylePreset");
    assert.equal(await picker.locator("[data-preset-tab]").count(), 4);
    await assertCompactSearch("风格库");
    placement = await picker.evaluate(element => element.getBoundingClientRect().width);
    assert.ok(placement >= 880 && placement <= 960);
    const searchGeometry = await picker.locator(".flora-visual-presets-search-wrap").evaluate(element => {
      const rect = element.getBoundingClientRect();
      const input = element.querySelector("input");
      const icon = element.querySelector("svg");
      const closeRect = element.closest(".flora-visual-presets-picker")
        .querySelector(".flora-visual-presets-picker-close").getBoundingClientRect();
      const hostSizingRules = [];
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const rule of rules) {
          if (!(rule instanceof CSSStyleRule) || !rule.selectorText) continue;
          try {
            if (!input.matches(rule.selectorText)) continue;
          } catch { continue; }
          const style = rule.style;
          if (!sheet.href?.endsWith("/styles.css")) continue;
          if (["height", "min-height"].some(name => style.getPropertyValue(name))) {
            hostSizingRules.push({
              selector: rule.selectorText,
              height: style.getPropertyValue("height"),
              minHeight: style.getPropertyValue("min-height"),
            });
          }
        }
      }
      const inputRect = input.getBoundingClientRect();
      const iconRect = icon?.getBoundingClientRect();
      const style = getComputedStyle(input);
      return {
        wrapper: { width: rect.width, height: rect.height },
        input: { width: inputRect.width, height: inputRect.height },
        styleSearch: input.classList.contains("flora-visual-presets-search"),
        icon: iconRect && { width: iconRect.width, height: iconRect.height },
        close: { width: closeRect.width, height: closeRect.height, gap: closeRect.left - rect.right },
        computed: {
          height: style.height, minHeight: style.minHeight, padding: style.padding,
          fontSize: style.fontSize, lineHeight: style.lineHeight,
          outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle,
          outlineColor: style.outlineColor, boxShadow: style.boxShadow,
          borderWidth: style.borderWidth, borderColor: style.borderColor,
        },
        hostSizingRules,
      };
    });
    assert.equal(searchGeometry.styleSearch, true, "四类视觉预设搜索框共用基础样式类");
    assert.ok(searchGeometry.wrapper.width >= 150 && searchGeometry.wrapper.width <= 160, JSON.stringify(searchGeometry));
    assert.ok(searchGeometry.wrapper.height <= 28, JSON.stringify(searchGeometry));
    assert.ok(searchGeometry.input.width >= 150 && searchGeometry.input.width <= 160, JSON.stringify(searchGeometry));
    assert.ok(searchGeometry.input.height >= 25 && searchGeometry.input.height <= 28, JSON.stringify(searchGeometry));
    assert.ok(searchGeometry.icon.width <= 13 && searchGeometry.icon.height <= 13, JSON.stringify(searchGeometry));
    assert.equal(searchGeometry.computed.height, "26px", JSON.stringify(searchGeometry));
    assert.equal(searchGeometry.computed.minHeight, "0px", JSON.stringify(searchGeometry));
    assert.equal(searchGeometry.computed.fontSize, "11px", JSON.stringify(searchGeometry));
    assert.equal(searchGeometry.computed.borderWidth, "1px", JSON.stringify(searchGeometry));
    assert.equal(searchGeometry.computed.outlineWidth, "1px", JSON.stringify(searchGeometry));
    assert.equal(searchGeometry.computed.boxShadow, "none", JSON.stringify(searchGeometry));
    assert.deepEqual(searchGeometry.hostSizingRules, [],
      "宿主通用 input 规则不应再命中风格库搜索框");
    assert.ok(searchGeometry.close.gap >= 4 && searchGeometry.close.gap <= 8, JSON.stringify(searchGeometry));
    console.log("风格库搜索框实测:", JSON.stringify({
      wrapper: searchGeometry.wrapper,
      input: searchGeometry.input,
      icon: searchGeometry.icon,
      close: searchGeometry.close,
      computed: searchGeometry.computed,
    }));
    assert.deepEqual(await picker.locator("[data-preset-tab]").allTextContents(),
      ["真人风格", "MV 风格", "2D 风格", "3D 风格"]);
    assert.deepEqual(
      await picker.locator(".flora-visual-presets-group-label").allTextContents(),
      [],
      "风格分类不再平铺为四个分组",
    );
    await picker.locator('[data-preset-tab="mv"]').click();
    assert.equal(
      await picker.locator(".flora-visual-presets-search").evaluate(element => getComputedStyle(element).outlineStyle),
      "none",
      "搜索框失焦后不保留绿色聚焦描边",
    );
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 20);
    assert.equal(await picker.locator("[data-preset-id^='R']").count(), 0);
    assert.equal(await picker.getByRole("searchbox").inputValue(), "");
    await picker.locator('[data-preset-tab="2d"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 20);
    await picker.locator('[data-preset-tab="3d"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 20);
    await picker.locator('[data-preset-tab="real"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 20);
    const styleGrid = picker.locator(".flora-visual-presets-picker-body .flora-visual-presets-grid");
    assert.equal(await styleGrid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length), 5,
      "桌面风格库默认采用五列大图");
    const styleCardLayout = await picker.locator(".flora-visual-presets-card").first().evaluate(element => {
      const rect = element.getBoundingClientRect();
      const image = element.querySelector("img");
      const imageRect = image?.getBoundingClientRect();
      const name = element.querySelector(".flora-visual-presets-card-name");
      return {
        cardWidth: rect.width,
        cardRatio: rect.width / rect.height,
        imageRatio: imageRect ? imageRect.width / imageRect.height : 0,
        imageFit: image && getComputedStyle(image).objectFit,
        namePosition: name && getComputedStyle(name).position,
        nameBottom: name && getComputedStyle(name).bottom,
      };
    });
    assert.ok(styleCardLayout.cardWidth >= 160 && styleCardLayout.cardWidth <= 180, JSON.stringify(styleCardLayout));
    assert.ok(styleCardLayout.cardRatio > 1.7 && styleCardLayout.cardRatio < 1.9, JSON.stringify(styleCardLayout));
    assert.ok(styleCardLayout.imageRatio > 1.7 && styleCardLayout.imageRatio < 1.9, JSON.stringify(styleCardLayout));
    assert.equal(styleCardLayout.imageFit, "cover");
    assert.equal(styleCardLayout.namePosition, "absolute");
    assert.equal(styleCardLayout.nameBottom, "0px");
    await page.setViewportSize({ width: 390, height: 960 });
    const narrowStyleGeometry = await picker.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const body = element.querySelector(".flora-visual-presets-picker-body");
      const grid = body.querySelector(".flora-visual-presets-grid");
      return {
        left: rect.left,
        right: rect.right,
        viewport: innerWidth,
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        scrollWidth: body.scrollWidth,
        clientWidth: body.clientWidth,
      };
    });
    assert.ok(narrowStyleGeometry.left >= 0 && narrowStyleGeometry.right <= narrowStyleGeometry.viewport,
      JSON.stringify(narrowStyleGeometry));
    assert.equal(narrowStyleGeometry.columns, 3, JSON.stringify(narrowStyleGeometry));
    assert.ok(narrowStyleGeometry.scrollWidth <= narrowStyleGeometry.clientWidth, JSON.stringify(narrowStyleGeometry));
    await page.setViewportSize({ width: 1440, height: 1000 });
    const search = picker.getByRole("searchbox");
    const styleBody = picker.locator(".flora-visual-presets-picker-body");
    assert.equal(await styleBody.evaluate(element => getComputedStyle(element).overflowY), "auto");
    assert.equal(await styleBody.locator(".flora-visual-presets-card").count(), 20,
      "当前风格分类完整显示且可在列表区独立滚动");
    await search.fill("商业");
    assert.equal(await styleBody.evaluate(element => element.scrollTop), 0, "搜索结果应回到可见起点");
    assert.equal(await search.inputValue(), "商业");
    assert.equal(await search.evaluate(element => element === document.activeElement), true);
    const searchedStyleGroups = await picker.locator(".flora-visual-presets-group-label").allTextContents();
    assert.deepEqual(searchedStyleGroups, []);
    assert.ok(await picker.locator(".flora-visual-presets-card").count() > 0);
    await search.fill("");
    assert.deepEqual(
      await picker.locator(".flora-visual-presets-group-label").allTextContents(),
      expectedGroups(presetCategories.find(category => category.id === "stylePreset")),
    );
    await choose("style-minimal-commercial");
    await save();
    await open("stylePreset");
    await choose("style-documentary-cinematic");
    await picker.locator('[data-preset-action="cancel"]').click();
    assert.equal((await read()).stylePreset, "style-minimal-commercial");
    await open("stylePreset");
    await choose("style-minimal-commercial");
    await picker.locator('[data-preset-id="style-minimal-commercial"]').press("Escape");
    assert.equal(await picker.count(), 0);
    await open("stylePreset");
    await page.screenshot({ path: path.join(output, "02-styles.png") });
    await picker.locator('[data-close-picker]').click();

    await open("filterPreset");
    await assertCompactSearch("滤镜");
    assert.equal(await picker.locator("[data-preset-tab]").count(), 2);
    placement = await picker.evaluate(element => element.getBoundingClientRect().width);
    assert.ok(placement >= 800 && placement <= 840);
    assert.ok(await picker.locator(".flora-visual-presets-search-wrap").evaluate(
      element => element.getBoundingClientRect().width >= 155
        && element.getBoundingClientRect().width <= 170,
    ), "滤镜搜索框放置在顶部右侧");
    assert.deepEqual(await picker.locator("[data-preset-tab]").allTextContents(), ["通用", "人像质感"]);
    assert.deepEqual(
      await picker.locator(".flora-visual-presets-group-label").allTextContents(),
      [],
    );
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 12);
    const filterGrid = picker.locator(".flora-visual-presets-picker-body .flora-visual-presets-grid");
    assert.equal(await filterGrid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length), 4);
    const filterCard = await picker.locator(".flora-visual-presets-card").first().evaluate(element => {
      const rect = element.getBoundingClientRect();
      const image = element.querySelector("img");
      const imageRect = image.getBoundingClientRect();
      const name = element.querySelector(".flora-visual-presets-card-name");
      return {
        width: rect.width,
        ratio: rect.width / rect.height,
        imageRatio: imageRect.width / imageRect.height,
        namePosition: getComputedStyle(name).position,
      };
    });
    assert.ok(filterCard.width >= 170 && filterCard.width <= 195, JSON.stringify(filterCard));
    assert.ok(filterCard.ratio > 1.7 && filterCard.ratio < 1.9, JSON.stringify(filterCard));
    assert.ok(filterCard.imageRatio > 1.7 && filterCard.imageRatio < 1.9, JSON.stringify(filterCard));
    assert.equal(filterCard.namePosition, "absolute");
    await picker.locator('[data-preset-tab="portrait"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 6);
    await picker.locator('[data-preset-tab="general"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 12);
    const filterBody = picker.locator(".flora-visual-presets-picker-body");
    assert.equal(await filterBody.evaluate(element => getComputedStyle(element).overflowY), "auto");
    const filterSearch = picker.getByRole("searchbox");
    await filterSearch.fill("胶片");
    const searchedFilterGroups = await picker.locator(".flora-visual-presets-group-label").allTextContents();
    assert.deepEqual(searchedFilterGroups, []);
    assert.ok(await picker.locator(".flora-visual-presets-card").count() > 0);
    await filterSearch.fill("");
    assert.deepEqual(
      await picker.locator(".flora-visual-presets-group-label").allTextContents(),
      expectedGroups(presetCategories.find(category => category.id === "filterPreset")),
    );
    for (const [width, expectedColumns] of [[768, 4], [390, 2]]) {
      await page.setViewportSize({ width, height: 960 });
      const filterGeometry = await picker.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const body = element.querySelector(".flora-visual-presets-picker-body");
        const grid = body.querySelector(".flora-visual-presets-grid");
        return {
          left: rect.left,
          right: rect.right,
          viewport: innerWidth,
          columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
          scrollWidth: body.scrollWidth,
          clientWidth: body.clientWidth,
        };
      });
      assert.ok(filterGeometry.left >= 0 && filterGeometry.right <= filterGeometry.viewport, JSON.stringify(filterGeometry));
      assert.equal(filterGeometry.columns, expectedColumns, JSON.stringify(filterGeometry));
      assert.ok(filterGeometry.scrollWidth <= filterGeometry.clientWidth, JSON.stringify(filterGeometry));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await choose("filter-soft-film");
    await save();
    await open("filterPreset");
    await page.screenshot({ path: path.join(output, "03-filters.png") });
    await picker.locator('[data-preset-action="reset"]').click();
    await picker.locator('[data-preset-action="cancel"]').click();
    assert.equal((await read()).filterPreset, "filter-soft-film");
    const changesBeforeOutside = await page.evaluate(() => presetChanges);
    await open("filterPreset");
    await page.mouse.click(18, 900);
    assert.equal(await picker.count(), 0, "点击面板外应关闭浮层");
    assert.equal(await page.evaluate(() => presetChanges), changesBeforeOutside,
      "未修改选择时点击面板外关闭不应写入节点");

    await open("functionPreset");
    await assertCompactSearch("功能预设");
    placement = await picker.evaluate(element => element.getBoundingClientRect().width);
    assert.ok(placement >= 800 && placement <= 840);
    assert.deepEqual(
      await picker.locator(".flora-visual-presets-group-label").allTextContents(),
      ["功能"],
    );
    assert.equal(await picker.locator("[data-preset-id^='FN']").count(), 12);
    const functionGrid = picker.locator(".flora-visual-presets-picker-body .flora-visual-presets-grid");
    assert.equal(await functionGrid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length), 4);
    const functionImageFit = await picker.locator(".flora-visual-presets-card img").first().evaluate(image => getComputedStyle(image).objectFit);
    assert.equal(functionImageFit, "contain", "功能预览须完整展示多视角与分镜内容");
    await page.screenshot({ path: path.join(output, "07-function-presets.png") });
    for (const [width, expectedColumns] of [[768, 4], [390, 2]]) {
      await page.setViewportSize({ width, height: 960 });
      const functionGeometry = await picker.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const body = element.querySelector(".flora-visual-presets-picker-body");
        const grid = body.querySelector(".flora-visual-presets-grid");
        return {
          left: rect.left,
          right: rect.right,
          viewport: innerWidth,
          columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
          scrollWidth: body.scrollWidth,
          clientWidth: body.clientWidth,
        };
      });
      assert.ok(functionGeometry.left >= 0 && functionGeometry.right <= functionGeometry.viewport, JSON.stringify(functionGeometry));
      assert.equal(functionGeometry.columns, expectedColumns, JSON.stringify(functionGeometry));
      assert.ok(functionGeometry.scrollWidth <= functionGeometry.clientWidth, JSON.stringify(functionGeometry));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await choose("FN01");
    await save();

    await open("cameraControl");
    await picker.locator('[data-preset-tab="camera"]').click();
    await page.screenshot({ path: path.join(output, "camera-preview-before.png") });
    const cameraPreviewFixtures = await page.evaluate(() => {
      const makeImage = (width, height, color) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = color;
        context.fillRect(0, 0, width, height);
        return canvas.toDataURL("image/png");
      };
      const camera = FloraVisualPresetConfig.presets.find(preset => preset.id === "camera-hasselblad");
      const thumbnail = makeImage(8, 4, "#d04b4b");
      const previewSource = makeImage(1024, 576, "#4bd06a");
      FloraVisualPresetConfig.presets
        .filter(preset => preset.group === "camera")
        .forEach(preset => {
          preset.thumbnail = thumbnail;
          preset.previewSource = previewSource;
        });
      return { thumbnail, previewSource };
    });
    assert.ok(cameraPreviewFixtures.previewSource.startsWith("data:image/png;base64,"));
    await picker.locator('[data-preset-tab="lens"]').click();
    await picker.locator('[data-preset-tab="camera"]').click();
    await page.waitForFunction(() => {
      const image = document.querySelector(".flora-visual-presets-camera-preview img");
      return image?.complete && image.naturalWidth === 1024 && image.naturalHeight === 576
        && image.dataset.previewQuality === "original";
    });
    await page.screenshot({ path: path.join(output, "camera-preview-after.png") });
    assert.deepEqual(await picker.locator("[data-preset-tab]").allTextContents(), ["相机", "镜头", "焦距", "光圈"]);
    placement = await picker.evaluate(element => element.getBoundingClientRect().width);
    assert.ok(placement >= 540 && placement <= 620);
    assert.equal(await picker.locator(".flora-visual-presets-camera-preview").count(), 1,
      "摄像机面板保留顶部摄影效果预览");
    assert.equal(await picker.locator(".flora-visual-presets-search-wrap").count(), 0,
      "摄像机独立面板不应显示通用预设搜索头");
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 6);
    assert.equal(await picker.locator(".flora-visual-presets-list").count(), 1,
      "摄像机参数应使用摄影控制列表，不使用通用卡片网格");
    assert.equal(await picker.locator(".flora-visual-presets-list").evaluate(element => element.clientHeight), 126);
    assert.ok(await picker.locator(".flora-visual-presets-list").evaluate(element => element.scrollHeight > element.clientHeight),
      "超过三行的相机选项应在固定高度的列表内部滚动");
    const cameraImageTiers = await page.evaluate(() => {
      const thumbnail = document.querySelector('.flora-visual-presets-list [data-preset-id="camera-hasselblad"] img');
      const preview = document.querySelector(".flora-visual-presets-camera-preview img");
      return {
        thumbnail: thumbnail && { src: thumbnail.currentSrc, width: thumbnail.naturalWidth, height: thumbnail.naturalHeight },
        preview: preview && { src: preview.currentSrc, width: preview.naturalWidth, height: preview.naturalHeight },
      };
    });
    assert.deepEqual(cameraImageTiers.thumbnail, {
      src: cameraPreviewFixtures.thumbnail, width: 8, height: 4,
    }, "相机列表继续使用轻量卡片缩略图");
    assert.deepEqual(cameraImageTiers.preview, {
      src: cameraPreviewFixtures.previewSource, width: 1024, height: 576,
    }, "摄像机大预览必须使用独立高清源，不放大列表缩略图");
    const cameraImageRequests = [];
    page.on("request", request => {
      if (request.url().includes("/visual-presets/originals/camera/")) cameraImageRequests.push(request.url());
    });
    const builtInCameraCases = [
      ["focalLength", "focal-35", "camera_focal_35mm.png", 1376, 768],
      ["focalLength", "focal-50", "camera_focal_50mm.png", 1672, 941],
      ["focalLength", "focal-85", "camera_focal_85mm.png", 1672, 941],
      ["aperture", "aperture-f1-4", "camera_aperture_f1.4.png", 1672, 941],
      ["aperture", "aperture-f2-8", "camera_aperture_f2_8.png", 1672, 941],
      ["aperture", "aperture-f4", "camera_aperture_f4.png", 1672, 941],
      ["aperture", "aperture-f8", "camera_aperture_f8.png", 1672, 941],
    ];
    const loadedOriginals = [];
    for (const [tab, id, fileName, width, height] of builtInCameraCases) {
      await picker.locator(`[data-preset-tab="${tab}"]`).click();
      await choose(id);
      await page.waitForFunction(expectedId => {
        const image = document.querySelector(".flora-visual-presets-camera-preview img");
        const preset = window.FloraVisualPresetConfig.presets.find(item => item.id === expectedId);
        return image?.complete && image.naturalWidth > 0 && image.dataset.previewQuality === "original"
          && image.currentSrc.endsWith(preset?.previewSource || "__missing__");
      }, id);
      const loaded = await page.locator(".flora-visual-presets-camera-preview img").evaluate(image => ({
        source: new URL(image.currentSrc).pathname,
        width: image.naturalWidth,
        height: image.naturalHeight,
        quality: image.dataset.previewQuality,
      }));
      assert.deepEqual(
        loaded,
        {
          source: `/visual-presets/originals/camera/${tab === "focalLength" ? "focal-length" : "aperture"}/${fileName}`,
          width,
          height,
          quality: "original",
        },
        `${id} 大预览必须加载对应的真实高清原图`,
      );
      assert.equal(
        await picker.locator(`[data-preset-id="${id}"]`).getAttribute("aria-pressed"),
        "true",
        `${id} 点击后选中项与大预览需同步`,
      );
      loadedOriginals.push({ id, ...loaded });
    }
    assert.equal(cameraImageRequests.length, builtInCameraCases.length,
      "按需切换只请求当前被浏览的 7 张原图");
    await picker.locator('[data-preset-tab="focalLength"]').click();
    for (const id of ["focal-35", "focal-50", "focal-85"]) await choose(id);
    await page.waitForFunction(() => {
      const image = document.querySelector(".flora-visual-presets-camera-preview img");
      return image?.currentSrc.endsWith("camera_focal_85mm.png")
        && image.complete && image.naturalWidth === 1672;
    });
    assert.equal(
      await picker.locator(".flora-visual-presets-camera-preview img").getAttribute("src"),
      "/visual-presets/originals/camera/focal-length/camera_focal_85mm.png",
      "连续快速切换后大预览应显示最后选中的原图",
    );
    console.log(`33200 原图大预览: ${JSON.stringify(loadedOriginals)}`);
    await page.locator(".flora-visual-presets-camera-preview img")
      .evaluate(image => image.dispatchEvent(new Event("error")));
    await page.waitForFunction(() => document.querySelector(
      ".flora-visual-presets-camera-preview .flora-visual-presets-placeholder",
    )?.textContent === "高清预览加载失败");
    assert.equal(
      await picker.locator(".flora-visual-presets-camera-preview img").count(),
      0,
      "高清预览加载失败时不得回退到列表缩略图",
    );
    await picker.locator('[data-preset-tab="camera"]').click();
    await page.waitForFunction(() => {
      const image = document.querySelector(".flora-visual-presets-camera-preview img");
      return image?.naturalWidth === 1024 && image?.naturalHeight === 576
        && image.dataset.previewQuality === "original";
    });
    const cameraLayout = await picker.evaluate(element => {
      const preview = element.querySelector(".flora-visual-presets-camera-preview");
      const body = element.querySelector(".flora-visual-presets-picker-body");
      const list = body.querySelector(".flora-visual-presets-list");
      const footer = element.querySelector(".flora-visual-presets-picker-footer");
      return {
        height: element.getBoundingClientRect().height,
        previewHeight: preview.getBoundingClientRect().height,
        previewRatio: preview.getBoundingClientRect().width / preview.getBoundingClientRect().height,
        listHeight: list.getBoundingClientRect().height,
        bodyHeight: body.getBoundingClientRect().height,
        footerBottom: footer.getBoundingClientRect().bottom,
      };
    });
    assert.ok(cameraLayout.previewHeight >= 280, JSON.stringify(cameraLayout));
    assert.ok(cameraLayout.previewRatio > 1.7 && cameraLayout.previewRatio < 1.9, JSON.stringify(cameraLayout));
    assert.equal(cameraLayout.listHeight, 126, JSON.stringify(cameraLayout));
    await choose("camera-hasselblad");
    await picker.locator('[data-preset-tab="lens"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 7,
      "保留原有 Panavision 镜头，同时展示六款新增镜头");
    assert.equal(await picker.locator(".flora-visual-presets-list").count(), 1);
    assert.ok(await picker.locator(".flora-visual-presets-list").evaluate(element => element.scrollHeight > element.clientHeight),
      "保留 Panavision 后超过三行的镜头列表应内部滚动");
    assert.deepEqual(await picker.locator(".flora-visual-presets-group-label").allTextContents(), ["镜头"]);
    const lensLayout = await picker.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      listHeight: element.querySelector(".flora-visual-presets-list").getBoundingClientRect().height,
    }));
    assert.deepEqual(lensLayout, { height: cameraLayout.height, listHeight: 126 });
    await choose("lens-hawk-class-x");
    await picker.locator('[data-preset-tab="focalLength"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 4);
    assert.deepEqual(await picker.locator(".flora-visual-presets-group-label").allTextContents(), ["焦距"]);
    const focalLayout = await picker.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      listHeight: element.querySelector(".flora-visual-presets-list").getBoundingClientRect().height,
    }));
    assert.deepEqual(focalLayout, { height: cameraLayout.height, listHeight: 126 });
    await choose("focal-50");
    await page.screenshot({ path: path.join(output, "04-camera.png") });
    await picker.locator('[data-preset-tab="aperture"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 4);
    assert.deepEqual(await picker.locator(".flora-visual-presets-group-label").allTextContents(), ["光圈"]);
    const apertureLayout = await picker.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      listHeight: element.querySelector(".flora-visual-presets-list").getBoundingClientRect().height,
    }));
    assert.deepEqual(apertureLayout, { height: cameraLayout.height, listHeight: 126 });
    await choose("aperture-f2-8");
    await picker.locator('[data-preset-tab="camera"]').click();
    assert.equal(await picker.locator(".flora-visual-presets-card").count(), 6);
    assert.equal(await picker.locator('[data-preset-id="camera-hasselblad"]').getAttribute("aria-pressed"), "true");
    const cameraSummary = await picker.locator(".flora-visual-presets-summary").innerText();
    const cameraTags = await picker.locator(".flora-visual-presets-tag").allTextContents();
    assert.equal(cameraSummary, "已选 4 项");
    assert.ok(cameraTags.some(tag => tag.includes("Hasselblad")));
    assert.ok(cameraTags.some(tag => tag.includes("50mm")));
    assert.ok(cameraTags.some(tag => tag.includes("f/2.8")));
    await save();
    const configured = await read();
    assert.equal(configured.cameraControl.lens, "lens-hawk-class-x");
    assert.equal(configured.cameraControl.focalLength, "focal-50");
    assert.equal(configured.cameraControl.aperture, "aperture-f2-8");

    const saved = await page.evaluate(() => {
      const node = getCanvasNode(presetTestNodeId);
      return {
        node: serializeCanvasNode(node),
        prompt: getCanvasGenerationPrompt(node, node.querySelector(".canvas-node-prompt").value),
        input: node.querySelector(".canvas-node-prompt").value,
        changes: presetChanges,
        changeLog: presetChangeLog,
      };
    });
    assert.deepEqual(saved.node.visualPresets, configured);
    assert.equal(saved.input, "街边咖啡馆的商业人像");
    assert.match(saved.prompt, /极简商业广告摄影/);
    assert.match(saved.prompt, /柔和胶片色调/);
    assert.match(saved.prompt, /50mm/);
    assert.match(saved.prompt, /广角全景图/);
    assert.equal(saved.changes, 7, JSON.stringify(saved.changeLog));
    await page.screenshot({ path: path.join(output, "05-selected.png") });

    for (const id of ["characterDesign", "stylePreset", "filterPreset", "functionPreset", "cameraControl"]) {
      await open(id);
      await picker.locator('[data-preset-action="reset"]').click();
      await save();
    }
    const cleared = await page.evaluate(() => {
      const node = getCanvasNode(presetTestNodeId);
      syncCanvasNodeModel(node);
      return {
        serialized: serializeCanvasNode(node).visualPresets,
        model: getCanvasNodeModel(presetTestNodeId).visualPresets,
        prompt: getCanvasGenerationPrompt(node, node.querySelector(".canvas-node-prompt").value),
      };
    });
    assert.deepEqual(cleared.serialized, {});
    assert.deepEqual(cleared.model, {}, "清除全部预设必须覆盖模型中的旧选择");
    assert.doesNotMatch(cleared.prompt, /\[AI OS 视觉预设\]/);

    const geometry = [];
    await open("cameraControl");
    await picker.locator('[data-preset-tab="focalLength"]').click();
    await choose("focal-50");
    for (const width of [390, 768, 1280, 1440, 1728, 1920]) {
      await page.setViewportSize({ width, height: 960 });
      const dimensions = await picker.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          viewport: innerWidth, height: innerHeight,
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        };
      });
      let row = null;
      if ([390, 1280, 1440, 1920].includes(width)) {
        row = await page.locator(".flora-generator-settings").evaluate(settings => {
          const controls = settings.querySelector(".canvas-node-controls");
          const entries = settings.querySelector(".flora-visual-presets-entries");
          const footer = settings.closest(".flora-generator-footer");
          const settingsRect = settings.getBoundingClientRect();
          const controlsRect = controls.getBoundingClientRect();
          const entriesRect = entries.getBoundingClientRect();
          return {
            sameLine: Math.abs(
              controlsRect.top + controlsRect.height / 2
              - entriesRect.top - entriesRect.height / 2,
            ) < 5,
            followsControls: controls.nextElementSibling === entries.parentElement,
            singleRow: settingsRect.height <= Math.max(controlsRect.height, entriesRect.height) + 4,
            footerScrolls: getComputedStyle(footer).overflowX === "auto",
          };
        });
        assert.equal(row.sameLine, true, `${width}px 参数与预设入口应保持同一行`);
        assert.equal(row.followsControls, true, `${width}px 预设入口应位于模型和尺寸之后`);
        assert.equal(row.singleRow, true, `${width}px 参数行不得折成两行`);
        if (width === 390) assert.equal(row.footerScrolls, true, "窄屏参数行应使用横向滚动容纳控件");
      }
      assert.ok(dimensions.left >= 0 && dimensions.right <= width);
      assert.ok(dimensions.top >= 0 && dimensions.bottom <= 960);
      assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1);
      geometry.push({ width, ...dimensions, row });
      await page.screenshot({ path: path.join(output, `camera-${width}.png`) });
    }
    await picker.locator('[data-close-picker]').click();

    await page.locator("#canvasAgentToggle").click();
    const agentPanel = page.locator("#canvasAgentPanel");
    assert.equal(await agentPanel.isVisible(), true);
    await page.locator("#canvasAgentSkillBook").click();
    const skillPopover = page.locator("#canvasAgentSkillPopover");
    assert.equal(await skillPopover.isVisible(), true);
    const agentSkillSearch = page.locator("#canvasAgentSkillSearch");
    await agentSkillSearch.fill("仅用于确认描述字段仍可被搜索");
    assert.deepEqual(
      await page.locator("#canvasAgentSkills [data-agent-skill]").evaluateAll(items => items.map(item => item.dataset.agentSkill)),
      ["qa-product-skill"],
      "Skill 说明继续参与搜索，但不渲染在快捷行内",
    );
    await agentSkillSearch.fill("");
    const agentHeaderGeometry = await page.evaluate(() => {
      const header = document.querySelector(".canvas-agent-skill-header");
      const title = header.querySelector(":scope > span").getBoundingClientRect();
      const search = header.querySelector(".canvas-agent-skill-search-wrap").getBoundingClientRect();
      const more = header.querySelector("#canvasAgentSkillMore").getBoundingClientRect();
      const centerY = rect => rect.top + rect.height / 2;
      return {
        title: { x: title.x, y: title.y, width: title.width, height: title.height },
        search: { x: search.x, y: search.y, width: search.width, height: search.height },
        more: { x: more.x, y: more.y, width: more.width, height: more.height },
        gap: more.left - search.right,
        rowDelta: Math.max(Math.abs(centerY(title) - centerY(search)), Math.abs(centerY(search) - centerY(more))),
      };
    });
    assert.ok(agentHeaderGeometry.gap >= 6 && agentHeaderGeometry.gap <= 8, JSON.stringify(agentHeaderGeometry));
    assert.ok(agentHeaderGeometry.rowDelta <= 1, JSON.stringify(agentHeaderGeometry));
    console.log("33200 Agent Skill 标题行:", JSON.stringify(agentHeaderGeometry));
    assert.equal(await page.locator("#canvasAgentSkills [data-agent-skill] small").count(), 0,
      "快捷列表只显示 Skill 名称，不显示简介");
    assert.ok(await page.locator("#canvasAgentSkills [data-agent-skill]").evaluateAll(items =>
      items.every(item => Math.round(item.getBoundingClientRect().height) === 38)));
    await page.locator('[data-agent-skill-detail="qa-product-skill"]').click();
    await page.locator("#canvasAgentSkillDetail [data-agent-skill-detail-favorite]").click();
    await page.keyboard.press("Escape");
    await page.locator('[data-skill-tab="favorites"]').click();
    assert.deepEqual(
      await page.locator("#canvasAgentSkills [data-agent-skill]").evaluateAll(items => items.map(item => item.dataset.agentSkill)),
      ["qa-product-skill"],
      "喜欢分类继续工作",
    );
    await page.locator('[data-skill-tab="all"]').click();
    await page.evaluate(() => window.addEventListener("neon:request-skill-square", () => { window.__qaMoreRequests = (window.__qaMoreRequests || 0) + 1; }));
    await page.locator("#canvasAgentSkillMore").click();
    assert.equal(await page.evaluate(() => window.__qaMoreRequests), 1, "更多仍进入完整 Skill 页面");
    await page.locator("#canvasAgentSkillBook").click();
    await page.locator('[data-agent-skill="qa-product-skill"]').click();
    assert.equal(await page.evaluate(() => window.CanvasAgentUi.getActiveSkillId()), "qa-product-skill");
    assert.equal(await page.locator("#canvasAgentContext [data-agent-context-key='skill']").count(), 1,
      "选中 Skill 后输入框上方显示上下文标签");
    await page.locator('#canvasAgentContext [data-remove-agent-context="skill"]').click();
    assert.equal(await page.evaluate(() => window.CanvasAgentUi.getActiveSkillId()), "");
    await page.locator("#canvasAgentModeButton").click();
    assert.equal(await page.locator("#canvasAgentModePopover").isVisible(), true, "Agent 模式入口仍打开模式菜单");
    await page.keyboard.press("Escape");
    await page.locator("#canvasAgentGenerationButton").click();
    assert.equal(await page.locator("#canvasAgentGenerationPopover").isVisible(), true,
      "滑杆入口打开生成参数");
    await page.locator("#canvasAgentGenerationButton").click();
    assert.equal(await page.locator("#canvasAgentSettingsButton").count(), 0);
    assert.equal(await page.locator("#canvasAgentGenerationButton").getAttribute("title"), "生成偏好");
    await page.locator("#canvasAgentSkillBook").click();
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 });
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector("#canvasAgentPanel").getBoundingClientRect();
        const footer = document.querySelector(".canvas-agent-form-footer");
        const tools = document.querySelector(".canvas-agent-composer-tools").getBoundingClientRect();
        const send = document.querySelector("#canvasAgentSend").getBoundingClientRect();
        const search = document.querySelector(".canvas-agent-skill-search-wrap").getBoundingClientRect();
        const more = document.querySelector("#canvasAgentSkillMore").getBoundingClientRect();
        return {
          panel: { left: panel.left, right: panel.right },
          footer: { left: footer.getBoundingClientRect().left, right: footer.getBoundingClientRect().right,
            scrollWidth: footer.scrollWidth, clientWidth: footer.clientWidth },
          tools: { left: tools.left, right: tools.right },
          send: { left: send.left, right: send.right },
          searchGap: more.left - search.right,
          viewport: innerWidth,
        };
      });
      assert.ok(geometry.panel.left >= 0 && geometry.panel.right <= width, JSON.stringify(geometry));
      assert.ok(geometry.footer.scrollWidth <= geometry.footer.clientWidth + 1, JSON.stringify(geometry));
      assert.ok(geometry.tools.right <= geometry.send.left, JSON.stringify(geometry));
      assert.ok(geometry.searchGap >= 6 && geometry.searchGap <= 8, JSON.stringify(geometry));
      if ([390, 1440].includes(width)) console.log(`33200 Agent 工具栏 ${width}px:`, JSON.stringify(geometry));
      if (width === 1440) await page.screenshot({ path: path.join(output, "agent-skill-1440.png"), fullPage: true });
    }
    await page.locator("#canvasAgentSkillBook").click();
    await page.locator("#canvasAgentToggle").click();

    await page.reload({ waitUntil: "networkidle" });
    const restored = await page.evaluate(async savedNode => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator", "canvas-node-comfy"]);
      const context = { maxId: 0, legacyResults: [], migratedLegacyCount: 0 };
      const node = restoreCanvasBoardNode(savedNode, { id: "qa-visual-presets", updatedAt: new Date().toISOString() }, context);
      return serializeCanvasNode(node).visualPresets;
    }, saved.node);
    assert.deepEqual(restored, configured);
    const restoredRun = await page.evaluate(async id => {
      await loadImageModels();
      canvasState.activeBoardId = "qa-visual-presets";
      const node = getCanvasNode(id);
      node.dataset.modelSelection = "exact";
      const model = node.querySelector(".canvas-node-model");
      model.value = "gpt-image-1";
      model.dataset.modelSelection = "exact";
      node.dataset.imageSrc = "https://example.test/reference-image.png";
      node.dataset.imageName = "参考图片.png";
      node.querySelector(".canvas-node-size").value = "auto";
      node.dataset.canvasSize = "auto";
      node.querySelector(".canvas-node-resolution").value = "1";
      node.dataset.canvasResolution = "1";
      return runCanvasImageEdit(node);
    }, saved.node.id);
    assert.equal(generationRequests.length, 3, "空预设、角色预设和完整预设分别经过一次隔离请求");
    assert.equal(restoredRun.code, "request_parameters_unsupported",
      "恢复完整预设后仍能从节点运行入口完成请求发送");
    assert.equal(generationRequests[0].prompt.includes("[AI OS 视觉预设]"), false,
      "无预设时不拼入视觉配置内容");
    assert.match(generationRequests[0].prompt, /无视觉预设的基线商业摄影/);
    assert.equal(generationRequests[0].model, "gpt-image-1");
    assert.equal(generationRequests[0].size, "auto");
    assert.match(generationRequests[1].prompt, /女性化人物表达/);
    assert.match(generationRequests[1].prompt, /18-25 岁青年年龄段/);
    assert.match(generationRequests[1].prompt, /东亚面部特征参考/);
    assert.match(generationRequests[1].prompt, /时代语境：现代/);
    assert.equal(generationRequests[1].model, undefined, "自动选择模式不被角色预设覆盖");
    assert.equal(generationRequests[1].size, "1024x1024", "恢复的 custom 选择必须序列化为有效尺寸");
    assert.deepEqual(generationRequests[1].reference_images, [], "角色缩略图不能变成图片参考输入");
    assert.equal(generationProbe.roleOnly.code, "request_parameters_unsupported",
      "上游参数错误映射为明确错误类别");
    assert.match(generationProbe.roleOnly.error, /无法识别当前图片比例/);
    assert.match(generationRequests[2].prompt, /极简商业广告摄影/);
    assert.match(generationRequests[2].prompt, /柔和胶片色调/);
    assert.match(generationRequests[2].prompt, /50mm/);
    assert.equal(generationRequests[2].model, "gpt-image-1");
    assert.equal(generationRequests[2].size, "auto");
    assert.equal(generationRequests[2].board_id, "qa-visual-presets");
    assert.equal(generationRequests[2].node_id, saved.node.id);
    const errorCategories = await page.evaluate(() => {
      const cases = [
        [{ message: "Invalid credentials", httpStatus: 401 }, "image_api_auth_failed"],
        [{ message: "insufficient_quota", httpStatus: 429 }, "image_api_balance_failed"],
        [{ message: "Too many requests", httpStatus: 429 }, "image_api_rate_limited"],
        [{ message: "Gateway response", httpStatus: 504 }, "generation_timeout"],
        [{ message: "ECONNREFUSED" }, "image_service_connection_failed"],
        [{ message: "model not found" }, "image_api_upstream_rejected"],
        [{ message: "Unsupported size", httpStatus: 400 }, "request_parameters_unsupported"],
      ];
      return cases.map(([error, expected]) => ({ expected, ...getSafeCanvasImageGenerationError(error) }));
    });
    for (const result of errorCategories) assert.equal(result.code, result.expected, result.error);
    const sanitizedErrors = await page.evaluate(id => {
      const message = 'Unauthorized {"api_key":"sensitiveKeyValue","access_token":"sensitiveTokenValue"} Bearer sensitiveBearerValue';
      const node = getCanvasNode(id);
      syncCanvasImageJobProgress(node, { id: "qa-failed", state: "failed", code: "AUTH_FAILED", error: message });
      return {
        detail: sanitizeCanvasImageGenerationErrorDetail(message),
        status: node.querySelector(".canvas-node-status")?.textContent || "",
      };
    }, saved.node.id);
    assert.doesNotMatch(sanitizedErrors.detail, /sensitive(?:Key|Token|Bearer)Value/);
    assert.doesNotMatch(sanitizedErrors.status, /sensitive(?:Key|Token|Bearer)Value/);
    assert.match(sanitizedErrors.status, /认证失败/);
    assert.ok(!mutations.some(url => /\/api\/images$|comfy/.test(url)));
    assert.deepEqual(errors, []);
    const report = { configured, changes: saved.changes, geometry, restored, errors, mutations,
      prompt: saved.prompt, generationProbe, generationRequests, errorCategories, sanitizedErrors,
      boundary: "实际 33200 程序资源，隔离 API；真实生成函数的请求被拦截并返回明确失败，未提交真实模型" };
    fs.writeFileSync(path.join(output, "browser-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, screenshots: output, configured, geometry, errors }));
  } catch (error) {
    await page.screenshot({ path: path.join(output, "failure.png") });
    console.error(await page.evaluate(() => ({
      nodes: [...document.querySelectorAll(".canvas-node")].map(node => ({ kind: node.dataset.floraKind, id: node.dataset.id })),
      entries: document.querySelectorAll(".flora-visual-presets-entries").length,
    })));
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
