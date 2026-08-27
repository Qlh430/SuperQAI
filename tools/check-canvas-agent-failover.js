const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Router = require("../canvas-agent-router");

async function main() {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /function getOrCreateCanvasAgentSession/);
  assert.match(server, /function pruneCanvasAgentSessions/);
  assert.match(server, /function runCanvasAgentCandidate/);
  assert.match(server, /function writeCanvasAgentEvent/);
  assert.match(server, /application\/x-ndjson/);
  assert.match(server, /CanvasAgentRouter\.executeSequentialFailover/);
  assert.match(server, /req\.once\("close"/);
  assert.match(server, /pinnedCandidateId/);
  assert.match(server, /forceStateless/);
  assert.match(server, /CANVAS_AGENT_SESSION_TTL_MS/);
  assert.match(server, /function disposeCanvasAgentSession/);
  assert.match(server, /disposeCanvasAgentSession\(session\)/);
  assert.match(server, /async function handleCanvasAgentCancel/);
  assert.match(server, /\/api\/canvas-agent\/cancel/);
  assert.match(server, /session\.initialPayload\.vision_images\s*=\s*\[\]/);
  assert.match(server, /session\.initialPayload\.canvas\s*=\s*\{\}/);
  assert.doesNotMatch(server, /writeCanvasAgentEvent\([^\n]+(?:candidate|provider|model)/);
  const turnHandlerSource = server.slice(
    server.indexOf("async function handleCanvasAgentTurn"),
    server.indexOf("async function handleCanvasAgentCancel"),
  );
  assert.match(turnHandlerSource, /let candidates = getCanvasAgentCandidates\(scopedPayload\)/);
  assert.doesNotMatch(turnHandlerSource, /wantsStream\s*\?\s*getCanvasAgentCandidates/);
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
