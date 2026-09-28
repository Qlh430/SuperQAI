"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { createComfyService } = require("../comfyui-service");

async function main() {
  const python = process.env.AI_OS_TEST_PYTHON || (() => {
    const result = spawnSync("python", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, "Set AI_OS_TEST_PYTHON to an installed Python; no runtime is installed by this test.");
    return result.stdout.trim();
  })();
  assert.ok(path.isAbsolute(python) && fs.statSync(python).isFile());
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-comfy-process-"));
  fs.copyFileSync(path.join(__dirname, "fixtures/comfyui/main.py"), path.join(temp, "main.py"));
  const settings = new Map();
  const service = createComfyService({
    settings: { getSetting: key => settings.get(key), setSetting: (key, value) => settings.set(key, value) },
    probeTimeoutMs: 500,
  });
  const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const unrelated = spawn(python, ["-c", "import time; time.sleep(120)"], { windowsHide: true, stdio: "ignore" });
  let helperPid;
  try {
    const portProbe = net.createServer();
    const port = await new Promise(resolve => portProbe.listen(0, "127.0.0.1", () => resolve(portProbe.address().port)));
    await new Promise(resolve => portProbe.close(resolve));
    await service.save({ mode: "local", rootDirectory: temp, pythonPath: python, mainPath: path.join(temp, "main.py"), port });
    const start = await service.start();
    assert.equal(start.runtime.state, "starting");
    assert.ok(start.runtime.pid);
    let status;
    for (let i = 0; i < 60; i++) {
      status = await service.status();
      if (status.runtime.state === "running") break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(status.runtime.state, "running", status.runtime.logs);
    helperPid = Number(status.runtime.logs.match(/FIXTURE_HELPER_PID=(\d+)/)?.[1]);
    assert.ok(helperPid && alive(helperPid), "fixture's helper started");
    assert.equal((await service.test()).ok, true);
    await service.stop();
    assert.equal(alive(start.runtime.pid), false, "owned Python process is stopped");
    if (process.platform === "win32") assert.equal(alive(helperPid), false, "owned Windows process tree is stopped");
    assert.equal(alive(unrelated.pid), true, "unrelated Python was not touched");
    helperPid = null;
    const restart = await service.start();
    for (let i = 0; i < 60; i++) {
      status = await service.status();
      if (status.runtime.state === "running") break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(status.runtime.state, "running", status.runtime.logs);
    helperPid = Number(status.runtime.logs.match(/FIXTURE_HELPER_PID=(\d+)/)?.[1]);
    await service.close();
    assert.equal(alive(restart.runtime.pid), false, "service shutdown stops child");
    if (process.platform === "win32") assert.equal(alive(helperPid), false);
    assert.equal(alive(unrelated.pid), true);
    console.log("ComfyUI process checks passed: real Python fixture starts, becomes ready, stops/restarts; shutdown clears owned Windows tree and preserves unrelated Python.");
  } finally {
    try {
      await service.close();
    } finally {
      try {
        if (helperPid && alive(helperPid)) process.kill(helperPid);
      } finally {
        if (unrelated.exitCode === null) {
          await new Promise(resolve => { unrelated.once("exit", resolve); unrelated.kill(); });
        }
        fs.rmSync(temp, { recursive: true, force: true });
      }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
