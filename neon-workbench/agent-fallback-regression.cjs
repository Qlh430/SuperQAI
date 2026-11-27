"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createAgentModelSettingsService } = require("../host-sources/app/agent-model-settings");
const { createCapabilityResolver } = require("../host-sources/app/provider-capability-resolver");
const { createProviderExecutor } = require("../host-sources/app/provider-executor");
const { createCanvasAgentProviderBridge } = require("../host-sources/app/canvas-agent-provider-bridge");

function fixture(enabled = true) {
  const capabilities = ["llm.chat", "llm.chat.vision", "llm.tools"];
  const providers = [
    { id: "main", name: "主服务", enabled: true, models: [{ id: "main", capabilities }] },
    { id: "backup", name: "候选服务", enabled: true, models: [{ id: "backup", capabilities }, { id: "text", capabilities: ["llm.chat"] }] },
    { id: "unselected", name: "未选择服务", enabled: true, models: [{ id: "other", capabilities }] },
  ];
  let config = { primary: { providerId: "main", modelId: "main" }, candidates: [{ providerId: "backup", modelId: "backup" }] };
  const store = { listInternal: () => providers, getAutoFallback: () => enabled };
  const settings = createAgentModelSettingsService({ store, db: { getSetting: () => config, setSetting: (_key, value) => { config = value; } } });
  return { providers, store, settings };
}

test("关闭自动切换时，主模型失效不能直接跳到候选", () => {
  const { providers, settings } = fixture(false);
  providers[0].enabled = false;
  assert.throws(() => settings.getRoute(), /主模型|自动切换/);
});

test("自动切换未配置候选时，不隐式使用所有账户服务", () => {
  const { settings } = fixture();
  settings.save({ primary: { providerId: "main", modelId: "main" }, candidates: [] });
  assert.equal(settings.getRoute().candidateOrder.length, 1);
});

test("普通对话所选主模型复用已配置候选，并保留首选", () => {
  const { settings } = fixture();
  assert.deepEqual(settings.getRoute({ primary: { providerId: "backup", modelId: "text" }, requiredCapabilities: ["llm.chat"] }).candidateOrder, [
    { providerId: "backup", modelId: "text" }, { providerId: "backup", modelId: "backup" },
  ]);
});

test("工具任务故障切换保留所有输入、Skill、工具结果，过滤非工具模型", async () => {
  const { store, settings } = fixture();
  const seen = [];
  const input = { messages: [{ role: "system", content: "Skill 专业流程" }, { role: "tool", tool_call_id: "done", content: '{"ok":true,"node_id":"existing"}' }], tools: [{ type: "function", function: { name: "create_text_node" } }] };
  const engine = {
    execute: async () => {}, executeWithTools: async () => {},
    stream: async (provider, _model, _intent, actual) => {
      seen.push({ provider: provider.id, input: actual });
      if (provider.id === "main") throw Object.assign(new Error("工具协议不兼容"), { code: "UPSTREAM_PROTOCOL", retryable: false, fallbackAllowed: true });
      return { toolCalls: [{ id: "next", name: "create_text_node", arguments: '{"content":"继续"}' }] };
    },
  };
  const executor = createProviderExecutor({ resolver: createCapabilityResolver({ store }), engine });
  const bridge = createCanvasAgentProviderBridge({ executor });
  const result = await bridge.runTurn({ ...input, candidateOrder: settings.getRoute().candidateOrder });
  assert.deepEqual(seen.map(item => item.provider), ["main", "backup"]);
  assert.deepEqual(seen[1].input.messages, input.messages);
  assert.equal(result.turn.tool_calls[0].name, "create_text_node");
  assert.equal(result.selection.modelId, "backup");
});

test("关闭自动切换，即使调用方 forceFallback 也不能绕过设置", async () => {
  const { store, settings } = fixture(false);
  const seen = [];
  const engine = {
    execute: async () => {}, executeWithTools: async () => {},
    stream: async provider => { seen.push(provider.id); throw Object.assign(new Error("限流"), { code: "UPSTREAM_RATE_LIMIT", retryable: true }); },
  };
  const executor = createProviderExecutor({ resolver: createCapabilityResolver({ store }), engine });
  await assert.rejects(() => executor.stream({ intent: "llm.chat", forceFallback: true, candidateOrder: settings.getRoute().candidateOrder }, () => {}));
  assert.deepEqual(seen, ["main"]);
});

test("普通流式对话已经输出后不能切换重复回答", async () => {
  const { store, settings } = fixture();
  const seen = [];
  const engine = { execute: async () => {}, executeWithTools: async () => {}, stream: async (provider, _m, _i, _in, _p, delta) => {
    seen.push(provider.id); delta({ type: "text-delta", text: "部分回答" });
    throw Object.assign(new Error("断开"), { code: "UPSTREAM_UNAVAILABLE" });
  } };
  const executor = createProviderExecutor({ resolver: createCapabilityResolver({ store }), engine });
  await assert.rejects(() => executor.stream({ intent: "llm.chat", candidateOrder: settings.getRoute().candidateOrder }, () => {}));
  assert.deepEqual(seen, ["main"]);
});

test("Agent 尚未交付的工具提议流中断，可以丢弃部分响应切换", async () => {
  const { store, settings } = fixture();
  const seen = [];
  const engine = { execute: async () => {}, executeWithTools: async () => {}, stream: async (provider, _m, _i, _in, _p, delta) => {
    seen.push(provider.id);
    if (provider.id === "main") {
      delta({ type: "text-delta", text: "未交付的规划" });
      throw Object.assign(new Error("工具流中断"), { code: "UPSTREAM_UNAVAILABLE" });
    }
    return { toolCalls: [{ id: "one", name: "create_text_node", arguments: "{}" }] };
  } };
  const bridge = createCanvasAgentProviderBridge({ executor: createProviderExecutor({ resolver: createCapabilityResolver({ store }), engine }) });
  const result = await bridge.runTurn({ candidateOrder: settings.getRoute().candidateOrder });
  assert.equal(result.turn.tool_calls.length, 1);
  assert.deepEqual(seen, ["main", "backup"]);
});
