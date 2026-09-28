"use strict";

// A fake upstream reproduces APIMart's real chat gateway behaviour — a 400 that
// asks for reasoning_effort "none" whenever function tools are present, and SSE
// replies to non-streaming calls — and the real Canvas Agent turn endpoint has
// to keep answering, including through the configured candidate list.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

async function eventually(read, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read().catch(() => null);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("condition timed out");
}

const calls = [];
const upstream = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const key = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = body ? JSON.parse(body) : {};
  calls.push({ key, url: req.url, method: req.method, body: payload });
  const sendJson = (data, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const sendSse = (events) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`);
  };
  if (req.method === "GET") return sendJson({ data: [{ id: "gpt-5.6-terra" }, { id: "gpt-5.6-terra-copy" }] });
  if (key === "broken-key") return sendJson({ error: { message: "The model 'gpt-5.6-terra' does not exist." } }, 400);
  if (key === "secondary-key") return sendJson({ choices: [{ message: { content: "secondary-ok" } }], usage: null });
  if (key === "reasoning-key") {
    const hasReasoningReplay = (Array.isArray(payload.messages) ? payload.messages : [])
      .some((message) => message?.role === "assistant" && message?.reasoning_content);
    if (hasReasoningReplay) {
      return sendSse([{
        id: "reasoning-second",
        choices: [{ delta: { content: "reasoning-continuation-ok" } }],
      }]);
    }
    return sendSse([
      {
        id: "reasoning-first",
        choices: [{ delta: { reasoning_content: "先读取参考文档。" } }],
      },
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "call-reasoning",
              function: {
                name: "read_skill_reference",
                arguments: '{"skill_id":"poster-design"}',
              },
            }],
          },
        }],
      },
    ]);
  }
  if (key === "history-strict-key") {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const hasNativeToolHistory = messages.some((message) => (
      message?.role === "assistant"
      && Array.isArray(message.tool_calls)
      && message.tool_calls.length
    ));
    const hasFlattenedToolResult = messages.some((message) => (
      message?.role === "user"
      && /\[工具结果\s+call-history-strict\]/.test(String(message.content || ""))
    ));
    if (hasNativeToolHistory) {
      return sendJson({
        error: {
          message: "The `reasoning_content` in the thinking mode must be passed back to the API.",
          type: "invalid_request_error",
        },
      }, 400);
    }
    if (hasFlattenedToolResult) {
      return sendSse([{
        id: "history-strict-second",
        choices: [{ delta: { content: "flattened-continuation-ok" } }],
      }]);
    }
    return sendSse([
      {
        id: "history-strict-first",
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "call-history-strict",
              function: {
                name: "read_skill_reference",
                arguments: '{"skill_id":"poster-design","path":"references/spec.md"}',
              },
            }],
          },
        }],
      },
    ]);
  }
  if (Array.isArray(payload.tools) && payload.tools.length) {
    if (payload.reasoning_effort !== "none") {
      return sendJson({
        error: {
          message: "Function tools with reasoning_effort are not supported for gpt-5.6-terra in /v1/chat/completions. "
            + "To use tools, use /v1/responses or set reasoning_effort to 'none'.",
        },
      }, 400);
    }
    if (payload.stream !== false) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end('data: {"choices":[{"delta":{"content":"sse-body"}}]}\n\ndata: [DONE]\n\n');
      return;
    }
  }
  return sendJson({ choices: [{ message: { content: "primary-ok" } }], usage: null });
});

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-turn-e2e-"));
  const upstreamPort = await listen(upstream);
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));

  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^(AI_|CANVAS_|IMAGE_|OUTBOUND_|SETTINGS_|APIMART_|GRSAI_|AINB_|CLSE_|RUNNINGHUB_|GEMINI_|BAILIAN_)/.test(name)) delete env[name];
  }
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...env,
      HOST: "127.0.0.1",
      PORT: String(port),
      AI_OS_AUTH_DISABLED: "0",
      AI_OS_SKIP_ENV_FILE: "1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_OUTPUT_DIR: path.join(dataDir, "output"),
      OUTBOUND_PROXY_URL: "direct",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
  });
  let log = "";
  child.stdout.on("data", (chunk) => { log = (log + chunk).slice(-4000); });
  child.stderr.on("data", (chunk) => { log = (log + chunk).slice(-4000); });

  let cookie = "";
  async function request(route, body, options = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie, ...(options.headers || {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return { response, data };
  }

  try {
    await eventually(() => request("/api/system/ready"));
    await request("/api/auth/bootstrap", { username: "AgentE2E", password: "temporary agent e2e password", displayName: "AgentE2E" });
    const login = await request("/api/auth/login", { username: "AgentE2E", password: "temporary agent e2e password" });
    cookie = login.response.headers.get("set-cookie").split(";", 1)[0];

    for (const [id, key] of [
      ["primary", "primary-key"],
      ["broken", "broken-key"],
      ["secondary", "secondary-key"],
      ["reasoning", "reasoning-key"],
      ["history-strict", "history-strict-key"],
    ]) {
      const saved = await request("/api/providers", {
        id,
        name: id,
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        protocol: "openai",
        apiKey: key,
        enabled: true,
        sortOrder: ["primary", "broken", "secondary"].indexOf(id),
        models: [{
          id: "gpt-5.6-terra",
          protocol: "openai",
          capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"],
        }],
      });
      assert.ok(saved.response.ok, `provider ${id}: ${JSON.stringify(saved.data)}`);
    }

    const turnBody = {
      board_id: "agent-e2e-board",
      prompt: "把画布里的节点整理一下",
      skill_mode: "auto",
      step: 0,
      canvas: { nodes: [], edges: [], selectedIds: [] },
      vision_images: [],
      conversation_context: [],
    };
    const board = await request("/api/canvas/boards", { id: "agent-e2e-board", title: "Agent 端到端画布" });
    assert.ok(board.response.ok, `canvas board: ${JSON.stringify(board.data)}`);

    async function runTurn(label) {
      calls.length = 0;
      const result = await request("/api/canvas-agent/turn", turnBody);
      console.log(`\n[${label}] status ${result.response.status}`);
      console.log(`[${label}] body ${JSON.stringify(result.data).slice(0, 400)}`);
      console.log(`[${label}] upstream calls ${JSON.stringify(calls.map((call) => ({
        key: call.key,
        stream: call.body.stream,
        reasoning: call.body.reasoning_effort,
        tools: Array.isArray(call.body.tools) ? call.body.tools.length : 0,
      })))}`);
      return result;
    }

    // Scenario A: the primary model only answers once the gateway's requested
    // shape (explicit non-streaming JSON + reasoning_effort "none") is used.
    await request("/api/providers/agent-settings", { primary: { providerId: "primary", modelId: "gpt-5.6-terra" }, candidates: [] });
    const main = await runTurn("primary model");
    assert.equal(main.response.status, 200, `the primary Agent model must answer: ${JSON.stringify(main.data)}`);
    assert.match(String(main.data.message || ""), /sse-body/, "an SSE reply from a JSON call is still decoded");
    assert.equal(main.data.tool_calls?.length || 0, 0);
    const shaped = calls.filter((call) => call.body.tools?.length);
    assert.ok(shaped.length >= 2, "the rejected shape is retried once");
    assert.equal(shaped[0].body.reasoning_effort, undefined, "the first attempt keeps the configured parameters");
    assert.equal(shaped.at(-1).body.reasoning_effort, "none", "the retry uses the shape the gateway asked for");

    // Scenario B: the primary rejects the request outright; the configured
    // candidate must still answer the user instead of failing the turn.
    await request("/api/providers/agent-settings", {
      primary: { providerId: "broken", modelId: "gpt-5.6-terra" },
      candidates: [{ providerId: "secondary", modelId: "gpt-5.6-terra" }],
    });
    const fallback = await runTurn("candidate fallback");
    assert.equal(fallback.response.status, 200, `the candidate must answer: ${JSON.stringify(fallback.data)}`);
    assert.match(String(fallback.data.message || ""), /secondary-ok/);
    assert.deepEqual(calls.map((call) => call.key), ["broken-key", "secondary-key"]);

    // Scenario C: a reasoning model returns a tool call, and the next request
    // must replay the assistant reasoning_content or DeepSeek-style gateways
    // reject the continuation with a 400.
    await request("/api/providers/agent-settings", {
      primary: { providerId: "broken", modelId: "gpt-5.6-terra" },
      candidates: [{ providerId: "reasoning", modelId: "gpt-5.6-terra" }],
    });
    calls.length = 0;
    const reasoningTurnBody = {
      ...turnBody,
      run_id: "agent-reasoning-e2e",
      prompt: "读取海报流程参考后继续设计",
    };
    const reasoningFirst = await request("/api/canvas-agent/turn", reasoningTurnBody);
    assert.equal(reasoningFirst.response.status, 200, `reasoning tool turn failed: ${JSON.stringify(reasoningFirst.data)}`);
    assert.equal(reasoningFirst.data.tool_calls?.[0]?.call_id, "call-reasoning");
    assert.deepEqual(calls.map((call) => call.key), ["broken-key", "reasoning-key"]);
    calls.length = 0;
    const reasoningCall = await request("/api/canvas-agent/turn", {
      ...reasoningTurnBody,
      previous_response_id: reasoningFirst.data.response_id,
      tool_outputs: [{ call_id: "call-reasoning", output: { ok: true } }],
      step: 1,
    });
    assert.equal(reasoningCall.response.status, 200, `reasoning continuation failed: ${JSON.stringify(reasoningCall.data)}`);
    assert.match(String(reasoningCall.data.message || ""), /reasoning-continuation-ok/);
    assert.deepEqual(calls.map((call) => call.key), ["reasoning-key"], "continuations must retry the model that produced the tool call first");
    const replayedReasoning = calls
      .flatMap((call) => Array.isArray(call.body.messages) ? call.body.messages : [])
      .find((message) => message?.role === "assistant" && message?.reasoning_content === "先读取参考文档。");
    assert.ok(replayedReasoning, "the tool continuation must send assistant reasoning_content back to the provider");

    // Scenario D: a thinking gateway rejects native tool-call history created
    // without reasoning_content. The endpoint must retry once with that history
    // flattened into ordinary text, preserving the latest tool output.
    await request("/api/providers/agent-settings", {
      primary: { providerId: "history-strict", modelId: "gpt-5.6-terra" },
      candidates: [],
    });
    calls.length = 0;
    const compatibilityTurnBody = {
      ...turnBody,
      run_id: "agent-reasoning-compatibility-e2e",
      prompt: "继续读取海报参考并完成设计",
    };
    const compatibilityFirst = await request("/api/canvas-agent/turn", compatibilityTurnBody);
    assert.equal(compatibilityFirst.response.status, 200, `compatibility tool turn failed: ${JSON.stringify(compatibilityFirst.data)}`);
    assert.equal(compatibilityFirst.data.tool_calls?.[0]?.call_id, "call-history-strict");
    calls.length = 0;
    const compatibilityContinuation = await request("/api/canvas-agent/turn", {
      ...compatibilityTurnBody,
      previous_response_id: compatibilityFirst.data.response_id,
      tool_outputs: [{ call_id: "call-history-strict", output: { ok: true } }],
      step: 1,
    });
    assert.equal(compatibilityContinuation.response.status, 200, `compatibility continuation failed: ${JSON.stringify(compatibilityContinuation.data)}`);
    assert.match(String(compatibilityContinuation.data.message || ""), /flattened-continuation-ok/);
    assert.equal(calls.length, 2, "the rejected native history should be retried once in compatibility mode");
    assert.ok(calls[0].body.messages.some((message) => message?.role === "assistant" && message?.tool_calls?.length));
    assert.equal(
      calls[1].body.messages.some((message) => message?.role === "assistant" && message?.tool_calls?.length),
      false,
      "compatibility mode must not replay native assistant tool_calls",
    );
    assert.ok(calls[1].body.messages.some((message) => (
      message?.role === "user"
      && /\[工具结果\s+call-history-strict\]/.test(String(message.content || ""))
    )));
    console.log("\nCanvas Agent turn endpoint checks passed: gateway shape retry, SSE decoding, candidate fallback, reasoning replay.");
  } catch (error) {
    console.error(log);
    throw error;
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    if (path.resolve(dataDir).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
