"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (request === "./canvas-feature-registry.js" && parent?.filename.startsWith(path.resolve(__dirname, "../host-sources/app") + path.sep)) {
    return path.join(__dirname, "design-sources/canvas-feature-registry.js");
  }
  return resolve.call(this, request, parent, ...args);
};
const CanvasAgentRuntime = require("../host-sources/app/canvas-agent-runtime");
const { createCanvasAgentHttpApi } = require("../host-sources/app/canvas-agent-http-api");
Module._resolveFilename = resolve;

test("Agent only acknowledges images present in the provider request, in the submitted order", async () => {
  const jpegPrefix = "data:image/jpeg;base64,";
  const images = [jpegPrefix + "/9j/AA==", jpegPrefix + "/9j/AQ=="];
  let providerCalls = 0;
  const api = createCanvasAgentHttpApi({
    CanvasAgentRuntime,
    CanvasAgentConversation: require("../host-sources/app/canvas-agent-conversation"),
    conversationStore: { get() {} },
    normalizeBoardId: String,
    skillRegistry: { loadAgentCatalog: () => ({ business: [] }) },
    agentModelSettings: { getRoute: () => ({ candidateOrder: [], autoFallback: false }) },
    ensureReferencedResource: async () => ({ id: "board" }),
    resourceAccess: { async assertRead() {}, async assertWrite() {} },
    maxSessions: 20, sessionTtlMs: 60000,
    readJson: async req => req.body,
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
    canvasAgentProviderBridge: {
      async runTurn({ messages, needsVision }) {
        providerCalls++;
        assert.equal(needsVision, true);
        const content = messages.find(message => Array.isArray(message.content)).content;
        assert.deepEqual(content.filter(item => item.type === "image_url").map(item => item.image_url.url), images);
        assert.match(content[0].text, /1600_01\.jpg.*1600_02\.jpg/);
        return { selection: {}, attempts: [], turn: { message: "识别完成" } };
      },
    },
  });
  const send = async (run, visionImages) => {
    const req = Object.assign(new EventEmitter(), {
      method: "POST", headers: {}, url: "/api/canvas-agent/turn", auth: { user: { id: "owner" } },
      body: {
        run_id: run, board_id: "board", prompt: "识别商品", vision_images: visionImages,
        canvas: { agent_image_attachments: images.map((_, index) => ({
          node_id: `node-${index}`, name: `1600_0${index + 1}.jpg`, source: "canvas", mime_type: "image/jpeg",
        })) },
      },
    });
    const res = new EventEmitter();
    await api.handle(req, res);
    return res;
  };
  const delivered = await send("valid", images);
  assert.equal(delivered.status, 200);
  assert.deepEqual(delivered.body.vision_receipt, { count: 2, mime_type: "image/jpeg" });
  for (const [id, malformed] of [
    ["missing", [images[0]]],
    ["filename", [images[0], "/output/1600_02.jpg"]],
    ["wrong-mime", [images[0], "data:image/jpeg;base64,iVBORw0KGgo="]],
  ]) {
    const rejected = await send(id, malformed);
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, "vision_input_unavailable");
  }
  assert.equal(providerCalls, 1);
});
