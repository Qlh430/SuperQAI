"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inside, readJson, removeInside, runtimeName } = require("./update-files");
const { COMPONENT_ROLLBACK_MARKER } = require("./update-install");
const { effectiveComponentState } = require("./component-state");
const { findRollbackSource } = require("./component-rollback");

// Current, previous and referenced component snapshots are protected separately.
const DEFAULT_KEEP_RELEASES = 0;
const DEFAULT_KEEP_COMPONENT_ROLLBACKS = 0;
const DEFAULT_MINIMUM_AGE_MS = 10 * 60_000;
const RUNTIME_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?-win-x64(?:--component-rollback-[a-f0-9]{12})?$/;

function runtimeKind(name) {
  const value = String(name || "");
  if (!RUNTIME_RE.test(value)) return "";
  return value.includes(COMPONENT_ROLLBACK_MARKER) ? "component-rollback" : "release";
}

function readPointer(root, relative, label) {
  const file = inside(root, relative);
  try {
    return runtimeName(fs.readFileSync(file, "utf8").trim());
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw Object.assign(new Error(`${label}无效：${error.message}`), { code: "runtime_retention_pointer_invalid" });
  }
}

function readOptionalJson(file) {
  try {
    return readJson(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw Object.assign(new Error(`运行时保留状态无效：${error.message}`), { code: "runtime_retention_state_invalid" });
  }
}

function listRecognizedRuntimes(root) {
  const versionsRoot = inside(root, ".ai-runtime/versions");
  let entries;
  try {
    entries = fs.readdirSync(versionsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const runtimes = [];
  for (const entry of entries) {
    let stat;
    try {
      stat = fs.lstatSync(path.join(versionsRoot, entry.name));
    } catch {
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
    let name;
    try {
      name = runtimeName(entry.name);
    } catch {
      continue;
    }
    const kind = runtimeKind(name);
    if (!kind) continue;
    runtimes.push({ name, kind, mtimeMs: stat.mtimeMs });
  }
  return runtimes;
}

function prepareProtectedRuntimes(root, runtimes, active) {
  const protectedNames = new Set();
  const previous = readPointer(root, ".ai-runtime/.previous-runtime", "上一运行时指针");
  if (previous) protectedNames.add(previous);
  const diagnostic = readOptionalJson(inside(root, "data/.logs/runtime-diagnostics.json"));
  if (diagnostic?.runtimeName) protectedNames.add(runtimeName(diagnostic.runtimeName));

  const ready = readOptionalJson(inside(root, ".ai-runtime/updates/ready.json"));
  if (ready) {
    const candidate = runtimeName(String(ready.candidate || ""));
    if (runtimeKind(candidate)) protectedNames.add(candidate);
    if (ready.componentRollback?.sourceRuntime) protectedNames.add(runtimeName(ready.componentRollback.sourceRuntime));
  }
  const result = readOptionalJson(inside(root, ".ai-runtime/updates/result.json"));
  if (result) for (const name of [result.previous, result.candidate]) {
    if (name) protectedNames.add(runtimeName(name));
  }
  // Recovery databases may require the matching old program to inspect them.
  const rollback = require("./rollback-retention");
  const retained = rollback.pruneRollbackSnapshots(root, { dryRun: true });
  for (const id of retained.kept) {
    const meta = readOptionalJson(inside(root, `.ai-runtime/rollback/${id}/components/meta.json`));
    if (meta) for (const name of [meta.previousRuntime, meta.candidateRuntime]) {
      if (name) protectedNames.add(runtimeName(name));
    }
  }

  const state = effectiveComponentState(root, active);
  for (const component of state.components) {
    if (!/^[a-f0-9]{64}$/i.test(String(component.previousHash || ""))) continue;
    // Use the rollback resolver's real file verification; a newer corrupt
    // manifest must not displace the only usable older component snapshot.
    try { protectedNames.add(findRollbackSource(root, component.id, component.previousHash, active).runtime); }
    catch (error) { if (error.code !== "component_snapshot_missing") throw error; }
  }

  if (active) protectedNames.add(active);
  return protectedNames;
}

function retentionCount(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return fallback;
  return Math.min(number, maximum);
}

function pruneRuntimeSnapshots(root, options = {}) {
  const portableRoot = path.resolve(root);
  if (fs.existsSync(inside(portableRoot, ".ai-runtime/updates/install.json")) ||
      fs.existsSync(inside(portableRoot, ".ai-runtime/updates/helper.json"))) {
    return { skipped: "update-in-progress", protected: [], kept: [], removed: [], errors: [] };
  }
  const active = readPointer(portableRoot, ".ai-runtime/.active-runtime", "活动运行时指针");
  if (!active) return { skipped: "active-runtime-missing", protected: [], kept: [], removed: [], errors: [] };

  const runtimes = listRecognizedRuntimes(portableRoot);
  const previous = readPointer(portableRoot, ".ai-runtime/.previous-runtime", "上一运行时指针");
  if (runtimes.length > 1 && (!previous || !fs.existsSync(inside(portableRoot, `.ai-runtime/versions/${previous}`)))) {
    return { skipped: "previous-runtime-unverified", protected: [active], kept: runtimes.map(runtime => runtime.name).sort(), removed: [], errors: [] };
  }
  const protectedNames = prepareProtectedRuntimes(portableRoot, runtimes, active);
  const keepReleases = retentionCount(options.keepReleases, DEFAULT_KEEP_RELEASES, 100);
  const keepComponentRollbacks = retentionCount(options.keepComponentRollbacks, DEFAULT_KEEP_COMPONENT_ROLLBACKS, 100);
  const minimumAgeMs = retentionCount(options.minimumAgeMs, DEFAULT_MINIMUM_AGE_MS, 365 * 24 * 60 * 60_000);
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const keepNames = new Set(protectedNames);

  for (const [kind, count] of [["release", keepReleases], ["component-rollback", keepComponentRollbacks]]) {
    runtimes
      .filter((runtime) => runtime.kind === kind && !keepNames.has(runtime.name))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, count)
      .forEach((runtime) => keepNames.add(runtime.name));
  }
  for (const runtime of runtimes) {
    if (now - runtime.mtimeMs < minimumAgeMs) keepNames.add(runtime.name);
  }

  const removed = [];
  const errors = [];
  const candidates = runtimes
    .filter((runtime) => !keepNames.has(runtime.name))
    .sort((left, right) => left.mtimeMs - right.mtimeMs);
  for (const runtime of candidates) {
    try {
      // Unknown extras, embedded data and links must survive automatic retention.
      require("./update-install").validateRuntime(portableRoot, runtime.name);
      if (options.dryRun) { removed.push(runtime.name); continue; }
      removeInside(portableRoot, `.ai-runtime/versions/${runtime.name}`);
      removed.push(runtime.name);
    } catch (error) {
      keepNames.add(runtime.name);
      errors.push({ name: runtime.name, message: String(error.message || error) });
    }
  }

  return {
    skipped: "",
    protected: [...protectedNames].sort(),
    kept: [...keepNames].sort(),
    removed,
    errors,
  };
}

module.exports = {
  DEFAULT_KEEP_RELEASES,
  DEFAULT_KEEP_COMPONENT_ROLLBACKS,
  DEFAULT_MINIMUM_AGE_MS,
  runtimeKind,
  pruneRuntimeSnapshots,
};
