const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createHash, webcrypto } = require("node:crypto");
const test = require("node:test");
const { naturalPhotoFidelity: photo } = require("../host-sources/app/canvas-agent-conversation");

const product = { nodeId: "product", type: "image", role: "product", url: "/output/product.jpg", sha256: "a".repeat(64) };
const style = { nodeId: "style", type: "image", role: "style", url: "/output/style.jpg", sha256: "b".repeat(64) };
const secondProduct = { ...style, role: "product" };

test("摄影向导保留同一请求已明确给出的用途、受众和保真约束", () => {
  const script = fs.readFileSync(require.resolve("../host-sources/app/canvas-agent-ui.js"), "utf8");
  const source = script.match(/^  function readCanvasAgentPhotoWizardFields\([^]*?^  }/m);
  assert.ok(source, "摄影信息提取应复用已有向导字段");
  const context = vm.createContext({});
  vm.runInContext(source[0], context);
  const input = "为手机壳策划摄影，作为春节海报的摄影底图。受众是 30 多岁商务人士，竖版 3:4，保留实物 NILLKIN 标识。";
  const fields = context.readCanvasAgentPhotoWizardFields(input);
  assert.equal(fields.audience_usage, "作为春节海报的摄影底图，受众是 30 多岁商务人士");
  assert.equal(fields.brand_limits, "保留实物 NILLKIN 标识");
  assert.equal(fields.resolution, undefined);
  assert.equal(context.readCanvasAgentPhotoWizardFields("竖版 3:4，分辨率 4K").resolution, "4");
});

test("主动重新引用上一轮已消费的原图时恢复摄影表单的素材资格", () => {
  const script = fs.readFileSync(require.resolve("../host-sources/app/canvas-agent-ui.js"), "utf8");
  const source = script.match(/^  function addPhotoMention\([^]*?^  }/m)[0];
  const excludedNodeIds = new Set([product.nodeId]);
  let mentions = [];
  const context = vm.createContext({ state: { excludedNodeIds }, window: {},
    CanvasAgentCanvasApi: { getH3CommerceImage: () => ({ url: product.url, name: "原图" }) },
    getPhotoMentions: () => mentions, setPhotoMentions: value => { mentions = value; },
  });
  vm.runInContext(source, context);
  assert.equal(context.addPhotoMention({ dataset: { id: product.nodeId } }, false), true);
  assert.equal(excludedNodeIds.has(product.nodeId), false);
  assert.equal(mentions[0].url, product.url);
});

const images = [{
  nodeId: product.nodeId,
  objects: [{ name: "手机与壳", count: 1, appearance: "青绿色", material: "半透明", structure: "侧键及长孔" }],
  relationships: ["壳包覆机身"],
  prohibitedChanges: ["不得拆下铰接环"],
  unresolved: [],
}];

test("摄影引用按当前顺序生成真实对象，风格素材不加入产品清单", () => {
  const ids = [style.nodeId, product.nodeId];
  const brief = photo.readBrief(JSON.stringify({ version: 1, analysis: "对角线构图", images }), ids, null, [style, product]);
  assert.deepEqual(brief.images, images);
  const lock = photo.nodeLock(brief.images, brief.references, "机身向右移，左侧留白。");
  assert.deepEqual(lock.mentions.map(item => [item.label, item.sourceNodeId, item.role]), [
    ["@图1", "style", "style"], ["@图2", "product", "product"],
  ]);
  assert.ok(lock.mentions.every(item => lock.prompt.substring(item.offset, item.offset + item.label.length) === item.label));
  assert.match(lock.prompt, /@图1.*仅参考摄影/);
  assert.match(lock.prompt, /@图2.*产品结构/);
  assert.doesNotMatch(lock.prompt, /参考图 1（product）/);
  assert.deepEqual(photo.readNodeLock(JSON.stringify(lock)), lock);
  const refs = [style, product].map(item => ({ sourceNodeId: item.nodeId, url: item.url }));
  assert.deepEqual(photo.verifyRequest(lock, lock.prompt, refs), refs);
  assert.throws(() => photo.verifyRequest(lock, lock.prompt, refs.toReversed()), /重新确认/);
});

test("缺失产品图、过期节点、伪引用及非图片输入均会被拒绝", () => {
  assert.throws(() => photo.normalizePhotoReferences([style]), /产品/);
  assert.throws(() => photo.normalizePhotoReferences([{ ...product, sha256: "" }]), /指纹/);
  assert.throws(() => photo.normalizePhotoReferences([{ ...product, type: "video" }]), /视频/);
  assert.throws(() => photo.readBrief(JSON.stringify({ version: 1, analysis: "过期", images }), ["new"], null, [product]), /引用/);
  assert.throws(() => photo.nodeLock(images, [product], "用 @图9 作为另一产品。"), /引用/);
});

test("策划视觉附件来自同一次读取的原图字节，替换或改变顺序会失效", async () => {
  const stage = process.env.PHOTO_TEST_STAGE;
  const script = stage ? await fetch(`${stage}/canvas-agent-ui.js`).then(response => response.text())
    : fs.readFileSync(require.resolve("../host-sources/app/canvas-agent-ui.js"), "utf8");
  const blobs = new Map([[product.url, "p"], [style.url, "s"]]);
  const attachmentBytes = [];
  const blobUrls = new Map();
  let composer = [style, product];
  const context = vm.createContext({
    getCanvasAgentPhotoReferences: () => composer, photoFidelity: photo, crypto: webcrypto, Uint8Array,
    stableSerializeCanvasAgentValue: JSON.stringify, digestCanvasAgentReferences: JSON.stringify,
    CanvasAgentCanvasApi: { getH3CommerceImage: id => {
      const ref = composer.find(item => item.nodeId === id);
      return { ...ref };
    } },
    fetch: async url => ({ ok: true, blob: async () => new Blob([blobs.get(url)], { type: "image/jpeg" }) }),
    URL: {
      createObjectURL: blob => { const key = String(blobUrls.size); blobUrls.set(key, blob); return key; },
      revokeObjectURL: key => blobUrls.delete(key),
    },
    compressCanvasAgentImage: async url => {
      const value = await blobUrls.get(url).text();
      attachmentBytes.push(value);
      return `data:image/jpeg;base64,${Buffer.from(value).toString("base64")}`;
    },
  });
  for (const name of ["readLivePhotoMentions", "getPhotoFingerprint", "getCanvasAgentVisionSources", "collectCanvasAgentVisionImages"]) {
    const source = script.match(new RegExp(`^  (?:async )?function ${name}\\([^]*?^  }\\s*$`, "m"));
    assert.ok(source, name);
    vm.runInContext(source[0], context);
  }
  const styled = await context.readLivePhotoMentions();
  assert.deepEqual(Array.from(styled.references, ref => ref.role), ["style", "product"]);
  composer = [secondProduct, product];
  const { references, materials } = await context.readLivePhotoMentions();
  assert.equal(references[0].sha256, createHash("sha256").update("s").digest("hex"));
  assert.equal(references[1].sha256, createHash("sha256").update("p").digest("hex"));
  const packed = await context.collectCanvasAgentVisionImages([], null, { photoSources: references }, materials);
  assert.deepEqual(Array.from(packed), ["data:image/jpeg;base64,cw==", "data:image/jpeg;base64,cA=="]);
  assert.deepEqual(attachmentBytes, ["s", "p"]);
  assert.ok(await context.getPhotoFingerprint(references));
  blobs.set(product.url, "replacement");
  assert.equal(await context.getPhotoFingerprint(references), "");
  blobs.set(product.url, "p");
  composer = [product, secondProduct];
  assert.equal(await context.getPhotoFingerprint(references), "");
});

test("生图节点保存后以原始顺序发送素材，字节变化或快照不符时不发送", async () => {
  const stage = process.env.PHOTO_TEST_STAGE;
  const script = stage ? await fetch(`${stage}/script.js`).then(response => response.text())
    : fs.readFileSync(require.resolve("./design-sources/script-before-save-bridge.js"), "utf8");
  const sources = [product].map(ref => ({
    ...ref, resultId: "", assetId: "", sha256: createHash("sha256").update(ref.nodeId).digest("hex"),
  }));
  const lock = {
    ...photo.nodeLock(images, sources, "让完整组合移向右侧，于左侧留白。"),
    model: "gpt-image-2", providerId: "apimart",
  };
  const references = sources.map(item => ({ sourceNodeId: item.nodeId, url: item.url }));
  const field = { value: lock.prompt };
  const node = {
    dataset: JSON.parse(JSON.stringify({
      id: "image-node", photoFidelity: JSON.stringify(lock), promptMentions: JSON.stringify(lock.mentions),
    })),
    querySelector: () => field,
  };
  let bytesChanged = false;
  let posts = [];
  let postFails = false;
  const context = vm.createContext({
    window: { CanvasAgentConversation: { naturalPhotoFidelity: photo } },
    crypto: webcrypto, Uint8Array,
    canvasState: { activeBoardId: "board" }, IMAGE_JOBS_API_URL: "/api/image-jobs",
    getCanvasGenerationPrompt: (_node, prompt) => prompt,
    getCanvasIncomingRefs: () => references,
    getCanvasH3CommerceSource: id => sources.find(ref => ref.nodeId === id),
    getCanvasNodeModel: () => null,
    resolveCanvasPromptImage: (_node, mention) => {
      const ref = references.find(item => item.sourceNodeId === mention.sourceNodeId && item.url === mention.url);
      return ref && { ...ref, sourcePort: "output" };
    },
    isMidjourneyModel: () => false, assertCanvasImageJobScope() {}, syncCanvasImageJobProgress() {},
    fetch: async (url, options) => {
      if (options.method === "POST") {
        posts.push(JSON.parse(options.body));
        if (postFails) return { ok: false, status: 503, json: async () => ({ error: "模拟上游不可用" }) };
        return { ok: true, json: async () => ({ job: { id: "mock-job" } }) };
      }
      const id = sources.find(ref => ref.url === url).nodeId;
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(bytesChanged ? "changed" : id).buffer };
    },
  });
  for (const name of ["readCanvasPromptMentions", "matchesCanvasPhotoReference", "getCanvasPhotoPromptReferenceState", "getCanvasPromptImageRequest", "createCanvasImageJob"]) {
    const source = script.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}\\s*$`, "m"));
    assert.ok(source, name);
    vm.runInContext(source[0], context);
  }
  const request = {
    model: lock.model, provider_id: lock.providerId, n: 1,
    prompt: lock.prompt, reference_images: references,
  };
  assert.equal((await context.createCanvasImageJob(request, node)).id, "mock-job");
  assert.deepEqual(posts[0].reference_images, references);
  assert.equal(posts[0].prompt, lock.prompt);
  assert.equal(posts[0].provider_id, "apimart");
  assert.equal(posts.length, 1);
  node.dataset.promptMentions = JSON.stringify(lock.mentions.map(mention => ({ ...mention, role: "style" })));
  await assert.rejects(context.createCanvasImageJob(request, node), /重新确认/);
  assert.equal(posts.length, 1);
  node.dataset.promptMentions = JSON.stringify(lock.mentions);
  await assert.rejects(context.createCanvasImageJob({ ...request, reference_images: [] }, node), /重新确认/);
  assert.equal(posts.length, 1);
  bytesChanged = true;
  await assert.rejects(context.createCanvasImageJob(request, node), /文件指纹已变化/);
  assert.equal(posts.length, 1);
  bytesChanged = false;
  const historicalLock = photo.nodeLock(images, [product, style], "历史方案");
  node.dataset.photoFidelity = JSON.stringify(historicalLock);
  await assert.rejects(context.createCanvasImageJob(request, node), /旧版摄影方案含风格图/);
  assert.equal(posts.length, 1);
  node.dataset.photoFidelity = JSON.stringify(lock);
  postFails = true;
  await assert.rejects(context.createCanvasImageJob(request, node), /模拟上游不可用/);
  assert.equal(posts.length, 2);
});
