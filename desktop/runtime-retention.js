"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inside, readJson, removeInside, runtimeName } = require("./update-files");
const { COMPONENT_ROLLBACK_MARKER } = require("./update-install");
const { effectiveComponentState } = require("./component-state");
const { readRuntimeManifest } = require("./component-rollback");

const DEFAULT_KEEP_RELEASES = 3;
const DEFAULT_KEEP_COMPONENT_ROLLBACKS = 1;
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

  const ready = readOptionalJson(inside(root, ".ai-runtime/updates/ready.json"));
  if (ready) {
    const candidate = runtimeName(String(ready.candidate || ""));
    if (runtimeKind(candidate)) protectedNames.add(candidate);
  }

  const state = effectiveComponentState(root, active);
  const previousHashes = new Set(
    state.components
      .map((component) => String(component.previousHash || "").toLowerCase())
      .filter((hash) => /^[a-f0-9]{64}$/.test(hash)),
  );
  if (previousHashes.size) {
    const byHash = new Map([...previousHashes].map((hash) => [hash, []]));
    for (const runtime of runtimes) {
      if (runtime.name === active) continue;
      let manifest;
      try {
        manifest = readRuntimeManifest(root, runtime.name);
      } catch {
        continue;
      }
      for (const component of manifest?.components || []) {
        if (byHash.has(component.hash)) byHash.get(component.hash).push(runtime);
      }
    }
    for (const candidates of byHash.values()) {
      candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
      if (candidates[0]) protectedNames.add(candidates[0].name);
    }
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
  if (fs.existsSync(inside(portableRoot, ".ai-runtime/updates/install.json"))) {
    return { skipped: "update-in-progress", protected: [], kept: [], removed: [], errors: [] };
  }
  const active = readPointer(portableRoot, ".ai-runtime/.active-runtime", "活动运行时指针");
  if (!active) return { skipped: "active-runtime-missing", protected: [], kept: [], removed: [], errors: [] };

  const runtimes = listRecognizedRuntimes(portableRoot);
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
    if (options.dryRun) {
      removed.push(runtime.name);
      continue;
    }
    try {
      removeInside(portableRoot, `.ai-runtime/versions/${runtime.name}`);
      removed.push(runtime.name);
    } catch (error) {
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
