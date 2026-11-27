"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Conversation = require("../host-sources/app/canvas-agent-conversation");
const uiPath = path.resolve(__dirname, "../host-sources/app/canvas-agent-ui.js");
const ui = fs.readFileSync(uiPath, "utf8");

const config = Conversation.parseInteraction(fs.readFileSync(path.resolve(__dirname,
  "../host-sources/app/skill-packages/natural-aesthetic-product-photography/interaction.json"), "utf8"));

test("默认或模型推断的画幅与分辨率仍进入原有信息收集步骤", () => {
  const values = Conversation.prefillInteraction(config, "");
  const plan = Conversation.createInteractionIntakePlan(config, JSON.stringify({
    knownValues: {
      product_positioning: "透明手机壳与手机组合",
      size: "3:4",
      resolution: "1",
    },
    collectFields: ["audience_usage", "creative_direction"],
    missingImageSteps: [],
  }), {
    values,
    userProvidedFieldIds: [],
    requireUserProvidedFieldIds: ["size", "resolution", "brand_limits"],
    candidateNodeIds: ["product-image"],
    completeImageStepIds: ["image"],
  });

  assert.equal(plan.knownValues.product_positioning, "透明手机壳与手机组合");
  assert.equal(Object.hasOwn(plan.knownValues, "size"), false);
  assert.equal(Object.hasOwn(plan.knownValues, "resolution"), false);
  assert.ok(plan.fieldsToCollect.includes("size"));
  assert.ok(plan.fieldsToCollect.includes("resolution"));

  const collection = Conversation.createInteractionCollection(config, plan);
  assert.deepEqual(collection.steps.map(step => step.id), ["audience", "creative", "output", "brand", "proposal"]);
});

test("用户已经明确填写画幅和分辨率时保持原值并跳过这些字段", () => {
  const values = {
    ...Conversation.prefillInteraction(config, ""),
    audience_usage: "商务人群的产品主视觉",
    size: "16:9",
    resolution: "2",
  };
  const plan = Conversation.createInteractionIntakePlan(config, JSON.stringify({
    knownValues: { size: "3:4", resolution: "1" },
    collectFields: ["size", "resolution"],
    missingImageSteps: [],
  }), {
    values,
    userProvidedFieldIds: ["audience_usage", "size", "resolution"],
    requireUserProvidedFieldIds: ["size", "resolution"],
    completeImageStepIds: ["image"],
  });

  assert.equal(plan.knownValues.size, undefined);
  assert.equal(plan.knownValues.resolution, undefined);
  assert.ok(!plan.fieldsToCollect.includes("size"));
  assert.ok(!plan.fieldsToCollect.includes("resolution"));
  assert.equal(values.size, "16:9");
  assert.equal(values.resolution, "2");
});

test("空文字发送已选摄影 Skill 时立即生成含 Skill 和图片的用户气泡", () => {
  const calls = [];
  const element = {
    dataset: {},
    append(child) { this.children = [...(this.children || []), child]; },
  };
  const document = {
    querySelector(selector) {
      return selector === "#canvasAgentPrompt" ? { value: "" } : null;
    },
    createElement() {
      return { setAttribute() {}, textContent: "" };
    },
  };
  const start = ui.indexOf("  function showCanvasAgentPendingSubmission(");
  assert.ok(start >= 0);
  const end = ui.indexOf("\n  }", start) + 4;
  const render = vm.runInNewContext(`(${ui.slice(start, end)})`, {
    document,
    performance: { now: () => 10 },
    crypto: { randomUUID: () => "request-photo-empty" },
    state: {
      currentRun: null,
      mentionedNodeIds: new Set(),
      excludedNodeIds: new Set(),
      conversation: { activeSkillId: "natural-aesthetic-product-photography" },
      skills: [{ id: "natural-aesthetic-product-photography", label: "自然美学产品摄影" }],
    },
    NATURAL_PHOTO_SKILL_ID: "natural-aesthetic-product-photography",
    CanvasAgentCore: { classifyAgentRequest: () => ({}) },
    classifyCanvasAgentContentEdit: () => "",
    getAgentContextNodes: () => [],
    getAgentNodeReferences: () => [],
    getCanvasAgentPhotoReferences: () => [{
      type: "image", nodeId: "product-1", name: "商品原图.png", url: "/output/product-1.png",
    }],
    CanvasAgentCanvasApi: { getBoardId: () => "canvas" },
    renderCanvasAgentMessage: (...args) => {
      calls.push(args);
      return element;
    },
  });

  const pending = render({ preventDefault() {} });

  assert.ok(pending, "the pending user message exists before the Agent response");
  assert.equal(calls[0][0], "user");
  assert.equal(calls[0][1], "按已选 Skill 执行标准工作流");
  assert.equal(calls[0][2].skillId, "natural-aesthetic-product-photography");
  assert.equal(calls[0][2].skillLabel, "自然美学产品摄影");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2].attachments)), [{
    type: "image", nodeId: "product-1", name: "商品原图.png", url: "/output/product-1.png",
  }]);
});
