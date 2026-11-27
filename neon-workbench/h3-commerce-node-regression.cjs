const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const workflowModule = { exports: {} };
new Function("module", fs.readFileSync(path.join(__dirname, "design-sources/h3-commerce-workflow.js"), "utf8"))(workflowModule);
const { prepareCommerceWorkflow } = workflowModule.exports;
const commerceTemplate = require("./design-sources/workflows/h3-commerce-video.json");
const sampleDir = process.env.AI_OS_H3_SAMPLE_DIR;
const screenshotDir = process.env.AI_OS_H3_SLOT_EVIDENCE;
const slotNames = ["开场场景", "商品主体", "商品其它角度", "商品细节"];
const sampleFiles = sampleDir && ["商品开场_", "完整主图_", "同款补充_", "核心细节_"].map(prefix =>
  path.join(sampleDir, fs.readdirSync(sampleDir).find(name => name.startsWith(prefix))));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: Number(process.env.AI_OS_H3_TEST_WIDTH || 1440), height: 1100 } });
    const errors = [];
    const commerceRequests = [];
    let supportsParameters;
    let submission;
    let acceptsSubmission = false;
    let polls = 0;
    const videoUrl = "/output/h3-qa-result.mp4";
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+WQngAAAAASUVORK5CYII=", "base64");
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], preferences: {}, settings: {} }),
    }));
    await page.route("**/api/canvas/boards/qa-h3-commerce/viewport?*", async route => {
      const board = await page.evaluate(() => serializeCanvasBoard()).catch(() => ({}));
      return route.fulfill({ json: { engineVersion: "canvas-visual-fidelity-v2", mode: "detail", ...board } });
    });
    await page.route("**/api/minimax-h3-video**", route => {
      commerceRequests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      if (route.request().method() === "POST") {
        submission = route.request().postDataJSON();
        if (acceptsSubmission) return route.fulfill({ status: 202, json: { task_id: "qa-commerce" } });
        return route.fulfill({ status: 400, json: { error: "验收模拟：停止提交" } });
      }
      return route.fulfill({ json: { protocol: "ai-os.h3-commerce.v1", available: true, resolution_parameters: supportsParameters } });
    });
    await page.route("**/api/upscale/status?id=qa-commerce", route => route.fulfill({
      json: ++polls === 1 ? { status: "running", progress: 35 } : { status: "success", videos: [videoUrl] },
    }));
    await page.route(`**${videoUrl}`, route => route.fulfill({
      contentType: "video/mp4",
      path: process.env.AI_OS_H3_RESULT_VIDEO || path.join(__dirname, "test-fixtures/video-seek-fixture.mp4"),
    }));
    await page.route("**/api/upload-image", route => {
      const name = decodeURIComponent(route.request().headers()["x-file-name"]);
      return route.fulfill({ json: { url: "/output/" + name } });
    });
    await page.route("**/output/h3-*.png", route => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      const index = { "h3-one.png": 0, "h3-main.png": 1, "h3-2.png": 1, "h3-3.png": 2, "h3-replaced.png": 2, "h3-4.png": 3 }[name];
      return sampleFiles && index !== undefined ? route.fulfill({ path: sampleFiles[index] }) : route.fulfill({ contentType: "image/png", body: png });
    });
    if (process.env.AI_OS_H3_SOURCE === "1") {
      const files = {
        "script.js": "script-before-save-bridge.js",
        "canvas-h3-node-renderer.js": "canvas-h3-node-renderer.js",
        "flora-generator-composer.js": "flora-generator-composer.js",
        "flora-generator-parameters.js": "flora-generator-parameters.js",
        "flora-node-shell.css": "flora-node-shell.css",
      };
      await page.route(url => Object.hasOwn(files, url.pathname.split("/").at(-1)), route => {
        const filename = files[new URL(route.request().url()).pathname.split("/").at(-1)];
        return route.fulfill({ path: path.join(__dirname, "design-sources", filename) });
      });
    }
    const openBoard = snapshot => page.evaluate(async snapshot => {
      const modules = await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-minimax-h3", "canvas-node-generator"]);
      if (modules?.ok === false) throw new Error(JSON.stringify(modules));
      await loadCanvasBoards();
      canvasState.activeBoardId = "qa-h3-commerce";
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      surface.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b";
      const view = document.querySelector("#canvasView");
      surface.append(view);
      document.body.append(surface);
      view.hidden = false;
      view.classList.add("active");
      view.style.cssText = "flex:1;min-height:0;width:100%";
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      showCanvasEditor();
      if (snapshot) restoreCanvasBoard(snapshot);
      window.qaCommerce = snapshot ? ensureCanvasNodeMounted(snapshot.nodes.find(item => item.kind === "minimax-h3").id)
        : addCanvasMinimaxH3Node({ x: 200, y: 80 }, { modelId: "h3-commerce" });
      canvasState.scale = 1;
      canvasState.x = (innerWidth - 640) / 2 - 200;
      canvasState.y = 0;
      applyCanvasTransformNow();
      selectCanvasNode(window.qaCommerce);
    }, snapshot);
    await page.goto(process.env.AI_OS_TEST_URL || "http://127.0.0.1:33200/", { waitUntil: "domcontentloaded" });
    await openBoard(null);
    const node = page.locator("#canvasPlane .canvas-node[data-flora-kind=minimax-h3]");
    await node.waitFor({ state: "visible" });
    const model = node.locator('[data-canvas-key="minimaxH3Model"]');
    assert.equal(await model.inputValue(), "h3-commerce");
    const commerce = page.locator(".flora-generator-composer");
    await commerce.waitFor({ state: "visible" });
    assert.equal(await commerce.locator(".canvas-h3-commerce-prompt-a").count(), 1);
    assert.equal(await commerce.locator(".canvas-h3-commerce-prompt-b").count(), 1);
    assert.equal(await commerce.locator(".canvas-h3-commerce-slot").count(), 4);
    assert.equal(await node.locator(".canvas-port-input").count(), 1);
    assert.equal(await node.locator('.canvas-port-input[data-canvas-port="input"]').isVisible(), true);
    assert.equal(await node.locator('.canvas-port-output[data-canvas-port="output"]').isVisible(), true);
    assert.equal(await commerce.locator(".canvas-h3-prompt").isVisible(), false);
    assert.equal(await commerce.locator(".flora-generator-add-reference:not(.canvas-h3-commerce-slot-choose)").isVisible(), false);
    const slots = commerce.locator(".canvas-h3-commerce-slot");
    assert.deepEqual(await slots.locator(".canvas-h3-commerce-slot-label").allTextContents(), slotNames);
    assert.deepEqual(await slots.evaluateAll(elements => elements.map(slot => slot.dataset.slotId)),
      ["opening_scene", "product_main", "product_angles", "product_details"]);
    assert.deepEqual(await slots.locator("button").evaluateAll(buttons => buttons.map(button => [button.offsetWidth, button.offsetHeight])), Array(4).fill([44, 44]));
    for (const part of ["A", "B"]) {
      await commerce.locator(`.flora-prompt-mention-editor[aria-label="H3 带货提示词 ${part}"]`)
        .fill(`Prompt ${part} 正式内容`);
    }
    async function upload(index, name) {
      const slot = commerce.locator(`.canvas-h3-commerce-slot[data-slot="${index}"]`);
      await slot.locator("input").setInputFiles({ name, mimeType: "image/png", buffer: png });
      await slot.locator(`img[src="/output/${name}"]`).waitFor();
    }
    await slots.nth(0).locator("button").click();
    const localUpload = page.getByRole("button", { name: "本地上传" });
    const chooser = page.waitForEvent("filechooser");
    await localUpload.click();
    await (await chooser).setFiles({ name: "h3-one.png", mimeType: "image/png", buffer: png });
    await slots.nth(0).locator("img").waitFor();
    for (let index = 1; index < 4; index++) await upload(index, `h3-${index + 1}.png`);
    const graphState = () => page.evaluate(() => {
      const board = serializeCanvasBoard();
      const images = getCanvasH3CommerceImages(window.qaCommerce);
      const edges = board.connections.filter(edge => edge.to === window.qaCommerce.dataset.id)
        .sort((a, b) => a.toPort.localeCompare(b.toPort));
      return { images, edges, sources: images.map(item => item && board.nodes.find(node => node.id === item.sourceNodeId)) };
    });
    const added = await graphState();
    assert.deepEqual(added.edges.map(edge => edge.toPort), [0, 1, 2, 3].map(id => "h3-commerce:" + id));
    assert.equal(new Set(added.sources.map(source => source.id)).size, 4);
    assert.ok(added.sources.every(source => source.kind === "image" && source.imageSrc && source.x + source.width < 200));
    assert.equal(await page.evaluate(() => getVisibleCanvasConnections().filter(item => item.item.to === window.qaCommerce.dataset.id).length), 4);
    assert.equal(await page.evaluate(() => [0, 1, 2, 3].every(slot =>
      JSON.stringify(getCanvasConnectionPortPoint(window.qaCommerce.dataset.id, "h3-commerce:" + slot)) ===
      JSON.stringify(getCanvasConnectionPortPoint(window.qaCommerce.dataset.id, "input"))
    )), true);
    await upload(2, "h3-replaced.png");
    let after = await graphState();
    assert.notEqual(after.sources[2].id, added.sources[2].id);
    assert.equal(after.sources[2].imageSrc, "/output/h3-replaced.png");
    assert.deepEqual(after.edges.filter(edge => edge.toPort !== "h3-commerce:2"), added.edges.filter(edge => edge.toPort !== "h3-commerce:2"));
    assert.ok(await page.evaluate(id => Boolean(canvasVirtualStore.get(id)), added.sources[2].id));
    await slots.nth(1).getByRole("button", { name: "删除商品主体" }).click();
    await slots.nth(1).getByRole("button", { name: "添加商品主体" }).waitFor();
    after = await graphState();
    assert.equal(after.images[1], null);
    assert.equal(after.edges.length, 3);
    assert.ok(await page.evaluate(id => Boolean(canvasVirtualStore.get(id)), added.sources[1].id));
    await slots.nth(1).getByRole("button", { name: "添加商品主体" }).click();
    await page.locator(".flora-reference-picker-item").filter({ hasText: "h3-one.png" }).click();
    await slots.nth(1).locator('img[src="/output/h3-one.png"]').waitFor();
    after = await graphState();
    assert.equal(after.sources[1].id, added.sources[0].id);
    await slots.nth(1).getByRole("button", { name: "删除商品主体" }).click();
    await slots.nth(1).getByRole("button", { name: "添加商品主体" }).waitFor();
    assert.equal((await graphState()).sources[0].id, added.sources[0].id);
    await upload(1, "h3-main.png");
    const displayOrder = () => slots.evaluateAll(elements => elements.map(element => Number(element.dataset.slot)));
    const snapshotNames = async () => (await graphState()).images.map(item => item?.name || null);
    const capture = async name => {
      if (!screenshotDir) return;
      fs.mkdirSync(screenshotDir, { recursive: true });
      await slots.locator("img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
      await page.screenshot({ path: path.join(screenshotDir, name + ".png") });
    };
    async function drag(from, to, screenshot) {
      const source = await slots.nth(from).locator(".canvas-h3-commerce-slot-choose").boundingBox();
      const target = await slots.nth(to).locator(".canvas-h3-commerce-slot-choose").boundingBox();
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
      if (from !== to) assert.match(await slots.nth(to).getAttribute("class"), /is-drop-target/);
      if (screenshot) await capture(screenshot);
      await page.mouse.up();
      assert.deepEqual(await displayOrder(), [0, 1, 2, 3]);
      assert.deepEqual(await slots.locator(".canvas-h3-commerce-slot-label").allTextContents(), slotNames);
    }
    const originalOrder = ["h3-one.png", "h3-main.png", "h3-replaced.png", "h3-4.png"];
    const swappedOrder = ["h3-replaced.png", "h3-4.png", "h3-one.png", "h3-main.png"];
    await capture("before-swap");
    await drag(0, 2, "drag-target");
    await drag(1, 3);
    assert.deepEqual(await snapshotNames(), swappedOrder);
    await capture("after-swap");
    await drag(2, 2);
    assert.deepEqual(await snapshotNames(), swappedOrder);
    await slots.nth(1).getByRole("button", { name: "删除商品主体" }).click();
    await slots.nth(1).getByRole("button", { name: "添加商品主体" }).waitFor();
    await drag(3, 1);
    assert.deepEqual(await snapshotNames(), [swappedOrder[0], originalOrder[1], swappedOrder[2], null]);
    await upload(3, originalOrder[3]);
    await drag(1, 3);
    assert.deepEqual(await snapshotNames(), swappedOrder);
    const trigger = commerce.locator(".flora-generator-parameter-trigger");
    const toolbar = () => commerce.locator(".flora-generator-footer").evaluate(footer => {
      const items = [".flora-generation-mode", '[data-canvas-key="minimaxH3Model"]', ".flora-generator-parameter-trigger", ".canvas-h3-run"]
        .map(selector => footer.querySelector(selector).getBoundingClientRect());
      return { height: footer.getBoundingClientRect().height, centers: items.map(item => item.top + item.height / 2) };
    });
    const closed = await toolbar();
    assert.ok(Math.max(...closed.centers) - Math.min(...closed.centers) < 2, JSON.stringify(closed));
    await trigger.click();
    assert.deepEqual(await toolbar(), closed);
    const aspect = node.locator('[data-canvas-key="h3CommerceAspectRatio"]');
    const resolution = node.locator('[data-canvas-key="h3CommerceMegapixels"]');
    const expected = [
      ["1:1", "方形", [800, 800], [1024, 1024]],
      ["2:3", "竖屏", [640, 960], [832, 1248]],
      ["3:2", "横屏", [960, 640], [1248, 832]],
      ["3:4", "竖屏", [672, 928], [896, 1184]],
      ["4:3", "横屏", [928, 672], [1184, 896]],
      ["9:16", "竖屏", [608, 1056], [768, 1376]],
      ["16:9", "横屏", [1056, 608], [1376, 768]],
      ["21:9", "超宽屏", [1216, 512], [1568, 672]],
    ];
    assert.deepEqual(await aspect.locator("option").allTextContents(), expected.map(([id, label]) => id + " " + label));
    for (const [ratio, , ...sizes] of expected) {
      await aspect.selectOption(ratio);
      assert.deepEqual(await resolution.locator("option").allTextContents(),
        sizes.map(([w,h]) => `${w} × ${h} px（约 ${(w*h/(1024*1024)).toFixed(2)} MP）`));
      for (const [index, megapixels] of [0.6, 1].entries()) {
        const graph = prepareCommerceWorkflow(commerceTemplate, {
          aspect_ratio: ratio, megapixels, prompt_a: "A", prompt_b: "B",
          images: [0, 1, 2, 3].map(i => ({ url: `/output/h3-${i}.png`, name: `h3-${i}.png` })),
        }, "qa");
        const parameters = graph[115].inputs;
        const ratios = parameters.aspect_ratio.split(" ")[0].split(":").map(Number);
        const scale = Math.sqrt(parameters.megapixels * 1024 ** 2 / (ratios[0] * ratios[1]));
        assert.deepEqual(ratios.map(value => Math.round(value * scale / parameters.multiple) * parameters.multiple), sizes[index]);
      }
    }
    await aspect.selectOption("16:9");
    await resolution.selectOption("1");
    await page.getByRole("button", { name: "关闭视频参数" }).click();
    assert.match(await trigger.innerText(), /16:9.*1376 × 768/);
    await model.selectOption("minimax-h3");
    assert.equal(await node.locator('.canvas-port-input[data-canvas-port="input"]').isVisible(), true);
    assert.equal(await node.locator(".canvas-h3-commerce-port:visible").count(), 0);
    assert.match(await trigger.innerText(), /16:9.*标准.*8步.*12秒/);
    await model.selectOption("h3-commerce");
    assert.match(await trigger.innerText(), /16:9.*1376 × 768/);
    const saved = await page.evaluate(() => serializeCanvasNode(window.qaCommerce));
    assert.equal(saved.h3CommercePromptA, "Prompt A 正式内容");
    assert.equal(saved.h3CommercePromptB, "Prompt B 正式内容");
    assert.equal(saved.h3CommerceImages.filter(Boolean).length, 4);
    const blocked = await page.evaluate(() => runCanvasMinimaxH3Node(window.qaCommerce));
    assert.equal(blocked.code, "commerce_resolution_unavailable");
    assert.match(blocked.error, /9:16.*0\.6 MP/);
    assert.deepEqual(commerceRequests, ["GET /api/minimax-h3-video/commerce-v1"]);
    supportsParameters = true;
    await page.evaluate(() => runCanvasMinimaxH3Node(window.qaCommerce));
    assert.equal(submission.aspect_ratio, "16:9");
    assert.equal(submission.megapixels, 1);
    assert.deepEqual(submission.images.map(item => item.name), swappedOrder);
    const submittedGraph = prepareCommerceWorkflow(commerceTemplate, { ...submission, prompt_a: submission.prompt }, "qa-swapped");
    assert.deepEqual([705, 704, 703, 701].map(id => submittedGraph[id].inputs.image), swappedOrder);
    const populated = await graphState();
    const boardSnapshot = await page.evaluate(() => {
      const id = window.qaCommerce.dataset.id;
      const board = serializeCanvasBoard();
      board.nodes.find(node => node.id === id).h3CommerceDisplayOrder = [3, 2, 0, 1];
      return board;
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await openBoard(boardSnapshot);
    const restored = await page.evaluate(() => serializeCanvasNode(window.qaCommerce));
    assert.equal(restored.h3CommerceAspectRatio, "16:9");
    assert.equal(restored.h3CommerceMegapixels, 1);
    assert.equal(restored.h3CommercePromptA, saved.h3CommercePromptA);
    assert.equal(restored.h3CommercePromptB, saved.h3CommercePromptB);
    assert.equal(restored.h3CommerceDisplayOrder, undefined);
    assert.deepEqual(await displayOrder(), [0, 1, 2, 3]);
    assert.deepEqual(await graphState(), populated);
    await capture("restored-slots");
    supportsParameters = undefined;
    await trigger.click();
    await aspect.selectOption("9:16");
    await resolution.selectOption("0.6");
    await page.getByRole("button", { name: "关闭视频参数" }).click();
    acceptsSubmission = true;
    const generated = await page.evaluate(() => runCanvasMinimaxH3Node(window.qaCommerce));
    assert.deepEqual(generated, { ok: true, task_id: "qa-commerce", video: videoUrl });
    assert.equal(polls, 2);
    assert.equal(submission.commerce_mode, true);
    assert.equal(submission.prompt, saved.h3CommercePromptA);
    assert.equal(submission.prompt_b, saved.h3CommercePromptB);
    assert.ok(!Object.hasOwn(submission, "aspect_ratio"));
    assert.ok(!Object.hasOwn(submission, "megapixels"));
    assert.deepEqual(submission.images.map(item => item.name), swappedOrder);
    assert.deepEqual(commerceRequests.slice(-2), ["GET /api/minimax-h3-video/commerce-v1", "POST /api/minimax-h3-video/commerce-v1"]);
    const persisted = await page.evaluate(() => serializeCanvasNode(window.qaCommerce));
    assert.equal(persisted.generationVideoSrc, videoUrl);
    assert.equal(persisted.generationHistory.find(item => item.id === "qa-commerce")?.src, videoUrl);
    await page.waitForFunction(() => window.qaCommerce.querySelector("video.canvas-video-preview")?.readyState >= 1);
    const playback = await node.locator("video.canvas-video-preview").evaluate(async video => {
      video.muted = true;
      await video.play();
      const playing = !video.paused;
      video.pause();
      return { playing, duration: video.duration, width: video.videoWidth };
    });
    assert.ok(playback.playing && playback.duration > 0 && playback.width > 0, JSON.stringify(playback));
    const actualSize = await page.evaluate(() => window.FloraGenerationHistory.serialize(window.qaCommerce)
      .generationHistory.find(item => item.id === "qa-commerce")?.actualSize);
    assert.deepEqual(actualSize, { width: playback.width, height: 240 });
    const versionUrls = ["/output/h3-one.png", "/output/h3-main.png", "/output/h3-4.png"];
    const versionSource = await page.evaluate(urls => {
      const history = addCanvasImageGeneratorNode({ x: -110, y: 38 }, { name: "同一节点的历史素材" });
      const versions = urls.map((url, index) => ({
        id: "h3-version-" + index, kind: "image", src: url, savedUrl: url, name: "版本 " + (index + 1),
      }));
      FloraGenerationHistory.hydrate(history, versions, "h3-version-2");
      applyCanvasGenerationHistoryItem(history, versions[2]);
      syncCanvasNodeModel(history);
      return history.dataset.id;
    }, versionUrls);
    const nodeCount = () => page.evaluate(() => serializeCanvasBoard().nodes.length);
    const beforePick = await nodeCount();
    await slots.nth(0).locator(".canvas-h3-commerce-slot-choose").click();
    await page.getByRole("button", { name: "从画布选择", exact: true }).click();
    const point = await page.evaluate(id => {
      const model = getCanvasNodeModel(id);
      const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const transform = getCanvasAppliedViewport();
      return { x: viewport.left + transform.x + (Number(model.x) + 45) * transform.scale,
        y: viewport.top + transform.y + (Number(model.y) + 48) * transform.scale };
    }, versionSource);
    await page.mouse.click(point.x, point.y);
    await slots.nth(0).locator(`img[src="${versionUrls[2]}"]`).waitFor();
    assert.equal(await nodeCount(), beforePick);
    assert.equal((await graphState()).images[0].sourceNodeId, versionSource);
    async function pickVersion(slot, version) {
      await slots.nth(slot).locator(".canvas-h3-commerce-slot-choose").click();
      await page.locator(`.flora-reference-picker-item[data-reference-id^="canvas:${versionSource}:"]`)
        .filter({ has: page.locator(`img[src="${versionUrls[version]}"]`) }).click();
      await slots.nth(slot).locator(`img[src="${versionUrls[version]}"]`).waitFor();
    }
    await pickVersion(1, 0);
    assert.equal((await graphState()).images.filter(item => item.sourceNodeId === versionSource).length, 2);
    await pickVersion(2, 1);
    await pickVersion(3, 0);
    assert.equal(await nodeCount(), beforePick);
    const historical = (await graphState()).images;
    assert.deepEqual(historical.map(item => item.sourceNodeId), Array(4).fill(versionSource));
    assert.deepEqual(historical.map(item => item.resultId), [2, 0, 1, 0].map(index => "h3-version-" + index));
    await drag(0, 2);
    await page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), versionSource);
    const historyNode = page.locator(`#canvasPlane .canvas-node[data-id="${versionSource}"]`);
    await historyNode.getByRole("button", { name: "查看生成历史，共3条" }).click();
    const historyDialog = page.getByRole("dialog", { name: "节点生成历史" });
    await historyDialog.getByRole("button", { name: "选择第1条生成结果" }).click();
    await historyDialog.getByRole("button", { name: "关闭生成历史" }).click();
    await page.evaluate(() => selectCanvasNode(window.qaCommerce));
    const kept = (await graphState()).images;
    assert.deepEqual(kept.map(item => [item.url, item.resultId]), [1, 0, 2, 0].map(index => [versionUrls[index], "h3-version-" + index]));
    await capture("same-source-history");
    acceptsSubmission = false;
    await page.evaluate(() => runCanvasMinimaxH3Node(window.qaCommerce));
    assert.deepEqual(submission.images.map(item => item.url), kept.map(item => item.url));
    assert.deepEqual(errors, []);
    if (process.env.AI_OS_H3_SCREENSHOT) await page.screenshot({ path: path.resolve(process.env.AI_OS_H3_SCREENSHOT) });
    console.log(JSON.stringify({ ok: true, hiddenLegacyControls: true, commerceRequests, errors }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
