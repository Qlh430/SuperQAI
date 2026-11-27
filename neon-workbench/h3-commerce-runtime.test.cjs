const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const vm = require("node:vm");

const app = path.resolve(__dirname, "../host-sources/app");
const design = path.join(__dirname, "design-sources");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "./canvas-feature-registry.js" && parent?.filename?.startsWith(app)) {
    return path.join(design, "canvas-feature-registry.js");
  }
  return resolve.call(this, request, parent, ...rest);
};
const runtime = require(path.join(app, "canvas-agent-runtime"));
const contractApi = require(path.join(app, "canvas-agent-skill-contract"));
const capabilities = require(path.join(app, "canvas-agent-capabilities"));
const { createCanvasAgentHttpApi } = require(path.join(app, "canvas-agent-http-api"));
const { createSkillRegistry } = require(path.join(app, "skill-registry"));
const { createH3CommercePackageService } = require(path.join(app, "h3-commerce-package-service"));
const { create: createAdapters } = require(path.join(app, "canvas-agent-tool-adapters"));
const { createBroker } = require(path.join(app, "canvas-agent-broker"));
const { createCanvasMcpSession } = require(path.join(app, "canvas-agent-mcp-server"));

test("mock model drives real Agent HTTP turns, Skill contract, MCP broker, package service, and canvas handler", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-h3-runtime-"));
  const registry = createSkillRegistry({ dataDir: scratch, systemDir: path.join(app, "skills") });
  const user = "qa";
  const runId = "qa-h3";
  const boardId = "board-qa";
  const skillId = "h3-commerce-video";
  const prompt = "根据商品图片、商品主图和商品细节图生成 H3 带货视频";
  const skills = registry.loadAgentCatalog(user);
  const skill = skills.business.find(item => item.id === skillId);
  const references = skill.references.map(item => item.path);
  const access = {
    assertRead() {},
    assertWrite(owner, id) { assert.equal(owner, user); assert.equal(id, boardId); },
  };
  const ensure = async (_user, { refId }) => ({ id: refId });
  const packageService = createH3CommercePackageService({
    outputDir: scratch, ensureReferencedResource: ensure, resourceAccess: access,
    resolveTarget: async (_owner, board, target, ids) => {
      assert.equal(board, boardId);
      assert.equal(target, "target");
      return ids.map((id, index) => ({ slot: index + 1, node_id: id, url: `/output/${id}.png` }));
    },
  });
  const makeNode = (id, model = "", image = false) => ({
    dataset: { id, boardId, minimaxH3Model: model, h3CommerceImages: "[]" },
    classList: { contains: selector => selector === (image ? "canvas-node-image" : "canvas-node-minimax-h3") },
    isConnected: true,
    closest: () => ({}),
    __h3CommercePrompts: { a: { value: "", dispatchEvent() {} }, b: { value: "", dispatchEvent() {} } },
    __h3CommerceImagesHost: {},
    output: image ? { type: "image", url: `/output/${id}.png` } : { type: "video", url: "/output/video.mp4" },
  });
  const node = makeNode("target", "h3-commerce");
  const other = makeNode("other", "minimax-h3");
  const images = ["one", "two", "three", "four"].map(id => makeNode(id, "", true));
  const foreign = makeNode("foreign", "", true);
  foreign.dataset.boardId = "board-other";
  const broken = makeNode("broken", "", true);
  const all = new Map([node, other, ...images, foreign, broken].map(item => [item.dataset.id, item]));
  const canvasState = { activeBoardId: boardId, selectedIds: new Set(), connections: [] };
  node.ownerDocument = { querySelectorAll: () => [...canvasState.selectedIds].map(id => all.get(id)) };
  let round = 0;
  const statuses = [];
  const nextCall = (name, args, index = round) => ({ name, arguments: args, call_id: `h3-call-${index}` });
  const packageArgs = {
    node_id: "target", image_node_ids: images.map(item => item.dataset.id),
    prompt_a: "QA A", prompt_b: "QA B", package_md: "# QA", result_json: "{}",
  };
  const fillArgs = {
    node_id: "target", prompt_a: packageArgs.prompt_a, prompt_b: packageArgs.prompt_b,
    image_node_ids: images.map(item => item.dataset.id),
  };
  const expectedTools = ["fill_h3_commerce_node", "read_skill_reference", "save_h3_commerce_package"];
  const api = createCanvasAgentHttpApi({
    CanvasAgentConversation: require(path.join(app, "canvas-agent-conversation")),
    conversationStore: { get() {} },
    normalizeBoardId: String,
    CanvasAgentRuntime: runtime, skillRegistry: {
      ...registry,
      loadAgentCatalog(account) {
        const catalog = registry.loadAgentCatalog(account);
        return { ...catalog, business: catalog.business.map(item =>
          item.id === skillId ? { ...item, enabled: true, validation_status: "verified" } : item) };
      },
    },
    agentModelSettings: { getRoute: () => ({ candidateOrder: [], autoFallback: false }) },
    ensureReferencedResource: ensure, resourceAccess: access, saveH3CommercePackage: packageService,
    maxSessions: 4, sessionTtlMs: 120000,
    totalTimeoutMs: 90_000,
    firstEventTimeoutMs: 30_000,
    readJson: async request => request.body,
    sendJson: (response, status, body) => Object.assign(response, { status, body }),
    canvasAgentProviderBridge: { async runTurn({ tools, messages, needsVision, options }) {
      assert.equal(options.firstEventTimeoutMs, 30_000);
      if (!needsVision) {
        assert.equal(options.totalTimeoutMs, 90_000);
        return { selection: {}, attempts: [], turn: { message: "你好", tool_calls: [] } };
      }
      assert.deepEqual(tools.map(item => item.function.name).filter(name => name !== "activate_canvas_skill").sort(), expectedTools);
      assert.equal(options.totalTimeoutMs, round === 0 ? 90_000 : 300_000);
      const userMessage = messages.find(message => message.role === "user" && Array.isArray(message.content));
      assert.equal(userMessage.content.filter(part => part.type === "image_url").length, 4);
      const outputs = messages.filter(item => item.role === "tool").map(item => JSON.parse(item.content));
      const index = round++;
      statuses.push(outputs.at(-1)?.state || outputs.at(-1)?.code || null);
      const calls = [];
      let message = "";
      if (index < references.length) {
        if (index > 0) assert.equal(outputs.at(-1).path, references[index - 1]);
        calls.push(nextCall("read_skill_reference", { skill_id: skillId, path: references[index] }, index));
      } else if (index === 6) {
        assert.equal(outputs.filter(item => item.tool === "read_skill_reference").length, 6);
        calls.push(nextCall("save_h3_commerce_package", packageArgs, index));
      } else if (index === 7) {
        assert.equal(outputs.at(-1).state, "package_saved");
        assert.equal(outputs.at(-1).files.length, 4);
        calls.push(nextCall("fill_h3_commerce_node", { node_id: "target", package_id: outputs.at(-1).package_id }, index));
      } else if (index === 8) {
        assert.equal(outputs.at(-1).code, "h3_commerce_target_not_selected");
        const saved = outputs.find(item => item.state === "package_saved");
        calls.push(nextCall("fill_h3_commerce_node", { node_id: "target", package_id: saved.package_id }, index));
      } else {
        assert.equal(outputs.at(-1).state, "node_inputs_filled");
        assert.equal(outputs.at(-1).image_slots_filled, 4);
        assert.ok(outputs.at(-1).prompt_a_filled && outputs.at(-1).prompt_b_filled);
        message = "方案已保存，节点已填充，等待生成。";
      }
      return { selection: { providerId: "mock", modelId: "mock" }, attempts: [], turn: {
        response_id: `mock-${index}`, message, tool_calls: calls,
      } };
    } },
  });
  async function callHttp(url, body, method = "POST") {
    const req = Object.assign(new EventEmitter(), { url, body, headers: {}, method, auth: { user: { id: user } } });
    const res = new EventEmitter();
    assert.equal(await api.handle(req, res), true);
    return res;
  }
  const greeting = await callHttp("/api/canvas-agent/turn", { board_id: boardId, prompt: "你好" });
  assert.equal(greeting.status, 200);
  assert.equal(greeting.body.message, "你好");
  const bridge = fs.readFileSync(path.join(design, "script-before-save-bridge.js"), "utf8");
  const fillStart = bridge.indexOf("async function fillAgentH3CommerceNode(");
  const saveEnd = bridge.indexOf("async function duplicateAgentCanvasNodes(", fillStart);
  const slotStart = bridge.indexOf("function getCanvasH3CommerceSource(");
  const slotEnd = bridge.indexOf("async function runCanvasH3CommerceSlotAction(", slotStart);
  const procedures = vm.runInNewContext(`${bridge.slice(fillStart, saveEnd)}\n${bridge.slice(slotStart, slotEnd)}\n({ fillAgentH3CommerceNode, saveAgentH3CommercePackage });`, {
    canvasState, Event, getCanvasNodeOutput: item => item.output,
    getCanvasNode: id => all.get(id),
    hasCanvasDependencyPath: () => false,
    syncCanvasNodeModel: item => ({ ...item.dataset }),
    toCanvasOperationNode: item => item,
    normalizeVisibleCanvasConnection: item => ({ ...item, id: `${item.from}:${item.to}:${item.toPort}` }),
    sameCanvasOperationValue: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    recordCanvasUndo() {},
    stageCanvasOperation() {},
    scheduleCanvasSave() {},
    assertCanvasAgentContext(context) {
      context.assertActive(context.scope);
      return canvasState.activeBoardId;
    },
    findAgentOwnedCanvasNode(id, context) {
      const item = all.get(id);
      if (!item || item.dataset.boardId !== context.scope.boardId) throw Object.assign(new Error("scope"), { code: "scope_mismatch" });
      return item;
    },
    async loadImageElement(url) {
      if (url.includes("broken")) throw new Error("missing");
      return { naturalWidth: 1, naturalHeight: 1 };
    },
    window: { addEventListener() {}, CanvasH3NodeRenderer: { setCommerceImages(item, refs) {
      item.dataset.h3CommerceImages = JSON.stringify(refs);
    } } },
    getCanvasNodePluginContext() {},
    scheduleCanvasConnectionRender() {},
    getAgentCanvasNodeResult: item => ({
      prompt_a: item.dataset.h3CommercePromptA,
      prompt_b: item.dataset.h3CommercePromptB,
      commerce_images: JSON.parse(item.dataset.h3CommerceImages).map(image => ({ ready: Boolean(image?.url) })),
    }),
    async fetch(url, init) {
      const res = await callHttp(url, JSON.parse(init.body));
      return { ok: res.status === 201, json: async () => res.body };
    },
  });
  const broker = createBroker({ getCurrentBoardId: () => canvasState.activeBoardId, adapters: createAdapters({
    getNodeOutput: item => item.output,
    fetchImpl: async url => {
      const read = await callHttp(url, null, "GET");
      return { ok: read.status === 200, json: async () => read.body };
    },
    canvasApi: {
    getNode(id, context) {
      const item = all.get(id);
      if (item?.dataset.boardId !== context.scope.boardId) throw Object.assign(new Error("scope"), { code: "scope_mismatch" });
      return item;
    },
    readSkillReference: ({ skill_id, path }) => registry.readReference(skill_id, path, user),
    saveH3CommercePackage: procedures.saveAgentH3CommercePackage,
    fillH3CommerceNode: procedures.fillAgentH3CommerceNode,
  } }) });
  const scope = broker.beginRun({ boardId, runId });
  const mcp = createCanvasMcpSession({ broker, getScope: () => scope, getRunContext: () => ({ boardId, runId }),
    getCapabilityIds: () => capabilities.getCapabilityIdsForToolNames(expectedTools) });
  let contract = contractApi.createContract(skill, { prompt });
  assert.equal(contractApi.inspectToolCall(contract, nextCall("save_h3_commerce_package", packageArgs)).violation.code, "skill_reference_required");
  const base = { run_id: runId, board_id: boardId, skill_mode: "auto", prompt };
  let payload = { ...base, vision_images: Array(4).fill("data:image/png;base64,YQ==") };
  let turn;
  let savedPackage;
  while (round < 10) {
    const result = await callHttp("/api/canvas-agent/turn", payload);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    turn = result.body;
    assert.equal(turn.auto_skill_id, skillId);
    if (!turn.tool_calls.length) break;
    const [call] = turn.tool_calls;
    if (round === 7 || round === 9) canvasState.selectedIds = new Set(["target"]);
    if (round === 8) canvasState.selectedIds = new Set();
    assert.equal(contractApi.inspectToolCall(contract, call).violation, null);
    const toolResult = await mcp.callTool(call);
    const output = toolResult.structuredContent;
    if (output.state === "package_saved") savedPackage = output.package_id;
    contract = contractApi.recordToolResult(contract, call, output);
    payload = { ...base, step: round, previous_response_id: turn.response_id, tool_outputs: [{ call_id: call.call_id, output }] };
  }
  assert.match(turn.message, /已保存.*已填充.*等待生成/);
  const readback = await callHttp(`/api/canvas-agent/h3-commerce-package?board_id=${boardId}&package_id=${savedPackage}`, null, "GET");
  assert.equal(readback.status, 200);
  assert.equal(readback.body.node_id, "target");
  assert.deepEqual(readback.body.image_references.map(image => image.node_id), fillArgs.image_node_ids);
  assert.equal(readback.body.contents["prompt-b.txt"], "QA B");
  assert.deepEqual(statuses.slice(-3), ["package_saved", "h3_commerce_target_not_selected", "node_inputs_filled"]);
  assert.deepEqual(JSON.parse(node.dataset.h3CommerceImages).map(image => image.sourceNodeId), fillArgs.image_node_ids);
  assert.deepEqual(canvasState.connections.map(edge => [edge.from, edge.toPort]), fillArgs.image_node_ids.map((id, index) => [id, `h3-commerce:${index}`]));
  assert.equal(node.dataset.h3CommercePromptA, "QA A");
  const before = node.dataset.h3CommerceImages;
  const finalFill = { node_id: "target", package_id: savedPackage };
  async function failure(index, args, pattern) {
    const result = await mcp.callTool(nextCall("fill_h3_commerce_node", args, index));
    assert.equal(result.isError, true);
    assert.match(result.structuredContent.code + " " + result.structuredContent.error, pattern);
    assert.equal(node.dataset.h3CommerceImages, before);
  }
  images[0].dataset.boardId = "board-other";
  await failure("foreign", finalFill, /scope_mismatch/);
  images[0].dataset.boardId = boardId;
  images[0].output.type = "video";
  await failure("wrong-type", finalFill, /尚无有效的已保存图片/);
  images[0].output.type = "image";
  const original = images[0].output.url;
  images[0].output.url = "/output/broken.png";
  await failure("source-changed", finalFill, /参考图已变化/);
  images[0].output.url = original;
  canvasState.selectedIds = new Set(["other"]);
  await failure("wrong-target", { ...finalFill, node_id: "other" }, /节点不匹配/);
  canvasState.activeBoardId = "board-other";
  await failure("cross-board", finalFill, /scope_expired/);
  mcp.close();
});
