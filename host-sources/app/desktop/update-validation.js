"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { inside, hashFile } = require("./update-files");
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const HASH = /^[a-f0-9]{64}$/i;
function safePath(value) {
  if (typeof value !== "string" || !value || /[\\:\x00-\x1f<>"|?*]/.test(value) || value.startsWith("/")) throw Error("更新文件路径不安全。");
  const parts = value.split("/");
  if (parts.some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(p))) throw Error("更新文件路径不安全。");
  if (parts.some(p => ["data", "output", ".env"].includes(p.toLowerCase()))) throw Error("更新包不能包含业务数据路径。");
  return value;
}
function inventory(files, label) {
  if (!Array.isArray(files) || !files.length || files.length > 100_000) throw Error(`${label}精确文件集合缺失或过大。`);
  const seen = new Map();
  for (const file of files) {
    const name = safePath(file?.path), key = name.toLowerCase();
    if (seen.has(key)) throw Error(`${label}文件归属重复：${name}`);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || !HASH.test(String(file.sha256 || ""))) throw Error(`${label}文件大小或哈希无效：${name}`);
    seen.set(key, { ...file, path: name });
  }
  return seen;
}
function validateConstraints(manifest, { installed } = {}) {
  if (manifest?.format !== 1 || manifest.product !== "AI OS" || manifest.platform !== "win32" || manifest.arch !== "x64") throw Error("更新清单平台或版本不兼容。");
  if (!VERSION.test(manifest.version) || manifest.runtime !== `${manifest.version}-win-x64` || manifest.minUpdaterVersion !== 1) throw Error("更新清单版本或运行时不兼容。");
  const c = manifest.compatibility;
  if (!c || !Number.isInteger(c.nodeMajor) || c.nodeMajor < 20 || !VERSION.test(c.electron) || c.nativeRuntimeChange !== "full-runtime-update-required") throw Error("更新清单缺少原生运行时兼容约束。");
  const components = new Map(), owners = new Map();
  if (!Array.isArray(manifest.components) || !manifest.components.length) throw Error("组件清单为空。");
  for (const component of manifest.components) {
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(component.id) || components.has(component.id) || !VERSION.test(component.version) || !HASH.test(String(component.hash || ""))) throw Error("组件标识或版本无效。");
    const cc = component.compatibility;
    if (!cc || cc.platform !== manifest.platform || cc.arch !== manifest.arch || cc.manifestFormat !== 1 || cc.minUpdaterVersion !== 1 || cc.nodeMajor !== c.nodeMajor || (cc.electron && cc.electron !== c.electron)) throw Error(`组件运行时兼容约束不满足：${component.id}`);
    if (!Array.isArray(component.dependencies)) throw Error(`组件依赖约束缺失：${component.id}`);
    for (const [key, file] of inventory(component.files, "组件")) {
      if (owners.has(key) || key === "ai-os-components.json") throw Error(`组件文件归属重复：${file.path}`);
      owners.set(key, file);
    }
    components.set(component.id, component);
  }
  for (const component of components.values()) for (const dep of component.dependencies) {
    if (!dep || !VERSION.test(dep.version) || components.get(dep.id)?.version !== dep.version || dep.id === component.id) throw Error(`组件依赖不满足：${component.id} → ${dep?.id || "未知"}`);
  }
  if (installed && (installed.compatibility?.nodeMajor !== c.nodeMajor || installed.compatibility?.electron !== c.electron || installed.platform !== manifest.platform || installed.arch !== manifest.arch)) throw Error("原生运行时版本变化，必须执行完整运行时更新。");
  return { owners };
}
function validateCandidate(directory, manifest) {
  const { owners } = validateConstraints(manifest);
  const expected = inventory(manifest.runtimeFiles, "运行时");
  if (expected.has("resources/app/ai-os-components.json")) throw Error("运行时清单不能包含自身哈希。");
  const appFiles = new Map([...expected].filter(([key]) => key.startsWith("resources/app/")).map(([key, file]) => [key.slice(14), file]));
  if (owners.size !== appFiles.size) throw Error("组件归属与运行时精确文件集合不一致。");
  for (const [key, file] of owners) {
    const runtimeFile = appFiles.get(key);
    if (!runtimeFile || file.size !== runtimeFile.size || file.sha256.toLowerCase() !== runtimeFile.sha256.toLowerCase()) throw Error(`组件文件与运行时清单不一致：${file.path}`);
  }
  const actual = new Map();
  function walk(relative = "") {
    const dir = relative ? inside(directory, relative) : directory;
    for (const name of fs.readdirSync(dir)) {
      const rel = relative ? `${relative}/${name}` : name, file = inside(directory, rel), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw Error("更新候选不能包含链接。");
      if (stat.isDirectory()) walk(rel);
      else if (stat.isFile()) {
        if (rel === "resources/app/ai-os-components.json") continue;
        const key = safePath(rel).toLowerCase();
        if (actual.has(key)) throw Error(`更新候选文件重复：${rel}`);
        actual.set(key, { file, size: stat.size });
      } else throw Error("更新候选包含非普通文件。");
    }
  }
  walk();
  if (actual.size !== expected.size) throw Error("更新候选精确文件集合不一致。");
  for (const [key, file] of expected) {
    const current = actual.get(key);
    if (!current || current.size !== file.size || hashFile(current.file) !== file.sha256.toLowerCase()) throw Error(`更新候选缺少文件或哈希错误：${file.path}`);
  }
  return { files: actual.size };
}
function canonicalManifest(manifest) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const { signature, ...payload } = manifest;
  return Buffer.from(JSON.stringify(canonical(payload)), "utf8");
}
function verifyPublisher(manifest, keys = require("./update-trust.json").keys) {
  const signature = manifest?.signature;
  if (!signature || signature.algorithm !== "Ed25519" || typeof keys?.[signature.keyId] !== "string") throw Error("更新发布者签名或受信公钥未配置，已停止自动更新。");
  try {
    const key = crypto.createPublicKey(keys[signature.keyId]);
    if (key.asymmetricKeyType !== "ed25519" || !/^[A-Za-z0-9+/]{86}==$/.test(signature.value) || !crypto.verify(null, canonicalManifest(manifest), key, Buffer.from(signature.value, "base64"))) throw Error("invalid signature");
  } catch { throw Error("更新发布者签名验证失败。"); }
  return true;
}
function verifyNativeCompatibility(directory, manifest) {
  const { execFileSync } = require("node:child_process");
  const expression = 'JSON.stringify({platform:process.platform,arch:process.arch,node:process.versions.node,electron:process.versions.electron})';
  const options = { encoding:"utf8", windowsHide:true, timeout:15_000, cwd:directory };
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let node, electron;
  try {
    node = JSON.parse(execFileSync(inside(directory, "resources/runtime/node.exe"), ["-p", expression], { ...options, env }).trim());
    electron = JSON.parse(execFileSync(inside(directory, "AI OS Runtime.exe"), ["-p", expression], { ...options, env: { ...env, ELECTRON_RUN_AS_NODE:"1" } }).trim());
  } catch (error) { throw new Error(`无法核验候选原生运行时版本：${error.message}`); }
  if ([node, electron].some(runtime => runtime.platform !== manifest.platform || runtime.arch !== manifest.arch || Number(runtime.node.split(".")[0]) !== manifest.compatibility.nodeMajor) || electron.electron !== manifest.compatibility.electron) throw Error("候选 Node/Electron 平台、架构或版本不兼容。");
  return { node, electron };
}
module.exports = { safePath, inventory, validateConstraints, validateCandidate, canonicalManifest, verifyPublisher, verifyNativeCompatibility };
