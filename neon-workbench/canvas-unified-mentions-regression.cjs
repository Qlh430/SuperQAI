const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
process.env.AI_OS_TEST_URL = "http://127.0.0.1:33200";
process.env.QA_RUNTIME_ROOT ||= path.resolve(__dirname, "../../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app");
const { openFixture } = require("./dom-scaling-test-support.cjs");

async function main() {
  const fixture = await openFixture();
  const { page } = fixture;
  page.setDefaultTimeout(5000);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
  const markdown = "# 自然光摄影\n\n**主体**与 *自然布光*，[示例](https://example.com)，`ISO 100`。\n\n- 场景一\n- 场景二\n\n1. 构图\n2. 色彩\n\n> 反光板补光\n\n```text\nEnglish 中文 very-long-example-without-spaces-".concat("z".repeat(180), "\n```\n\n|项目|说明|\n|---|---|\n|光线|窗边自然光|\n\n", "光线和构图需要保留产品特征。 Mixed text.\n\n".repeat(16));
  const submissions = new Map();
  const pagedImage = { id: "qa-paged-image", kind: "image", nodeTitle: "已分页素材", imageSrc: "/output/qa-paged.png",
    uploadOnly: true, x: -8800, y: 0, width: 400, height: 400 };
  await page.route("**/output/qa-*.png", route => route.fulfill({ contentType: "image/png", body: png }));
  await page.route("**/api/asset-library?*", route => route.fulfill({ json: { entries: [
    { asset: { id: "qa-asset", name: "资产库样图" }, resource: { type: "image", metadata: { url: "/output/qa-asset.png" } } },
    { asset: { id: "qa-sound", name: "资产库声音" }, resource: { type: "audio", metadata: { url: "/output/qa-sound.wav" } } },
  ] } }));
  await page.route("**/export-page?*", route => route.fulfill({ json: { items: [pagedImage] } }));
  await page.route("**/node?nodeId=qa-paged-image", route => route.fulfill({ json: { node: pagedImage } }));
  await page.route("**/api/minimax-h3-video/commerce-v1", route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { protocol: "ai-os.h3-commerce.v1", available: true } });
    }
    submissions.set("/api/minimax-h3-video/commerce-v1", route.request().postDataJSON());
    return route.fulfill({ status: 400, json: { error: "验收拦截，未执行生成。" } });
  });
  await page.route("**/api/providers/audio-models*", route => route.fulfill({ json: { models: [
    { id: "qa-music", modelId: "music-2.5", providerId: "qa", displayName: "验收音乐模型", capabilities: ["audio.generate"], modelProtocol: "audio-adapter" },
    { id: "custom:local-comfyui:qwen-tts", modelId: "qwen-tts", providerId: "local-comfyui", displayName: "Qwen-TTS", capabilities: ["audio.generate"], modelProtocol: "audio-speech" },
  ] } }));
  for (const endpoint of ["/api/chat", "/api/videos", "/api/minimax-h3-video", "/api/providers/generate-audio", "/api/image-jobs", "/api/qwen-image21"]) {
    await page.route(`**${endpoint}`, route => {
      if (route.request().method() !== "POST") return route.fallback();
      submissions.set(endpoint, route.request().postDataJSON());
      return endpoint === "/api/chat" ? route.fulfill({ json: { choices: [{ message: { content: markdown } }] } })
        : route.fulfill({ status: 400, json: { error: "验收拦截，未执行生成。" } });
    });
  }
  try {
    const ids = await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(["canvas-node-llm", "canvas-node-audio-generator", "canvas-node-video-api", "canvas-node-comfy", "canvas-node-midjourney"]);
      canvasState.isRestoring = true;
      const image = addCanvasImage("/output/qa-ref.png", "图像素材", { x: -900, y: 0 });
      const text = addCanvasText({ x: -6000, y: 0 }, { text: "来自文本素材的自然光说明", focus: false });
      const sound = addCanvasAudioNode({ x: -1800, y: 0 }, { src: "/output/qa-audio.wav", name: "试听音频" });
      addCanvasVideoNode({ x: -2300, y: 0 }, { src: "/output/qa-motion.mp4", name: "动态视频" });
      canvasVirtualStore.upsert({ id: "untitled-image", kind: "image", imageSrc: "/output/qa-untitled.png", uploadOnly: true, x: -6600, y: 0, width: 400, height: 400 });
      const generator = addCanvasImageGeneratorNode({ x: 0, y: 0 }, { focus: false });
      const video = addCanvasApiVideoNode({ x: 0, y: 0 });
      const h3 = addCanvasMinimaxH3Node({ x: 0, y: 0 });
      const audio = addCanvasAudioGeneratorNode({ x: 0, y: 0 });
      const llm = addCanvasText({ x: 0, y: 0 }, { text: "", focus: false });
      const comfy = addCanvasImageGeneratorNode({ x: 0, y: 0 }, { engine: "comfyui", focus: false });
      const legacy = addCanvasLlmNode({ x: 0, y: 0 }, { prompt: "隐藏在输入区的文字" });
      const commerce = addCanvasMinimaxH3Node({ x: 0, y: 0 }, { modelId: "h3-commerce" });
      const midjourney = addCanvasMidjourneyNode({ x: 0, y: 0 });
      canvasState.isRestoring = false;
      return { image: image.dataset.id, text: text.dataset.id, sound: sound.dataset.id,
        generator: generator.dataset.id, video: video.dataset.id, h3: h3.dataset.id, audio: audio.dataset.id,
        textGenerator: llm.dataset.id, comfy: comfy.dataset.id, legacy: legacy.dataset.id, commerce: commerce.dataset.id, midjourney: midjourney.dataset.id };
    });
    const nodeLocator = id => page.locator(`.canvas-node[data-id="${id}"]`);
    const picker = page.locator(".flora-reference-picker.is-prompt-mention:visible");
    async function select(id) {
      await page.evaluate(id => {
        const node = getCanvasNode(id) || ensureCanvasNodeMounted(id);
        selectCanvasNode(node);
        Object.assign(canvasState, { x: 520, y: 70, scale: 1 });
        applyCanvasTransformNow();
      }, id);
      return nodeLocator(id);
    }
    async function open(editor, text = "") {
      await editor.fill(text);
      await editor.press("End");
      await page.keyboard.insertText("@");
      await picker.waitFor();
    }
    for (const id of [ids.generator, ids.video, ids.h3, ids.audio, ids.textGenerator, ids.comfy, ids.legacy, ids.commerce, ids.midjourney]) {
      const node = await select(id);
      const editor = node.locator(".flora-prompt-mention-editor:visible").first();
      await open(editor);
      await picker.getByRole("button", { name: /图像素材/ }).waitFor();
      await page.keyboard.press("Escape");
    }
    const api = await select(ids.generator);
    await page.evaluate(() => { canvasState.activeBoardPersisted = true; });
    await open(api.locator(".flora-prompt-mention-editor"));
    await picker.getByRole("button", { name: /已分页素材/ }).click();
    await api.locator(".flora-prompt-mention-chip").waitFor();
    assert.equal(await api.evaluate(node => serializeCanvasNode(node).promptMentions[0].sourceNodeId), pagedImage.id);
    await api.locator(".flora-prompt-mention-editor").fill("");
    assert.equal(await api.evaluate(node => canvasState.connections.some(edge => edge.to === node.dataset.id && edge.from === "qa-paged-image")), false);
    await page.evaluate(() => { canvasState.activeBoardPersisted = false; });
    await open(api.locator(".flora-prompt-mention-editor"));
    await picker.getByRole("tab", { name: "资产库" }).click();
    await picker.getByRole("searchbox").fill("样图");
    await picker.getByRole("button", { name: /资产库样图/ }).click();
    await api.locator(".flora-prompt-mention-chip").waitFor();
    assert.equal(await api.evaluate(node => serializeCanvasNode(node).promptMentions[0].assetId), "qa-asset");
    await api.locator(".flora-prompt-mention-editor").fill("");
    const video = await select(ids.video);
    await open(video.locator(".flora-prompt-mention-editor"), "镜头");
    await picker.getByRole("button", { name: /图像素材/ }).click();
    await video.locator(".flora-prompt-mention-chip").waitFor();
    await page.evaluate(id => {
      const node = getCanvasNode(id);
      node.dataset.apiVideoModel = "qa-video";
      delete node.querySelector(".canvas-api-video-model").dataset.catalogUnavailable;
      return runCanvasApiVideoNode(node);
    }, ids.video);
    assert.equal(submissions.get("/api/videos")?.reference_images[0]?.url, "/output/qa-ref.png",
      JSON.stringify(await video.evaluate(node => ({ model: node.dataset.apiVideoModel, value: node.querySelector("textarea")?.value,
        mentions: readCanvasPromptMentions(node), validation: resolveCanvasPromptMaterials(node),
        status: node.querySelector(".canvas-h3-status, .canvas-node-status")?.textContent }))));
    const h3 = await select(ids.h3);
    const h3Editor = h3.locator(".flora-prompt-mention-editor");
    for (const [type, name] of [["图片", "图像素材"], ["视频", "动态视频"], ["音频", "试听音频"]]) {
      await h3Editor.press("End");
      await page.keyboard.insertText("@");
      await picker.getByRole("button", { name: type, exact: true }).click();
      await picker.getByRole("button", { name: new RegExp(name) }).click();
      await picker.waitFor({ state: "hidden" });
    }
    assert.equal(await h3.locator(".flora-prompt-mention-chip").count(), 3);
    await page.evaluate(id => runCanvasMinimaxH3Node(getCanvasNode(id)), ids.h3);
    const h3Payload = submissions.get("/api/minimax-h3-video");
    assert.ok(h3Payload && h3Payload.images.length === 1 && h3Payload.videos.length === 1 && h3Payload.audios.length === 1);
    assert.match(h3Payload.prompt, /<Picture 1>.*<Video 1>.*<Audio 1>/s);
    const audio = await select(ids.audio);
    const audioEditor = audio.locator(".flora-prompt-mention-editor");
    await open(audioEditor);
    await picker.getByRole("button", { name: "文本", exact: true }).click();
    await picker.locator(`[data-reference-id="canvas:${ids.text}:output"]`).click();
    await audio.locator(".flora-prompt-mention-chip").waitFor();
    await page.evaluate(async id => {
      await loadCanvasAudioModels();
      const node = getCanvasNode(id);
      const model = node.querySelector(".canvas-audio-generator-model");
      model.value = "qa-music";
      model.dispatchEvent(new Event("change", { bubbles: true }));
      await CanvasAudioGenerator.run(node);
    }, ids.audio);
    assert.equal(submissions.get("/api/providers/generate-audio")?.prompt, "来自文本素材的自然光说明",
      JSON.stringify(await audio.evaluate(node => ({ model: node.querySelector(".canvas-audio-generator-model")?.value,
        mentions: readCanvasPromptMentions(node), references: resolveCanvasPromptMaterials(node),
        status: node.querySelector(".canvas-audio-generator-status, .canvas-node-status")?.textContent }))));
    await audio.evaluate(node => {
      const set = (selector, value) => {
        const field = node.querySelector(selector);
        field.value = value;
        field.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set(".canvas-audio-generator-mode", "speech");
      set(".canvas-audio-generator-model", "custom:local-comfyui:qwen-tts");
      set(".canvas-audio-generator-speed", "clone");
    });
    await open(audioEditor, "这是配音。");
    await picker.getByRole("button", { name: "音频", exact: true }).click();
    await picker.getByRole("button", { name: /试听音频/ }).click();
    await audio.locator(".flora-prompt-mention-chip").waitFor().catch(async cause => {
      const state = await audio.evaluate(node => ({
        audio: CanvasAudioGenerator.serialize(node),
        mentions: readCanvasPromptMentions(node),
        prompt: node.querySelector(".flora-prompt-mention-editor")?.innerHTML,
        connections: canvasState.connections.filter(edge => edge.to === node.dataset.id),
      }));
      throw new Error(JSON.stringify({ picker: await picker.allTextContents(), state }), { cause });
    });
    await page.evaluate(id => CanvasAudioGenerator.run(getCanvasNode(id)), ids.audio);
    const clone = submissions.get("/api/providers/generate-audio");
    assert.equal(clone?.parameters.referenceAudio, "/output/qa-audio.wav");
    assert.equal(clone?.prompt, "这是配音。");
    await audio.evaluate(node => {
      const field = node.querySelector(".canvas-audio-generator-mode");
      field.value = "music";
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(await audio.locator(".flora-prompt-mention-label").innerText(), "@文本1");
    const audioDrafts = await audio.evaluate(node => serializeCanvasNode(node).audioGeneration.promptMentionDrafts);
    assert.equal(audioDrafts.music[0].sourceNodeId, ids.text);
    assert.equal(audioDrafts["qwen-clone"][0].sourceNodeId, ids.sound);
    const commerce = await select(ids.commerce);
    for (const part of ["A", "B"]) {
      await open(commerce.getByRole("textbox", { name: `H3 带货提示词 ${part}`, exact: true }));
      await picker.getByRole("button", { name: /图像素材/ }).click();
      await picker.waitFor({ state: "hidden" });
    }
    const slots = await commerce.evaluate(node => getCanvasH3CommerceImages(node));
    assert.equal(slots.filter(Boolean).length, 1);
    assert.equal(slots[0].sourceNodeId, ids.image);
    await commerce.getByRole("textbox", { name: "H3 带货提示词 A", exact: true }).fill("第一段");
    assert.equal(await commerce.evaluate(node => getCanvasH3CommerceImages(node)[0]?.url), "/output/qa-ref.png");
    await commerce.getByRole("textbox", { name: "H3 带货提示词 B", exact: true }).fill("第二段");
    assert.equal(await commerce.evaluate(node => getCanvasH3CommerceImages(node)[0]?.url), undefined);
    await commerce.evaluate(node => {
      for (let index = 0; index < 3; index++) {
        const source = addCanvasImage(`/output/qa-commerce-${index}.png`, `带货素材${index + 1}`, { x: -3400, y: index * 500 });
        applyCanvasH3CommerceSlot(node, index, { sourceNodeId: source.dataset.id, sourcePort: "output" });
      }
    });
    await open(commerce.getByRole("textbox", { name: "H3 带货提示词 A", exact: true }), "使用");
    await picker.getByRole("button", { name: /图像素材/ }).click();
    assert.equal(await commerce.locator(".flora-prompt-mention-label").innerText(), "@图片4");
    await page.evaluate(id => runCanvasH3CommerceNode(getCanvasNode(id)), ids.commerce);
    const commercePayload = submissions.get("/api/minimax-h3-video/commerce-v1");
    assert.equal(commercePayload?.prompt, "使用<Picture 4>");
    assert.equal(commercePayload?.prompt_b, "第二段");
    assert.deepEqual(commercePayload?.images.map(item => item.url), [
      "/output/qa-commerce-0.png", "/output/qa-commerce-1.png", "/output/qa-commerce-2.png", "/output/qa-ref.png",
    ]);
    const midjourney = await select(ids.midjourney);
    await open(midjourney.locator(".flora-prompt-mention-editor"), "编辑商品");
    await picker.getByRole("button", { name: /图像素材/ }).click();
    await midjourney.locator(".flora-prompt-mention-chip").waitFor();
    await page.evaluate(id => {
      const node = getCanvasNode(id);
      node.dataset.midjourneyModel = "qa-midjourney";
      return runCanvasMidjourneyNode(node);
    }, ids.midjourney);
    assert.deepEqual(submissions.get("/api/image-jobs")?.reference_images, [{ url: "/output/qa-ref.png", name: "图像素材" }]);
    const comfy = await select(ids.comfy);
    await open(comfy.locator(".flora-prompt-mention-editor"), "编辑");
    await picker.getByRole("button", { name: /图像素材/ }).click();
    await comfy.locator(".flora-prompt-mention-chip").waitFor();
    await page.evaluate(id => runCanvasComfyNode(getCanvasNode(id)), ids.comfy);
    assert.deepEqual(submissions.get("/api/qwen-image21")?.images, ["/output/qa-ref.png"]);
    const text = await select(ids.textGenerator);
    const textEditor = text.locator(".flora-prompt-mention-editor");
    const output = text.locator(".canvas-text");
    const instruction = "请根据素材生成一段自然美学产品摄影方案。";
    await open(textEditor, instruction);
    assert.equal(await output.textContent(), "");
    assert.equal(await output.locator(".flora-text-empty-icon").isVisible(), true);
    await picker.getByRole("button", { name: /图像素材/ }).click();
    await text.locator(".flora-prompt-mention-chip").waitFor();
    await page.evaluate(id => {
      const node = getCanvasNode(id);
      const model = node.querySelector(".canvas-llm-model");
      model.add(new Option("验收模型", "qa-text-model"));
      model.value = "qa-text-model";
      delete model.dataset.catalogUnavailable;
      return runCanvasLlmNode(node);
    }, ids.textGenerator);
    assert.equal(submissions.get("/api/chat").messages[0].content[0].text.startsWith(instruction), true);
    assert.match(submissions.get("/api/chat").messages[0].content[1].image_url.url, /^data:image\/png/);
    const rich = output.locator(".canvas-text-markdown");
    for (const tag of ["h1", "strong", "em", "ul", "ol", "blockquote", "pre", "table", "a"]) assert.ok(await rich.locator(tag).count(), tag);
    assert.equal((await output.textContent()).includes(instruction), false);
    const visibleSize = () => rich.evaluate(element => {
      const b = element.getBoundingClientRect(), style = getComputedStyle(element);
      return [b.x, b.y, b.width, b.height, style.fontFamily, style.fontSize, style.lineHeight];
    });
    const firstSize = await visibleSize();
    await output.dblclick({ position: { x: 25, y: 25 } });
    assert.deepEqual(await visibleSize(), firstSize);
    await output.press("Escape");
    assert.deepEqual(await visibleSize(), firstSize);
    await textEditor.fill("新的提示词");
    assert.equal(await rich.locator("h1").textContent(), "自然光摄影");
    const draft = await text.evaluate(node => serializeCanvasNode(node));
    assert.equal(draft.llmPrompt, "新的提示词");
    assert.equal(draft.text, markdown.trim());
    assert.ok(draft.height > 400);
    const resized = await text.evaluate(node => {
      const before = Number(node.dataset.height);
      node.dataset.width = "240";
      applyCanvasNodeSize(node);
      CanvasTextNodeRenderer.syncAutoSize(node);
      return [before, Number(node.dataset.height)];
    });
    assert.ok(resized[1] >= resized[0]);
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 1000 });
      const bar = await text.locator(".flora-generator-footer").evaluate(element => {
        const model = element.querySelector(".image-model-picker-trigger, .canvas-llm-model");
        const params = element.querySelector(".flora-generator-parameter-trigger");
        const run = element.querySelector(".canvas-node-run");
        const middle = el => { const rect = el.getBoundingClientRect(); return rect.y + rect.height / 2; };
        return { model: middle(model), params: middle(params), run: middle(run), overflow: element.scrollWidth - element.clientWidth };
      });
      assert.ok(Math.max(bar.model, bar.params, bar.run) - Math.min(bar.model, bar.params, bar.run) < 2, JSON.stringify({ width, bar }));
      assert.ok(bar.overflow <= 1, JSON.stringify({ width, bar }));
    }
    await page.evaluate(() => {
      Object.assign(canvasState, { x: 620, y: -110, scale: .5 });
      applyCanvasTransformNow();
    });
    await text.locator(".flora-generator-parameter-trigger").click();
    await text.getByRole("dialog", { name: "文本参数", exact: true }).waitFor();
    await text.getByRole("button", { name: "关闭文本参数", exact: true }).click();
    const agentVideo = await page.evaluate(async image => {
      const other = addCanvasImage("/output/qa-second.png", "qa-second.png", { x: -1300, y: 450 });
      const context = { scope: { boardId: canvasState.activeBoardId, runId: "qa-mentions" },
        assertActive() {}, nextFrame: async () => {} };
      const result = await createAgentCanvasNode("minimax-h3", {
        prompt: "在 qa-second.png 的背景中展示主体。", model: "minimax-h3",
        reference_node_ids: [image, other.dataset.id],
      }, context);
      const generated = ensureCanvasNodeMounted(result.node_id);
      const bindings = readCanvasPromptMentions(generated);
      await runCanvasMinimaxH3Node(generated);
      return { bindings, source: other.dataset.id };
    }, ids.image);
    assert.deepEqual(agentVideo.bindings.map(ref => [ref.label, ref.sourceNodeId]), [["@图片2", agentVideo.source]]);
    const agentH3 = submissions.get("/api/minimax-h3-video");
    assert.match(agentH3.prompt, /<Picture 2>/);
    assert.deepEqual(agentH3.images.map(item => item.url), ["/output/qa-ref.png", "/output/qa-second.png"]);
    assert.deepEqual(fixture.errors, []);
    const report = { entries: 9, intercepted: [...submissions.keys()], pagedCatalog: true, commerceSlots: true,
      text: "Markdown、独立提示词、自动高度、编辑一致、四宽度单行" };
    const directory = path.resolve(__dirname, "../.planning/canvas-unified-mentions-20261121");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await fixture.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
