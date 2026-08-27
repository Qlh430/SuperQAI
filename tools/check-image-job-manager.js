const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createImageJobManager } = require("../image-job-manager");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-image-jobs-"));
  const filePath = path.join(directory, "jobs.json");
  try {
    const execution = deferred();
    let calls = 0;
    const manager = createImageJobManager({
      filePath,
      timeoutMs: 500,
      execute: async (payload, context) => {
        calls += 1;
        assert.equal(payload.prompt, "slow apple");
        assert.equal(context.jobId.length > 0, true);
        return execution.promise;
      },
    });

    const created = manager.create({ prompt: "slow apple" }, { boardId: "board-a", nodeId: "node-a" });
    assert.equal(created.state, "queued");
    assert.equal(created.boardId, "board-a");
    assert.equal(created.nodeId, "node-a");
    assert.equal(created.payload, undefined, "public jobs must not expose the submitted prompt or references");
    await wait(10);
    assert.equal(calls, 1);
    assert.match(manager.get(created.id).state, /submitting|running/);

    execution.resolve({ status: 200, body: { model: "gpt-image-2", data: [{ url: "/output/apple.png" }] } });
    await wait(20);
    const completed = manager.get(created.id);
    assert.equal(completed.state, "completed");
    assert.equal(completed.result.model, "gpt-image-2");
    assert.equal(completed.result.data[0].url, "/output/apple.png");
    assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).jobs[created.id].state, "completed");

    let timeoutCalls = 0;
    const timeoutManager = createImageJobManager({
      filePath: path.join(directory, "timeouts.json"),
      timeoutMs: 35,
      execute: async () => {
        timeoutCalls += 1;
        return new Promise(() => {});
      },
    });
    const timedOut = timeoutManager.create({ prompt: "never returns" }, { boardId: "board-b", nodeId: "node-b" });
    await wait(80);
    const unknown = timeoutManager.get(timedOut.id);
    assert.equal(unknown.state, "unknown");
    assert.equal(unknown.code, "image_job_timeout_unknown");
    assert.match(unknown.error, /结果待确认/);
    assert.equal(timeoutCalls, 1, "an ambiguous paid request must never be submitted twice");

    const interruptedFile = path.join(directory, "interrupted.json");
    fs.writeFileSync(interruptedFile, JSON.stringify({
      version: 1,
      jobs: {
        interrupted: {
          id: "interrupted",
          state: "running",
          payload: { prompt: "do not resubmit" },
          boardId: "board-c",
          nodeId: "node-c",
          createdAt: "2026-08-25T00:00:00.000Z",
          updatedAt: "2026-08-25T00:00:01.000Z",
        },
      },
    }, null, 2));
    let recoveredCalls = 0;
    const recovered = createImageJobManager({
      filePath: interruptedFile,
      timeoutMs: 500,
      execute: async () => {
        recoveredCalls += 1;
        return { status: 200, body: {} };
      },
    });
    assert.equal(recovered.get("interrupted").state, "unknown");
    assert.equal(recovered.get("interrupted").code, "image_job_interrupted_unknown");
    assert.equal(recoveredCalls, 0, "startup recovery must not resubmit an interrupted paid request");

    console.log("Image job manager checks passed.");
  } finally {
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
