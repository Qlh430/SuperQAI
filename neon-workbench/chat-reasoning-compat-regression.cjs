const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const diagnostic = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../AI-OS-Portable-1.0.5-win-x64/data/.logs/runtime-diagnostics.json"), "utf8"));
const runtime = diagnostic.appRoot;
const source = path.join(__dirname, "design-sources/provider-protocol-engine.js");
const moduleRecord = { exports: {} };
vm.runInNewContext(fs.readFileSync(source, "utf8"), {
  require: name => require(path.join(runtime, name)), module: moduleRecord, exports: moduleRecord.exports,
  URL, Date, Set, Map, Object, Number, String, Boolean, Array, Error, TypeError, JSON,
  AbortController, AbortSignal, TextDecoder, FormData, Blob, Response, Buffer, setTimeout, clearTimeout,
}, { filename: source });
const { createProtocolEngine } = moduleRecord.exports;
const provider = { id: "reasoning-regression", protocol: "openai", baseUrl: "https://example.invalid/v1", apiKey: "fixture" };
const tools = { messages: [{ role: "user", content: "test" }], tools: [{ type: "function", function: { name: "test", parameters: { type: "object" } } }] };
const ok = () => new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] }), { status: 200 });
const rejected = message => new Response(JSON.stringify({ error: { message } }), { status: 400 });
const unsupported = "Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'.";
const required = "Function calling is only supported when reasoning_effort is none.";
const explicitToolAdvice = "Function tools with reasoning_effort are not supported for gpt-6.1-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.";

async function main() {
  const calls = [];
  const engine = createProtocolEngine({ outboundFetch: async (_url, request) => {
    const body = JSON.parse(request.body);
    calls.push(body);
    if (body.model === "reject-none" && body.reasoning_effort !== "low") return rejected(unsupported);
    if (body.model === "requires-none" && body.reasoning_effort !== "none") return rejected(required);
    if (body.model === "always-reject") return rejected(unsupported);
    return ok();
  } });
  const model = id => ({ id, protocol: "openai" });
  assert.throws(() => engine.buildRequest({ ...provider, protocol: "openai-images" }, { id: "image-only", protocol: "openai-images" }, "llm.tools", tools),
    error => error.code === "UPSTREAM_PROTOCOL" && error.fallbackAllowed === true,
    "a protocol that cannot build a tool request is a safe pre-submission fallback");
  await engine.execute(provider, model("reject-none"), "llm.chat", tools, { reasoning_effort: "none" });
  assert.deepEqual(calls.splice(0).map(call => call.reasoning_effort), [undefined, "low"]);
  await engine.execute(provider, model("other-model"), "llm.chat", tools, { reasoning_effort: "high" });
  assert.deepEqual(calls.splice(0).map(call => call.reasoning_effort), [undefined]);
  await engine.execute(provider, model("requires-none"), "llm.chat", tools, { reasoning_effort: "medium" });
  assert.deepEqual(calls.splice(0).map(call => call.reasoning_effort), [undefined, "none"]);
  await engine.execute(provider, model("requires-none"), "llm.chat", tools, { reasoning_effort: "medium" });
  assert.deepEqual(calls.splice(0).map(call => call.reasoning_effort), ["none"]);
  await assert.rejects(() => engine.execute(provider, model("always-reject"), "llm.chat", tools, { reasoning_effort: "medium" }));
  assert.deepEqual(calls.splice(0).map(call => call.reasoning_effort), [undefined, "low"]);
  await assert.rejects(() => engine.execute(provider, model("always-reject"), "llm.chat", {}, { reasoning_effort: "none" }));
  assert.equal(calls.splice(0).length, 1);
  const streamCalls = [];
  const streaming = createProtocolEngine({ outboundFetch: async (_url, request) => {
    const body = JSON.parse(request.body);
    streamCalls.push(body.reasoning_effort);
    if (body.reasoning_effort !== "low") return rejected(unsupported);
    return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
      headers: { "content-type": "text/event-stream" },
    });
  } });
  await streaming.stream(provider, model("stream-reject-none"), "llm.chat", tools, { reasoning_effort: "medium" }, () => {});
  assert.deepEqual(streamCalls, [undefined, "low"]);
  streamCalls.length = 0;
  await streaming.stream(provider, model("agent-tools-reject-none"), "llm.tools", tools, { reasoning_effort: "none" }, () => {});
  assert.equal(streamCalls.at(-1), "low", "Agent tool requests use the same bounded parameter adaptation as chat");
  assert.equal(streamCalls.length, 2);
  const advisedCalls = [];
  const advised = createProtocolEngine({ outboundFetch: async (_url, request) => {
    const body = JSON.parse(request.body);
    advisedCalls.push(body.reasoning_effort);
    if (body.tools?.length && body.reasoning_effort !== "none") return rejected(explicitToolAdvice);
    return ok();
  } });
  await advised.stream(provider, model("candidate-tool-advice"), "llm.tools", tools, {}, () => {});
  assert.deepEqual(advisedCalls.splice(0), [undefined, "none"], "explicit gateway advice adapts a rejected tool request once");
  await advised.stream(provider, model("candidate-tool-advice"), "llm.tools", tools, {}, () => {});
  assert.deepEqual(advisedCalls.splice(0), ["none"], "later turns reuse only this provider/model's accepted tool parameter");
  await advised.execute(provider, model("candidate-tool-advice"), "llm.chat", { messages: tools.messages });
  assert.deepEqual(advisedCalls.splice(0), [undefined], "ordinary chat without tools keeps its original parameters");
  const protocolCalls = [];
  const protocolRepair = createProtocolEngine({ outboundFetch: async (url, request) => {
    const body = JSON.parse(request.body);
    protocolCalls.push({ path: new URL(url).pathname, effort: body.reasoning_effort ?? body.reasoning?.effort });
    if (String(url).endsWith("/responses")) return new Response(JSON.stringify({
      status: "completed", output: [{ type: "function_call", call_id: "continue", name: "test", arguments: "{}" }],
    }));
    return rejected(body.reasoning_effort === "none" ? unsupported : explicitToolAdvice);
  } });
  const repaired = await protocolRepair.stream(provider, model("contradictory-tool-gateway"), "llm.tools", tools, {}, () => {});
  assert.equal(repaired.toolCalls[0]?.name, "test", "existing Responses adapter can finish an explicitly recommended protocol repair");
  assert.deepEqual(protocolCalls.splice(0), [
    { path: "/v1/chat/completions", effort: undefined },
    { path: "/v1/chat/completions", effort: "none" },
    { path: "/v1/responses", effort: "low" },
  ], "contradictory parameter advice is bounded and must not oscillate none/low");
  await protocolRepair.stream(provider, model("contradictory-tool-gateway"), "llm.tools", tools, {}, () => {});
  assert.deepEqual(protocolCalls.splice(0), [{ path: "/v1/responses", effort: "low" }], "later tool turns reuse the verified protocol only for this provider/model");
  let failures = 0;
  const failureEngine = createProtocolEngine({ outboundFetch: async (_url, request) => {
    const body = JSON.parse(request.body);
    failures++;
    return rejected(body.reasoning_effort === "none" ? "different error" : required);
  } });
  await assert.rejects(() => failureEngine.execute(provider, model("failed-retry"), "llm.chat", tools));
  await assert.rejects(() => failureEngine.execute(provider, model("failed-retry"), "llm.chat", tools));
  assert.equal(failures, 4);
  console.log("reasoning compatibility regression: passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
