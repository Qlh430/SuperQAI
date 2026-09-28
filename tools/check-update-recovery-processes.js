"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const { atomicWrite, inside, removeInside } = require("../desktop/update-files");
const { run, alive } = require("../desktop/update-helper");
const { compileLauncher } = require("./build-electron-portable");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function stop(pid) {
  if (!pid || !alive(pid)) return;
  try { execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "pipe", timeout: 15_000 }); }
  catch {}
}

function put(root, relative, value) {
  atomicWrite(inside(root, relative), value);
}

function createRuntime(root, version, fixtureExecutable) {
  const runtimeRoot = inside(root, `.ai-runtime/versions/${version}`);
  fs.mkdirSync(path.join(runtimeRoot, "resources", "runtime"), { recursive: true });
  fs.copyFileSync(fixtureExecutable, path.join(runtimeRoot, "AI OS Runtime.exe"));
  fs.copyFileSync(process.execPath, path.join(runtimeRoot, "resources", "runtime", "node.exe"));
  return runtimeRoot;
}

async function runUpdateRecoveryProcessChecks() {
  if (process.platform !== "win32") throw new Error("This native process recovery check requires Windows.");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-recovery-process-"));
  const temporaryRealRoot = fs.realpathSync(temporaryRoot);
  const children = [];
  try {
    const sourcePath = path.join(temporaryRoot, "fixture-runtime.cs");
    const fixtureExecutable = path.join(temporaryRoot, "fixture-runtime.exe");
    fs.writeFileSync(sourcePath, `using System; using System.Diagnostics; using System.IO; using System.Threading;
class FixtureRuntime {
  static void Main() {
    var root = Environment.GetEnvironmentVariable("AI_OS_PORTABLE_ROOT");
    if (Environment.GetEnvironmentVariable("AI_OS_FIXTURE_PRELAUNCHED") == "1") {
      File.WriteAllText(Path.Combine(root, "candidate-runtime-started.txt"), Process.GetCurrentProcess().Id.ToString());
      Thread.Sleep(Timeout.Infinite);
      return;
    }
    var active = File.ReadAllText(Path.Combine(root, ".ai-runtime", ".active-runtime")).Trim();
    File.WriteAllText(Path.Combine(root, "launched-" + active + ".txt"), Process.GetCurrentProcess().Id.ToString());
  }
}`);
    compileLauncher({ sourcePath, outputPath: fixtureExecutable });

    const recoveryRoot = path.join(temporaryRoot, "interrupted 中文");
    fs.mkdirSync(recoveryRoot);
    const previous = "1.0.0-win-x64";
    const candidate = "1.1.0-win-x64";
    const id = "ab".repeat(12);
    createRuntime(recoveryRoot, previous, fixtureExecutable);
    const candidateRoot = createRuntime(recoveryRoot, candidate, fixtureExecutable);
    put(recoveryRoot, ".ai-runtime/.active-runtime", `${candidate}\n`);
    put(recoveryRoot, `.ai-runtime/rollback/${id}/data/record.txt`, "snapshot");
    put(recoveryRoot, "data/record.txt", "before candidate");
    put(recoveryRoot, ".ai-runtime/updates/install.json", { format: 1, id, previous, candidate, phase: "starting" });

    const runtimeProcess = spawn(path.join(candidateRoot, "AI OS Runtime.exe"), [], {
      cwd: recoveryRoot,
      env: { ...process.env, AI_OS_PORTABLE_ROOT: recoveryRoot, AI_OS_FIXTURE_PRELAUNCHED: "1" },
      windowsHide: true,
      stdio: "ignore",
    });
    children.push(runtimeProcess);
    const serverScript = path.join(temporaryRoot, "candidate-server.js");
    fs.writeFileSync(serverScript, `const fs=require("node:fs");const path=require("node:path");const root=process.env.AI_OS_PORTABLE_ROOT;fs.writeFileSync(path.join(root,"data","record.txt"),"candidate data");fs.writeFileSync(path.join(root,"candidate-server-started.txt"),String(process.pid));setInterval(()=>{},1000);`);
    const serverProcess = spawn(path.join(candidateRoot, "resources", "runtime", "node.exe"), [serverScript], {
      cwd: recoveryRoot,
      env: { ...process.env, AI_OS_PORTABLE_ROOT: recoveryRoot },
      windowsHide: true,
      stdio: "ignore",
    });
    children.push(serverProcess);
    await waitFor(() => fs.existsSync(path.join(recoveryRoot, "candidate-runtime-started.txt")) && fs.existsSync(path.join(recoveryRoot, "candidate-server-started.txt")), "candidate fixture processes");
    assert.equal(fs.existsSync(inside(recoveryRoot, `.ai-runtime/updates/${id}-process.json`)), false, "fixture deliberately omits the candidate PID report");

    const recovered = await run(recoveryRoot);
    assert.equal(recovered.status, "rolled-back");
    await waitFor(() => !alive(runtimeProcess.pid) && !alive(serverProcess.pid), "candidate processes to stop");
    assert.equal(fs.readFileSync(inside(recoveryRoot, "data/record.txt"), "utf8"), "snapshot");
    assert.equal(fs.readFileSync(inside(recoveryRoot, `.ai-runtime/rollback/${id}/failed-data/record.txt`), "utf8"), "candidate data");
    assert.equal(fs.readFileSync(inside(recoveryRoot, ".ai-runtime/.active-runtime"), "utf8").trim(), previous);
    await waitFor(() => fs.existsSync(path.join(recoveryRoot, `launched-${previous}.txt`)), "previous runtime relaunch marker");

    const confirmedRoot = path.join(temporaryRoot, "confirmed 中文");
    fs.mkdirSync(confirmedRoot);
    createRuntime(confirmedRoot, previous, fixtureExecutable);
    createRuntime(confirmedRoot, candidate, fixtureExecutable);
    put(confirmedRoot, ".ai-runtime/.active-runtime", `${candidate}\n`);
    put(confirmedRoot, "data/record.txt", "confirmed data");
    put(confirmedRoot, ".ai-runtime/updates/install.json", { format: 1, id: "cd".repeat(12), previous, candidate, phase: "confirmed" });
    const confirmed = await run(confirmedRoot);
    assert.equal(confirmed.status, "updated");
    await waitFor(() => fs.existsSync(path.join(confirmedRoot, `launched-${candidate}.txt`)), "confirmed candidate relaunch marker");
    assert.equal(fs.readFileSync(inside(confirmedRoot, "data/record.txt"), "utf8"), "confirmed data");
    console.log("PASS update helper native recovery: path-based candidate process discovery without PID report, failed-data preservation, snapshot restore, old-runtime relaunch, and confirmed candidate relaunch");
  } finally {
    for (const child of children) stop(child.pid);
    if (fs.realpathSync(temporaryRoot) !== temporaryRealRoot || path.dirname(temporaryRealRoot) !== fs.realpathSync(os.tmpdir()) || !path.basename(temporaryRealRoot).startsWith("ai-os-recovery-process-")) throw new Error("Unsafe temporary fixture cleanup refused");
    removeInside(os.tmpdir(),path.basename(temporaryRoot));
  }
}

if (require.main === module) {
  runUpdateRecoveryProcessChecks().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}

module.exports = { runUpdateRecoveryProcessChecks };
