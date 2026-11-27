"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const registry = path.join(__dirname, "design-sources/canvas-feature-registry.js");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveFeatureRegistry(request, parent, ...rest) {
  if (request === "./canvas-feature-registry.js" && parent?.filename?.startsWith(path.join(root, "host-sources", "app"))) {
    return registry;
  }
  return originalResolve.call(this, request, parent, ...rest);
};

const capabilities = require("../host-sources/app/canvas-agent-capabilities");
const runtime = require("../host-sources/app/canvas-agent-runtime");
const conversation = require("../host-sources/app/canvas-agent-conversation");
Module._resolveFilename = originalResolve;

const skill = runtime.parseSkillDocument(`---
name: commercial-product-photography-10
description: Plans ten photography concepts without declaring canvas tools.
metadata:
  version: "1.1.0"
---

Prepare ten distinct product photography concepts.`);

function items(count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    slot: index + 1,
    direction: `方向 ${index + 1}`,
    summary: `方案说明 ${index + 1}`,
    prompt: `完整提示词 ${index + 1}，保持产品原图外观与配件。`,
  }));
}

test("ten-creative workflow exposes its confirmation tool only to its own explicit Skill run", () => {
  const definition = capabilities.CAPABILITY_REGISTRY
    .find(item => item.tool.name === "request_creative_batch_confirmation")?.tool;
  assert.ok(definition, "the ten-creative Skill needs a structured handoff tool");
  const request = (activeSkill, skillWorkflow = true, prompt = "按当前商业产品摄影 Skill 策划十种创意方案。") => runtime.buildProviderTurnRequest({
    prompt,
    skill_mode: skillWorkflow ? "manual" : "auto",
    skill_id: activeSkill,
    skill_workflow: skillWorkflow,
  }, { skills: [skill] });
  assert.ok(request(skill.id).tools.some(tool => tool.function.name === definition.name));
  assert.deepEqual(request(skill.id).toolChoice, {
    type: "function", function: { name: "request_creative_batch_confirmation" },
  });
  const responsesRequest = runtime.buildResponsesRequest({
    prompt: "按当前商业产品摄影 Skill 策划十种创意方案。",
    skill_mode: "manual", skill_id: skill.id, skill_workflow: true,
  }, { skills: [skill] });
  assert.deepEqual(responsesRequest.tool_choice, {
    type: "function", name: "request_creative_batch_confirmation",
  });
  const other = runtime.parseSkillDocument(`---
name: another-photo-skill
description: Another unrelated workflow.
---

Use the available capabilities for its own task.`);
  const otherRequest = runtime.buildProviderTurnRequest({
    prompt: "执行当前图片工作流。",
    skill_mode: "manual",
    skill_id: other.id,
    skill_workflow: true,
  }, { skills: [skill, other] });
  assert.equal(otherRequest.tools.some(tool => tool.function.name === definition.name), false);
  assert.equal(request(skill.id, false, "你好，请解释焦距。").tools.some(tool => tool.function.name === definition.name), false);
});

test("batch normalization requires ten ordered unique complete prompts and one verified product source", () => {
  const normalize = conversation.normalizeCreativeProductPhotoBatch;
  assert.equal(typeof normalize, "function");
  const value = normalize({
    workflowId: "batch-123",
    boardId: "board-1",
    conversationId: "conversation-1",
    sourceNodeIds: ["product-1"],
    sourceFingerprint: "a".repeat(64),
    productName: "手机壳",
    productAnalysis: "手机壳、手机本体与两件配件。",
    items: items(),
  }, { boardId: "board-1", conversationId: "conversation-1" });
  assert.equal(value.items.length, 10);
  assert.equal(value.items[9].prompt, "完整提示词 10，保持产品原图外观与配件。");
  assert.throws(() => normalize({ ...value, items: items(9) }, { boardId: "board-1", conversationId: "conversation-1" }), /十项/);
  assert.throws(() => normalize({ ...value, items: items().map(item => ({ ...item, prompt: "same" })) },
    { boardId: "board-1", conversationId: "conversation-1" }), /重复/);
  assert.throws(() => normalize({ ...value, sourceNodeIds: [] },
    { boardId: "board-1", conversationId: "conversation-1" }), /产品原图/);
  assert.throws(() => normalize({ ...value, boardId: "other-board" },
    { boardId: "board-1", conversationId: "conversation-1" }), /画布/);
});

test("batch state round-trips partial progress without losing prompt-to-node correspondence", () => {
  const value = conversation.normalizeCreativeProductPhotoBatch({
    workflowId: "batch-123",
    boardId: "board-1",
    conversationId: "conversation-1",
    sourceNodeIds: ["product-1"],
    sourceFingerprint: "b".repeat(64),
    productName: "手机壳",
    productAnalysis: "保持镜头开孔。",
    items: items().map((item, index) => ({
      ...item,
      status: index < 8 ? "created" : index === 8 ? "failed" : "pending",
      nodeId: index < 8 ? `node-${index + 1}` : "",
      error: index === 8 ? "模拟保存失败" : "",
    })),
    batchState: "partial-failed",
  }, { boardId: "board-1", conversationId: "conversation-1" });
  const stored = conversation.normalize({
    boardId: "board-1", conversationId: "conversation-1", items: [],
    pendingWorkflow: { ...value, workflow: "creative-product-photography-10", skillId: skill.id, status: "confirmed" },
  }, "board-1").pendingWorkflow;
  assert.equal(stored.items[7].nodeId, "node-8");
  assert.equal(stored.items[8].status, "failed");
  assert.equal(stored.items[9].prompt, "完整提示词 10，保持产品原图外观与配件。");
});

test("the grid helper aligns ten image nodes into two rows of five at their rendered size", () => {
  const offsets = require("../host-sources/app/canvas-agent-core").planGridOffsets(
    Array.from({ length: 10 }, () => ({ width: 400, height: 448 })), 5, 90,
  );
  assert.equal(offsets.length, 10);
  assert.deepEqual(offsets[0], { x: 0, y: 0 });
  assert.deepEqual(offsets[4], { x: 1960, y: 0 });
  assert.deepEqual(offsets[5], { x: 0, y: 538 });
  assert.deepEqual(offsets[9], { x: 1960, y: 538 });
  for (let index = 0; index < offsets.length; index += 1) {
    for (let other = index + 1; other < offsets.length; other += 1) {
      const horizontal = Math.abs(offsets[index].x - offsets[other].x) < 400;
      const vertical = Math.abs(offsets[index].y - offsets[other].y) < 448;
      assert.equal(horizontal && vertical, false);
    }
  }
});
