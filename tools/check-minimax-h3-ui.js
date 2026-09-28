const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.H3_UI_BASE_URL || "http://127.0.0.1:3107";
const root = path.join(__dirname, "..");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('[data-ai-app="canvas"]').click();
  await page.locator("#canvasLibraryScreen").waitFor({ state: "visible" });
  const result = await page.evaluate(() => {
    setActiveTool("canvas");
    canvasState.isRestoring = true;
    clearCanvasPlane();
    canvasState.x = 42;
    canvasState.y = 38;
    canvasState.scale = 0.82;
    applyCanvasTransform();

    const pixel = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#e5b72f"/><circle cx="160" cy="90" r="54" fill="#111827"/></svg>');
    const image = addCanvasImage(pixel, "人物参考.png", { x: 20, y: 30 });
    const video = addCanvasVideoNode({ x: 20, y: 360 }, { name: "动作参考.mp4" });
    video.dataset.videoSrc = "/output/ui-video-reference.mp4";
    video.dataset.mediaMimeType = "video/mp4";
    const audio = addCanvasAudioNode({ x: 20, y: 620 }, { name: "对白参考.wav" });
    audio.dataset.audioSrc = "/output/ui-audio-reference.wav";
    audio.dataset.mediaMimeType = "audio/wav";
    const text = addCanvasText({ x: 20, y: 830 }, { text: "让 <Picture 1> 跟随 <Video 1> 的动作，并使用 <Audio 1> 的对白。", focus: false });
    const h3 = addCanvasMinimaxH3Node({ x: 420, y: 30 }, {
      prompt: "备用描述",
      aspectRatio: "3:2",
      megapixels: 1,
      steps: 8,
      duration: 8,
      refImageSize: "max",
      seed: 123,
    });
    const output = addCanvasVideoOutputNode({ x: 980, y: 80 }, {
      src: "/output/ui-generated-video.mp4",
      name: "H3 测试输出.mp4",
      promptSummary: "UI persistence check",
      createdAt: "2026-08-10T00:00:00.000Z",
    });

    connectCanvasNodes(image.dataset.id, h3.dataset.id);
    connectCanvasNodes(video.dataset.id, h3.dataset.id);
    connectCanvasNodes(audio.dataset.id, h3.dataset.id);
    connectCanvasNodes(text.dataset.id, h3.dataset.id);
    connectCanvasNodes(h3.dataset.id, output.dataset.id);

    const before = getCanvasIncomingMinimaxH3Refs(h3);
    const board = JSON.parse(JSON.stringify(serializeCanvasBoard()));
    restoreCanvasBoard(board);
    showCanvasEditor();
    canvasVirtualizer.flushNow();
    const restoredH3 = document.querySelector(".canvas-node-minimax-h3");
    const restoredOutput = document.querySelector(".canvas-node-video-output");
    const getH3Select = (caption) => Array.from(restoredH3.querySelectorAll(".canvas-h3-field"))
      .find((field) => field.querySelector(":scope > span")?.textContent === caption)
      ?.querySelector("select");
    const after = getCanvasIncomingMinimaxH3Refs(restoredH3);
    renderCanvasMinimaxH3References(restoredH3);
    syncCanvasMinimaxH3Prompt(restoredH3);

    const baseConnectionCount = canvasState.connections.length;
    const extraImages = Array.from({ length: 9 }, (_, index) => addCanvasImage(pixel, `extra-${index + 1}.png`, { x: 1180, y: 420 + index * 26 }));
    extraImages.forEach((item) => connectCanvasNodes(item.dataset.id, restoredH3.dataset.id));
    const capacityRefs = getCanvasIncomingMinimaxH3Refs(restoredH3);
    const rejectedSourceId = extraImages.at(-1).dataset.id;
    const capacityRejected = !canvasState.connections.some((item) => item.from === rejectedSourceId && item.to === restoredH3.dataset.id);
    const remappedOrder = remapCanvasH3ReferenceOrder(["image:old-id", "group:old-id:2", "audio:external-id"], new Map([["old-id", "new-id"]]));

    const emptyImage = addCanvasUploadPlaceholder({ x: 1180, y: 700 });
    const emptyVideo = addCanvasVideoNode({ x: 1180, y: 940 });
    const emptyAudio = addCanvasAudioNode({ x: 1180, y: 1180 });
    const emptyH3 = addCanvasMinimaxH3Node({ x: 1580, y: 760 });
    connectCanvasNodes(emptyImage.dataset.id, emptyH3.dataset.id);
    connectCanvasNodes(emptyVideo.dataset.id, emptyH3.dataset.id);
    connectCanvasNodes(emptyAudio.dataset.id, emptyH3.dataset.id);
    const emptyConnectionState = {
      image: canvasState.connections.some((item) => item.from === emptyImage.dataset.id && item.to === emptyH3.dataset.id),
      video: canvasState.connections.some((item) => item.from === emptyVideo.dataset.id && item.to === emptyH3.dataset.id),
      audio: canvasState.connections.some((item) => item.from === emptyAudio.dataset.id && item.to === emptyH3.dataset.id),
    };
    const beforeActivation = getCanvasIncomingMinimaxH3Refs(emptyH3);
    renderCanvasUploadNode(emptyImage, { src: pixel, name: "activated.png" });
    renderCanvasVideoNode(emptyVideo, { src: "/output/activated.mp4", name: "activated.mp4", mimeType: "video/mp4" });
    renderCanvasAudioNode(emptyAudio, { src: "/output/activated.wav", name: "activated.wav", mimeType: "audio/wav" });
    [emptyImage, emptyVideo, emptyAudio].forEach((item) => refreshCanvasConnectedNodes(item.dataset.id));
    const afterActivation = getCanvasIncomingMinimaxH3Refs(emptyH3);
    const dragEmptyVideo = addCanvasVideoNode({ x: 120, y: 520 });
    const dragEmptyH3 = addCanvasMinimaxH3Node({ x: 720, y: 420 });
    const textOnlyH3 = addCanvasMinimaxH3Node({ x: 1200, y: 1480 }, { prompt: "" });

    const mentionImage = addCanvasImage(pixel, "人物外观.png", { x: 2100, y: 80 });
    const mentionVideo = addCanvasVideoNode({ x: 2100, y: 360 }, { name: "动作参考.mp4" });
    mentionVideo.dataset.videoSrc = "/output/mention-video.mp4";
    mentionVideo.dataset.mediaMimeType = "video/mp4";
    const mentionAudio = addCanvasAudioNode({ x: 2100, y: 620 }, { name: "对白参考.wav" });
    mentionAudio.dataset.audioSrc = "/output/mention-audio.wav";
    mentionAudio.dataset.mediaMimeType = "audio/wav";
    const mentionEmptyVideo = addCanvasVideoNode({ x: 2100, y: 880 }, { name: "等待上传.mp4" });
    const mentionH3 = addCanvasMinimaxH3Node({ x: 2550, y: 180 }, { prompt: "" });
    connectCanvasNodes(mentionImage.dataset.id, mentionH3.dataset.id);
    connectCanvasNodes(mentionVideo.dataset.id, mentionH3.dataset.id);
    connectCanvasNodes(mentionAudio.dataset.id, mentionH3.dataset.id);
    connectCanvasNodes(mentionEmptyVideo.dataset.id, mentionH3.dataset.id);

    const mentionItems = getCanvasH3MentionItems(mentionH3);
    const mentionProbe = document.createElement("textarea");
    mentionProbe.value = "动作参考 @动作";
    mentionProbe.selectionStart = mentionProbe.selectionEnd = mentionProbe.value.length;
    const mentionTrigger = getCanvasH3MentionTrigger(mentionProbe);
    mentionProbe.value = "name@example.com";
    mentionProbe.selectionStart = mentionProbe.selectionEnd = mentionProbe.value.length;
    const emailTrigger = getCanvasH3MentionTrigger(mentionProbe);
    const mentionRefs = getCanvasIncomingMinimaxH3Refs(mentionH3);
    const validReferenceCheck = validateCanvasH3PromptReferences(
      "使用 <Picture 1>、<Video 1> 和 <Audio 1>",
      mentionRefs,
    );
    const missingReferenceCheck = validateCanvasH3PromptReferences("使用 <Video 2>", mentionRefs);

    return {
      menuKinds: Array.from(document.querySelectorAll("[data-canvas-node]")).map((item) => item.dataset.canvasNode),
      kinds: board.nodes.map((item) => item.kind).sort(),
      before: { images: before.images.length, videos: before.videos.length, audios: before.audios.length },
      after: { images: after.images.length, videos: after.videos.length, audios: after.audios.length },
      prompt: restoredH3.querySelector(".canvas-h3-prompt")?.value || "",
      promptReadOnly: restoredH3.querySelector(".canvas-h3-prompt")?.readOnly,
      aspectRatio: restoredH3.dataset.minimaxH3AspectRatio,
      megapixels: restoredH3.dataset.minimaxH3Megapixels,
      steps: restoredH3.dataset.minimaxH3Steps,
      resolutionHint: restoredH3.querySelector(".canvas-h3-resolution-hint")?.textContent || "",
      aspectChoices: Array.from(getH3Select("画幅")?.options || []).map((option) => option.value),
      resolutionChoices: Array.from(getH3Select("分辨率")?.options || []).map((option) => option.value),
      stepChoices: Array.from(getH3Select("采样质量")?.options || []).map((option) => option.value),
      duration: restoredH3.dataset.minimaxH3Duration,
      collections: restoredH3.querySelectorAll(".canvas-h3-reference-collection").length,
      outputVideo: restoredOutput.dataset.videoSrc,
      outputPlayer: Boolean(restoredOutput.querySelector("video")),
      connections: baseConnectionCount,
      capacityImages: capacityRefs.images.length,
      capacityRejected,
      remappedOrder,
      emptyConnectionState,
      beforeActivation: { images: beforeActivation.images.length, videos: beforeActivation.videos.length, audios: beforeActivation.audios.length },
      afterActivation: { images: afterActivation.images.length, videos: afterActivation.videos.length, audios: afterActivation.audios.length },
      dragPair: { video: dragEmptyVideo.dataset.id, h3: dragEmptyH3.dataset.id },
      textOnlyH3Id: textOnlyH3.dataset.id,
      mentionH3Id: mentionH3.dataset.id,
      mentionItems: mentionItems.map(({ type, promptLabel, name, ready }) => ({ type, promptLabel, name, ready })),
      mentionTrigger,
      emailTrigger,
      validReferenceCheck,
      missingReferenceCheck,
    };
  });

  ["asset", "video-generator"].forEach((kind) => assert.ok(result.menuKinds.includes(kind), `Missing menu kind: ${kind}`));
  ["audio", "image", "minimax-h3", "text", "video", "video-output"].forEach((kind) => assert.ok(result.kinds.includes(kind), `Missing serialized kind: ${kind}`));
  assert.deepEqual(result.before, { images: 1, videos: 1, audios: 1 });
  assert.deepEqual(result.after, result.before);
  assert.match(result.prompt, /<Picture 1>/);
  assert.equal(result.promptReadOnly, true);
  assert.equal(result.aspectRatio, "3:2");
  assert.equal(result.megapixels, "1");
  assert.equal(result.steps, "8");
  assert.equal(result.resolutionHint, "预计输出：1248 × 832");
  assert.deepEqual(result.aspectChoices, ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]);
  assert.deepEqual(result.resolutionChoices, ["0.6", "1"]);
  assert.deepEqual(result.stepChoices, ["4", "8"]);
  assert.equal(result.duration, "8");
  assert.equal(result.collections, 3);
  assert.equal(result.outputVideo, "/output/ui-generated-video.mp4");
  assert.equal(result.outputPlayer, true);
  assert.equal(result.connections, 5);
  assert.equal(result.capacityImages, 9);
  assert.equal(result.capacityRejected, true);
  assert.deepEqual(result.remappedOrder, ["image:new-id", "group:new-id:2", "audio:external-id"]);
  assert.deepEqual(result.emptyConnectionState, { image: true, video: true, audio: true });
  assert.deepEqual(result.beforeActivation, { images: 0, videos: 0, audios: 0 });
  assert.deepEqual(result.afterActivation, { images: 1, videos: 1, audios: 1 });
  assert.deepEqual(result.mentionItems.filter((item) => item.ready).map((item) => item.promptLabel), ["<Picture 1>", "<Video 1>", "<Audio 1>"]);
  assert.deepEqual(result.mentionItems.filter((item) => !item.ready), [{ type: "video", promptLabel: "", name: "等待上传.mp4", ready: false }]);
  assert.deepEqual(result.mentionTrigger, { start: 5, end: 8, query: "动作" });
  assert.equal(result.emailTrigger, null);
  assert.deepEqual(result.validReferenceCheck, { ok: true, missing: [] });
  assert.deepEqual(result.missingReferenceCheck, { ok: false, missing: ["<Video 2>"] });

  await page.evaluate((nodeId) => {
    showCanvasEditor();
    const node = document.querySelector(`[data-id="${nodeId}"]`) || ensureCanvasNodeMounted(nodeId);
    setCanvasNodePoint(node, { x: 560, y: 80 });
    updateCanvasNodePosition(node);
    canvasState.x = 0;
    canvasState.y = 0;
    canvasState.scale = 0.82;
    applyCanvasTransform();
    canvasVirtualizer.flushNow();
  }, result.mentionH3Id);
  const mentionNode = page.locator(`[data-id="${result.mentionH3Id}"]`);
  const mentionPrompt = mentionNode.locator(".canvas-h3-prompt");
  await mentionPrompt.fill("人物外观来自 ");
  await mentionPrompt.pressSequentially("@");
  const mentionMenu = mentionNode.locator(".canvas-h3-mention-menu");
  await mentionMenu.waitFor({ state: "visible" });
  assert.equal(await mentionPrompt.getAttribute("aria-expanded"), "true");
  assert.ok(await mentionPrompt.getAttribute("aria-controls"));
  const initialMentionOptions = mentionMenu.locator(".canvas-h3-mention-option");
  assert.equal(await initialMentionOptions.count(), 4, "Mention menu should only contain current H3 connections");
  assert.deepEqual(await initialMentionOptions.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))), [
    "<Picture 1> 人物外观.png",
    "<Video 1> 动作参考.mp4",
    "等待上传 等待上传.mp4",
    "<Audio 1> 对白参考.wav",
  ]);
  assert.equal(await initialMentionOptions.filter({ hasText: "等待上传.mp4" }).getAttribute("aria-disabled"), "true");
  await initialMentionOptions.filter({ hasText: "<Picture 1>" }).click();
  assert.equal(await mentionPrompt.inputValue(), "人物外观来自 <Picture 1> ");

  await mentionPrompt.pressSequentially("动作参考 @动");
  assert.equal(await mentionMenu.locator(".canvas-h3-mention-option:not([aria-disabled=\"true\"])").count(), 1);
  await mentionPrompt.press("ArrowDown");
  await mentionPrompt.press("Enter");
  assert.match(await mentionPrompt.inputValue(), /动作参考 <Video 1> /);

  await mentionPrompt.pressSequentially("声音参考 @音");
  await mentionPrompt.press("Tab");
  assert.match(await mentionPrompt.inputValue(), /声音参考 <Audio 1> /);
  await mentionPrompt.pressSequentially("保留 @");
  await mentionPrompt.press("Escape");
  assert.equal(await mentionPrompt.getAttribute("aria-expanded"), "false");
  assert.match(await mentionPrompt.inputValue(), /保留 @$/);
  assert.equal(
    await page.locator("#infiniteCanvas").evaluate((element) => element.scrollLeft),
    0,
    "Mention keyboard navigation must not scroll the infinite canvas container",
  );

  let submittedRequest = null;
  const submittedRequests = [];
  let generationRequests = 0;
  await page.route("**/api/minimax-h3-video", async (route) => {
    generationRequests += 1;
    submittedRequest = route.request().postDataJSON();
    submittedRequests.push(submittedRequest);
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ task_id: "h3-mention-test" }) });
  });
  await page.route("**/api/upscale/status?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "success", progress: 100, message: "完成", videos: ["/output/h3-mention-result.mp4"] }),
    });
  });
  const textOnlyPrompt = "雨夜街道上的电影感跟拍镜头";
  const textOnlyStatus = await page.evaluate(async ({ nodeId, prompt }) => {
    const node = document.querySelector(`[data-id="${nodeId}"]`);
    const textarea = node.querySelector(".canvas-h3-prompt");
    textarea.value = prompt;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await runCanvasMinimaxH3Node(node);
    return node.querySelector(".canvas-h3-status")?.textContent || "";
  }, { nodeId: result.textOnlyH3Id, prompt: textOnlyPrompt });
  assert.equal(textOnlyStatus, "生成完成");
  assert.equal(generationRequests, 1);
  assert.equal(submittedRequests[0].prompt, textOnlyPrompt);
  assert.deepEqual(submittedRequests[0].images, []);
  assert.deepEqual(submittedRequests[0].videos, []);
  assert.deepEqual(submittedRequests[0].audios, []);

  const exactPrompt = "人物来自 <Picture 1>，动作参考 <Video 1>，声音参考 <Audio 1>";
  await mentionPrompt.fill(exactPrompt);
  const selectedHint = await page.evaluate((nodeId) => {
    const node = document.querySelector(`[data-id="${nodeId}"]`);
    const selectByCaption = (caption) => Array.from(node.querySelectorAll(".canvas-h3-field"))
      .find((field) => field.querySelector(":scope > span")?.textContent === caption)
      ?.querySelector("select");
    [["画幅", "3:2"], ["分辨率", "1"], ["采样质量", "8"]].forEach(([caption, value]) => {
      const select = selectByCaption(caption);
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return node.querySelector(".canvas-h3-resolution-hint")?.textContent || "";
  }, result.mentionH3Id);
  await mentionNode.locator(".canvas-h3-run").click();
  await page.waitForFunction(() => document.querySelector(".canvas-h3-status")?.textContent !== "正在创建任务...");
  assert.equal(selectedHint, "预计输出：1248 × 832");
  assert.equal(submittedRequest.prompt, exactPrompt, "Inserted reference labels should be submitted unchanged");
  assert.equal(submittedRequest.aspect_ratio, "3:2");
  assert.equal(submittedRequest.megapixels, 1);
  assert.equal(submittedRequest.steps, 8);
  assert.equal(generationRequests, 2);

  await mentionPrompt.fill("使用 <Video 2>");
  await mentionNode.locator(".canvas-h3-run").click();
  await page.waitForTimeout(100);
  assert.equal(generationRequests, 2, "Missing reference label should block generation");
  assert.match(await mentionNode.locator(".canvas-h3-status").textContent(), /<Video 2>.*当前不存在/);
  assert.equal(await mentionNode.locator(".canvas-h3-run").isEnabled(), true);

  await page.evaluate((nodeId) => {
    const node = document.querySelector(`[data-id="${nodeId}"]`);
    setCanvasNodePoint(node, { x: 1800, y: 80 });
    updateCanvasNodePosition(node);
  }, result.mentionH3Id);

  const dragSourceNode = page.locator(`[data-id="${result.dragPair.video}"]`);
  const dragSourcePort = dragSourceNode.locator(".canvas-port-output");
  const dragTargetNode = page.locator(`[data-id="${result.dragPair.h3}"]`);
  const sourceNodeBox = await dragSourceNode.boundingBox();
  await page.mouse.move(sourceNodeBox.x + sourceNodeBox.width / 2, sourceNodeBox.y + 20);
  const sourcePortBox = await dragSourcePort.boundingBox();
  const targetNodeBox = await dragTargetNode.boundingBox();
  await page.mouse.move(sourcePortBox.x + sourcePortBox.width / 2, sourcePortBox.y + sourcePortBox.height / 2, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(targetNodeBox.x + targetNodeBox.width / 2, targetNodeBox.y + 80, { steps: 8 });
  await page.mouse.up();
  const dragConnected = await page.evaluate(({ video, h3 }) => canvasState.connections.some((item) => item.from === video && item.to === h3), result.dragPair);
  assert.equal(dragConnected, true, "Empty video node should connect to H3 through pointer drag");
  assert.deepEqual(pageErrors, []);

  if (process.env.H3_TEST_VIDEO_URL) {
    const metadata = await page.evaluate((url) => new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.addEventListener("loadedmetadata", () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }), { once: true });
      video.addEventListener("error", () => reject(new Error("Generated video metadata could not be loaded.")), { once: true });
      video.src = url;
    }), new URL(process.env.H3_TEST_VIDEO_URL, baseUrl).toString());
    assert.ok(metadata.duration > 0, "Generated video duration should be positive");
    assert.ok(metadata.width > 0 && metadata.height > 0, "Generated video should expose dimensions");
    console.log(`Generated video metadata: ${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(2)}s`);
  }

  await page.screenshot({ path: path.join(root, "artifacts", "minimax-h3-canvas-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 480, height: 900 });
  await page.evaluate(() => {
    canvasState.x = -300;
    canvasState.y = 18;
    canvasState.scale = 0.72;
    applyCanvasTransform();
  });
  await page.screenshot({ path: path.join(root, "artifacts", "minimax-h3-canvas-mobile.png"), fullPage: true });
  await browser.close();
  console.log("MiniMax H3 browser UI checks passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
