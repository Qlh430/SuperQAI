"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inside, atomicWrite, readJson, removeInside, runtimeName } = require("./update-files");

const STATE_RELATIVE = ".ai-runtime/components/state.json";
const COMPONENT_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const HASH_RE = /^[a-f0-9]{64}$/i;

function timestamp(value, fallback = new Date().toISOString()) {
  const text = String(value || "");
  return Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : fallback;
}

function normalizeManifest(manifest) {
  if (!manifest || manifest.format !== 1 || manifest.product !== "AI OS" || !Array.isArray(manifest.components)) {
    throw new Error("组件清单格式不受支持。");
  }
  const seen = new Set();
  const components = manifest.components.map((component) => {
    const id = String(component?.id || "");
    const hash = String(component?.hash || "").toLowerCase();
    const version = String(component?.version || "");
    if (!COMPONENT_ID_RE.test(id) || seen.has(id)) throw new Error(`组件标识无效或重复：${id}`);
    if (!HASH_RE.test(hash)) throw new Error(`组件哈希无效：${id}`);
    if (!version) throw new Error(`组件版本为空：${id}`);
    seen.add(id);
    return {
      id,
      label: String(component?.label || id),
      version,
      hash,
      fileCount: Array.isArray(component?.files) ? component.files.length : 0,
    };
  });
  return {
    format: 1,
    product: "AI OS",
    version: String(manifest.version || ""),
    components: components.sort((left, right) => left.id.localeCompare(right.id, "en")),
  };
}

function normalizeComponentRecord(component) {
  const id = String(component?.id || "");
  const hash = String(component?.hash || "").toLowerCase();
  const version = String(component?.version || "");
  if (!COMPONENT_ID_RE.test(id)) throw new Error(`组件状态标识无效：${id}`);
  if (!HASH_RE.test(hash)) throw new Error(`组件状态哈希无效：${id}`);
  if (!version) throw new Error(`组件状态版本为空：${id}`);
  const previousHash = component?.previousHash ? String(component.previousHash).toLowerCase() : null;
  if (previousHash && !HASH_RE.test(previousHash)) throw new Error(`组件上一版哈希无效：${id}`);
  return {
    id,
    label: String(component?.label || id),
    version,
    hash,
    previousVersion: component?.previousVersion ? String(component.previousVersion) : null,
    previousHash,
    installedAt: timestamp(component?.installedAt),
    sourceRuntime: String(component?.sourceRuntime || ""),
    fileCount: Number.isSafeInteger(Number(component?.fileCount)) && Number(component.fileCount) >= 0 ? Number(component.fileCount) : 0,
  };
}

function normalizeState(state) {
  if (!state || state.format !== 1 || state.product !== "AI OS" || !Array.isArray(state.components)) {
    throw new Error("组件状态文件格式不受支持。");
  }
  const seen = new Set();
  const components = state.components.map(normalizeComponentRecord).sort((left, right) => left.id.localeCompare(right.id, "en"));
  for (const component of components) {
    if (seen.has(component.id)) throw new Error(`组件状态标识重复：${component.id}`);
    seen.add(component.id);
  }
  return {
    format: 1,
    product: "AI OS",
    updatedAt: timestamp(state.updatedAt),
    sourceRuntime: String(state.sourceRuntime || ""),
    manifestVersion: String(state.manifestVersion || ""),
    manifestPresent: state.manifestPresent !== false,
    components,
  };
}

function readComponentState(root) {
  try {
    return normalizeState(readJson(inside(root, STATE_RELATIVE)));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`组件状态读取失败：${error.message}`);
  }
}

function readRuntimeComponentManifest(root, runtime) {
  if (!root || !runtime) return null;
  const active = runtimeName(runtime);
  try {
    return normalizeManifest(readJson(inside(root, `.ai-runtime/versions/${active}/resources/app/ai-os-components.json`)));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`运行时组件清单读取失败（${active}）：${error.message}`);
  }
}

function createEmptyComponentState(sourceRuntime, options = {}) {
  return {
    format: 1,
    product: "AI OS",
    updatedAt: timestamp(options.now),
    sourceRuntime: String(sourceRuntime || ""),
    manifestVersion: "",
    manifestPresent: false,
    components: [],
  };
}

function buildComponentState(manifest, previousState, sourceRuntime, options = {}) {
  const normalizedManifest = normalizeManifest(manifest);
  const previous = previousState ? normalizeState(previousState) : { components: [] };
  const previousById = new Map(previous.components.map((component) => [component.id, component]));
  const now = timestamp(options.now);
  const components = normalizedManifest.components.map((component) => {
    const before = previousById.get(component.id);
    const changed = !before || before.hash !== component.hash || before.version !== component.version;
    return {
      id: component.id,
      label: component.label,
      version: component.version,
      hash: component.hash,
      previousVersion: changed ? (before?.version || null) : (before?.previousVersion || null),
      previousHash: changed ? (before?.hash || null) : (before?.previousHash || null),
      installedAt: changed ? now : (before?.installedAt || now),
      sourceRuntime: changed ? String(sourceRuntime || "") : (before?.sourceRuntime || String(sourceRuntime || "")),
      fileCount: component.fileCount,
    };
  });
  return normalizeState({
    format: 1,
    product: "AI OS",
    updatedAt: now,
    sourceRuntime: String(sourceRuntime || ""),
    manifestVersion: normalizedManifest.version,
    manifestPresent: true,
    components,
  });
}

function activeRuntime(root) {
  try {
    return runtimeName(fs.readFileSync(inside(root, ".ai-runtime/.active-runtime"), "utf8").trim());
  } catch {
    return "";
  }
}

function effectiveComponentState(root, runtime = activeRuntime(root), options = {}) {
  const stored = readComponentState(root);
  if (stored) return stored;
  const manifest = readRuntimeComponentManifest(root, runtime);
  return manifest
    ? buildComponentState(manifest, null, runtime, options)
    : createEmptyComponentState(runtime, options);
}

function writeComponentState(root, state) {
  const normalized = normalizeState(state);
  atomicWrite(inside(root, STATE_RELATIVE), normalized);
  return normalized;
}

function transitionDirectory(tx) {
  if (!tx || !/^[a-f0-9]{24}$/.test(String(tx.id || ""))) throw new Error("组件状态事务标识无效。");
  runtimeName(tx.previous);
  runtimeName(tx.candidate);
  return `.ai-runtime/rollback/${tx.id}/components`;
}

function beginComponentTransition(root, tx, options = {}) {
  const relative = transitionDirectory(tx);
  if (fs.existsSync(inside(root, relative))) removeInside(root, relative);
  const state = effectiveComponentState(root, tx.previous, options);
  atomicWrite(inside(root, `${relative}/meta.json`), {
    format: 1,
    id: tx.id,
    previousRuntime: tx.previous,
    candidateRuntime: tx.candidate,
    capturedAt: timestamp(options.now),
  });
  atomicWrite(inside(root, `${relative}/state.json`), state);
  return state;
}

function commitComponentTransition(root, tx, options = {}) {
  const previous = effectiveComponentState(root, tx.previous, options);
  const manifest = readRuntimeComponentManifest(root, tx.candidate);
  const state = manifest
    ? buildComponentState(manifest, previous, tx.candidate, options)
    : createEmptyComponentState(tx.candidate, options);
  return writeComponentState(root, state);
}

function restoreComponentTransition(root, tx) {
  const relative = transitionDirectory(tx);
  const metaFile = inside(root, `${relative}/meta.json`);
  const snapshotFile = inside(root, `${relative}/state.json`);
  let hasMeta = false;
  try {
    const meta = readJson(metaFile);
    if (meta?.id !== tx.id || meta?.previousRuntime !== tx.previous || meta?.candidateRuntime !== tx.candidate) {
      throw new Error("组件状态快照与更新事务不一致。");
    }
    hasMeta = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!hasMeta) {
    if (readComponentState(root)) throw new Error("组件状态快照缺失，已停止自动恢复。");
    return null;
  }
  const state = normalizeState(readJson(snapshotFile));
  return writeComponentState(root, state);
}

function inspectComponentState(root, options = {}) {
  const state = effectiveComponentState(root, options.runtime, options);
  let lastResult = null;
  try {
    const result = readJson(inside(root, ".ai-runtime/updates/result.json"));
    lastResult = {
      status: String(result?.status || ""),
      error: String(result?.error || ""),
      previous: String(result?.previous || ""),
      candidate: String(result?.candidate || ""),
      finishedAt: timestamp(result?.finishedAt),
    };
  } catch {}
  return {
    total: state.components.length,
    updatedAt: state.updatedAt,
    sourceRuntime: state.sourceRuntime,
    manifestVersion: state.manifestVersion,
    manifestPresent: state.manifestPresent,
    components: state.components,
    lastResult,
  };
}

module.exports = {
  STATE_RELATIVE,
  normalizeManifest,
  normalizeState,
  readComponentState,
  readRuntimeComponentManifest,
  createEmptyComponentState,
  buildComponentState,
  effectiveComponentState,
  writeComponentState,
  beginComponentTransition,
  commitComponentTransition,
  restoreComponentTransition,
  inspectComponentState,
};
