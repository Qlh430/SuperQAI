"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { inside, atomicWrite, readJson, copyTree, hashFile, removeInside, runtimeName, transaction } = require("./update-files");
const componentState = require("./component-state");

const REQUIRED_RUNTIME_FILES = ["AI OS Runtime.exe", "resources.pak", "icudtl.dat", "resources/runtime/node.exe", "resources/app/package.json", "resources/app/server.js", "resources/app/index.html", "resources/app/desktop/main.js", "resources/app/desktop/preload.js", "resources/app/desktop/dev-reload.js", "resources/app/desktop/service-readiness.js", "resources/app/desktop/update-helper.js", "resources/app/desktop/update-install.js", "resources/app/desktop/update-files.js", "resources/app/desktop/component-state.js", "resources/app/desktop/component-rollback.js", "resources/app/desktop/runtime-retention.js", "resources/app/desktop/rollback-retention.js"];
const COMPONENT_ROLLBACK_MARKER = "--component-rollback-";

function runtimeReleaseName(candidate) {
  const name = runtimeName(candidate);
  const markerIndex = name.lastIndexOf(COMPONENT_ROLLBACK_MARKER);
  if (markerIndex < 0) return name;
  const token = name.slice(markerIndex + COMPONENT_ROLLBACK_MARKER.length);
  if (!/^[a-f0-9]{12}$/.test(token)) throw Error("Invalid component rollback runtime name");
  return name.slice(0, markerIndex);
}

function validateRuntime(root, candidate, prefix = ".ai-runtime/versions/") {
  const releaseName = runtimeReleaseName(candidate);
  if (!releaseName.endsWith("-win-x64")) throw Error("Invalid runtime release name");
  const directory = inside(root, `${prefix}${candidate}`);
  for (const name of REQUIRED_RUNTIME_FILES) {
    if (!fs.statSync(inside(directory, name)).isFile()) throw Error(`更新运行时缺少文件：${name}`);
  }
  const metadata = readJson(inside(directory, "resources/app/package.json"));
  if (`${metadata.version}-win-x64` !== releaseName || metadata.main !== "desktop/main.js") throw Error("更新运行时版本或入口与清单不符。");
  for (const name of ["data", "resources/app/data", "resources/app/.env", "resources/app/output"]) {
    if (fs.existsSync(inside(directory, name))) throw Error("更新包不能包含业务数据。");
  }
  require("./update-validation").validateCandidate(directory, readJson(inside(directory, "resources/app/ai-os-components.json")));
  return directory;
}
const UPDATE_SPACE_MARGIN = 128 * 1024 * 1024;
const DATABASE_FILES = ["system.sqlite", "canvas.db"];
function assertAvailableSpace(requiredBytes, availableBytes) {
  const required = Math.max(0, Math.ceil(Number(requiredBytes) || 0));
  const available = Number(availableBytes);
  if (!Number.isFinite(available) || available < required) {
    const needed = (required / 1024 ** 3).toFixed(2);
    const free = Number.isFinite(available) ? (Math.max(0, available) / 1024 ** 3).toFixed(2) : "未知";
    throw Error(`磁盘空间不足，更新至少需要约 ${needed} GB，可用空间 ${free} GB。请释放空间后重试；更新尚未开始。`);
  }
  return available;
}
function portableFreeBytes(root) {
  const stat = fs.statfsSync(root);
  return stat.bavail * stat.bsize;
}
function databaseBytes(data) {
  return DATABASE_FILES.reduce((total, name) => {
    const file = path.join(data, name);
    const bytes = ["", "-wal", "-shm"].reduce((size, suffix) => {
      const candidate = `${file}${suffix}`;
      return size + (fs.existsSync(candidate) ? fs.statSync(candidate).size : 0);
    }, 0);
    // Legacy provider migration may create its own system DB snapshot at startup.
    return total + bytes * (name === "system.sqlite" ? 2 : 1);
  }, 0);
}
function snapshotDatabases(data, destination) {
  const { DatabaseSync } = require("node:sqlite");
  fs.mkdirSync(destination, { recursive: true });
  const copied = [];
  for (const name of DATABASE_FILES) {
    const sourcePath = path.join(data, name);
    if (!fs.existsSync(sourcePath)) continue;
    if (!fs.lstatSync(sourcePath).isFile()) throw Error(`数据库快照源不是普通文件：${name}`);
    const targetPath = path.join(destination, name);
    const escaped = targetPath.replace(/'/g, "''");
    const db = new DatabaseSync(sourcePath, { timeout: 5000, readOnly: true });
    try {
      db.exec(`VACUUM INTO '${escaped}'`);
      const check = new DatabaseSync(targetPath, { readOnly: true });
      try {
        if (check.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") throw Error(`数据库快照校验失败：${name}`);
      } finally { check.close(); }
    } finally { db.close(); }
    copied.push(name);
  }
  if (!copied.length) throw Error("找不到可保护的 Portable 数据库，已停止更新。");
  atomicWrite(path.join(destination, "manifest.json"), { format: 1, files: copied });
  return copied;
}
function restoreDatabases(data, snapshot) {
  const manifest = readJson(path.join(snapshot, "manifest.json"));
  if (manifest.format !== 1 || !Array.isArray(manifest.files) || !manifest.files.length ||
      manifest.files.some(name => !DATABASE_FILES.includes(name))) throw Error("更新数据库快照清单无效，已停止自动恢复。");
  const { DatabaseSync } = require("node:sqlite");
  for (const name of manifest.files) {
    const saved = path.join(snapshot, name);
    if (!fs.lstatSync(saved).isFile()) throw Error(`更新数据库快照缺失：${name}`);
    const check = new DatabaseSync(saved, { readOnly: true });
    try {
      if (check.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") throw Error(`更新数据库快照校验失败：${name}`);
    } finally { check.close(); }
  }
  fs.mkdirSync(data, { recursive: true });
  for (const name of manifest.files) {
    const saved = path.join(snapshot, name);
    const target = path.join(data, name);
    const failed = path.join(snapshot, `failed-${name}`);
    const hasSidecar = ["-wal", "-shm"].some(suffix => fs.existsSync(`${target}${suffix}`));
    if (fs.existsSync(target) && !hasSidecar && hashFile(target) === hashFile(saved)) continue;
    for (const suffix of ["", "-wal", "-shm"]) {
      const current = `${target}${suffix}`, preserved = `${failed}${suffix}`;
      if (fs.existsSync(current)) {
        let destination = preserved;
        for (let attempt = 1; fs.existsSync(destination); attempt += 1) destination = path.join(snapshot, `retry-${attempt}-${path.basename(failed)}${suffix}`);
        fs.renameSync(current, destination);
      }
    }
    const temporary = `${target}.update-restore`;
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
    fs.copyFileSync(saved, temporary, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temporary, target);
  }
}
function requiredInstallSpace(root) {
  return databaseBytes(inside(root, "data")) + UPDATE_SPACE_MARGIN;
}
function prepareInstall(root, candidate, options = {}) {
  const directory = validateRuntime(root, candidate);
  require("./update-validation").verifyNativeCompatibility(directory, readJson(inside(directory, "resources/app/ai-os-components.json")));
  assertAvailableSpace(requiredInstallSpace(root), portableFreeBytes(root));
  const previous = runtimeName(fs.readFileSync(inside(root, ".ai-runtime/.active-runtime"), "utf8").trim());
  if (previous === candidate) throw Error("当前版本已经激活。");
  const file = inside(root, ".ai-runtime/updates/install.json");
  if (fs.existsSync(file)) throw Error("已有更新正在安装。");
  const tx = { format: 1, id: crypto.randomBytes(12).toString("hex"), previous, candidate, parentPid: options.parentPid || process.pid, serverPid: options.serverPid || null, hidden: Boolean(options.hidden), phase: "waiting", createdAt: new Date().toISOString() };
  atomicWrite(file, tx);
  return tx;
}
function finish(root, tx, status, error) {
  const result = { status, previous: tx.previous, candidate: tx.candidate, id: tx.id, error: error || null, finishedAt: new Date().toISOString() };
  const preserved = `.ai-runtime/rollback/${tx.id}/failed-data`;
  const databasePath = `.ai-runtime/rollback/${tx.id}/database`;
  const hasFailedDatabases = DATABASE_FILES.some(name => fs.existsSync(inside(root, `${databasePath}/failed-${name}`)));
  if (fs.existsSync(inside(root, preserved)) || hasFailedDatabases) {
    result.recovery = { automaticDeletion:false, merged:false };
    if (fs.existsSync(inside(root, preserved))) result.recovery.dataPath = preserved;
    if (hasFailedDatabases) result.recovery.databasePath = databasePath;
    result.error = hasFailedDatabases
      ? `${error || '更新失败'} 已恢复上一版本。更新期间的数据库保存在 ${path.join(root, databasePath)}，请保留整个目录，不要直接覆盖当前数据库。`
      : `${error || '更新失败'} 已恢复上一版本。更新期间的数据已单独保留在 ${path.join(root, preserved)}。请保留整个目录，不要直接覆盖当前 data；可在独立副本中恢复访问。`;
    atomicWrite(inside(root, `.ai-runtime/rollback/${tx.id}/RECOVERY.txt`), hasFailedDatabases
      ? '上一版本已恢复；Portable data 目录及生成媒体保持原位。\n数据库快照保留更新前状态；failed-*.sqlite 和对应 sidecar 保留更新期间的数据库状态，不会自动删除。\n如需恢复检查，请先正常退出 AI OS 并复制整个安装目录到新的独立副本，只在副本中操作；不要将单个数据库直接覆盖回原安装。\n'
      : '上一版本已恢复；当前 data 是更新前快照。\nfailed-data 保留更新期间的全部数据，未与当前数据库自动合并，且不会自动清理。\n恢复时请先正常退出 AI OS，复制整个安装目录到新的独立目录，再仅在该副本中把 data 改名为 data-before-recovery，并将 failed-data 的完整副本作为该副本的 data。使用兼容该数据格式的运行时打开；失败时保留原件寻求支持。禁止将单个数据库直接覆盖回原安装。\n');
  }
  atomicWrite(inside(root, ".ai-runtime/updates/result.json"), result);
  // Keep the journal until both the result and cleanup are durable.
  for (const name of ["ready.json", `${tx.id}-health.json`, `${tx.id}-process.json`, "install.json"]) {
    const file=inside(root, `.ai-runtime/updates/${name}`);
    try { fs.unlinkSync(file); } catch(error) {if(error.code!=="ENOENT")throw error;}
  }
  return result;
}
function restore(root, tx) {
  if (tx.rollbackFormat === "sqlite-v1") {
    restoreDatabases(inside(root, "data"), inside(root, `.ai-runtime/rollback/${tx.id}/database`));
    atomicWrite(inside(root, ".ai-runtime/.active-runtime"), `${tx.previous}\n`);
    return;
  }
  const data = inside(root, "data");
  const base = `.ai-runtime/rollback/${tx.id}`;
  const failed = inside(root, `${base}/failed-data`);
  const snapshot = inside(root, `${base}/data`);
  if (!fs.existsSync(snapshot)) throw Error("更新数据快照缺失，已停止自动恢复。");
  if (!fs.existsSync(failed) && fs.existsSync(data)) fs.renameSync(data, failed);
  if (!fs.existsSync(data)) {
    const temporary = inside(root, `${base}/restore-data`);
    if (fs.existsSync(temporary)) removeInside(root, `${base}/restore-data`);
    copyTree(snapshot, temporary);
    fs.renameSync(temporary, data);
  }
  atomicWrite(inside(root, ".ai-runtime/.active-runtime"), `${tx.previous}\n`);
}
// The helper supplies process operations. File transaction logic stays executable in isolation.
async function performInstall(root, hooks) {
  const tx = transaction(root);
  const recoveringConfirmed = tx.phase === "confirmed";
  const save = phase => {
    const next = { ...tx, phase };
    atomicWrite(inside(root, ".ai-runtime/updates/install.json"), next);
    tx.phase = phase;
  };
  let candidate;
  let oldExited = false;
  try {
    await hooks.waitForExit(tx);
    oldExited = true;
    if (tx.phase === "waiting" || tx.phase === "snapshotting") {
      tx.rollbackFormat = "sqlite-v1";
      save("snapshotting");
      const snapshotRelative = `.ai-runtime/rollback/${tx.id}/database`;
      if (fs.existsSync(inside(root, snapshotRelative))) removeInside(root, snapshotRelative);
      assertAvailableSpace(requiredInstallSpace(root), portableFreeBytes(root));
      snapshotDatabases(inside(root, "data"), inside(root, snapshotRelative));
      save("snapshotted");
      componentState.beginComponentTransition(root, tx);
      validateRuntime(root, tx.candidate);
      atomicWrite(inside(root, ".ai-runtime/.previous-runtime"), `${tx.previous}\n`);
      save("switching");
      atomicWrite(inside(root, ".ai-runtime/.active-runtime"), `${tx.candidate}\n`);
      save("starting");
      candidate = await hooks.launch(tx.candidate, tx);
      await hooks.waitForReady(candidate, tx);
      componentState.commitComponentTransition(root, tx);
      save("confirmed");
    } else if (tx.phase !== "confirmed") {
      throw Error("上次更新被中断，正在恢复上一版本。");
    }
    const result = finish(root, tx, "updated");
    if (recoveringConfirmed) await hooks.launch(tx.candidate, { ...tx, rollback: true });
    return result;
  } catch (error) {
    // The old process still owns the lock and data. Never start a duplicate or
    // discard the journal when its exit acknowledgement has not arrived.
    if (!oldExited) throw error;
    // Once health was confirmed, new data belongs to the new runtime. Keep the journal
    // for cleanup recovery instead of starting old code against migrated data.
    if (tx.phase === "confirmed") throw error;
    const switched = ["switching", "starting", "restoring"].includes(tx.phase);
    if (switched) {
      // Never replace data until every process that might write it has exited.
      await hooks.stopCandidate(candidate, tx);
      save("restoring");
      restore(root, tx);
      componentState.restoreComponentTransition(root, tx);
    } else if (tx.rollbackFormat === "sqlite-v1") {
      const partial = inside(root, `.ai-runtime/rollback/${tx.id}/database`);
      if (fs.existsSync(partial)) removeInside(root, `.ai-runtime/rollback/${tx.id}/database`);
    }
    const recoveryState = { ...tx, candidate:tx.previous, rollback:true };
    const recovery = await hooks.launch(tx.previous, recoveryState);
    await hooks.waitForReady(recovery, recoveryState);
    return finish(root, tx, switched ? "rolled-back" : "error", error.message);
  }
}
function writeCandidateStatus(root, candidate, state, values = {}) {
  const id = process.env.AI_OS_UPDATE_ID;
  if (!root || !id) return false;
  let tx;
  try { tx = transaction(root); } catch (error) { if (error.code === "ENOENT") return false; throw error; }
  if (tx.id !== id || tx.candidate !== candidate || tx.phase !== "starting") return false;
  atomicWrite(inside(root, `.ai-runtime/updates/${id}-${state}.json`), { id, candidate, pid:process.pid, ...values });
  return true;
}
module.exports = { REQUIRED_RUNTIME_FILES, COMPONENT_ROLLBACK_MARKER, UPDATE_SPACE_MARGIN, runtimeReleaseName, validateRuntime, prepareInstall, performInstall, writeCandidateStatus, assertAvailableSpace, portableFreeBytes, snapshotDatabases, restoreDatabases, requiredInstallSpace };
