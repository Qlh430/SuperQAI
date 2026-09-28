const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createImageJobManager } = require("../image-job-manager");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForState(manager, id, expected) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const job = manager.get(id);
    if (job?.state === expected) return job;
    await wait(10);
  }
  throw new Error(`Timed out waiting for ${expected}; got ${manager.get(id)?.state}`);
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-image-job-recovery-"));
  const filePath = path.join(directory, "jobs.json");
  try {
    let executeCalls = 0;
    let recoveryCalls = 0;
    const manager = createImageJobManager({
      filePath,
      timeoutMs: 1000,
      execute: async (_payload, context) => {
        executeCalls += 1;
        const remoteResult = { data: [{ url: "https://cdn.example/a.png" }] };
        context.report("syncing", { remoteResult });
        return {
          status: 200,
          body: {
            ...remoteResult,
            saved_images: [{ error: "download timeout" }],
            code: "image_sync_failed",
          },
        };
      },
      recover: async (result) => {
        recoveryCalls += 1;
        assert.equal(result.data[0].remote_url || result.data[0].url, "https://cdn.example/a.png");
        return {
          status: 200,
          body: { data: [{ url: "/output/a.png", local_url: "/output/a.png" }] },
        };
      },
    });

    const created = manager.create({ model: "gpt-image-2" }, { boardId: "b", nodeId: "n" });
    const failedSync = await waitForState(manager, created.id, "sync_failed");
    assert.equal(failedSync.result.data[0].local_url, undefined);
    assert.equal(failedSync.code, "image_sync_failed");
    const [first, second] = await Promise.all([manager.recover(created.id), manager.recover(created.id)]);
    assert.equal(first.state, "completed");
    assert.equal(second.state, "completed");
    assert.match(first.result.data[0].local_url, /^\/output\//);
    assert.equal(executeCalls, 1, "recovery must not repeat the paid generation request");
    assert.equal(recoveryCalls, 1, "concurrent recovery must share one download operation");

    const interruptedFile = path.join(directory, "restart.json");
    fs.writeFileSync(interruptedFile, JSON.stringify({
      version: 1,
      jobs: {
        active: { id: "active", state: "running", result: null, apiKey: "must-not-leak" },
        syncing: {
          id: "syncing",
          state: "syncing",
          result: { data: [{ remote_url: "https://cdn.example/during-restart.png" }] },
        },
        sync: {
          id: "sync",
          state: "sync_failed",
          result: { data: [{ remote_url: "https://cdn.example/a.png" }] },
        },
      },
    }));
    const restarted = createImageJobManager({
      filePath: interruptedFile,
      execute: async () => { throw new Error("must not execute"); },
      recover: async () => ({ status: 500, body: {} }),
    });
    assert.equal(restarted.get("active").state, "unknown");
    assert.equal(restarted.get("syncing").state, "sync_failed");
    assert.equal(restarted.get("sync").state, "sync_failed");
    assert.equal(JSON.stringify(restarted.get("active")).includes("must-not-leak"), false);

    const legacyCompletedFile = path.join(directory, "legacy-completed.json");
    fs.writeFileSync(legacyCompletedFile, JSON.stringify({
      version: 1,
      jobs: {
        recoverable: {
          id: "recoverable",
          state: "completed",
          boardId: "legacy-board",
          nodeId: "legacy-node",
          result: {
            data: [{ url: "https://cdn.example/legacy.png", local_url: "https://cdn.example/legacy.png" }],
            saved_images: [{ error: "fetch failed" }],
          },
        },
        valid: {
          id: "valid",
          state: "completed",
          boardId: "legacy-board",
          nodeId: "valid-node",
          result: { data: [{ url: "/output/already-local.png", local_url: "/output/already-local.png" }] },
        },
      },
    }));
    let legacyGenerationCalls = 0;
    let legacyRecoveryCalls = 0;
    const legacyCompleted = createImageJobManager({
      filePath: legacyCompletedFile,
      execute: async () => {
        legacyGenerationCalls += 1;
        throw new Error("legacy repair must not generate again");
      },
      recover: async (result) => {
        legacyRecoveryCalls += 1;
        assert.equal(result.data[0].url, "https://cdn.example/legacy.png");
        return {
          status: 200,
          body: { data: [{ url: "/output/legacy.png", local_url: "/output/legacy.png" }] },
        };
      },
    });
    assert.equal(legacyCompleted.get("recoverable").state, "sync_failed", "legacy fake completion must become recoverable");
    assert.equal(legacyCompleted.get("recoverable").code, "image_sync_failed");
    assert.equal(legacyCompleted.get("valid").state, "completed", "verified local completions must remain completed");
    assert.equal((await legacyCompleted.recover("recoverable")).state, "completed");
    assert.equal(legacyGenerationCalls, 0, "repairing a legacy completion must never repeat generation");
    assert.equal(legacyRecoveryCalls, 1, "legacy repair only downloads the existing remote result once");

    console.log("Image job recovery checks passed.");
  } finally {
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
