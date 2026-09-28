"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { inside, atomicWrite, readJson, removeInside } = require("../desktop/update-files");
const {
  STATE_RELATIVE,
  readComponentState,
  readRuntimeComponentManifest,
  effectiveComponentState,
  beginComponentTransition,
  commitComponentTransition,
  restoreComponentTransition,
  inspectComponentState,
} = require("../desktop/component-state");

function hash(character) {
  return character.repeat(64);
}

function component(id, version, hashValue) {
  return {
    id,
    label: `${id} fixture`,
    version,
    hash: hashValue,
    files: [{ path: `${id}.js`, size: 1, sha256: hash("f") }],
  };
}

function manifest(version, components) {
  return { format: 1, product: "AI OS", version, platform: "win32", arch: "x64", components };
}

function writeRuntime(root, runtime, value) {
  const file = `.ai-runtime/versions/${runtime}/resources/app/ai-os-components.json`;
  atomicWrite(inside(root, file), value);
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-component-state-"));
  try {
    const previous = "1.0.0-win-x64";
    const candidate = "1.1.0-win-x64";
    const tx = { format: 1, id: "ab".repeat(12), previous, candidate };
    writeRuntime(root, previous, manifest("1.0.0", [
      component("alpha", "1.0.0-alpha", hash("a")),
      component("beta", "1.0.0-beta", hash("b")),
    ]));
    writeRuntime(root, candidate, manifest("1.1.0", [
      component("alpha", "1.1.0-alpha", hash("c")),
      component("beta", "1.0.0-beta", hash("b")),
      component("gamma", "1.1.0-gamma", hash("d")),
    ]));

    assert.equal(readRuntimeComponentManifest(root, previous).components.length, 2);
    const baseline = effectiveComponentState(root, previous, { now: "2026-01-01T00:00:00.000Z" });
    assert.equal(baseline.components.length, 2);
    assert.equal(baseline.sourceRuntime, previous);
    assert.equal(readComponentState(root), null, "runtime manifest may seed state without writing it");

    const snapshot = beginComponentTransition(root, tx, { now: "2026-01-02T00:00:00.000Z" });
    assert.equal(snapshot.components.length, 2);
    assert.equal(readJson(inside(root, `.ai-runtime/rollback/${tx.id}/components/meta.json`)).candidateRuntime, candidate);
    assert.equal(readComponentState(root), null, "starting a transaction must not activate component state");

    const committed = commitComponentTransition(root, tx, { now: "2026-01-03T00:00:00.000Z" });
    assert.equal(committed.components.length, 3);
    assert.equal(committed.sourceRuntime, candidate);
    const alpha = committed.components.find((item) => item.id === "alpha");
    const beta = committed.components.find((item) => item.id === "beta");
    const gamma = committed.components.find((item) => item.id === "gamma");
    assert.equal(alpha.previousVersion, "1.0.0-alpha");
    assert.equal(alpha.previousHash, hash("a"));
    assert.equal(beta.previousVersion, null);
    assert.equal(gamma.previousVersion, null);
    assert.equal(readComponentState(root).manifestVersion, "1.1.0");

    const restored = restoreComponentTransition(root, tx);
    assert.equal(restored.sourceRuntime, previous);
    assert.equal(restored.components.find((item) => item.id === "alpha").version, "1.0.0-alpha");
    assert.equal(restored.components.some((item) => item.id === "gamma"), false);

    commitComponentTransition(root, tx, { now: "2026-01-04T00:00:00.000Z" });
    atomicWrite(inside(root, ".ai-runtime/updates/result.json"), {
      status: "rolled-back",
      error: "fixture startup failure",
      previous,
      candidate,
      finishedAt: "2026-01-04T00:01:00.000Z",
    });
    const inspected = inspectComponentState(root);
    assert.equal(inspected.total, 3);
    assert.equal(inspected.lastResult.status, "rolled-back");
    assert.equal(inspected.lastResult.error, "fixture startup failure");

    atomicWrite(inside(root, STATE_RELATIVE), { format: 1, product: "AI OS", components: [{ id: "../bad" }] });
    assert.throws(() => readComponentState(root), /组件状态/);
    fs.unlinkSync(inside(root, STATE_RELATIVE));

    const missing = path.join(root, "missing");
    fs.mkdirSync(missing);
    const missingState = inspectComponentState(missing);
    assert.equal(missingState.total, 0);
    assert.equal(missingState.manifestPresent, false);
    console.log("PASS component state: seed from runtime manifest, previous version/hash, transactional commit, rollback and last-result reporting");
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    removeInside(os.tmpdir(), path.basename(root));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
