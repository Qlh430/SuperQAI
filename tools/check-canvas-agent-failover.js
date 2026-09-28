const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Router = require("../canvas-agent-router");

async function main() {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const canvasAgentHttpApi = fs.readFileSync(path.join(__dirname, "..", "canvas-agent-http-api.js"), "utf8");
  assert.match(server, /require\("\.\/canvas-agent-http-api"\)/);
  assert.match(canvasAgentHttpApi, /function getOrCreateSession/);
  assert.match(canvasAgentHttpApi, /function pruneSessions/);
  assert.doesNotMatch(canvasAgentHttpApi, /function runCanvasAgentCandidate/);
  assert.match(canvasAgentHttpApi, /function writeEvent/);
  assert.match(canvasAgentHttpApi, /application\/x-ndjson/);
  assert.match(server, /createCanvasAgentProviderBridge/);
  assert.match(canvasAgentHttpApi, /req\.once\("close"/);
  assert.match(canvasAgentHttpApi, /pinnedCandidateId/);
  assert.match(canvasAgentHttpApi, /forceStateless/);
  assert.match(server, /CANVAS_AGENT_SESSION_TTL_MS/);
  assert.match(canvasAgentHttpApi, /function disposeSession/);
  assert.match(canvasAgentHttpApi, /disposeSession\(session\)/);
  assert.match(canvasAgentHttpApi, /async function handleCancel/);
  assert.match(canvasAgentHttpApi, /\/api\/canvas-agent\/cancel/);
  assert.match(canvasAgentHttpApi, /session\.initialPayload\.vision_images\s*=\s*\[\]/);
  assert.match(canvasAgentHttpApi, /session\.initialPayload\.canvas\s*=\s*\{\}/);
  assert.doesNotMatch(canvasAgentHttpApi, /writeEvent\([^\n]+(?:candidate|provider|model)/);
  const turnHandlerSource = canvasAgentHttpApi.slice(
    canvasAgentHttpApi.indexOf("async function handleTurn"),
    canvasAgentHttpApi.indexOf("async function handleCancel"),
  );
  assert.match(turnHandlerSource, /canvasAgentProviderBridge\.runTurn/);
  assert.match(turnHandlerSource, /onAttemptFailure:[\s\S]{0,180}stage:\s*"recovering"/);
  assert.doesNotMatch(turnHandlerSource, /getCanvasAgentCandidates|executeSequentialFailover/);
  assert.doesNotMatch(turnHandlerSource, /getLegacyCanvasAgentCandidate/);

  const attempts = [];
  const statuses = [];
  const result = await Router.executeSequentialFailover({
    candidates: [{ id: "slow" }, { id: "fast" }],
    runAttempt: async (candidate) => {
      attempts.push(candidate.id);
      if (candidate.id === "slow") {
        const error = new Error("first event timeout");
        error.code = "FIRST_EVENT_TIMEOUT";
        throw error;
      }
      return { candidateId: candidate.id, turn: { message: "ok", tool_calls: [] } };
    },
    onStatus: (event) => statuses.push(event.stage),
  });
  assert.equal(result.candidateId, "fast");
  assert.deepEqual(attempts, ["slow", "fast"]);
  assert.deepEqual(statuses, ["recovering"]);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => Router.executeSequentialFailover({
    candidates: [{ id: "never" }, { id: "also-never" }],
    signal: controller.signal,
    runAttempt: async () => ({ ok: true }),
  }), (error) => error.name === "AbortError" && error.cancelledByUser === true);

  console.log("Canvas agent failover checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
