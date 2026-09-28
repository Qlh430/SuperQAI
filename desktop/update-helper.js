"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const { inside, atomicWrite, readJson, transaction } = require("./update-files");
const { performInstall } = require("./update-install");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function alive(pid) { if (!Number.isSafeInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
function ownsProcess(pid, executable) {
  if (!alive(pid)) return false;
  if (process.platform !== "win32") return true;
  const actual = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; $p.ExecutablePath`], {encoding:"utf8",windowsHide:true,timeout:10_000}).trim();
  try { return fs.realpathSync.native(actual).toLowerCase() === fs.realpathSync.native(executable).toLowerCase(); } catch { return false; }
}
function processesAt(executables) {
  if (process.platform !== "win32") return [];
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @(Get-CimInstance Win32_Process -Filter \"Name = 'AI OS Runtime.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ExecutablePath) | ConvertTo-Json -Compress"], {encoding:"utf8",windowsHide:true,timeout:15_000}).trim();
  const targets = executables.map(file => fs.realpathSync.native(file).toLowerCase());
  return (output ? [].concat(JSON.parse(output)) : []).filter(item => {
    try { return targets.includes(fs.realpathSync.native(item.ExecutablePath).toLowerCase()); } catch { return false; }
  }).map(item => Number(item.ProcessId));
}
async function waitExit(pid, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (alive(pid)) { if (Date.now() >= deadline) throw Error("等待旧进程退出超时，更新未切换。"); await delay(150); }
}
async function run(root) {
  root = fs.realpathSync(root);
  const lock = inside(root, ".ai-runtime/updates/helper.json");
  if (fs.existsSync(lock)) {
    const previous = readJson(lock);
    if (ownsProcess(previous.pid, process.execPath)) return;
    fs.unlinkSync(lock);
  }
  const handle = fs.openSync(lock, "wx");
  fs.writeFileSync(handle, JSON.stringify({pid:process.pid})); fs.closeSync(handle);
  process.send?.({type:"ready"});
  process.disconnect?.();
  const tx = transaction(root);
  const runtimeExe = name => inside(root, `.ai-runtime/versions/${name}/AI OS Runtime.exe`);
  const nodeExe = name => inside(root, `.ai-runtime/versions/${name}/resources/runtime/node.exe`);
  let launched;
  const hooks = {
    async waitForExit(state) {
      if (ownsProcess(state.parentPid, runtimeExe(state.previous))) await waitExit(state.parentPid);
      if (ownsProcess(state.serverPid, nodeExe(state.previous))) await waitExit(state.serverPid);
      // Electron's renderer children can release profile handles slightly after its parent exits.
      await delay(500);
    },
    async launch(version, state) {
      const env = {...process.env, AI_OS_PORTABLE_ROOT:root}; delete env.ELECTRON_RUN_AS_NODE;
      if (state.rollback) delete env.AI_OS_UPDATE_ID; else env.AI_OS_UPDATE_ID = state.id;
      const child = spawn(runtimeExe(version), ["--initialize", ...(state.hidden ? ["--hidden"] : [])], {cwd:root,env,windowsHide:true,detached:true,stdio:"ignore"});
      await new Promise((resolve,reject) => { child.once("spawn", resolve); child.once("error", reject); });
      child.unref(); launched = child;
      if (!state.rollback) atomicWrite(inside(root, `.ai-runtime/updates/${state.id}-process.json`), {id:state.id,candidate:version,pid:child.pid});
      return child;
    },
    async waitForReady(child, state) {
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        if (!alive(child.pid)) throw Error("新版本在启动检查完成前退出。");
        try {
          const report = readJson(inside(root, `.ai-runtime/updates/${state.id}-health.json`));
          if (report.id === state.id && report.candidate === state.candidate && report.pid === child.pid && alive(report.serverPid)) return;
        } catch {}
        await delay(200);
      }
      throw Error("新版本启动检查超时。");
    },
    async stopCandidate(child, state) {
      let report = {};
      try { report = readJson(inside(root, `.ai-runtime/updates/${state.id}-process.json`)); } catch {}
      const discovered = processesAt([runtimeExe(state.candidate), nodeExe(state.candidate)]);
      const pids = [...new Set([child?.pid || report.pid, report.serverPid, ...discovered].filter(Boolean))];
      // Confirm the executable before acting on persisted PIDs after an interrupted update.
      for (const pid of pids) if (ownsProcess(pid, runtimeExe(state.candidate)) || ownsProcess(pid, nodeExe(state.candidate))) {
        if (process.platform === "win32") execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {windowsHide:true,stdio:"pipe",timeout:15_000});
        else process.kill(pid);
        await waitExit(pid);
      }
      await delay(500);
    },
  };
  try { return await performInstall(root, hooks); }
  finally {
    if (fs.existsSync(lock) && readJson(lock).pid === process.pid) fs.unlinkSync(lock);
  }
}
if (require.main === module) run(process.argv[2]).catch(error => {
  try { atomicWrite(inside(process.argv[2], ".ai-runtime/updates/helper-error.json"), {error:error.message,at:new Date().toISOString()}); } catch {}
  process.exitCode = 1;
});
module.exports = { run, alive };
