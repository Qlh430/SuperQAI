"use strict";

const fs = require("node:fs");
const path = require("node:path");

function resolveDesktopPaths({ appRoot, resourcesPath, isPackaged = false, userDataPath, exePath, env = process.env }) {
  const root = path.resolve(appRoot);
  let portableRoot = env.AI_OS_PORTABLE_ROOT ? path.resolve(env.AI_OS_PORTABLE_ROOT) : "";
  if (!portableRoot && isPackaged) {
    for (let candidate = root; ; candidate = path.dirname(candidate)) {
      if (fs.existsSync(path.join(candidate, "ai-os-portable.json"))) { portableRoot = candidate; break; }
      if (path.dirname(candidate) === candidate) break;
    }
  }
  if (portableRoot) {
    const manifest = JSON.parse(fs.readFileSync(path.join(portableRoot, "ai-os-portable.json"), "utf8"));
    if (manifest.product !== "AI OS" || manifest.portable !== true || manifest.dataDirectory !== "data") {
      throw new Error("AI OS 便携配置无效：dataDirectory 必须为 data。");
    }
  }
  const dataDir = portableRoot ? path.join(portableRoot, "data")
    : env.AI_OS_DATA_DIR ? path.resolve(env.AI_OS_DATA_DIR)
      : isPackaged ? path.join(userDataPath, "data") : path.join(root, "data");
  const bundledNode = path.join(resourcesPath || path.dirname(root), "runtime", "node.exe");
  return {
    appRoot: root, portableRoot, dataDir,
    userDataDir: portableRoot ? path.join(dataDir, ".desktop") : userDataPath,
    outputDir: portableRoot ? path.join(dataDir, "output") : path.resolve(env.AI_OS_OUTPUT_DIR || path.join(root, "output")),
    envFile: portableRoot ? path.join(dataDir, ".env") : path.resolve(env.AI_OS_ENV_FILE || path.join(root, ".env")),
    nodeExecutable: portableRoot ? bundledNode : env.AI_OS_NODE_EXECUTABLE
      ? path.resolve(env.AI_OS_NODE_EXECUTABLE) : isPackaged && fs.existsSync(bundledNode) ? bundledNode : exePath,
  };
}

function getServerEnvironment(paths, base = process.env) {
  const env = { ...base, AI_OS_DATA_DIR: paths.dataDir };
  if (!paths.portableRoot) return env;
  Object.assign(env, {
    AI_OS_OUTPUT_DIR: paths.outputDir,
    AI_OS_ENV_FILE: paths.envFile,
    AI_OS_UPLOAD_TMP_DIR: path.join(paths.dataDir, ".tmp", "uploads"),
    AI_OS_SYSTEM_DB_FILE: path.join(paths.dataDir, "system.sqlite"),
    AI_OS_BACKUP_DIR: path.join(paths.dataDir, "backups"),
    AI_OS_WORKFLOW_DIR: path.join(paths.dataDir, "workflows"),
    CANVAS_DB_FILE: path.join(paths.dataDir, "canvas.db"),
    CANVAS_LEGACY_FILE: path.join(paths.dataDir, "canvas-boards.json"),
    CANVAS_BACKUP_DIR: path.join(paths.dataDir, "canvas-legacy-backups"),
    SETTINGS_FILE: path.join(paths.dataDir, "settings.json"),
    IMAGE_JOBS_FILE: path.join(paths.dataDir, "image-jobs.json"),
    CANVAS_AGENT_ROUTE_HISTORY_FILE: path.join(paths.dataDir, "canvas-agent-route-history.json"),
    CANVAS_AGENT_CONVERSATIONS_FILE: path.join(paths.dataDir, "canvas-agent-conversations.json"),
    OUTBOUND_ROUTE_STATE_FILE: path.join(paths.dataDir, "outbound-route-state.json"),
  });
  return env;
}

// Defaults are copied only if absent, so a migrated or edited workflow survives updates.
function seedPortableWorkflows(paths) {
  if (!paths.portableRoot) return;
  const source = path.join(paths.appRoot, "workflows"), target = path.join(paths.dataDir, "workflows");
  fs.mkdirSync(target, { recursive: true });
  const copyMissing = (from, to) => {
    if (fs.lstatSync(from).isSymbolicLink()) throw new Error("工作流模板不能包含目录链接。");
    if (fs.statSync(from).isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from)) copyMissing(path.join(from, name), path.join(to, name));
    } else if (!fs.existsSync(to)) fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  };
  if (fs.existsSync(source)) copyMissing(source, target);
}

module.exports = { resolveDesktopPaths, getServerEnvironment, seedPortableWorkflows };
