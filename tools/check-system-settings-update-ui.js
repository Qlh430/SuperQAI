"use strict";

const assert = require("node:assert/strict");
const settings = require("../system-settings-ui");

function createRoot() {
  const listeners = new Map();
  return {
    ownerDocument: { documentElement: { dataset: {}, style: { setProperty() {} } } },
    innerHTML: "",
    addEventListener(type, listener) { listeners.set(type, listener); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    replaceChildren() { this.innerHTML = ""; },
    async click(datasetKey, value) {
      const target = {
        dataset: { [datasetKey]: value },
        closest(selector) {
          const expected = `[data-${datasetKey.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}]`;
          return selector === expected ? target : null;
        },
      };
      await listeners.get("click")({ target });
    },
  };
}

const request = async path => {
  if (path === "/api/preferences") return { preferences: { appearance: { theme: "system", scale: 1, animations: "full" } } };
  if (path === "/api/system/health") return { ok: true, uptime: 120, freeBytes: 1024, port: 3099 };
  throw new Error(`Unexpected request: ${path}`);
};

(async () => {
  const root = createRoot();
  const calls = [];
  let emitUpdate;
  let unsubscribed = false;
  const hostBridge = {
    async getUpdateStatus() {
      return {
        status: "available",
        currentVersion: "1.0.0",
        availableVersion: "1.1.0",
        notes: '<img src=x onerror="boom"> 修复与改进',
        size: 12 * 1024 * 1024,
        progress: 0,
        error: "",
        componentState: {
          total: 29,
          updatedAt: "2026-09-24T00:00:00.000Z",
          sourceRuntime: "1.0.0-win-x64",
          lastResult: { status: "updated" },
          components: [{
            id: "platform-core",
            label: "系统内核",
            version: "1.0.0-abcdef123456",
            previousVersion: "0.9.0-fedcba654321",
            previousHash: "a".repeat(64),
          }],
        },
      };
    },
    async checkForUpdates() { calls.push("check"); },
    async downloadUpdate() { calls.push("download"); },
    async rollbackComponent(componentId) { calls.push(`rollback:${componentId}`); },
    async restartToUpdate() { calls.push("restart"); },
    onUpdateStatus(callback) { emitUpdate = callback; return () => { unsubscribed = true; }; },
  };
  const app = settings.createSettingsApp({
    root,
    request,
    sessionProvider: () => ({ user: { role: "user", username: "test" } }),
    hostBridge,
    media: { matches: false, addEventListener() {}, removeEventListener() {} },
  });

  await app.load();
  await root.click("settingsNav", "system");
  assert.match(root.innerHTML, /当前版本[\s\S]*1\.0\.0/);
  assert.match(root.innerHTML, /发现新版本[\s\S]*1\.1\.0/);
  assert.match(root.innerHTML, /12 MB/);
  assert.match(root.innerHTML, /29 个活动组件/);
  assert.match(root.innerHTML, /1\.0\.0-win-x64/);
  assert.match(root.innerHTML, /系统内核/);
  assert.match(root.innerHTML, /0\.9\.0-fedcba654321/);
  assert.match(root.innerHTML, /data-component-rollback="platform-core"/);
  assert.doesNotMatch(root.innerHTML, /aaaaaaaaaaaaaaaa/);
  assert.match(root.innerHTML, /&lt;img src=x onerror=&quot;boom&quot;&gt; 修复与改进/);
  assert.doesNotMatch(root.innerHTML, /<img src=x/);
  assert.match(root.innerHTML, /data-update-download/);
  assert.match(root.innerHTML, /下载期间可继续使用；重启时会备份数据并完成更新。/);

  await root.click("componentRollback", "platform-core");
  assert.deepEqual(calls, ["rollback:platform-core"]);
  emitUpdate({
    status: "available",
    currentVersion: "1.0.0",
    availableVersion: "1.1.0",
    componentState: {
      total: 29,
      sourceRuntime: "1.0.0-win-x64",
      components: [{
        id: "platform-core",
        label: "系统内核",
        version: "1.0.0-abcdef123456",
        previousVersion: "0.9.0-fedcba654321",
        previousHash: "a".repeat(64),
      }],
    },
  });
  await root.click("updateDownload", "");
  assert.deepEqual(calls, ["rollback:platform-core", "download"]);

  emitUpdate({ status: "downloading", currentVersion: "1.0.0", availableVersion: "1.1.0", progress: 0.42 });
  assert.match(root.innerHTML, /下载更新[\s\S]*42%/);
  assert.match(root.innerHTML, /aria-valuenow="42"/);

  emitUpdate({ status: "error", currentVersion: "1.0.0", error: '<script>alert("x")<\/script>' });
  assert.match(root.innerHTML, /更新未完成/);
  assert.match(root.innerHTML, /role="alert"/);
  assert.match(root.innerHTML, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(root.innerHTML, /<script>alert/);
  assert.match(root.innerHTML, /data-update-check[\s\S]*重新检查/);
  await root.click("updateCheck", "");
  assert.deepEqual(calls, ["rollback:platform-core", "download", "check"]);

  emitUpdate({ status: "downloaded", currentVersion: "1.0.0", availableVersion: "1.1.0", progress: 1 });
  assert.match(root.innerHTML, /data-update-restart/);
  await root.click("updateRestart", "");
  assert.deepEqual(calls, ["rollback:platform-core", "download", "check", "restart"]);

  emitUpdate({
    status: "ready",
    currentVersion: "1.0.0",
    progress: 1,
    componentRollback: {
      componentId: "platform-core",
      label: "系统内核",
      sourceRuntime: "0.9.0-win-x64",
      fromVersion: "1.0.0-abcdef123456",
      toVersion: "0.9.0-fedcba654321",
    },
  });
  assert.match(root.innerHTML, /系统内核：1\.0\.0-abcdef123456 → 0\.9\.0-fedcba654321/);
  assert.match(root.innerHTML, /重启并应用组件回退/);

  emitUpdate({
    status: "up-to-date",
    currentVersion: "1.0.0",
    componentState: { total: 29, sourceRuntime: "1.0.0-win-x64", lastResult: { status: "rolled-back" } },
  });
  assert.match(root.innerHTML, /上次更新启动失败，已回滚到原组件版本/);

  emitUpdate({ status: "development", currentVersion: "dev" });
  assert.match(root.innerHTML, /开发模式/);
  assert.match(root.innerHTML, /源码运行不会使用在线更新/);

  emitUpdate({ status: "unpublished", currentVersion: "1.0.0" });
  assert.match(root.innerHTML, /暂无已发布更新/);

  app.destroy();
  assert.equal(unsubscribed, true);

  const browserRoot = createRoot();
  const browserApp = settings.createSettingsApp({
    root: browserRoot,
    request,
    sessionProvider: () => ({ user: { role: "user", username: "browser" } }),
    media: { matches: false, addEventListener() {}, removeEventListener() {} },
  });
  await browserApp.load();
  await browserRoot.click("settingsNav", "system");
  assert.match(browserRoot.innerHTML, /在线更新仅在桌面便携版中可用/);
  assert.doesNotMatch(browserRoot.innerHTML, /data-update-download|data-update-restart/);
  browserApp.destroy();

  console.log("System settings update UI checks passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
