"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { inside, atomicWrite, readJson, removeInside } = require("../desktop/update-files");
const { prepareComponentRollback, readRuntimeManifest } = require("../desktop/component-rollback");
const { REQUIRED_RUNTIME_FILES, validateRuntime, runtimeReleaseName } = require("../desktop/update-install");
const { writeComponentState } = require("../desktop/component-state");
const { createUpdater } = require("../desktop/updater");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeFile(root, relative, content) {
  const target = inside(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function component(id, version, files) {
  const records = files.map(([filePath, content]) => ({
    path: filePath,
    size: Buffer.byteLength(content),
    sha256: sha256(content),
  }));
  return {
    id,
    label: `${id} fixture`,
    version,
    hash: sha256(JSON.stringify(records)),
    files: records,
  };
}

function manifest(version, components) {
  return { format: 1, product: "AI OS", version, platform: "win32", arch: "x64", components };
}

function writeRuntime(root, runtime, componentValue) {
  const runtimeRoot = `.ai-runtime/versions/${runtime}`;
  for (const relative of REQUIRED_RUNTIME_FILES) {
    const target = `${runtimeRoot}/${relative}`;
    if (relative === "resources/app/package.json") {
      writeFile(root, target, `${JSON.stringify({ name: "ai-os", productName: "AI OS", version: "1.0.0", main: "desktop/main.js" }, null, 2)}\n`);
    } else if (!relative.startsWith("resources/app/")) {
      writeFile(root, target, "fixture\n");
    } else {
      writeFile(root, target, "fixture\n");
    }
  }
  for (const file of componentValue.files) {
    const content = file.path === "server.js" && componentValue.version.includes("old")
      ? "old server\n"
      : file.path === "server.js" ? "active server\n" : `${file.path}\n`;
    writeFile(root, `${runtimeRoot}/resources/app/${file.path}`, content);
  }
  writeFile(root, `${runtimeRoot}/resources/app/ai-os-components.json`, `${JSON.stringify(manifest("1.0.0", [componentValue]), null, 2)}\n`);
}

function stateFor(componentValue, previous) {
  return {
    format: 1,
    product: "AI OS",
    updatedAt: "2026-09-24T00:00:00.000Z",
    sourceRuntime: "1.0.0-win-x64",
    manifestVersion: "1.0.0",
    components: [{
      id: componentValue.id,
      label: componentValue.label,
      version: componentValue.version,
      hash: componentValue.hash,
      previousVersion: previous?.version || null,
      previousHash: previous?.hash || null,
      installedAt: "2026-09-24T00:00:00.000Z",
      sourceRuntime: "1.0.0-win-x64",
      fileCount: componentValue.files.length,
    }],
  };
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-component-rollback-"));
  const active = "1.0.0-win-x64";
  const oldRuntime = "1.0.0-win-x64--previous";
  const currentComponent = component("platform-core", "1.0.0-current", [
    ["server.js", "active server\n"],
    ["removed.js", "removed.js\n"],
  ]);
  const oldComponent = component("platform-core", "0.9.0-old", [
    ["server.js", "old server\n"],
    ["old-only.js", "old-only.js\n"],
  ]);
  writeRuntime(root, active, currentComponent);
  writeRuntime(root, oldRuntime, oldComponent);
  writeFile(root, ".ai-runtime/.active-runtime", `${active}\n`);
  writeComponentState(root, stateFor(currentComponent, oldComponent));
  return { root, active, oldRuntime, currentComponent, oldComponent };
}

(async () => {
  const fixture = createFixture();
  const { root, active, currentComponent, oldComponent } = fixture;
  try {
    assert.throws(() => prepareComponentRollback(root, "../platform-core"), /组件标识/);

    writeComponentState(root, stateFor(currentComponent, { ...oldComponent, hash: "f".repeat(64) }));
    assert.throws(() => prepareComponentRollback(root, "platform-core"), /找不到可用的上一版组件快照/);
    writeComponentState(root, stateFor(currentComponent, oldComponent));

    const rolledBack = prepareComponentRollback(root, "platform-core");
    assert.match(rolledBack.candidate, /^1\.0\.0-win-x64--component-rollback-[a-f0-9]{12}$/);
    assert.equal(rolledBack.componentRollback.toVersion, oldComponent.version);
    assert.equal(fs.readFileSync(inside(root, ".ai-runtime/.active-runtime"), "utf8").trim(), active, "preparing a rollback must not switch the active runtime");
    assert.equal(fs.readFileSync(inside(root, `.ai-runtime/versions/${active}/resources/app/server.js`), "utf8"), "active server\n");
    assert.equal(fs.existsSync(inside(root, `.ai-runtime/versions/${active}/resources/app/removed.js`)), true);

    const candidateApp = inside(root, `.ai-runtime/versions/${rolledBack.candidate}/resources/app`);
    assert.equal(fs.readFileSync(inside(candidateApp, "server.js"), "utf8"), "old server\n");
    assert.equal(fs.readFileSync(inside(candidateApp, "old-only.js"), "utf8"), "old-only.js\n");
    assert.equal(fs.existsSync(inside(candidateApp, "removed.js")), false, "rollback must remove files absent from the old component");
    assert.equal(readRuntimeManifest(root, rolledBack.candidate).components[0].hash, oldComponent.hash);
    validateRuntime(root, rolledBack.candidate);
    assert.equal(runtimeReleaseName(rolledBack.candidate), "1.0.0-win-x64");

    const corruptedRuntime = "1.0.0-win-x64--corrupted";
    const corruptedComponent = component("platform-core", "0.8.0-corrupted", [
      ["corrupt.js", "expected\n"],
    ]);
    writeRuntime(root, corruptedRuntime, corruptedComponent);
    fs.writeFileSync(inside(root, `.ai-runtime/versions/${corruptedRuntime}/resources/app/corrupt.js`), "changed\n");
    writeComponentState(root, stateFor(currentComponent, corruptedComponent));
    assert.throws(() => prepareComponentRollback(root, "platform-core"), /找不到可用的上一版组件快照/);
    writeComponentState(root, stateFor(currentComponent, oldComponent));

    let restarted = "";
    const updater = createUpdater({
      portableRoot: root,
      currentVersion: "1.0.0",
      onRestart: async (candidate) => { restarted = candidate; },
    });
    const ready = await updater.rollbackComponent("platform-core");
    assert.equal(ready.status, "ready", ready.error);
    assert.equal(ready.componentRollback.componentId, "platform-core");
    assert.equal(ready.componentRollback.toVersion, oldComponent.version);
    assert.equal(fs.readFileSync(inside(root, ".ai-runtime/.active-runtime"), "utf8").trim(), active);
    const readyFile = readJson(inside(root, ".ai-runtime/updates/ready.json"));
    assert.equal(readyFile.version, "1.0.0");
    assert.equal(readyFile.componentRollback.componentId, "platform-core");
    validateRuntime(root, readyFile.candidate);

    const recovered = createUpdater({
      portableRoot: root,
      currentVersion: "1.0.0",
      onRestart: async (candidate) => { restarted = candidate; },
    });
    assert.equal(recovered.getStatus().status, "ready", "same-version component rollback ready state must be recoverable");
    assert.equal(recovered.getStatus().componentRollback.componentId, "platform-core");
    await recovered.restart();
    assert.equal(restarted, readyFile.candidate);

    console.log("PASS component rollback: snapshot lookup, replacement and deletion, active-runtime safety, invalid/missing snapshot failures, and same-version restart recovery");
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    removeInside(os.tmpdir(), path.basename(root));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
