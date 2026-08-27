"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("../canvas-agent-runtime");
const connectors = require("../canvas-agent-llm-connectors");
const legacyAdapters = require("../canvas-agent-model-adapters");

const skill = runtime.parseSkillDocument(`---
name: llm-connector-contract-test
description: 验证不同模型只转换同一批 MCP 工具而不执行画布操作
canvas:
  category: test
  capabilities: [node.text.create]
---
# Connector contract

收到明确要求时创建文字节点。
`, "llm-connector-contract-test/SKILL.md");
const payload = {
  skill_mode: "manual",
  skill_id: skill.id,
  prompt: "创建标题",
  canvas: { id: "board-1", nodes: [] },
  step: 0,
};
const options = { model: "model-a", reasoningEffort: "low", skills: [skill] };

const responses = connectors.getLlmConnector("openai-responses");
const chat = connectors.getLlmConnector("openai-chat");
assert.equal(responses.buildRequest(payload, options).tools[0].name, "create_text_node");
assert.equal(chat.buildRequest(payload, options).tools[0].function.name, "create_text_node");
assert.equal(typeof responses.executeCanvasTool, "undefined");
assert.equal(typeof chat.executeCanvasTool, "undefined");
assert.deepEqual(connectors.listLlmConnectors().map((item) => item.id), ["openai-responses", "openai-chat"]);
assert.equal(connectors.resolveLlmConnector({ protocol: "responses" }).id, "openai-responses");
assert.equal(connectors.resolveLlmConnector({ protocol: "chat" }).id, "openai-chat");

assert.equal(legacyAdapters.getModelAdapter("responses"), responses);
assert.equal(legacyAdapters.resolveModelAdapter({ protocol: "chat" }), chat);
assert.equal(legacyAdapters.getLlmConnector("responses"), responses);

const source = fs.readFileSync(path.join(__dirname, "..", "canvas-agent-llm-connectors.js"), "utf8");
assert.doesNotMatch(source, /CanvasAgentBroker|broker\.execute|CanvasAgentToolAdapters|createCanvasMcpSession|\.callTool\(/);

console.log("Canvas agent LLM Connector checks passed.");
