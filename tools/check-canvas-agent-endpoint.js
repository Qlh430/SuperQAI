const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function requestJson(port, pathname, options = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: options.method || "GET",
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => {
        let data = null;
        try { data = JSON.parse(responseBody); } catch { data = responseBody; }
        resolve({ status: response.statusCode, data });
      });
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Canvas Agent test server exited with code ${child.exitCode}: ${diagnostics.join("")}`);
    }
    try {
      const response = await requestJson(port, "/api/canvas-agent/skills");
      if (response.status === 200) return response;
    } catch {
      // The server may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for Canvas Agent test server: ${diagnostics.join("")}`);
}

(async () => {
  const upstreamRequests = [];
  const upstream = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      upstreamRequests.push({ url: req.url, authorization: req.headers.authorization, body: parsed });
      if (parsed.previous_response_id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "No tool call found for function call output with call_id call_text_1" } }));
        return;
      }
      const hasToolOutput = Array.isArray(parsed.input)
        && parsed.input.some((item) => item?.type === "function_call_output");
      const response = hasToolOutput
        ? {
            id: "resp_done",
            model: "test-agent-model",
            output: [{ type: "message", content: [{ type: "output_text", text: "海报文案节点已创建。" }] }],
          }
        : {
            id: "resp_plan",
            model: "test-agent-model",
            output: [{
              type: "function_call",
              call_id: "call_text_1",
              name: "create_text_node",
              arguments: JSON.stringify({ content: "夏日新品", x: null, y: null }),
            }],
          };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    });
  });

  const upstreamPort = await listen(upstream);
  const appPortProbe = http.createServer();
  const appPort = await listen(appPortProbe);
  await close(appPortProbe);
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-endpoint-"));
  const routeHistoryFile = path.join(tempDirectory, "route-history.json");
  fs.writeFileSync(routeHistoryFile, JSON.stringify({
    agentRoutes: {},
    agentCapabilities: {
      "canvas-agent-env-fallback": {
        "test-agent-model": { text: true, tools: true, vision: true, protocol: "responses", adapterId: "openai-responses" },
      },
    },
  }));
  const diagnostics = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: "127.0.0.1",
      CANVAS_AGENT_API_URL: `http://127.0.0.1:${upstreamPort}/v1`,
      CANVAS_AGENT_API_KEY: "test-agent-key",
      CANVAS_AGENT_MODEL: "test-agent-model",
      CANVAS_AGENT_REASONING_EFFORT: "medium",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_FILE: routeHistoryFile,
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  try {
    const skillsResponse = await waitForServer(appPort, child, diagnostics);
    assert.equal(skillsResponse.data.model, undefined);
    assert.equal(skillsResponse.data.reasoning_effort, undefined);
    assert.equal(skillsResponse.data.configured, true);
    assert.ok(skillsResponse.data.skills.some((skill) => skill.id === "poster-design"));

    const firstTurn = await requestJson(appPort, "/api/canvas-agent/turn", {
      method: "POST",
      body: {
        run_id: "endpoint-run-1",
        skill_mode: "auto",
        skill_id: "",
        prompt: "你好",
        canvas: { id: "board-1", title: "测试画布", selected_node_ids: [], nodes: [], connections: [] },
        vision_images: [],
        step: 0,
      },
    });
    assert.equal(firstTurn.status, 200);
    assert.equal(firstTurn.data.response_id, "resp_plan");
    assert.deepEqual(firstTurn.data.tool_calls, [{
      call_id: "call_text_1",
      name: "create_text_node",
      arguments: { content: "夏日新品", x: null, y: null },
    }]);

    const wrongBoardTurn = await requestJson(appPort, "/api/canvas-agent/turn", {
      method: "POST",
      body: {
        run_id: "endpoint-run-1",
        board_id: "board-2",
        skill_mode: "auto",
        previous_response_id: "resp_plan",
        tool_outputs: [{ call_id: "call_text_1", output: { ok: true, node_id: "node-1" } }],
        step: 1,
      },
    });
    assert.equal(wrongBoardTurn.status, 400);
    assert.match(String(wrongBoardTurn.data.error || ""), /不属于当前画布/);

    const secondTurn = await requestJson(appPort, "/api/canvas-agent/turn", {
      method: "POST",
      body: {
        run_id: "endpoint-run-1",
        skill_mode: "auto",
        skill_id: "",
        previous_response_id: "resp_plan",
        tool_outputs: [{ call_id: "call_text_1", output: { ok: true, node_id: "node-1" } }],
        step: 1,
      },
    });
    assert.equal(secondTurn.status, 200);
    assert.equal(secondTurn.data.response_id, "resp_done");
    assert.equal(secondTurn.data.message, "海报文案节点已创建。");
    assert.deepEqual(secondTurn.data.tool_calls, []);

    const manualTurn = await requestJson(appPort, "/api/canvas-agent/turn", {
      method: "POST",
      body: {
        skill_mode: "manual",
        skill_id: "poster-design",
        prompt: "做一张夏日新品海报",
        canvas: { id: "board-1", title: "测试画布", selected_node_ids: [], nodes: [], connections: [] },
        vision_images: [],
        step: 0,
      },
    });
    assert.equal(manualTurn.status, 200);

    assert.equal(upstreamRequests.length, 3);
    assert.equal(upstreamRequests[0].url, "/v1/responses");
    assert.equal(upstreamRequests[0].authorization, "Bearer test-agent-key");
    assert.equal(upstreamRequests[0].body.model, "test-agent-model");
    assert.ok(upstreamRequests[0].body.tools.some((tool) => tool.name === "create_text_node"));
    assert.match(upstreamRequests[0].body.instructions, /自动模式/);
    assert.match(upstreamRequests[0].body.instructions, /普通问候或头脑风暴/);
    assert.equal(upstreamRequests[1].body.previous_response_id, undefined);
    assert.deepEqual(
      upstreamRequests[1].body.input.filter((item) => item.type).map((item) => item.type),
      ["function_call", "function_call_output"],
    );
    assert.doesNotMatch(upstreamRequests[2].body.instructions, /当前处于自动模式/);
    assert.match(upstreamRequests[2].body.instructions, /当前业务 Skill：poster-design/);
    assert.ok(upstreamRequests[2].body.tools.length < upstreamRequests[0].body.tools.length);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await close(upstream);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }

  console.log("Canvas agent endpoint checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
