"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const COMPONENT_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const COMPONENT_MANIFEST_FILE = "ai-os-components.json";

const COMPONENT_LABELS = Object.freeze({
  "platform-core": "系统内核",
  "os-shell": "桌面外壳",
  "os-window-manager": "窗口管理器",
  "os-app-runtime": "应用运行时",
  "provider-settings": "API 与模型设置",
  "provider-core": "Provider 服务",
  "chat-services": "聊天与搜索服务",
  "image-generation": "图片生成服务",
  "system-services": "账户与系统服务",
  "system-settings": "系统设置",
  "comfyui-settings": "ComfyUI 设置",
  comfyui: "ComfyUI 服务",
  "canvas-runtime": "画布运行层",
  "canvas-engine": "画布引擎",
  "canvas-node-plugins": "画布节点插件宿主",
  "canvas-node-text": "文字节点插件",
  "canvas-node-note": "便签节点插件",
  "canvas-node-media": "素材节点插件",
  "canvas-node-asset-collection": "素材合集节点插件",
  "canvas-node-llm": "LLM 节点插件",
  "canvas-node-loop": "循环节点插件",
  "canvas-node-video-output": "视频输出节点插件",
  "canvas-node-director3d": "3D 导演台节点插件",
  "canvas-node-gallery": "图集节点插件",
  "canvas-node-grid-editor": "宫格编辑节点插件",
  "canvas-node-midjourney": "Midjourney 节点插件",
  "canvas-node-video-api": "API 视频节点插件",
  "canvas-node-minimax-h3": "MiniMax H3 节点插件",
  "canvas-node-generator": "图片生成节点插件",
  "canvas-node-comfy": "ComfyUI 图片节点插件",
  "canvas-agent-core": "画布 Agent 内核",
  "canvas-agent-ui": "画布 Agent 界面",
  "canvas-agent-tool-adapters": "画布 Agent 工具",
  "canvas-assets": "画布素材库",
  "canvas-director3d": "3D 导演台",
  "canvas-collaboration": "画布协作",
  "content-assets": "内容资源",
  "runtime-dependencies": "运行依赖",
});

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function normalizeRelativePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/^(?:\.\/)+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part))) {
    throw new Error(`Unsafe component path: ${value}`);
  }
  return normalized;
}

function hashFile(filename) {
  const hash = crypto.createHash("sha256");
  const handle = fs.openSync(filename, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const read = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (!read) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

function loadRuntimeOwners(root) {
  const owners = new Map();
  const kernelPath = require.resolve("../core/module-kernel.js");
  const manifestPath = require.resolve("../module-manifest.js");
  delete require.cache[kernelPath];
  delete require.cache[manifestPath];
  delete globalThis.AiOsKernel;
  delete globalThis.AiOsModuleManifest;
  require("../core/module-kernel.js");
  require("../module-manifest.js");
  const kernel = globalThis.AiOsKernel;
  if (!kernel) throw new Error("Unable to load the AI OS runtime component manifest.");
  for (const component of kernel.listComponents()) {
    for (const script of component.scripts) {
      const relative = normalizeRelativePath(script.src.split(/[?#]/, 1)[0]);
      owners.set(relative, component.id);
    }
  }
  delete globalThis.AiOsKernel;
  delete globalThis.AiOsModuleManifest;
  return owners;
}

function componentIdFor(relativePath, runtimeOwners) {
  const relative = normalizeRelativePath(relativePath);
  if (runtimeOwners.has(relative)) return runtimeOwners.get(relative);
  const lower = relative.toLowerCase();
  if (lower === "index.html" || lower === "server.js" || lower === "package.json" || lower.startsWith("core/") || lower === "module-loader.js" || lower === "module-manifest.js") return "platform-core";
  if (lower.startsWith("desktop/")) return "os-shell";
  if (lower.startsWith("canvas-director3d")) return "canvas-director3d";
  if (lower.startsWith("canvas-agent-")) return "canvas-agent-core";
  if (lower.startsWith("canvas-") || lower === "canvas.css") return "canvas-runtime";
  if (lower.startsWith("comfyui-") || lower.startsWith("comfy-workflow-")) return "comfyui";
  if (lower === "image-generation-service.js"
    || lower === "image-generation-http-api.js"
    || lower === "image-model-catalog.js"
    || lower === "image-model-rules.js") return "image-generation";
  if (lower.startsWith("jimeng-") || lower.startsWith("runtime/dreamina")) return "provider-core";
  if (lower.startsWith("api-video-") || lower.startsWith("minimax-h3-") || lower.startsWith("runninghub-")) return "provider-core";
  if (lower.startsWith("provider-") || lower.startsWith("protocol-") || lower.startsWith("model-") || lower.startsWith("media-")) return "provider-core";
  if (lower.startsWith("chat-")) return "chat-services";
  if (lower.startsWith("account-") || lower.startsWith("auth-") || lower.startsWith("resource-") || lower.startsWith("backup-") || lower.startsWith("skill-") || lower.startsWith("system-") || lower.startsWith("asset-library-")) return "system-services";
  if (lower.startsWith("image-") || lower.startsWith("background-removal-")) return "canvas-runtime";
  if (lower.startsWith("node_modules/")) return "runtime-dependencies";
  if (lower.startsWith("assets/") || lower.startsWith("skills/") || lower.startsWith("workflows/")) return "content-assets";
  if (lower.startsWith("styles.css") || lower.startsWith("canvas-tokens.css") || lower.startsWith("canvas-bendo.css") || lower.startsWith("canvas-collab.css") || lower.startsWith("canvas-theme.css")) return "os-shell";
  if (lower.endsWith(".css")) return "platform-core";
  return "platform-core";
}

function listFiles(root) {
  const files = [];
  function visit(directory, relative = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Component packaging must not follow links: ${next}`);
      if (entry.isDirectory()) visit(absolute, next);
      else if (entry.isFile() && next !== COMPONENT_MANIFEST_FILE) files.push(normalizeRelativePath(next));
    }
  }
  visit(root);
  return files.sort();
}

function componentHash(files) {
  return crypto.createHash("sha256").update(JSON.stringify(files)).digest("hex");
}

function copyComponentSource(appRoot, componentRoot, relativePath) {
  const source = path.join(appRoot, ...relativePath.split("/"));
  const target = path.join(componentRoot, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
}

function removeDirectory(root, directory) {
  if (!fs.existsSync(directory)) return;
  const relative = path.relative(root, directory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Refusing to remove unsafe component staging path: ${directory}`);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) removeDirectory(root, target);
    else fs.unlinkSync(target);
  }
  fs.rmdirSync(directory);
}

function buildComponentPackages(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || path.join(__dirname, ".."));
  const appRoot = options.appRoot ? path.resolve(options.appRoot) : "";
  const releaseRoot = options.releaseRoot ? path.resolve(options.releaseRoot) : "";
  const version = String(options.version || "").trim();
  if (!appRoot || !fs.existsSync(appRoot)) return null;
  if (!releaseRoot || !fs.existsSync(releaseRoot)) throw new Error("Component packaging requires an existing release output directory.");
  if (!version) throw new Error("Component packaging requires a release version.");

  const runtimeOwners = loadRuntimeOwners(sourceRoot);
  const groups = new Map();
  for (const relativePath of listFiles(appRoot)) {
    const componentId = componentIdFor(relativePath, runtimeOwners);
    if (!COMPONENT_ID.test(componentId)) throw new Error(`Invalid component id: ${componentId}`);
    if (!groups.has(componentId)) groups.set(componentId, []);
    groups.get(componentId).push(relativePath);
  }

  const components = [];
  const { createZip } = require("./build-electron-portable");
  for (const [componentId, files] of [...groups].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    const fileRecords = files.map((relativePath) => {
      const absolute = path.join(appRoot, ...relativePath.split("/"));
      const stat = fs.statSync(absolute);
      return { path: relativePath, size: stat.size, sha256: hashFile(absolute) };
    });
    const hash = componentHash(fileRecords);
    const fileName = `AI-OS-Component-${version}-${componentId}.zip`;
    const targetZip = path.join(releaseRoot, fileName);
    const staging = fs.mkdtempSync(path.join(releaseRoot, `.component-${componentId}-`));
    const componentRoot = path.join(staging, componentId);
    fs.mkdirSync(componentRoot, { recursive: true });
    try {
      for (const relativePath of files) copyComponentSource(appRoot, componentRoot, relativePath);
      createZip(componentRoot, targetZip);
    } finally {
      removeDirectory(releaseRoot, staging);
    }
    components.push({
      id: componentId,
      label: COMPONENT_LABELS[componentId] || componentId,
      version: `${version}-${hash.slice(0, 12)}`,
      hash,
      asset: {
        fileName,
        size: fs.statSync(targetZip).size,
        sha256: hashFile(targetZip),
      },
      files: fileRecords,
    });
  }

  const manifest = {
    format: 1,
    product: "AI OS",
    version,
    platform: "win32",
    arch: "x64",
    generatedAt: new Date().toISOString(),
    components,
  };
  const manifestPath = path.join(releaseRoot, COMPONENT_MANIFEST_FILE);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return {
    manifest,
    manifestPath,
    asset: {
      fileName: COMPONENT_MANIFEST_FILE,
      size: fs.statSync(manifestPath).size,
      sha256: hashFile(manifestPath),
    },
    componentAssets: components.map((component) => component.asset.fileName),
  };
}

module.exports = {
  COMPONENT_MANIFEST_FILE,
  COMPONENT_LABELS,
  buildComponentPackages,
  componentHash,
  hashFile,
  normalizeRelativePath,
};
