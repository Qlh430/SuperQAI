const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
process.env.AI_OS_TEST_URL = "http://127.0.0.1:33200";
const { openFixture } = require("./dom-scaling-test-support.cjs");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const webp = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
const output = path.resolve(__dirname, "../.design/image-node-mentions-20261120");
const before = process.argv.includes("--before");

async function main() {
  const fixture = await openFixture();
  const { page } = fixture;
  page.setDefaultTimeout(8000);
  const requests = [];
  let uploads = 0;
  await page.route("**/api/image-jobs", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 400, json: { error: "验收拦截，未执行生成。", code: "invalid_request" } });
  });
  await page.route("**/api/asset-library?*", route => route.fulfill({
    json: { entries: [{
      asset: { id: "qa-asset", name: "资产原图" },
      resource: { type: "image", metadata: { url: "/output/asset-original.png" } },
      preview: { kind: "image", url: "/output/asset-preview.png" },
    }, {
      asset: { id: "qa-existing-canvas-asset", name: "已上画布的商品" },
      resource: { type: "image", metadata: { url: "/output/product.png" } },
      preview: { kind: "image", url: "/output/preview.png" },
    }] },
  }));
  await page.route("**/output/*", async route => {
    if (route.request().url().endsWith(".webp")) return route.fulfill({ contentType: "image/webp", body: webp });
    return route.fulfill({ contentType: "image/png", body: png });
  });
  await page.route("**/api/upload-image", route => {
    uploads += 1;
    assert.deepEqual(route.request().postDataBuffer(), webp);
    return route.fulfill({ json: { url: "/output/uploaded.webp", asset: { id: "qa-upload" } } });
  });
  try {
    const ids = await page.evaluate(() => {
      canvasState.isRestoring = true;
      const target = addCanvasImageGeneratorNode({ x: 0, y: 0 }, { focus: false });
      const product = addCanvasImage("/output/preview.png", "商品主图", { x: -900, y: 0 });
      product.dataset.originalSrc = "/output/product.png";
      syncCanvasNodeModel(product);
      const scene = addCanvasImageGeneratorNode({ x: -880, y: 450 }, { focus: false });
      scene.dataset.resultSrc = "/output/scene-new.png";
      FloraGenerationHistory.hydrate(scene, [
        { id: "scene-old", kind: "image", src: "/output/scene-old.png", savedUrl: "/output/scene-old.png", name: "旧场景" },
        { id: "scene-new", kind: "image", src: "/output/scene-new.png", name: "新场景" },
      ], "scene-new");
      syncCanvasNodeModel(scene);
      addCanvasAudioNode({ x: -1000, y: 700 }, { src: "/output/material.mp3", name: "配音" });
      addCanvasVideoNode({ x: -1200, y: 700 }, { src: "/output/material.mp4", name: "视频案例" });
      canvasState.isRestoring = false;
      selectCanvasNode(target);
      return { target: target.dataset.id, product: product.dataset.id, scene: scene.dataset.id };
    });
    const target = page.locator(`.canvas-node[data-id="${ids.target}"]`);
    const editor = target.getByRole("textbox", { name: "提示词", exact: true });
    const chips = editor.locator(".flora-prompt-mention-chip");
    const trigger = target.getByRole("button", { name: "@ 引用素材", exact: true });
    const picker = page.locator(".flora-reference-picker.is-prompt-mention:not([hidden])");
    const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function center(width, scale) {
      await page.setViewportSize({ width, height: 950 });
      await page.evaluate(scale => {
        Object.assign(canvasState, { x: innerWidth / 2 - 200 * scale, y: 68, scale });
        applyCanvasTransformNow();
      }, scale);
      await frame();
      const current = await trigger.boundingBox();
      if (!current) throw new Error("图片节点缺少 @ 入口。");
      const deltaX = (width / 2) - current.x;
      const deltaY = 600 - current.y;
      await page.evaluate(({ x, y }) => {
        canvasState.x += x;
        canvasState.y += y;
        applyCanvasTransformNow();
      }, { x: deltaX, y: deltaY });
      await frame();
    }
    const prepareModel = (id = ids.target) => page.evaluate(id => {
      const node = getCanvasNode(id);
      const field = node.querySelector(".canvas-node-model");
      field.add(new Option("验收编辑模型", "qa-image-model"));
      field.value = "qa-image-model";
      field.dataset.modelSelection = "exact";
      delete field.dataset.catalogUnavailable;
      node.dataset.modelSelection = "exact";
      node.dataset.canvasModel = "qa-image-model";
    }, id);
    const submit = async (expected, id = ids.target) => {
      await prepareModel(id);
      const before = requests.length;
      const result = await page.evaluate(id => runCanvasImageEdit(getCanvasNode(id)), id);
      assert.equal(requests.length, before + 1, JSON.stringify(result));
      const payload = requests.at(-1);
      assert.deepEqual(payload.reference_images.map(ref => ref.url), expected);
      assert.doesNotMatch(payload.prompt, /<span|data-image/);
      return payload;
    };
    await center(1440, 1);
    fs.mkdirSync(output, { recursive: true });
    const toolbarOrder = () => target.evaluate(node => {
      const footer = node.querySelector(".flora-generator-footer");
      const button = footer.querySelector(".flora-prompt-mention-trigger");
      const parameters = footer.querySelector(".flora-generator-parameter-trigger");
      const icons = footer.querySelector(".flora-visual-presets");
      return Boolean(parameters.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
        && Boolean(button.compareDocumentPosition(icons) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    await target.locator(".flora-generator-composer").screenshot({ path: path.join(output, before ? "toolbar-before.png" : "toolbar-after.png") });
    assert.equal(await toolbarOrder(), true);
    if (before) return;
    const automatic = await page.evaluate(async ({ product, scene }) => {
      const boardId = canvasState.activeBoardId;
      const context = { scope: { boardId, runId: "qa-mentions" }, confirmedPhotoWorkflow: { runId: "qa-mentions" },
        assertActive() {}, nextFrame: async () => {} };
      const result = await createAgentCanvasNode("image", {
        title: "Agent 引用", prompt: "用 @图2 的背景搭配 product.png 的商品", reference_node_ids: [product, scene],
        x: 1200, y: -650,
      }, context);
      const node = ensureCanvasNodeMounted(result.node_id);
      selectCanvasNode(node);
      return { id: result.node_id, mentions: readCanvasPromptMentions(node), refs: getCanvasPromptImageRequest(node, undefined, getCanvasIncomingRefs(node.dataset.id)) };
    }, ids);
    assert.deepEqual(automatic.mentions.map(item => item.sourceNodeId), [ids.scene, ids.product]);
    assert.deepEqual(automatic.refs.refs.map(item => item.url), ["/output/product.png", "/output/scene-new.png"]);
    const agentNode = page.locator(`.canvas-node[data-id="${automatic.id}"]`);
    assert.deepEqual(await agentNode.locator(".flora-prompt-mention-chip").allTextContents(), ["@图2", "@图片1"]);
    await page.evaluate(id => {
      const node = ensureCanvasNodeMounted(id);
      const point = { x: Number(node.dataset.x), y: Number(node.dataset.y) };
      Object.assign(canvasState, { x: innerWidth / 2 - point.x - 200, y: 70 - point.y, scale: 1 });
      applyCanvasTransformNow();
    }, automatic.id);
    await agentNode.locator(".flora-generator-composer").screenshot({ path: path.join(output, "agent-auto-mention.png") });
    const agentRequest = await submit(["/output/product.png", "/output/scene-new.png"], automatic.id);
    assert.match(agentRequest.prompt, /^用 @图2 的背景搭配 @图片1 的商品/);
    const updated = await page.evaluate(async ({ id }) => {
      const node = ensureCanvasNodeMounted(id);
      const context = { scope: { boardId: canvasState.activeBoardId, runId: "qa-mentions" },
        assertActive() {}, forEachBatched: (nodes, apply) => Promise.all(nodes.map(apply)) };
      await updateAgentCanvasNodeFields(id, { prompt: "保留 @图片1 的商品，背景参考 scene-new.png。" }, context);
      return readCanvasPromptMentions(node);
    }, automatic);
    assert.deepEqual(updated.map(item => [item.label, item.sourceNodeId]), [["@图片1", ids.product], ["@图片2", ids.scene]]);
    const confirmed = await page.evaluate(async ({ product, scene }) => {
      const boardId = canvasState.activeBoardId;
      const context = { scope: { boardId, runId: "qa-mentions-single-token" },
        confirmedPhotoWorkflow: { runId: "qa-mentions-single-token" }, assertActive() {}, nextFrame: async () => {} };
      const result = await createAgentCanvasNode("image", {
        title: "单编号引用", prompt: "保留 @图2 的背景", reference_node_ids: [product, scene],
        x: 1600, y: -650,
      }, context);
      const node = ensureCanvasNodeMounted(result.node_id);
      const mentions = readCanvasPromptMentions(node);
      const refs = getCanvasPromptImageRequest(node, undefined, getCanvasIncomingRefs(node.dataset.id));
      node.dataset.photoFidelity = JSON.stringify({ prompt: "保留 @图2 的背景", mentions });
      selectCanvasNode(node);
      return { id: result.node_id, urls: refs.refs.map(item => item.url) };
    }, ids);
    assert.deepEqual(confirmed.urls, ["/output/product.png", "/output/scene-new.png"]);
    assert.deepEqual(await page.locator(`.canvas-node[data-id="${confirmed.id}"] .flora-prompt-mention-chip`).allTextContents(), ["@图2"]);
    await page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), ids.target);
    await center(1440, 1);
    await editor.fill("旧提示词中的 @图1");
    assert.equal(await chips.count(), 0);
    assert.match(await target.locator(".flora-prompt-mention-warning").innerText(), /未绑定素材/);
    await prepareModel();
    const rejected = await page.evaluate(id => runCanvasImageEdit(getCanvasNode(id)), ids.target);
    assert.equal(rejected.code, "invalid_prompt_reference");
    assert.equal(requests.length, 1);
    await editor.fill("普通生图");
    const ordinary = await submit([]);
    assert.match(ordinary.prompt, /^普通生图(?:\n|$)/);
    await page.evaluate(({ target, product }) => CanvasReferenceBridge.add({ targetNodeId: target, sourceNodeId: product }), ids);
    await editor.fill("让 的商品出现在场景");
    await editor.press("Home");
    await editor.press("ArrowRight");
    await page.keyboard.insertText("@");
    await picker.waitFor();
    await page.screenshot({ path: path.join(output, "typed-at-picker.png") });
    assert.equal(await picker.locator(".flora-reference-picker-item").first().getAttribute("data-reference-id"), `canvas:${ids.product}:output`);
    await editor.press("ArrowDown");
    await editor.press("Enter");
    await chips.waitFor();
    assert.equal(await chips.first().innerText(), "@图片1");
    const one = await submit(["/output/product.png"]);
    assert.match(one.prompt, /^让@图片1 的商品/);
    for (const key of ["model", "size", "n", "resolution"]) assert.deepEqual(one[key], ordinary[key], key);
    const crossSource = await page.evaluate(({ target, product }) => {
      const before = canvasVirtualStore.size;
      const ref = CanvasReferenceBridge.pinPromptImage({ targetNodeId: target, item: {
        source: "asset", type: "image", assetId: "qa-existing-canvas-asset", name: "已上画布的商品", url: "/output/product.png",
      } });
      return { expected: product, source: ref.sourceNodeId, asset: ref.assetId, before, after: canvasVirtualStore.size };
    }, ids);
    assert.equal(crossSource.source, crossSource.expected);
    assert.equal(crossSource.asset, "qa-existing-canvas-asset");
    assert.equal(crossSource.before, crossSource.after);
    await editor.press("End");
    await trigger.click();
    await picker.getByRole("button", { name: /历史 1/ }).click();
    assert.deepEqual(await chips.allTextContents(), ["@图片1", "@图片2"]);
    const two = await submit(["/output/product.png", "/output/scene-old.png"]);
    assert.match(two.prompt, /场景@图片2/);
    await page.evaluate(id => {
      const scene = getCanvasNode(id) || ensureCanvasNodeMounted(id);
      scene.dataset.resultSrc = "/output/scene-third.png";
      syncCanvasNodeModel(scene);
    }, ids.scene);
    await submit(["/output/product.png", "/output/scene-old.png"]);
    await editor.press("End");
    for (const type of ["音频", "视频"]) {
      await trigger.click();
      await picker.getByRole("button", { name: type, exact: true }).click();
      assert.equal(await picker.locator(".flora-reference-picker-item[aria-disabled=true]").count(), 1);
      assert.equal(await picker.getByText("图片生成当前仅接受图片参考。", { exact: false }).count(), 1);
      await editor.press("Escape");
      assert.equal(await chips.count(), 2);
    }
    await trigger.click();
    await picker.getByRole("tab", { name: "资产库" }).click();
    await picker.getByRole("searchbox").fill("资产原图");
    await picker.getByRole("button", { name: /资产原图/ }).click();
    assert.equal(await chips.count(), 3, await picker.locator(".flora-reference-picker-empty:visible").allTextContents());
    await submit(["/output/product.png", "/output/scene-old.png", "/output/asset-original.png"]);
    await trigger.click();
    const chooserPromise = page.waitForEvent("filechooser");
    await picker.getByRole("button", { name: "本地上传" }).click();
    await (await chooserPromise).setFiles({ name: "验收.webp", mimeType: "image/webp", buffer: webp });
    await page.waitForFunction(() => document.querySelectorAll(".flora-prompt-mention-chip").length === 4);
    await submit(["/output/product.png", "/output/scene-old.png", "/output/asset-original.png", "/output/uploaded.webp"]);
    await trigger.click();
    const repeat = page.waitForEvent("filechooser");
    await picker.getByRole("button", { name: "本地上传" }).click();
    await (await repeat).setFiles({ name: "相同内容.webp", mimeType: "image/webp", buffer: webp });
    await page.waitForFunction(() => document.querySelectorAll(".flora-prompt-mention-chip").length === 5);
    assert.equal(uploads, 1);
    await editor.evaluate(element => {
      const range = document.createRange();
      range.setStartBefore(element.querySelectorAll(".flora-prompt-mention-chip")[1]);
      range.setEndAfter(element.querySelectorAll(".flora-prompt-mention-chip")[1]);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await editor.press("Backspace");
    const deleted = await submit(["/output/product.png", "/output/asset-original.png", "/output/uploaded.webp"]);
    assert.match(deleted.prompt, /场景@图片2@图片3@图片3/);
    await editor.press("Control+z");
    await page.waitForFunction(() => document.querySelectorAll(".flora-prompt-mention-chip").length === 5);
    await editor.press("Control+Shift+z");
    await page.waitForFunction(() => document.querySelectorAll(".flora-prompt-mention-chip").length === 4);
    const board = await page.evaluate(async () => {
      await saveCanvasBoardNow({ recordUndo: false });
      return serializeCanvasBoard();
    });
    const saved = board.nodes.find(node => node.id === ids.target).promptMentions;
    assert.deepEqual(fixture.savedModels.get(ids.target).promptMentions, saved, "保存请求中的草稿包含原始引用");
    const persistedBoard = { ...board, nodes: [...fixture.savedModels.values()], connections: [...fixture.savedConnections.values()] };
    async function reopenBoard(target, board) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.evaluate(async ({ target, board }) => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator", "canvas-node-text"]);
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      surface.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column";
      const view = document.querySelector("#canvasView");
      surface.append(view);
      document.body.append(surface);
      view.hidden = false;
      view.classList.add("active");
      view.style.cssText = "flex:1;min-height:0;width:100%";
      document.body.classList.add("canvas-surface-open");
      canvasState.activeBoardId = board.id;
      showCanvasEditor();
      restoreCanvasBoard(board);
      selectCanvasNode(getCanvasNode(target) || ensureCanvasNodeMounted(target));
      }, { target, board });
    }
    await reopenBoard(ids.target, persistedBoard);
    assert.deepEqual(saved.map(x => x.url), ["/output/product.png", "/output/asset-original.png", "/output/uploaded.webp", "/output/uploaded.webp"]);
    assert.equal(await chips.count(), 4);
    await submit(["/output/product.png", "/output/asset-original.png", "/output/uploaded.webp"]);
    for (const width of [390, 768, 1440, 1728]) {
      for (const scale of [.5, 1, 2]) {
        await center(width, scale);
        await trigger.click();
        await picker.waitFor();
        await frame();
        const box = await picker.boundingBox();
        assert.ok(box.x >= 7 && box.x + box.width <= width - 7, JSON.stringify({ width, scale, box }));
        const bounds = await target.locator(".canvas-node-run").boundingBox();
        const button = await trigger.boundingBox();
        assert.ok(bounds.x >= button.x + button.width || bounds.y >= button.y + button.height,
          JSON.stringify({ width, scale, bounds, button }));
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width,
          JSON.stringify({ width, scale, bounds }));
        await page.keyboard.press("Escape");
      }
    }
    await center(1440, 1);
    const moveCamera = async (x, y, scale) => {
      await page.evaluate(({ x, y, scale }) => {
        canvasState.x += x;
        canvasState.y += y;
        canvasState.scale = scale;
        applyCanvasTransformNow();
      }, { x, y, scale });
      await frame();
    };
    const placement = async () => {
      const panel = await picker.boundingBox();
      const canvas = await page.locator("#infiniteCanvas").boundingBox();
      assert.ok(panel && panel.x >= canvas.x + 7 && panel.y >= canvas.y + 7 &&
        panel.x + panel.width <= canvas.x + canvas.width - 7 &&
        panel.y + panel.height <= canvas.y + canvas.height - 7, JSON.stringify({ panel, canvas }));
      return panel;
    };
    const canvasBox = await page.locator("#infiniteCanvas").boundingBox();
    for (const [x, y] of [[24, 130], [canvasBox.width - 52, 130], [24, canvasBox.height - 64], [canvasBox.width - 52, canvasBox.height - 64]]) {
      await center(1440, 1);
      const button = await trigger.boundingBox();
      await moveCamera(canvasBox.x + x - button.x, canvasBox.y + y - button.y, 1);
      const hit = await trigger.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const over = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { hit: element.contains(over), blocker: over?.className, rect: rect.toJSON() };
      });
      assert.ok(hit.hit, JSON.stringify({ x, y, canvasBox, hit }));
      await trigger.click({ timeout: 3000 });
      await placement();
      await page.keyboard.press("Escape");
    }
    await center(1440, 1);
    await trigger.click();
    const beforePan = await placement();
    await moveCamera(-125, -60, 1);
    const afterPan = await placement();
    assert.notEqual(beforePan.x, afterPan.x);
    await moveCamera(25, 20, .7);
    const positioned = await placement();
    for (const control of [editor, target.locator(".canvas-node-run")]) {
      const rect = await control.boundingBox();
      assert.ok(positioned.x + positioned.width <= rect.x || positioned.x >= rect.x + rect.width
        || positioned.y + positioned.height <= rect.y || positioned.y >= rect.y + rect.height);
    }
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "mention-picker-stage.png") });
    await page.keyboard.press("Escape");
    await center(1440, 1);
    await page.screenshot({ path: path.join(output, "mention-editor-stage.png") });
    await target.getByRole("button", { name: "放大操作区", exact: true }).click();
    await trigger.click();
    await placement();
    assert.equal(await picker.evaluate(element => element.matches(":popover-open")), true);
    await page.keyboard.press("Escape");
    assert.equal(await picker.count(), 0);
    await target.getByRole("button", { name: "关闭放大操作区", exact: true }).click();
    await center(1440, 1);
    await editor.fill("开始");
    await editor.press("End");
    await editor.press("Shift+Enter");
    await page.keyboard.insertText("第二行");
    await editor.press("Enter");
    await page.keyboard.insertText("第三行");
    const nativePrompt = target.locator("textarea.canvas-node-prompt");
    assert.equal(await nativePrompt.inputValue(), "开始\n第二行\n第三行");
    for (const key of ["Control+Home", "Control+End"]) {
      await editor.press(key);
      await page.keyboard.insertText("@");
      await picker.waitFor();
      await editor.press("Escape");
      await editor.press("Backspace");
    }
    assert.equal(await nativePrompt.inputValue(), "开始\n第二行\n第三行");
    const client = await fixture.context.newCDPSession(page);
    await client.send("Input.imeSetComposition", { text: "zhong", selectionStart: 5, selectionEnd: 5 });
    assert.equal(await picker.count(), 0);
    await client.send("Input.insertText", { text: "中文输入" });
    assert.equal(await nativePrompt.inputValue(), "开始\n第二行\n第三行中文输入");
    await fixture.context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText(" 普通粘贴"));
    await editor.press("Control+v");
    await page.waitForFunction(() => document.querySelector(".canvas-node.is-selected textarea.canvas-node-prompt")?.value.endsWith(" 普通粘贴"));
    await editor.fill("保留前后文字");
    await editor.press("Home");
    await editor.press("ArrowRight");
    await page.keyboard.insertText("@");
    await picker.getByRole("button", { name: /商品主图/ }).click();
    assert.equal(await chips.count(), 1);
    await editor.evaluate(element => {
      const chip = element.querySelector(".flora-prompt-mention-chip");
      const range = document.createRange();
      range.selectNode(chip);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await trigger.click();
    await picker.getByRole("button", { name: /历史 1/ }).click();
    assert.equal(await nativePrompt.inputValue(), "保@图片1留前后文字");
    const replacement = await chips.first().evaluate(chip => JSON.parse(chip.dataset.image));
    assert.equal(replacement.sourceNodeId, ids.scene);
    assert.equal(replacement.resultId, "scene-old");
    await submit(["/output/scene-old.png", "/output/product.png"]);

    const live = await page.evaluate(async ({ scene }) => {
      const source = addCanvasImageGeneratorNode({ x: -400, y: 900 }, { focus: false });
      const context = { scope: { boardId: canvasState.activeBoardId, runId: "qa-live-mention" },
        assertActive() {}, nextFrame: async () => {} };
      const prompt = "用 @图片1 的商品搭配 @图片2 的场景";
      const result = await createAgentCanvasNode("image", {
        prompt, reference_node_ids: [source.dataset.id, scene], x: 0, y: 900,
      }, context);
      const node = ensureCanvasNodeMounted(result.node_id);
      selectCanvasNode(node);
      const editor = node.querySelector(".flora-prompt-mention-editor");
      const chip = editor.firstElementChild;
      editor.focus();
      const range = document.createRange();
      range.setStart(editor.firstChild, 1);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      window.qaMentionSelection = { editor, chip, text: range.startContainer };
      return { id: result.node_id, source: source.dataset.id, prompt, mentions: readCanvasPromptMentions(node),
        pending: getCanvasImagePendingDependency(node)?.code };
    }, ids);
    const liveNode = page.locator(`.canvas-node[data-id="${live.id}"]`);
    const liveImages = liveNode.locator(".flora-prompt-mention-chip img");
    const livePreview = index => liveImages.nth(index).getAttribute("src");
    assert.equal(live.pending, "upstream_image_pending");
    assert.equal(live.mentions[0].pendingOutput, true);
    assert.equal(await livePreview(0), null);
    const pinned = live.mentions[1].url;
    const addResult = version => page.evaluate(({ id, version }) => {
      FloraGenerationHistory.add(ensureCanvasNodeMounted(id), {
        kind: "image", id: `live-${version}`, src: `/output/live-preview-${version}.png`,
        savedUrl: `/output/live-original-${version}.png`,
      });
    }, { id: live.source, version });
    const expectLiveResult = async version => {
      const preview = `/output/live-preview-${version}.png`;
      const band = await liveNode.locator(".flora-reference-materials img").evaluateAll(images => images.map(img => img.getAttribute("src")));
      assert.ok(band.includes(preview), "素材栏已收到上游结果");
      assert.equal(await livePreview(0), preview, "同一次刷新应更新待生成引用的标签缩略图");
      assert.equal(await livePreview(1), pinned);
      assert.equal(await liveNode.locator("textarea.canvas-node-prompt").inputValue(), live.prompt);
      await submit([`/output/live-original-${version}.png`, pinned], live.id);
    };
    await addResult(1);
    await expectLiveResult(1);
    assert.ok(await liveNode.evaluate(node => {
      const { editor, chip, text } = window.qaMentionSelection;
      const selection = getSelection();
      return node.querySelector(".flora-prompt-mention-editor") === editor && editor.firstElementChild === chip
        && selection.anchorNode === text && selection.anchorOffset === 1;
    }), "更新缩略图应保留编辑器、标签以及光标");
    await addResult(2);
    await expectLiveResult(2);
    await page.evaluate(({ source, scene, pinned }) => {
      const chooseResult = (nodeId, resultId) => {
        const badge = ensureCanvasNodeMounted(nodeId).querySelector(".flora-generation-history-badge");
        badge.click();
        const panel = document.getElementById(badge.getAttribute("aria-controls"));
        panel.querySelector(`[data-history-id="${resultId}"][data-history-action="select"]`).click();
        panel.querySelector('button[aria-label="关闭生成历史"]').click();
      };
      chooseResult(source, "live-1");
      const id = pinned.endsWith("scene-old.png") ? "scene-new" : "scene-old";
      chooseResult(scene, id);
    }, { source: live.source, scene: ids.scene, pinned });
    await expectLiveResult(1);
    const liveBoard = await page.evaluate(async () => {
      await saveCanvasBoardNow({ recordUndo: false });
      return serializeCanvasBoard();
    });
    assert.deepEqual(fixture.savedModels.get(live.id).promptMentions, live.mentions);
    await reopenBoard(live.id, { ...liveBoard, nodes: [...fixture.savedModels.values()], connections: [...fixture.savedConnections.values()] });
    await expectLiveResult(1);

    assert.deepEqual(fixture.errors, []);
    const report = { submitted: requests.length, uploads, responsiveCases: 12, edgeCases: 4, savedAndReloaded: true, crossSourceReuse: true,
      imeAndClipboard: true, pansAndZoom: true, expanded: true, liveMentionHistory: true,
      payloads: requests.map(({ model, prompt, size, n, resolution, reference_images }) =>
        ({ model, prompt, size, n, resolution, reference_urls: reference_images.map(ref => ref.url) })) };
    fs.writeFileSync(path.join(output, "image-mention-regression.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, payloads: undefined }));
  } finally { await fixture.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
