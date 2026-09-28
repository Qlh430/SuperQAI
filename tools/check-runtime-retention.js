"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { inside, atomicWrite, removeInside } = require("../desktop/update-files");
const { runtimeKind, pruneRuntimeSnapshots } = require("../desktop/runtime-retention");

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeRuntime(root, name, mtimeMs, componentHash = "") {
  const runtimeRoot = `.ai-runtime/versions/${name}`;
  fs.mkdirSync(inside(root, runtimeRoot), { recursive: true });
  if (componentHash) {
    atomicWrite(inside(root, `${runtimeRoot}/resources/app/ai-os-components.json`), {
      format: 1,
      product: "AI OS",
      version: "0.8.5",
      platform: "win32",
      arch: "x64",
      components: [{
        id: "platform-core",
        label: "系统内核",
        version: "0.8.5-fixture",
        hash: componentHash,
        files: [],
      }],
    });
  }
  fs.utimesSync(inside(root, runtimeRoot), new Date(mtimeMs), new Date(mtimeMs));
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-runtime-retention-"));
  try {
    const now = Date.parse("2026-09-24T12:00:00.000Z");
    const olderSourceHash = hash("older-source-component");
    const currentHash = hash("current-component");
    const previousHash = hash("previous-component");

    writeRuntime(root, "1.0.0-win-x64", now - 1_000);
    writeRuntime(root, "0.9.5-win-x64", now - 2_000);
    writeRuntime(root, "0.9.0-win-x64", now - 3_000);
    writeRuntime(root, "0.8.5-win-x64", now - 4_000, olderSourceHash);
    writeRuntime(root, "0.7.0-win-x64", now - 5_000);
    writeRuntime(root, "1.0.0-win-x64--component-rollback-aaaaaaaaaaaa", now - 6_000);
    writeRuntime(root, "1.0.0-win-x64--component-rollback-bbbbbbbbbbbb", now - 7_000);
    writeRuntime(root, "custom-runtime", now - 8_000);
    writeRuntime(root, "0.6.0-win-x64", now - 30_000);

    atomicWrite(inside(root, ".ai-runtime/.active-runtime"), "1.0.0-win-x64\n");
    atomicWrite(inside(root, ".ai-runtime/.previous-runtime"), "0.9.0-win-x64\n");
    atomicWrite(inside(root, ".ai-runtime/components/state.json"), {
      format: 1,
      product: "AI OS",
      updatedAt: "2026-09-24T11:00:00.000Z",
      sourceRuntime: "1.0.0-win-x64",
      manifestVersion: "1.0.0",
      components: [{
        id: "platform-core",
        label: "系统内核",
        version: "1.0.0-current",
        hash: currentHash,
        previousVersion: "0.8.5-fixture",
        previousHash: olderSourceHash,
        installedAt: "2026-09-24T11:00:00.000Z",
        sourceRuntime: "1.0.0-win-x64",
        fileCount: 0,
      }],
    });

    assert.equal(runtimeKind("1.0.0-win-x64"), "release");
    assert.equal(runtimeKind("1.0.0-win-x64--component-rollback-aaaaaaaaaaaa"), "component-rollback");
    assert.equal(runtimeKind("custom-runtime"), "");

    atomicWrite(inside(root, ".ai-runtime/updates/install.json"), { format: 1 });
    assert.equal(pruneRuntimeSnapshots(root).skipped, "update-in-progress");
    fs.unlinkSync(inside(root, ".ai-runtime/updates/install.json"));

    const dryRun = pruneRuntimeSnapshots(root, {
      keepReleases: 1,
      keepComponentRollbacks: 1,
      minimumAgeMs: 0,
      now,
      dryRun: true,
    });
    assert.deepEqual(dryRun.protected, [
      "0.8.5-win-x64",
      "0.9.0-win-x64",
      "1.0.0-win-x64",
    ]);
    assert.ok(dryRun.kept.includes("0.9.5-win-x64"), "one recent release must be kept");
    assert.ok(dryRun.kept.includes("1.0.0-win-x64--component-rollback-aaaaaaaaaaaa"), "one recent rollback candidate must be kept");
    assert.ok(dryRun.removed.includes("0.7.0-win-x64"));
    assert.ok(dryRun.removed.includes("0.6.0-win-x64"));
    assert.ok(dryRun.removed.includes("1.0.0-win-x64--component-rollback-bbbbbbbbbbbb"));
    assert.equal(dryRun.removed.includes("custom-runtime"), false, "unknown runtimes must not be pruned");

    const recent = pruneRuntimeSnapshots(root, {
      keepReleases: 0,
      keepComponentRollbacks: 0,
      minimumAgeMs: 10 * 60_000,
      now: now - 15_000,
      dryRun: true,
    });
    assert.ok(recent.kept.includes("0.9.5-win-x64"), "young unprotected runtimes must survive the race window");

    const readyCandidate = "0.5.0-win-x64";
    writeRuntime(root, readyCandidate, now - 100_000);
    atomicWrite(inside(root, ".ai-runtime/updates/ready.json"), {
      candidate: readyCandidate,
      version: "0.5.0",
    });
    const withPrepared = pruneRuntimeSnapshots(root, {
      keepReleases: 0,
      keepComponentRollbacks: 0,
      minimumAgeMs: 0,
      now,
      dryRun: true,
    });
    assert.ok(withPrepared.protected.includes(readyCandidate), "a prepared update candidate must be protected");
    fs.unlinkSync(inside(root, ".ai-runtime/updates/ready.json"));

    const result = pruneRuntimeSnapshots(root, {
      keepReleases: 1,
      keepComponentRollbacks: 1,
      minimumAgeMs: 0,
      now,
    });
    assert.deepEqual(result.errors, []);
    assert.equal(fs.existsSync(inside(root, ".ai-runtime/versions/0.7.0-win-x64")), false);
    assert.equal(fs.existsSync(inside(root, ".ai-runtime/versions/0.6.0-win-x64")), false);
    assert.equal(fs.existsSync(inside(root, ".ai-runtime/versions/1.0.0-win-x64--component-rollback-bbbbbbbbbbbb")), false);
    assert.equal(fs.existsSync(inside(root, ".ai-runtime/versions/custom-runtime")), true);
    assert.equal(fs.existsSync(inside(root, ".ai-runtime/versions/0.9.0-win-x64")), true);
    assert.equal(fs.existsSync(inside(root, ".ai-runtime/versions/0.8.5-win-x64")), true);

    atomicWrite(inside(root, ".ai-runtime/.previous-runtime"), "../bad\n");
    assert.throws(() => pruneRuntimeSnapshots(root), /上一运行时指针/);
    console.log("PASS runtime retention: protected active/previous/component sources, bounded release and rollback history, age guard, prepared-update protection and unknown runtime preservation");
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    removeInside(os.tmpdir(), path.basename(root));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
