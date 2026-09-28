"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { inside, atomicWrite, removeInside } = require("../desktop/update-files");
const {
  TRANSACTION_ID_RE,
  pruneRollbackSnapshots,
} = require("../desktop/rollback-retention");

function transaction(root, id, mtimeMs, failed = false) {
  const relative = `.ai-runtime/rollback/${id}`;
  atomicWrite(inside(root, `${relative}/data/record.txt`), `${id}-snapshot`);
  atomicWrite(inside(root, `${relative}/components/state.json`), { id });
  if (failed) atomicWrite(inside(root, `${relative}/failed-data/record.txt`), `${id}-failed`);
  fs.utimesSync(inside(root, relative), new Date(mtimeMs), new Date(mtimeMs));
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-rollback-retention-"));
  try {
    const now = Date.parse("2026-09-24T12:00:00.000Z");
    const ids = {
      latestSuccess: "10".repeat(12),
      olderSuccess: "20".repeat(12),
      oldestSuccess: "30".repeat(12),
      latestFailure: "40".repeat(12),
      olderFailure: "50".repeat(12),
      oldestFailure: "60".repeat(12),
      young: "70".repeat(12),
    };

    transaction(root, ids.latestSuccess, now - 60_000);
    transaction(root, ids.olderSuccess, now - 2 * 60_000);
    transaction(root, ids.oldestSuccess, now - 3 * 60_000);
    transaction(root, ids.latestFailure, now - 4 * 60_000, true);
    transaction(root, ids.olderFailure, now - 5 * 60_000, true);
    transaction(root, ids.oldestFailure, now - 6 * 60_000, true);
    transaction(root, ids.young, now - 1_000);
    atomicWrite(inside(root, ".ai-runtime/rollback/not-a-transaction/data/keep.txt"), "unknown");
    atomicWrite(inside(root, `.ai-runtime/rollback/${"g".repeat(24)}/extra.txt`), "unknown-id");
    atomicWrite(inside(root, ".ai-runtime/updates/result.json"), {
      id: ids.latestSuccess,
      status: "updated",
      previous: "1.0.0-win-x64",
      candidate: "1.0.1-win-x64",
    });

    assert.equal(TRANSACTION_ID_RE.test(ids.latestSuccess), true);
    assert.equal(TRANSACTION_ID_RE.test("not-a-transaction"), false);

    atomicWrite(inside(root, ".ai-runtime/updates/install.json"), { format: 1 });
    assert.equal(pruneRollbackSnapshots(root).skipped, "update-in-progress");
    fs.unlinkSync(inside(root, ".ai-runtime/updates/install.json"));

    const dryRun = pruneRollbackSnapshots(root, {
      keepSuccessful: 1,
      keepFailed: 1,
      minimumAgeMs: 0,
      now,
      dryRun: true,
    });
    assert.deepEqual(dryRun.protected, [ids.latestSuccess]);
    for (const id of [
      ids.latestSuccess,
      ids.latestFailure,
      ids.young,
    ]) {
      assert.ok(dryRun.kept.includes(id), `${id} must be retained`);
    }
    assert.ok(dryRun.removed.includes(ids.olderSuccess));
    assert.ok(dryRun.removed.includes(ids.oldestSuccess));
    assert.ok(dryRun.removed.includes(ids.olderFailure));
    assert.ok(dryRun.removed.includes(ids.oldestFailure));
    assert.equal(dryRun.removed.includes("not-a-transaction"), false);
    assert.equal(dryRun.removed.includes("g".repeat(24)), false);

    const ageGuard = pruneRollbackSnapshots(root, {
      keepSuccessful: 0,
      keepFailed: 0,
      minimumAgeMs: 10 * 60_000,
      now: now - 30_000,
      dryRun: true,
    });
    assert.ok(ageGuard.kept.includes(ids.latestFailure));
    assert.ok(ageGuard.kept.includes(ids.young));

    const result = pruneRollbackSnapshots(root, {
      keepSuccessful: 1,
      keepFailed: 1,
      minimumAgeMs: 0,
      now,
    });
    assert.deepEqual(result.errors, []);
    assert.equal(fs.existsSync(inside(root, `.ai-runtime/rollback/${ids.olderSuccess}`)), false);
    assert.equal(fs.existsSync(inside(root, `.ai-runtime/rollback/${ids.oldestSuccess}`)), false);
    assert.equal(fs.existsSync(inside(root, `.ai-runtime/rollback/${ids.olderFailure}`)), false);
    assert.equal(fs.existsSync(inside(root, `.ai-runtime/rollback/${ids.oldestFailure}`)), false);
    assert.equal(fs.existsSync(inside(root, `.ai-runtime/rollback/${ids.latestSuccess}`)), true);
    assert.equal(fs.existsSync(inside(root, `.ai-runtime/rollback/${ids.latestFailure}`)), true);
    assert.equal(fs.existsSync(inside(root, `.ai-runtime/rollback/${ids.young}`)), true);
    assert.equal(fs.existsSync(inside(root, ".ai-runtime/rollback/not-a-transaction")), true);
    assert.equal(fs.existsSync(inside(root, `.ai-runtime/rollback/${"g".repeat(24)}`)), true);

    atomicWrite(inside(root, ".ai-runtime/updates/result.json"), "{ invalid json");
    assert.throws(() => pruneRollbackSnapshots(root), /回滚保留状态无效/);

    console.log("PASS rollback retention: in-progress skip, latest transaction protection, bounded success/failure history, age guard, dry run, unknown entry preservation and invalid state refusal");
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    removeInside(os.tmpdir(), path.basename(root));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
