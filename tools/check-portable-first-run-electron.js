"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");

const workspace = path.resolve(__dirname, "..");
const { preparePortableData } = require(path.join(workspace, "desktop", "portable-setup.js"));

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-first-run-electron-"));
const dataDir = path.join(temporaryRoot, "portable", "data");
const sourceRoot = path.join(temporaryRoot, "old project");
const screenshotDir = path.join(workspace, "artifacts", "electron-portable");
fs.mkdirSync(path.join(dataDir, ".logs"), { recursive: true });
fs.mkdirSync(path.join(sourceRoot, "data"), { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });
app.disableHardwareAcceleration();
app.setPath("userData", path.join(temporaryRoot, "profile"));

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(60);
  }
  throw lastError || new Error("Electron first-run smoke test timed out.");
}

async function capture(setupWindow, name) {
  const image = await setupWindow.webContents.capturePage();
  fs.writeFileSync(path.join(screenshotDir, `${name}.png`), image.toPNG());
}

async function main() {
  let attempts = 0;
  const setupPromise = preparePortableData({
    paths: { portableRoot: temporaryRoot, dataDir, appRoot: workspace, nodeExecutable: process.execPath },
    BrowserWindow,
    ipcMain,
    dialog: {
      async showOpenDialog() {
        return { canceled: false, filePaths: [sourceRoot] };
      },
    },
    argv: [],
    inspectSource: async () => ({
      sourceRoot: "C:\\private\\old-project",
      secretApiKey: "sk-private-value",
      sourceKind: "project",
      fileCount: 18,
      totalBytes: 4096,
      databaseCount: 2,
      excludedCount: 1,
      hasEnv: true,
      hasOutput: true,
      hasWorkflows: true,
    }),
    runMigration: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("private database detail");
        error.code = "invalid_database";
        throw error;
      }
      return { ok: true, fileCount: 18, totalBytes: 4096, databaseCount: 2, publishedFileCount: 16 };
    },
  });

  const setupWindow = await waitFor(() => BrowserWindow.getAllWindows()[0]);
  await waitFor(() => setupWindow.webContents.executeJavaScript("document.readyState === 'complete'"));
  setupWindow.showInactive();
  setupWindow.setSize(520, 620);
  await delay(250);

  const welcome = await setupWindow.webContents.executeJavaScript(`(() => ({
    text: document.body.innerText,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    buttonHeights: [...document.querySelectorAll("button")]
      .filter((button) => button.getClientRects().length)
      .map((button) => button.getBoundingClientRect().height),
  }))()`);
  assert.match(welcome.text, /迁移旧数据/);
  assert.match(welcome.text, /直接全新开始/);
  assert.ok(welcome.overflow <= 1, `setup page overflows by ${welcome.overflow}px at 520px width`);
  assert.ok(welcome.buttonHeights.every((height) => height >= 44), "all setup buttons must be at least 44px tall");
  await capture(setupWindow, "first-run-welcome");

  await setupWindow.webContents.executeJavaScript("document.querySelector('#migrateChoice').click()");
  await waitFor(async () => /检查完成/.test(await setupWindow.webContents.executeJavaScript("document.body.innerText")));
  const preview = await setupWindow.webContents.executeJavaScript("document.body.innerText");
  assert.match(preview, /18 个文件/);
  assert.match(preview, /数据库\n2 个/);
  assert.doesNotMatch(preview, /C:\\private|sk-private-value|private database detail/);
  await capture(setupWindow, "first-run-preview");

  await setupWindow.webContents.executeJavaScript("document.querySelector('#confirmMigration').click()");
  await waitFor(async () => /迁移没有完成/.test(await setupWindow.webContents.executeJavaScript("document.body.innerText")));
  const failure = await setupWindow.webContents.executeJavaScript("document.body.innerText");
  assert.match(failure, /数据库损坏|WAL/);
  assert.doesNotMatch(failure, /private database detail|C:\\private|sk-private-value/);
  await capture(setupWindow, "first-run-error");

  await setupWindow.webContents.executeJavaScript("document.querySelector('#retryMigration').click()");
  await waitFor(async () => /旧数据已经迁移完成/.test(await setupWindow.webContents.executeJavaScript("document.body.innerText")));
  await capture(setupWindow, "first-run-success");
  await setupWindow.webContents.executeJavaScript("document.querySelector('#openSystem').click()");
  const result = await setupPromise;
  assert.equal(result.action, "migrated");
  assert.equal(attempts, 2);
  console.log("Portable first-run Electron smoke passed: responsive welcome, safe preflight, failure recovery, retry, and explicit open action.");
}

function cleanup() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.destroy();
  }
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
}

app.whenReady().then(main).then(() => {
  cleanup();
  app.exit(0);
}).catch((error) => {
  console.error(error.stack || error);
  cleanup();
  app.exit(1);
});
