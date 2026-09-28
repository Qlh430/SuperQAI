"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workspace = path.resolve(__dirname, "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-first-run-ui-"));
let checks = 0;

function safeInspection(overrides = {}) {
  return {
    sourceRoot: "C:\\private\\old-project",
    secretApiKey: "sk-private-value",
    sourceKind: "project",
    fileCount: 12,
    totalBytes: 2048,
    databaseCount: 2,
    excludedCount: 1,
    hasEnv: true,
    hasOutput: true,
    hasWorkflows: true,
    ...overrides,
  };
}

function actionQueue(actions) {
  return async () => {
    if (!actions.length) throw new Error("Synthetic setup action queue is empty.");
    return actions.shift();
  };
}

async function check(name, run) {
  await run();
  checks += 1;
  console.log(`PASS ${name}`);
}

async function main() {
  const {
    preparePortableData,
    runPortableSetup,
    translateMigrationError,
  } = require("../desktop/portable-setup");

  await check("failed migration stays in the setup state until the user explicitly chooses fresh", async () => {
    const states = [];
    const result = await runPortableSetup({
      initialSource: "C:\\private\\old-project",
      inspectSource: async () => safeInspection(),
      runMigration: async () => {
        const error = new Error("private database detail");
        error.code = "invalid_database";
        throw error;
      },
      pickSource: async () => "",
      waitForAction: actionQueue([
        { type: "confirmMigration" },
        { type: "fresh" },
      ]),
      update: (state) => states.push(JSON.parse(JSON.stringify(state))),
    });
    assert.deepEqual(result, { action: "fresh" });
    assert.ok(states.some((state) => state.view === "error" && state.error.code === "invalid_database"));
    assert.ok(states.some((state) => state.view === "error" && /数据库/.test(state.error.message)));
    assert.doesNotMatch(JSON.stringify(states), /private database detail|sk-private-value|old-project|C:\\\\private/);
  });

  await check("retry can migrate successfully and waits for the explicit open action", async () => {
    const states = [];
    let attempts = 0;
    const result = await runPortableSetup({
      initialSource: "C:\\private\\old-project",
      inspectSource: async () => safeInspection(),
      runMigration: async () => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error("temporary failure");
          error.code = "source_changed";
          throw error;
        }
        return { ok: true, fileCount: 12, totalBytes: 2048, databaseCount: 2, publishedFileCount: 10 };
      },
      pickSource: async () => "",
      waitForAction: actionQueue([
        { type: "confirmMigration" },
        { type: "retryMigration" },
        { type: "openSystem" },
      ]),
      update: (state) => states.push(JSON.parse(JSON.stringify(state))),
    });
    assert.equal(result.action, "migrated");
    assert.equal(result.report.fileCount, 12);
    assert.equal(attempts, 2);
    assert.ok(states.some((state) => state.view === "success"));
  });

  await check("inspection summaries and errors never expose source paths or secrets", async () => {
    const states = [];
    const inspection = safeInspection();
    const result = await runPortableSetup({
      initialSource: "C:\\private\\old-project",
      inspectSource: async () => inspection,
      runMigration: async () => ({ ok: true, fileCount: 12, totalBytes: 2048, databaseCount: 2 }),
      pickSource: async () => "",
      waitForAction: actionQueue([{ type: "quit" }]),
      update: (state) => states.push(JSON.parse(JSON.stringify(state))),
    });
    assert.deepEqual(result, { action: "quit" });
    const preview = states.find((state) => state.view === "preview");
    assert.ok(preview);
    assert.equal(preview.source.sourceKindLabel, "旧版 AI OS 项目");
    assert.doesNotMatch(JSON.stringify(states), /sourceRoot|secretApiKey|sk-private-value|old-project|private/);
    assert.deepEqual(translateMigrationError({ code: "target_not_empty" }), {
      code: "target_not_empty",
      message: "当前便携目录已经包含业务数据。请使用新解压的便携目录，或选择“直接全新开始”。",
    });
  });

  await check("preparePortableData uses the injected UI and cannot return migrated after a failure", async () => {
    const dataDir = path.join(root, "portable-data");
    fs.mkdirSync(path.join(dataDir, ".logs"), { recursive: true });
    const states = [];
    const actions = [
      { type: "selectMigration" },
      { type: "confirmMigration" },
      { type: "fresh" },
    ];
    const result = await preparePortableData({
      paths: { portableRoot: root, dataDir },
      argv: [],
      createSetupUi: async () => ({
        pickSource: async () => "C:\\private\\old-project",
        waitForAction: actionQueue(actions),
        update: (state) => states.push(JSON.parse(JSON.stringify(state))),
        close() {},
      }),
      inspectSource: async () => safeInspection(),
      runMigration: async () => {
        const error = new Error("private database detail");
        error.code = "invalid_database";
        throw error;
      },
    });
    assert.deepEqual(result, { action: "fresh" });
    assert.ok(states.some((state) => state.view === "error" && state.error.code === "invalid_database"));
    assert.ok(!states.some((state) => state.view === "success"));
    assert.doesNotMatch(JSON.stringify(states), /private database detail|sk-private-value|old-project/);
  });

  await check("hidden --import-from migration failures are tagged and never become a fresh start", async () => {
    const dataDir = path.join(root, "hidden-portable-data");
    fs.mkdirSync(path.join(dataDir, ".logs"), { recursive: true });
    await assert.rejects(
      preparePortableData({
        paths: { portableRoot: root, dataDir },
        argv: ["--hidden", "--import-from", "C:\\private\\old-project"],
        createSetupUi: async () => {
          throw new Error("hidden mode must not create the setup window");
        },
        inspectSource: async () => safeInspection(),
        runMigration: async () => {
          const error = new Error("hidden failure");
          error.code = "invalid_database";
          throw error;
        },
      }),
      (error) => {
        assert.equal(error.code, "invalid_database");
        assert.equal(error.portableSetup, true);
        return true;
      },
    );
  });

  await check("the dedicated setup page and isolated preload expose the required controls", async () => {
    const html = fs.readFileSync(path.join(workspace, "desktop/portable-setup.html"), "utf8");
    const preload = fs.readFileSync(path.join(workspace, "desktop/portable-setup-preload.js"), "utf8");
    const main = fs.readFileSync(path.join(workspace, "desktop/main.js"), "utf8");
    assert.match(html, /id="welcomeView"/);
    assert.match(html, /id="migrationView"/);
    assert.match(html, /id="resultView"/);
    assert.match(html, /迁移旧数据/);
    assert.match(html, /直接全新开始/);
    assert.match(preload, /contextBridge\.exposeInMainWorld\("aiOsSetup"/);
    assert.doesNotMatch(preload, /nodeIntegration/);
    assert.match(main, /const setupResult = await preparePortableData/);
    assert.match(main, /setupResult\.action !== "fresh" && setupResult\.action !== "migrated"/);
  });
}

main().then(() => {
  console.log(`Portable first-run UI checks passed (${checks}).`);
}).catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(() => {
  assert.equal(path.dirname(root), os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});
