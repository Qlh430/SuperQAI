"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { inside, atomicWrite, readJson, copyTree, removeInside, runtimeName, transaction } = require("./update-files");
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
  return directory;
}
function prepareInstall(root, candidate, options = {}) {
  validateRuntime(root, candidate);
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
  atomicWrite(inside(root, ".ai-runtime/updates/result.json"), result);
  // Keep the journal until both the result and cleanup are durable.
  for (const name of ["ready.json", `${tx.id}-health.json`, `${tx.id}-process.json`, "install.json"]) {
    const file=inside(root, `.ai-runtime/updates/${name}`);
    try { fs.unlinkSync(file); } catch(error) {if(error.code!=="ENOENT")throw error;}
  }
  return result;
}
function restore(root, tx) {
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
  try {
    await hooks.waitForExit(tx);
    if (tx.phase === "waiting" || tx.phase === "snapshotting") {
      save("snapshotting");
      const snapshotRelative = `.ai-runtime/rollback/${tx.id}/data`;
      if (fs.existsSync(inside(root, snapshotRelative))) removeInside(root, snapshotRelative);
      (hooks.snapshot || copyTree)(inside(root, "data"), inside(root, snapshotRelative));
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
    }
    const result = finish(root, tx, switched ? "rolled-back" : "error", error.message);
    await hooks.launch(tx.previous, { ...tx, rollback: true });
    return result;
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
module.exports = { REQUIRED_RUNTIME_FILES, COMPONENT_ROLLBACK_MARKER, runtimeReleaseName, validateRuntime, prepareInstall, performInstall, writeCandidateStatus };
