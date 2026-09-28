"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { inspectLegacyProject } = require("./portable-migration");

const ACTION_CHANNEL = "portable-setup:action";
const GET_STATE_CHANNEL = "portable-setup:get-state";
const STATE_CHANNEL = "portable-setup:state";
const ACTION_TYPES = new Set([
  "selectMigration",
  "confirmMigration",
  "retryMigration",
  "chooseAnother",
  "fresh",
  "openSystem",
  "quit",
]);

const ERROR_MESSAGES = Object.freeze({
  invalid_arguments: "启动参数不完整。请重新打开 AI OS，或按说明重新填写迁移命令。",
  invalid_source: "选中的目录不是有效的旧 AI OS 项目。请选择包含 data 文件夹的项目根目录，不要选择 data 本身。",
  source_changed: "旧项目在迁移过程中发生了变化。请完全退出旧版 AI OS，确认文件不再写入后重试。",
  unsupported_source_layout: "旧项目的 .env 使用了非标准存储路径，暂时无法自动迁移。请先把旧数据整理到默认目录。",
  invalid_database: "旧项目的数据库损坏或 WAL 文件不完整。请先修复或恢复完整数据库，再重试迁移。",
  missing_provider_key: "旧项目缺少 data/security/provider-master.key，无法解密接口密钥。请从同一旧项目恢复该文件。",
  invalid_provider_key: "旧项目的 provider-master.key 与加密数据库不匹配。请恢复同一份数据库和主密钥后重试。",
  target_not_empty: "当前便携目录已经包含业务数据。请使用新解压的便携目录，或选择“直接全新开始”。",
  migration_busy: "另一个迁移任务仍在运行，或上次中断留下了锁。请完全退出 AI OS 后重试。",
  migration_rollback_failed: "迁移已经停止，但部分临时文件未能清理。请保留旧项目，并改用新解压的便携目录。",
  verification_failed: "迁移副本没有通过文件校验。请检查目标磁盘空间和文件系统，然后重试。",
  source_collision: "旧项目中存在会互相覆盖的文件。请先整理重复的 data、output、workflows 或 .env 文件。",
  unsafe_path: "旧项目或目标目录包含不安全的链接路径。迁移已停止，旧目录没有被修改。",
});

function hasBusinessData(dataDir) {
  return fs.existsSync(dataDir) && fs.readdirSync(dataDir).some((name) => ![".desktop", ".logs", ".tmp"].includes(name));
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let unit = -1;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unit]}`;
}

function toSafeInspectionSummary(inspection = {}) {
  const sourceKind = inspection.sourceKind === "portable" ? "portable" : "project";
  return Object.freeze({
    sourceKind,
    sourceKindLabel: sourceKind === "portable" ? "AI OS 便携版" : "旧版 AI OS 项目",
    fileCount: Math.max(0, Number(inspection.fileCount) || 0),
    totalBytes: Math.max(0, Number(inspection.totalBytes) || 0),
    totalSizeLabel: formatBytes(inspection.totalBytes),
    databaseCount: Math.max(0, Number(inspection.databaseCount) || 0),
    excludedCount: Math.max(0, Number(inspection.excludedCount) || 0),
    hasEnv: Boolean(inspection.hasEnv),
    hasOutput: Boolean(inspection.hasOutput),
    hasWorkflows: Boolean(inspection.hasWorkflows),
  });
}

function toSafeReport(report = {}) {
  return Object.freeze({
    fileCount: Math.max(0, Number(report.fileCount) || 0),
    totalBytes: Math.max(0, Number(report.totalBytes) || 0),
    totalSizeLabel: formatBytes(report.totalBytes),
    databaseCount: Math.max(0, Number(report.databaseCount) || 0),
    publishedFileCount: Math.max(0, Number(report.publishedFileCount) || 0),
  });
}

function translateMigrationError(error) {
  const code = String(error?.code || "migration_failed");
  return Object.freeze({
    code,
    message: ERROR_MESSAGES[code] || `迁移没有完成，错误代码：${code}。旧目录没有被修改，请重试或改为全新开始。`,
  });
}

function asPortableSetupError(error, fallbackCode = "migration_failed") {
  if (error?.portableSetup) return error;
  const wrapped = new Error(error?.message || "Portable setup failed.", error instanceof Error ? { cause: error } : undefined);
  wrapped.code = error?.code || fallbackCode;
  wrapped.portableSetup = true;
  return wrapped;
}

function parseImportSource(argv) {
  const importIndex = argv.indexOf("--import-from");
  if (importIndex < 0) return "";
  const source = argv[importIndex + 1];
  if (!source || String(source).startsWith("--")) {
    const error = new Error("--import-from 后需要填写旧项目目录。");
    error.code = "invalid_arguments";
    throw asPortableSetupError(error);
  }
  return String(source);
}

function baseState(view, fields = {}) {
  return {
    view,
    source: fields.source || null,
    progress: fields.progress || null,
    report: fields.report || null,
    error: fields.error || null,
    canRetry: Boolean(fields.canRetry),
    canChooseAnother: Boolean(fields.canChooseAnother),
    canStartFresh: Boolean(fields.canStartFresh),
    canOpenSystem: Boolean(fields.canOpenSystem),
  };
}

function toSafeProgress(progress = {}, inspection = {}) {
  const fileCount = Math.max(0, Number(progress.fileCount) || Number(inspection.fileCount) || 0);
  const totalBytes = Math.max(0, Number(progress.totalBytes) || Number(inspection.totalBytes) || 0);
  const filesCopied = Math.max(0, Number(progress.filesCopied) || 0);
  const bytesCopied = Math.max(0, Number(progress.bytesCopied) || 0);
  const filesPublished = Math.max(0, Number(progress.filesPublished) || 0);
  const phases = {
    inspect: "检查旧数据",
    copy: "复制数据",
    verify: "校验文件和数据库",
    publish: "完成迁移",
    complete: "迁移完成",
  };
  let ratio = 0.04;
  if (progress.phase === "copy") ratio = 0.08 + (totalBytes > 0 ? Math.min(1, bytesCopied / totalBytes) * 0.68 : 0);
  if (progress.phase === "verify") ratio = 0.82;
  if (progress.phase === "publish") ratio = 0.88 + (fileCount > 0 ? Math.min(1, filesPublished / fileCount) * 0.11 : 0.06);
  if (progress.phase === "complete") ratio = 1;
  const label = progress.phase === "copy"
    ? `${phases.copy} · ${filesCopied} / ${fileCount} 个文件`
    : `${phases[progress.phase] || "正在迁移"} · ${filesCopied} / ${fileCount} 个文件`;
  return {
    phase: String(progress.phase || "inspect"),
    ratio: Math.max(0, Math.min(1, ratio)),
    filesCopied,
    filesPublished,
    fileCount,
    bytesCopied,
    totalBytes,
    label,
  };
}

async function runPortableSetup({
  initialSource = "",
  inspectSource,
  runMigration,
  pickSource,
  waitForAction,
  update,
}) {
  let source = String(initialSource || "");
  let inspection = null;
  let welcomeError = null;

  while (true) {
    if (source && !inspection) {
      update(baseState("inspecting"));
      try {
        inspection = toSafeInspectionSummary(await inspectSource(source));
      } catch (error) {
        welcomeError = translateMigrationError(error);
        source = "";
        inspection = null;
        update(baseState("welcome", { error: welcomeError }));
        continue;
      }
      update(baseState("preview", {
        source: inspection,
        canChooseAnother: true,
        canStartFresh: true,
      }));
    } else if (!source) {
      update(baseState("welcome", { error: welcomeError }));
    }

    const action = await waitForAction();
    if (!action) continue;
    if (action.type === "quit") return { action: "quit" };
    if (action.type === "fresh") return { action: "fresh" };
    if (action.type === "selectMigration" || action.type === "chooseAnother") {
      const picked = await pickSource();
      source = picked ? String(picked) : "";
      inspection = null;
      welcomeError = null;
      continue;
    }
    if (action.type !== "confirmMigration" || !inspection) continue;

    while (true) {
      update(baseState("migrating", { source: inspection }));
      let report;
      try {
        report = await runMigration(source, (progress) => {
          update(baseState("migrating", {
            source: inspection,
            progress: toSafeProgress(progress, inspection),
          }));
        });
      } catch (error) {
        update(baseState("error", {
          source: inspection,
          error: translateMigrationError(error),
          canRetry: true,
          canChooseAnother: true,
          canStartFresh: true,
        }));
        let recovery;
        do {
          recovery = await waitForAction();
          if (recovery?.type === "quit") return { action: "quit" };
          if (recovery?.type === "fresh") return { action: "fresh" };
          if (recovery?.type === "retryMigration") break;
          if (recovery?.type === "chooseAnother") {
            const picked = await pickSource();
            source = picked ? String(picked) : "";
            inspection = null;
            break;
          }
        } while (true);
        if (!inspection) break;
        continue;
      }

      update(baseState("success", {
        source: inspection,
        report: toSafeReport(report),
        canOpenSystem: true,
      }));
      while (true) {
        const finished = await waitForAction();
        if (finished?.type === "openSystem") return { action: "migrated", report };
        if (finished?.type === "quit") return { action: "quit" };
      }
    }
  }
}

function runMigrationProcess({ paths, source, onProgress }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(
      paths.nodeExecutable,
      ["--disable-warning=ExperimentalWarning", path.join(__dirname, "migrate-data-cli.js"), source, paths.dataDir],
      { cwd: paths.appRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let buffer = "";
    let report = null;
    let migrationError = null;
    let settled = false;

    const consumeLine = (line) => {
      if (!line.trim()) return;
      let item;
      try { item = JSON.parse(line); } catch { return; }
      if (item.type === "progress") {
        try { onProgress?.(item); } catch {}
      } else if (item.type === "complete") {
        report = item;
      } else if (item.type === "error") {
        migrationError = new Error(item.message || "迁移失败");
        migrationError.code = item.code || "migration_failed";
      }
    };

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) consumeLine(line);
    });
    child.stderr.on("data", () => {});
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(asPortableSetupError(error));
    });
    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      consumeLine(buffer);
      if (code === 0 && report) resolve(report);
      else if (migrationError) reject(asPortableSetupError(migrationError));
      else {
        const error = new Error(`迁移未完成（退出码 ${code}）。旧目录保持不变。`);
        error.code = "migration_failed";
        reject(asPortableSetupError(error));
      }
    });
  });
}

async function createElectronSetupUi({ BrowserWindow, ipcMain, dialog, hidden, onSetupWindowOpen } = {}) {
  if (!BrowserWindow) throw new Error("Electron BrowserWindow is required for portable setup.");
  const setupWindow = new BrowserWindow({
    width: 720,
    height: 620,
    minWidth: 520,
    minHeight: 540,
    show: false,
    title: "设置 AI OS",
    autoHideMenuBar: true,
    backgroundColor: "#eef3f8",
    webPreferences: {
      preload: path.join(__dirname, "portable-setup-preload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const actions = [];
  const waiters = [];
  let state = baseState("welcome");
  let disposed = false;

  const dispatch = (type) => {
    if (disposed || !ACTION_TYPES.has(type)) return false;
    const action = { type };
    const waiter = waiters.shift();
    if (waiter) waiter(action);
    else actions.push(action);
    return true;
  };

  const waitForAction = () => {
    if (actions.length) return Promise.resolve(actions.shift());
    return new Promise((resolve) => waiters.push(resolve));
  };

  const fromSetupWindow = (event) => !setupWindow.isDestroyed() && event.sender === setupWindow.webContents;
  const onAction = (event, type) => {
    if (!fromSetupWindow(event)) return false;
    return dispatch(String(type || ""));
  };
  const onGetState = (event) => fromSetupWindow(event) ? state : baseState("welcome");

  ipcMain.removeHandler?.(ACTION_CHANNEL);
  ipcMain.removeHandler?.(GET_STATE_CHANNEL);
  ipcMain.handle(ACTION_CHANNEL, onAction);
  ipcMain.handle(GET_STATE_CHANNEL, onGetState);
  setupWindow.on("closed", () => {
    if (!disposed) dispatch("quit");
  });
  setupWindow.webContents.on("render-process-gone", () => {
    if (!disposed) dispatch("quit");
  });
  setupWindow.webContents.on("did-fail-load", () => {
    if (!disposed) dispatch("quit");
  });
  setupWindow.once("ready-to-show", () => {
    if (disposed || setupWindow.isDestroyed()) return;
    onSetupWindowOpen?.();
    if (!hidden) setupWindow.show();
  });
  await setupWindow.loadFile(path.join(__dirname, "portable-setup.html"));

  return {
    async pickSource() {
      const selected = await dialog.showOpenDialog(setupWindow, {
        title: "选择旧 AI OS 项目根目录（里面包含 data）",
        buttonLabel: "选择此项目",
        properties: ["openDirectory"],
      });
      return selected.canceled ? "" : (selected.filePaths[0] || "");
    },
    waitForAction,
    update(nextState) {
      state = nextState;
      if (!disposed && !setupWindow.isDestroyed()) setupWindow.webContents.send(STATE_CHANNEL, state);
    },
    close() {
      if (disposed) return;
      disposed = true;
      ipcMain.removeHandler?.(ACTION_CHANNEL);
      ipcMain.removeHandler?.(GET_STATE_CHANNEL);
      if (!setupWindow.isDestroyed()) setupWindow.destroy();
    },
  };
}

async function preparePortableData({
  paths,
  dialog,
  BrowserWindow,
  ipcMain,
  argv = process.argv,
  createSetupUi = createElectronSetupUi,
  inspectSource = inspectLegacyProject,
  runMigration,
  onSetupWindowOpen,
} = {}) {
  if (!paths?.portableRoot) return { action: "fresh" };
  const initialSource = parseImportSource(argv);
  if (!initialSource && hasBusinessData(paths.dataDir)) return { action: "fresh" };
  if (!initialSource && argv.includes("--initialize")) return { action: "fresh" };

  const hidden = argv.includes("--hidden");
  const migrationRunner = runMigration || ((source, onProgress) => runMigrationProcess({ paths, source, onProgress }));

  if (hidden) {
    if (!initialSource) return { action: "quit" };
    try {
      const report = await migrationRunner(initialSource, () => {});
      return { action: "migrated", report };
    } catch (error) {
      throw asPortableSetupError(error);
    }
  }

  let ui;
  try {
    ui = await createSetupUi({ BrowserWindow, ipcMain, dialog, hidden, onSetupWindowOpen });
    return await runPortableSetup({
      initialSource,
      inspectSource,
      runMigration: migrationRunner,
      pickSource: () => ui.pickSource(),
      waitForAction: () => ui.waitForAction(),
      update: (state) => ui.update(state),
    });
  } catch (error) {
    throw asPortableSetupError(error);
  } finally {
    ui?.close();
  }
}

module.exports = {
  ERROR_MESSAGES,
  hasBusinessData,
  preparePortableData,
  runPortableSetup,
  toSafeInspectionSummary,
  translateMigrationError,
};
