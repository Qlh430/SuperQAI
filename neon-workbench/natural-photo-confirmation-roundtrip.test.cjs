const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createCanvasAgentConversationStore } = require("../host-sources/app/canvas-agent-conversation-store");
const Conversation = require("../host-sources/app/canvas-agent-conversation");

const skillId = "natural-aesthetic-product-photography";
const boardId = "photo-board";
const conversationId = "photo-session";
const sourceNodeIds = ["photo-source"];
const parameters = { model: "provider:gpt-image-2", size: "1024x1024", resolution: "1" };
const analysis = JSON.stringify({
  version: 1,
  analysis: "核对保真",
  images: [{
    nodeId: sourceNodeIds[0],
    objects: [{ name: "手机与壳", count: 1, appearance: "青绿色", material: "半透明观感", structure: "保留侧边按键及长孔" }],
    relationships: ["壳包覆机身"],
    prohibitedChanges: ["不得改变侧边长孔"],
    unresolved: [],
  }],
});
const pending = {
  workflow: skillId, skillId, boardId, workflowId: "photo-draft", analysis,
  status: "awaiting-confirmation", proposal: "草丘留白", imagePrompt: "自然侧光",
  sourceNodeIds, sourceFingerprint: "a".repeat(64), parameters,
  updatedAt: "2026-11-20T06:38:41.597Z",
};
const wizardDraft = {
  skillId, boardId, taskId: pending.workflowId, status: "analyzing", sourceNodeIds, parameters,
};

test("摄影确认快照按同一会话保存并从磁盘回读", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "photo-confirmation-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "conversations.json");
  const store = createCanvasAgentConversationStore({ filePath });
  const conversation = { boardId, conversationId, wizardDraft, pendingWorkflow: {
    ...pending, conversationId, canvasId: boardId, executionTarget: "image",
  } };
  const saved = store.upsert(conversation, 0, "owner");
  const expected = saved.pendingWorkflow;
  assert.equal(expected.canvasId, boardId);
  assert.equal(expected.conversationId, conversationId);
  assert.equal(expected.executionTarget, "image");
  for (const field of ["analysis", "proposal", "imagePrompt", "sourceFingerprint", "status"]) {
    assert.equal(expected[field], pending[field]);
  }
  const reopened = createCanvasAgentConversationStore({ filePath }).get(boardId, "owner", conversationId);
  assert.deepEqual(reopened.pendingWorkflow, expected);
});

test("只从同一真实会话与对应摄影向导恢复历史字段", () => {
  const legacy = { boardId, conversationId, wizardDraft, pendingWorkflow: pending };
  const recovered = Conversation.normalize(legacy).pendingWorkflow;
  assert.equal(recovered.conversationId, conversationId);
  assert.equal(recovered.executionTarget, "image");
  for (const value of [
    { ...legacy, conversationId: undefined },
    { ...legacy, wizardDraft: { ...wizardDraft, taskId: "other-draft" } },
    { ...legacy, wizardDraft: { ...wizardDraft, sourceNodeIds: ["other-source"] } },
  ]) {
    const draft = Conversation.normalize(value).pendingWorkflow;
    assert.equal(draft.conversationId, undefined);
    assert.equal(draft.executionTarget, undefined);
    assert.equal(draft.photoReconfirmationRequired, true);
    assert.equal(draft.analysis, analysis);
    assert.equal(Conversation.normalize(Conversation.normalize(value)).pendingWorkflow.photoReconfirmationRequired, true);
  }
  for (const additions of [{ conversationId: "other-session" }, { canvasId: "other-canvas" }, { executionTarget: "video" }]) {
    assert.equal(Conversation.normalize({ ...legacy, pendingWorkflow: { ...pending, ...additions } }).pendingWorkflow, null);
  }
});

test("旧版摄影草案迁入历史后可从原会话恢复，另一账户不可读取", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "photo-history-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "conversations.json");
  fs.writeFileSync(filePath, JSON.stringify({
    version: 1, conversations: [{ boardId, conversationId, wizardDraft, pendingWorkflow: pending }],
  }));
  const store = createCanvasAgentConversationStore({ filePath });
  assert.equal(store.list(boardId, "owner").activeConversationId, conversationId);
  assert.equal(store.activateSession(boardId, "owner", conversationId), true);
  const reopened = store.get(boardId, "owner", conversationId);
  assert.equal(reopened.pendingWorkflow.conversationId, conversationId);
  assert.equal(reopened.pendingWorkflow.status, "awaiting-confirmation");
  assert.equal(reopened.pendingWorkflow.analysis, analysis);
  assert.equal(store.get(boardId, "other-owner", conversationId, "owner"), null);
});

for (const [failure, status, expectedCode] of [
  ["上游 503", 503, "image_api_upstream_rejected"],
  ["上游 524", 524, "image_api_upstream_rejected"],
  ["连接超时、受理状态未知", 0, "image_job_result_unknown"],
]) test(`摄影节点固定接口，双击及${failure}只封包一次`, async () => {
  const stage = process.env.PHOTO_TEST_STAGE;
  const script = stage ? await fetch(`${stage}/script.js`).then(async response => {
    assert.equal(response.headers.get("X-AI-OS-Frontend"), "fixed-stage");
    return response.text();
  }) : fs.readFileSync(path.join(__dirname, "design-sources/script-before-save-bridge.js"), "utf8");
  const photo = Conversation.naturalPhotoFidelity;
  const [{ nodeId }] = photo.readBrief(analysis, sourceNodeIds).images;
  const url = "/output/t16.jpg";
  const provider = "confirmed-provider";
  const model = parameters.model;
  const brief = photo.readBrief(analysis, sourceNodeIds);
  const lock = { ...photo.nodeLock(brief.images, [{ nodeId, url }], "自然侧光"), model, providerId: provider };
  const refs = [{ sourceNodeId: nodeId, url }];
  const node = {
    dataset: { id: "gen", photoFidelity: JSON.stringify(lock) },
    classList: { contains: name => name === "canvas-node-api" },
    querySelector(selector) {
      if (selector === ".canvas-node-model") return { value: model, dataset: {} };
      if (selector === ".canvas-node-prompt") return { value: lock.prompt };
      return null;
    },
  };
  const packets = [];
  let release;
  const upstream = new Promise(resolve => { release = resolve; });
  const noop = () => {};
  const context = vm.createContext({
    window: { CanvasAgentConversation: Conversation }, CanvasGenerationSound: { arm: noop },
    CANVAS_IMAGE_JOB_ACTIVE_STATES: new Set(["queued", "submitting", "running"]),
    IMAGE_JOBS_API_URL: "/api/image-jobs", canvasState: { activeBoardId: boardId },
    canvasImageModelCandidates: [{ id: model, providerId: provider, capabilities: ["image.edit"] }],
    getCanvasImagePendingDependency: () => null, setCanvasNodeStatus: noop, syncCanvasPromptFromTextInputs: noop,
    getCanvasGenerationPrompt: (_, prompt) => prompt, getCanvasIncomingRefs: () => refs,
    getCanvasPromptImageRequest: () => ({ refs }), getCanvasImageReferenceSignature: () => "verified",
    readCanvasPromptMentions: () => [], getCanvasVisualPresetReferenceError: () => null,
    setCanvasImageDependencyState: noop, setCanvasImageNodeGenerationState: noop,
    syncCanvasNodeResolutionState: () => ({ supported: true }), refreshCanvasDownstreamNodes: noop,
    getCanvasOutputSize: () => "1024x1024", getCanvasImageResolution: () => "1",
    getCanvasImageRequestSummary: () => "1024x1024", getImageModelPlatform: () => "openai",
    isMidjourneyModel: () => false, prepareOpenAIEditRefs: async supplied => supplied,
    getCanvasImageProtocolParams: () => ({ resolution: "1" }), readCanvasModelParameters: () => ({}),
    assertCanvasImageReferencesCurrent: noop, captureCanvasImageHistorySnapshot: noop, scheduleCanvasSave: noop,
    getSafeCanvasImageGenerationError: error => ({ ok: false, code: error.code, error: error.message }),
    prepareCanvasImageNodeCandidate: () => assert.fail("摄影节点不得启用请求前换路"),
    resolveCanvasImageFailoverCandidate: () => assert.fail("摄影节点不得在上游失败后换路"),
    fetch: async (endpoint, options) => {
      assert.equal(endpoint, "/api/image-jobs");
      packets.push(JSON.parse(options.body));
      await upstream;
      if (!status) throw new Error("模拟连接超时");
      return { ok: false, status, json: async () => ({ error: "上游不可用", code: expectedCode }) };
    },
  });
  for (const name of ["usesCanvasImageResolutionTiers", "matchesCanvasPhotoReference", "getCanvasPhotoPromptReferenceState", "hydrateCanvasPromptSources", "runCanvasImageEdit", "runCanvasImageEditRequest", "createCanvasImageJob"]) {
    const source = script.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}\\s*$`, "m"));
    assert.ok(source, name);
    vm.runInContext(source[0], context);
  }
  const first = context.runCanvasImageEdit(node, { autoFailover: true });
  const second = await context.runCanvasImageEdit(node, { autoFailover: true });
  assert.equal(second.code, "image_task_pending");
  release();
  assert.equal((await first).code, expectedCode);
  assert.equal(node.dataset.photoSubmissionUncertain, "true");
  assert.equal((await context.runCanvasImageEdit(node)).code, "image_job_result_unknown");
  assert.deepEqual(packets, [{
    model, provider_id: provider, prompt: lock.prompt, size: "1024x1024", n: 1,
    reference_images: refs, resolution: "1", board_id: boardId, node_id: "gen",
  }]);
});

for (const [savedAssetId, liveAssetId, liveBytes, expectedPosts, terminalJob = false] of [
  ["", "t16-asset", "reference bytes", 2],
  ["t16-asset", "t16-asset", "reference bytes", 2, true],
  ["t16-asset", "different-asset", "reference bytes", 0],
  ["", "t16-asset", "different bytes", 0],
]) test(`摄影节点校验原图并允许手动重试已明确失败的请求（${terminalJob ? "任务终止" : savedAssetId || "旧快照"} / ${liveBytes}）`, async () => {
  const stage = process.env.PHOTO_TEST_STAGE;
  const script = stage ? await fetch(`${stage}/script.js`).then(async response => {
    assert.equal(response.headers.get("X-AI-OS-Frontend"), "fixed-stage");
    return response.text();
  }) : fs.readFileSync(path.join(__dirname, "design-sources/script-before-save-bridge.js"), "utf8");
  const { createHash, webcrypto } = require("node:crypto");
  const photo = Conversation.naturalPhotoFidelity;
  const url = "/output/t16.jpg";
  const [nodeId] = sourceNodeIds;
  const refs = [{ sourceNodeId: nodeId, sourcePort: "output", url }];
  const source = { nodeId, url, type: "image", role: "product", assetId: savedAssetId,
    sha256: createHash("sha256").update("reference bytes").digest("hex") };
  const { images } = photo.readBrief(analysis, sourceNodeIds);
  const lock = { ...photo.nodeLock(images, [source], "自然侧光"), model: parameters.model, providerId: "confirmed-provider" };
  const status = { textContent: "" };
  const node = { dataset: { id: "gen", photoFidelity: JSON.stringify(lock) },
    classList: { contains: name => name === "canvas-node-api" }, querySelector(selector) {
    if (selector === ".canvas-node-model") return { value: lock.model, dataset: {} };
    if (selector === ".canvas-node-prompt") return { value: lock.prompt };
    return null;
  } };
  const packets = [];
  const noop = () => {};
  const canvasContext = vm.createContext({
    window: { CanvasAgentConversation: Conversation }, CanvasGenerationSound: { arm: noop }, crypto: webcrypto,
    CANVAS_IMAGE_JOB_ACTIVE_STATES: new Set(["queued", "submitting", "running"]),
    IMAGE_JOBS_API_URL: "/api/image-jobs", canvasState: { activeBoardId: boardId },
    canvasImageModelCandidates: [{ id: lock.model, providerId: lock.providerId, capabilities: ["image.edit"] }],
    isCanvasImageGenerator: () => true, getCanvasNodeStatusElement: () => status,
    getCanvasImagePendingDependency: () => null,
    setCanvasNodeStatus: (_, message) => { status.textContent = message; },
    syncCanvasPromptFromTextInputs: noop, getCanvasGenerationPrompt: (_, prompt) => prompt,
    getCanvasIncomingRefs: () => refs, getCanvasPromptImageRequest: () => ({ refs }),
    getCanvasImageReferenceSignature: () => "verified", readCanvasPromptMentions: () => lock.mentions,
    getCanvasH3CommerceSource: () => ({ url, assetId: liveAssetId, resultId: "" }),
    getCanvasNode: () => ({}),
    getCanvasNodeModel: () => null,
    getCanvasVisualPresetReferenceError: () => null,
    setCanvasImageDependencyState: (target, state) => { target.dataset.imageDependencyState = state; },
    setCanvasImageNodeGenerationState: (target, active) => { target.dataset.canvasGenerating = String(active); },
    refreshCanvasDownstreamNodes: () => canvasContext.syncCanvasImageDependencyStatus(node),
    syncCanvasNodeResolutionState: () => ({ supported: true }),
    getCanvasOutputSize: () => "1024x1024", getCanvasImageResolution: () => "1", getCanvasImageRequestSummary: () => "1024x1024",
    getImageModelPlatform: () => "openai", isMidjourneyModel: () => false, prepareOpenAIEditRefs: async supplied => supplied,
    getCanvasImageProtocolParams: () => ({}), readCanvasModelParameters: () => ({}),
    assertCanvasImageReferencesCurrent: noop, captureCanvasImageHistorySnapshot: noop, scheduleCanvasSave: noop,
    isCanvasImageFailoverError: () => false, assertCanvasImageJobScope: noop,
    syncCanvasImageJobProgress: (target, job) => { target.dataset.imageJobState = job.state; },
    waitForCanvasImageJob: async () => {
      node.dataset.imageJobState = "failed";
      return { state: "failed", code: "generation_timeout", error: "模拟：任务已终止" };
    },
    getSafeCanvasImageGenerationError: error => ({ ok: false, code: error.code, error: error.message }),
    prepareCanvasImageNodeCandidate: () => assert.fail("摄影节点不得换路"),
    resolveCanvasImageFailoverCandidate: () => assert.fail("摄影节点不得换路"),
    fetch: async (endpoint, options) => {
      if (endpoint === url) return new Response(liveBytes);
      assert.equal(endpoint, "/api/image-jobs");
      packets.push(JSON.parse(options.body));
      if (terminalJob) return { ok: true, status: 202, json: async () => ({ job: { id: "qa-job", state: "running" } }) };
      return { ok: false, status: 400, json: async () => ({ error: "模拟：服务明确拒绝了本次请求" }) };
    },
  });
  for (const name of ["usesCanvasImageResolutionTiers", "matchesCanvasPhotoReference", "getCanvasPhotoPromptReferenceState", "syncCanvasImageDependencyStatus", "hydrateCanvasPromptSources", "runCanvasImageEdit", "runCanvasImageEditRequest", "createCanvasImageJob", "createCanvasImageJobTerminalError"]) {
    const block = script.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}\\s*$`, "m"));
    assert.ok(block, name);
    vm.runInContext(block[0], canvasContext);
  }

  const first = await canvasContext.runCanvasImageEdit(node, { autoFailover: true });
  assert.equal(first.ok, false);
  assert.match(status.textContent, new RegExp(terminalJob ? "任务已终止" : expectedPosts ? "明确拒绝" : liveBytes === "reference bytes" ? "最新原图已变化" : "文件指纹已变化"));
  assert.equal(node.dataset.photoSubmissionUncertain, undefined);
  assert.equal((await canvasContext.runCanvasImageEdit(node, { autoFailover: true })).ok, false);
  assert.equal(packets.length, expectedPosts);
  for (const packet of packets) {
    assert.equal(packet.reference_images[0].url, url);
    assert.equal(packet.prompt, lock.prompt);
    assert.equal(packet.provider_id, lock.providerId);
  }
});
