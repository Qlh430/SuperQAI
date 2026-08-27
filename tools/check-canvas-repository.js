const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCanvasRepository } = require("../canvas-repository");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-repository-"));
  const dbPath = path.join(root, "canvas.db");
  const repository = createCanvasRepository({ dbPath, requestTimeoutMs: 5000 });

  try {
    const ready = await repository.ready();
    assert.equal(ready.schemaVersion, 4);
    assert.deepEqual(await repository.quickCheck(), { ok: true, result: "ok" });

    await assert.rejects(
      () => repository.invoke("missingMethod", {}),
      (error) => error.code === "unknown_repository_method" && /unknown repository method/i.test(error.message),
    );

    await repository.close();
    await repository.close();
    await assert.rejects(
      () => repository.invoke("ready", {}),
      (error) => error.code === "repository_closed",
    );

    assert.ok(fs.existsSync(dbPath));
  } finally {
    await repository.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log("Canvas repository lifecycle checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
