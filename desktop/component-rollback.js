"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { inside, atomicWrite, readJson, copyTree, removeInside, runtimeName } = require("./update-files");
const { effectiveComponentState } = require("./component-state");

const COMPONENT_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const HASH_RE = /^[a-f0-9]{64}$/i;
const COMPONENT_ROLLBACK_MARKER = "--component-rollback-";

function safeRelativePath(value, label = "组件文件") {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/");
  if (!normalized || /^[A-Za-z]:/.test(normalized) || parts.some((part) => !part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part))) {
    throw new Error(`${label}路径不安全：${value}`);
  }
  return normalized;
}

function hashFile(filename) {
  const hash = crypto.createHash("sha256");
  const handle = fs.openSync(filename, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const read = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (!read) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

function validateRuntimeManifest(manifest) {
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
    const files = Array.isArray(component.files) ? component.files : [];
    if (files.length > 100_000) throw new Error(`组件文件数量过多：${id}`);
    const normalizedFiles = files.map((file) => {
      const filePath = safeRelativePath(file?.path);
      const size = Number(file?.size);
      const sha256 = String(file?.sha256 || "").toLowerCase();
      if (!Number.isSafeInteger(size) || size < 0) throw new Error(`组件文件大小无效：${id}/${filePath}`);
      if (!HASH_RE.test(sha256)) throw new Error(`组件文件哈希无效：${id}/${filePath}`);
      return { path: filePath, size, sha256 };
    });
    return { ...component, id, hash, version, files: normalizedFiles };
  });
  return { ...manifest, components };
}

function readRuntimeManifest(root, runtime) {
  const active = runtimeName(runtime);
  try {
    return validateRuntimeManifest(readJson(inside(root, `.ai-runtime/versions/${active}/resources/app/ai-os-components.json`)));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function activeRuntime(root) {
  try {
    return runtimeName(fs.readFileSync(inside(root, ".ai-runtime/.active-runtime"), "utf8").trim());
  } catch {
    throw Object.assign(new Error("当前便携版没有可用的活动运行时。"), { code: "component_rollback_unavailable" });
  }
}

function verifyComponentSnapshot(root, runtime, component) {
  const appRoot = inside(root, `.ai-runtime/versions/${runtime}/resources/app`);
  for (const file of component.files) {
    const filename = inside(appRoot, file.path);
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size !== file.size || hashFile(filename) !== file.sha256) {
      throw Object.assign(new Error(`组件快照校验失败：${component.id}/${file.path}`), { code: "component_snapshot_invalid" });
    }
  }
}

function findRollbackSource(root, componentId, previousHash, active) {
  const versionsRoot = inside(root, ".ai-runtime/versions");
  const candidates = [];
  for (const entry of fs.readdirSync(versionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === active) continue;
    const runtime = runtimeName(entry.name);
    let manifest;
    try {
      manifest = readRuntimeManifest(root, runtime);
    } catch {
      continue;
    }
    const component = manifest?.components.find((item) => item.id === componentId);
    if (!component || component.hash !== previousHash) continue;
    candidates.push({
      runtime,
      component,
      mtimeMs: fs.statSync(inside(root, `.ai-runtime/versions/${runtime}`)).mtimeMs,
    });
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  for (const candidate of candidates) {
    try {
      verifyComponentSnapshot(root, candidate.runtime, candidate.component);
      return candidate;
    } catch {}
  }
  throw Object.assign(new Error("找不到可用的上一版组件快照，可能已被清理或校验失败。"), { code: "component_snapshot_missing" });
}

function copyComponentSnapshot(root, active, candidateApp, currentComponent, sourceComponent) {
  const sourceApp = inside(root, `.ai-runtime/versions/${sourceComponent.runtime}/resources/app`);
  const sourcePaths = new Set(sourceComponent.component.files.map((file) => file.path));
  for (const file of currentComponent.files) {
    if (sourcePaths.has(file.path)) continue;
    try {
      fs.rmSync(inside(candidateApp, file.path), { force: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const file of sourceComponent.component.files) {
    const target = inside(candidateApp, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(inside(sourceApp, file.path), target);
  }
}

function prepareComponentRollback(root, componentId, options = {}) {
  const id = String(componentId || "");
  if (!COMPONENT_ID_RE.test(id)) throw Object.assign(new Error("组件标识无效。"), { code: "invalid_component" });
  const active = activeRuntime(root);
  const state = effectiveComponentState(root, active);
  const current = state.components.find((component) => component.id === id);
  if (!current) throw Object.assign(new Error("该组件不在当前活动状态中。"), { code: "component_not_active" });
  if (!current.previousHash) throw Object.assign(new Error("该组件没有记录可回退的上一版本。"), { code: "no_previous_component" });
  const source = findRollbackSource(root, id, current.previousHash, active);
  const currentManifest = readRuntimeManifest(root, active);
  const currentManifestComponent = currentManifest?.components.find((component) => component.id === id);
  if (!currentManifestComponent) throw Object.assign(new Error("当前运行时缺少该组件清单。"), { code: "component_manifest_missing" });

  const token = crypto.randomBytes(6).toString("hex");
  const candidate = `${options.version || readRuntimeManifestVersion(root, active)}-win-x64${COMPONENT_ROLLBACK_MARKER}${token}`;
  const destination = inside(root, `.ai-runtime/versions/${candidate}`);
  if (fs.existsSync(destination)) throw new Error("组件回滚运行时名称冲突。");
  const updatesRoot = inside(root, ".ai-runtime/updates");
  fs.mkdirSync(updatesRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(updatesRoot, "rollback-stage-"));
  const candidateRoot = path.join(staging, candidate);
  try {
    copyTree(inside(root, `.ai-runtime/versions/${active}`), candidateRoot);
    const candidateApp = path.join(candidateRoot, "resources", "app");
    copyComponentSnapshot(root, active, candidateApp, currentManifestComponent, source);
    const components = currentManifest.components.map((component) => component.id === id ? source.component : component);
    const mergedManifest = {
      ...currentManifest,
      generatedAt: new Date().toISOString(),
      runtimeRevision: {
        kind: "component-rollback",
        componentId: id,
        sourceRuntime: source.runtime,
        fromHash: current.hash,
        toHash: source.component.hash,
        createdAt: new Date().toISOString(),
      },
      components,
    };
    atomicWrite(path.join(candidateApp, "ai-os-components.json"), mergedManifest);
    require("./update-install").validateRuntime(staging, candidate, "");
    fs.renameSync(candidateRoot, destination);
    return {
      candidate,
      version: readRuntimeManifestVersion(root, active),
      notes: "",
      componentRollback: {
        componentId: id,
        label: current.label || id,
        sourceRuntime: source.runtime,
        fromVersion: current.version,
        fromHash: current.hash,
        toVersion: source.component.version,
        toHash: source.component.hash,
      },
    };
  } finally {
    removeInside(root, path.relative(root, staging).split(path.sep).join("/"));
  }
}

function readRuntimeManifestVersion(root, runtime) {
  const metadata = readJson(inside(root, `.ai-runtime/versions/${runtime}/resources/app/package.json`));
  if (!metadata || typeof metadata.version !== "string" || !metadata.version) throw new Error("运行时版本元数据无效。");
  return metadata.version;
}

module.exports = {
  COMPONENT_ROLLBACK_MARKER,
  safeRelativePath,
  readRuntimeManifest,
  findRollbackSource,
  prepareComponentRollback,
};
