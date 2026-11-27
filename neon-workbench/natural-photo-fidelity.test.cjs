const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Conversation = require("../host-sources/app/canvas-agent-conversation");

const photo = () => Conversation.naturalPhotoFidelity;
const skill = "natural-aesthetic-product-photography";
const source = (id) => ({ nodeId: id, url: `/output/${id}.png`, name: id });

function picture(nodeId, names, relationship = "") {
  return {
    nodeId,
    objects: names.map(name => ({
      name, count: 1, appearance: "参考图可见的颜色与轮廓",
      material: "仅按可见质感", structure: "保持参考图结构",
    })),
    relationships: relationship ? [relationship] : [],
    prohibitedChanges: ["不可增删组件或改动孔位"],
    unresolved: [],
  };
}

function brief(images, narrative = "分辨商品和布景") {
  return JSON.stringify({ version: 1, analysis: narrative, images });
}

function checkpoint(analysis) {
  return {
    boardId: "board", workflow: skill, skillId: skill,
    status: "confirmed", sourceFingerprint: "a".repeat(64),
    sourceNodeIds: ["one"], analysis, proposal: "自然侧光",
    imagePrompt: "保留完整主体，采用柔和侧光。",
  };
}

for (const [title, names, relationship] of [
  ["空壳", ["手机壳"], "原图是空壳状态，开孔保持空置"],
  ["已套壳", ["手机", "手机壳"], "手机壳包覆手机，镜头与开孔对齐"],
  ["相机与镜头", ["相机", "镜头"], "镜头安装于机身接口"],
  ["耳机与充电盒", ["耳机", "充电盒"], "耳机嵌入充电盒"],
  ["手表与表带", ["表身", "表带"], "表带连接表身两端"],
  ["产品与包装", ["产品", "原包装"], "配套包装与商品同框"],
]) {
  test(title, () => {
    const parsed = photo().readBrief(brief([picture("one", names, relationship)]), ["one"]);
    const text = photo().composePrompt(parsed.images, "设置自然场景");
    for (const name of names) assert.match(text, new RegExp(`${name} × 1`));
    assert.ok(text.includes(relationship) && text.includes("不可增删组件或改动孔位"));
    assert.ok(text.indexOf(relationship) < text.indexOf("设置自然场景"));
    if (title === "空壳") assert.doesNotMatch(text, /手机 ×/);
  });
}

test("多图按已分析的参考顺序提交，拒绝缺失及遮罩替代", () => {
  const parsed = photo().readBrief(brief([picture("two", ["包装"]), picture("one", ["手机"])]), ["one", "two"]);
  assert.deepEqual(parsed.images.map(image => image.nodeId), ["one", "two"]);
  const locked = photo().nodeLock(parsed.images, [source("one"), source("two")], "自然侧光");
  const refs = ["two", "one"].map(id => ({ sourceNodeId: id, url: source(id).url }));
  assert.deepEqual(photo().verifyRequest(locked, locked.prompt, refs).map(ref => ref.sourceNodeId), ["one", "two"]);
  assert.throws(() => photo().verifyRequest(locked, locked.prompt, refs.slice(1)), /重新确认/);
  assert.throws(() => photo().verifyRequest(locked, locked.prompt, [{ ...refs[0], maskUrl: "/mask.png" }, refs[1]]), /重新确认/);
});

test("超过视觉容量时列出无法发送的素材，普通容量内不裁图", () => {
  const items = ["一号", "二号", "三号", "四号", "五号"].map(source);
  assert.equal(photo().verifyAnalysisSources(items.slice(0, 3)).length, 3);
  assert.throws(() => photo().verifyAnalysisSources(items), /四号.*五号.*分批/);
  assert.throws(() => photo().verifyAnalysisSources([null]), /素材/);
});

test("超长创意压缩保留锁定条款，超长保真本身阻止提交", () => {
  const parsed = photo().readBrief(brief([picture("one", ["手机"])]), ["one"]);
  const text = photo().composePrompt(parsed.images, "背景".repeat(7000));
  assert.ok(text.length <= 12000 && text.includes("不可增删组件或改动孔位"));
  assert.throws(() => photo().composePrompt([{ ...parsed.images[0], prohibitedChanges: ["禁止改变".repeat(4000)] }], "侧光"), /保真.*超/);
  assert.throws(() => photo().readBrief(brief([]), ["one"]), /保真/);
});

test("方向修改保留既有产品组成，关键未知阻止最终确认", () => {
  const original = [picture("one", ["手机", "手机壳"], "壳包覆手机")];
  const pending = photo().readBrief(brief(original), ["one"]);
  const changed = photo().readBrief(brief([picture("one", ["手机壳"])], "改用草丘"), ["one"], pending.images);
  assert.deepEqual(changed.images, pending.images);
  assert.match(photo().composePrompt(changed.images, "改用草丘"), /壳包覆手机[\s\S]*改用草丘/);
  const unresolved = [{ ...original[0], unresolved: [{ detail: "壳内是否有手机", required: true }] }];
  assert.throws(() => photo().assertResolved(unresolved), /壳内是否有手机/);
  assert.throws(() => photo().readBrief(brief([{ ...original[0], relationships: [] }]), ["one"]), /组合关系/);
});

test("刷新通过现有会话序列化保存清单，节点快照通过 JSON 恢复", () => {
  const parsed = photo().readBrief(brief([picture("one", ["相机", "镜头"], "镜头接在机身")]), ["one"]);
  const saved = Conversation.normalize({ pendingWorkflow: checkpoint(JSON.stringify(parsed)) }, "board").pendingWorkflow;
  const restored = photo().readBrief(JSON.parse(JSON.stringify(saved)).analysis, ["one"]);
  const lock = photo().nodeLock(restored.images, [source("one")], saved.imagePrompt);
  assert.deepEqual(photo().readNodeLock(JSON.stringify(lock)), lock);
  assert.match(lock.prompt, /镜头接在机身/);
});

test("失败重试复用锁定快照并拒绝素材替换和擅改提示词", () => {
  const lock = photo().nodeLock([picture("one", ["手机壳"])], [source("one")], "自然光");
  const refs = [{ sourceNodeId: "one", url: "/output/one.png" }];
  assert.throws(() => photo().verifyRequest(lock, lock.prompt, [{ ...refs[0], url: "/output/changed.png" }]), /重新确认/);
  assert.throws(() => photo().verifyRequest(lock, "改为空壳", refs), /重新确认/);
  assert.deepEqual(photo().verifyRequest(lock, lock.prompt, refs), refs);
  assert.deepEqual(photo().verifyRequest(lock, lock.prompt, refs), refs);
});

test("审核通过的改稿替换生效提示词，原保真清单、图片和模型仍受锁定", () => {
  const asset = { ...source("one"), type: "image", role: "product", sha256: "a".repeat(64) };
  const lock = { ...photo().nodeLock([picture("one", ["手机壳"])], [asset], "镜盖向外展开，深灰石板与自然侧光。", { compact: true }), model: "model", providerId: "provider" };
  const previous = JSON.stringify(lock);
  const revised = "以 @图1 为商品原图，镜盖完全闭合并与壳体贴合。保留深灰石板和自然侧光。";
  const locked = photo().readNodeLock(photo().reviseNodeLock(previous, revised));
  assert.equal(locked.prompt, revised);
  assert.deepEqual(locked.images, lock.images);
  assert.deepEqual(locked.sources, lock.sources);
  assert.equal(locked.model, lock.model);
  assert.equal(locked.providerId, lock.providerId);
  assert.equal(locked.mentions[0].offset, revised.indexOf("@图1"));
  assert.throws(() => photo().reviseNodeLock(previous, "镜盖闭合，但删去图片标签"), /引用不完整/);
  const refs = [{ sourceNodeId: "one", url: asset.url }];
  assert.throws(() => photo().verifyRequest(locked, lock.prompt, refs), /重新确认/);
  assert.deepEqual(photo().verifyRequest(locked, revised, refs), refs);
});

test("实际工作台桥接直到模拟生图 HTTP 封包仍使用同一快照", async () => {
  const stage = process.env.PHOTO_TEST_STAGE;
  const script = stage
    ? await fetch(`${stage}/script.js`).then(response => {
        assert.equal(response.headers.get("X-AI-OS-Frontend"), "fixed-stage");
        return response.text();
      })
    : fs.readFileSync(path.join(__dirname, "design-sources/script-before-save-bridge.js"), "utf8");
  const captured = [];
  const original = [source("one"), source("two")];
  const photos = [picture("one", ["手机", "手机壳"], "壳包覆手机"), picture("two", ["配套包装"])];
  const refs = original.map(item => ({ sourceNodeId: item.nodeId, url: item.url }));
  const dataset = { id: "generator" };
  let ownPrompt = "";
  const node = { dataset, querySelector: () => ({ value: ownPrompt }) };
  let live = refs;
  let fail = false;
  const context = vm.createContext({
    window: { CanvasAgentConversation: Conversation, CanvasAgentUi: { getSkillWorkflowContext: () => ({}) },
      getCanvasNodeOutput: () => ({ type: "image", url: "/mock.png" }) },
    assertCanvasAgentContext() {},
    findAgentOwnedCanvasNode: () => ({}),
    getCanvasGenerationPrompt: (_, prompt) => prompt,
    getCanvasIncomingRefs: () => live,
    canvasState: { activeBoardId: "board" },
    isMidjourneyModel: () => false,
    IMAGE_JOBS_API_URL: "/api/image-jobs",
    assertCanvasImageJobScope() {},
    syncCanvasImageJobProgress() {},
    scheduleCanvasSave() {},
    fetch: async (url, options) => {
      assert.equal(url, "/api/image-jobs");
      captured.push(JSON.parse(options.body));
      return fail
        ? { ok: false, status: 503, json: async () => ({ error: "模拟暂不可用" }) }
        : { ok: true, json: async () => ({ job: { id: "mock" } }) };
    },
  });
  for (const [name, type] of [["requestAgentDesignBrief", ""], ["createCanvasImageJob", "async "]]) {
    const start = script.indexOf(`\n${type}function ${name}(`) + 1;
    assert.ok(start > 0);
    const end = script.indexOf("\n}", start) + 2;
    vm.runInContext(script.slice(start, end), context);
  }
  const analysis = brief(photos);
  const created = context.requestAgentDesignBrief({
    workflow: skill, source_node_ids: ["one", "two"], image_prompt: "自然侧光".repeat(4000),
    known_context: analysis, summary: "方案",
  }, {});
  assert.equal(created.known_context, analysis);
  assert.ok(created.image_prompt.length > 12000);
  const lock = {
    ...photo().nodeLock(photo().readBrief(analysis, ["one", "two"]).images, original, created.image_prompt),
    model: "pinned-image-model",
    providerId: "pinned-provider",
  };
  dataset.photoFidelity = JSON.parse(JSON.stringify(dataset)).photoFidelity || JSON.stringify(lock);
  ownPrompt = lock.prompt;
  const payload = { prompt: lock.prompt, reference_images: refs, n: 1, model: lock.model, provider_id: lock.providerId };
  fail = true;
  await assert.rejects(context.createCanvasImageJob(payload, node), /模拟暂不可用/);
  fail = false;
  await context.createCanvasImageJob(payload, node);
  assert.deepEqual(captured[0], captured[1]);
  assert.match(captured[1].prompt, /壳包覆手机/);
  assert.equal(captured[1].reference_images.length, 2);
  live = [refs[0]];
  await assert.rejects(context.createCanvasImageJob(payload, node), /重新确认/);
  assert.equal(captured.length, 2);
});
