"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { inside, atomicWrite, readJson, copyTree, copyFileVerified, removePathStrict, removeInside, runtimeName } = require("./update-files");
const { inspectComponentState } = require("./component-state");
const { prepareComponentRollback } = require("./component-rollback");
const { execFile } = require("node:child_process");
const { safePath, validateConstraints, verifyPublisher, verifyNativeCompatibility } = require("./update-validation");

const UPDATE_SOURCE = "https://api.github.com/repos/Qlh430/SuperQAI/releases/latest";
const ASSET_PREFIX = "https://github.com/Qlh430/SuperQAI/releases/download/";
const ASSET_API_PREFIX = "https://api.github.com/repos/Qlh430/SuperQAI/releases/assets/";
const UPDATER_VERSION = 1;
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;
const COMPONENT_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function parseVersion(value) {
  const text = String(value || "").replace(/^v/i, "");
  const match = VERSION_RE.exec(text);
  if (!match) throw new Error(`无效版本号：${value}`);
  return { text, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] || "" };
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (!a.pre && !b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  const aa = a.pre.split("."), bb = b.pre.split(".");
  for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
    if (i >= aa.length) return -1;
    if (i >= bb.length) return 1;
    if (aa[i] === bb[i]) continue;
    const an = /^\d+$/.test(aa[i]), bn = /^\d+$/.test(bb[i]);
    if (an && bn) return Number(aa[i]) > Number(bb[i]) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return aa[i] > bb[i] ? 1 : -1;
  }
  return 0;
}

function approvedBrowserAssetUrl(value) {
  if (typeof value !== "string" || !value.startsWith(ASSET_PREFIX)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith("/Qlh430/SuperQAI/releases/download/") && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function approvedAssetApiUrl(value) {
  if (typeof value !== "string" || !value.startsWith(ASSET_API_PREFIX)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "api.github.com" && /^\/repos\/Qlh430\/SuperQAI\/releases\/assets\/\d+$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function approvedAssetUrl(value) {
  return approvedBrowserAssetUrl(value) || approvedAssetApiUrl(value);
}

function trustedAssetUrl(asset) {
  if (approvedAssetApiUrl(asset?.url)) return asset.url;
  if (approvedBrowserAssetUrl(asset?.browser_download_url)) return asset.browser_download_url;
  return "";
}

// Explicit v3.0.1 trust policy: GitHub repository control + HTTPS + exact hashes.
// This is not publisher cryptographic authentication. A supplied signature must
// always verify; it can never downgrade to the unsigned compatibility policy.
function verifyReleaseAuthentication(manifest, release, policy = require('./update-trust.json'), keys = policy.keys) {
  if (manifest && Object.hasOwn(manifest, 'signature')) { verifyPublisher(manifest, keys); return 'ed25519'; }
  if (policy.format !== 1 || policy.mode !== 'github-release-assets' || policy.repository !== 'Qlh430/SuperQAI') throw Error('更新发布者签名或受信公钥未配置，已停止更新。');
  if (!release || release.version !== manifest?.version || release.tag !== `v${manifest.version}` || !approvedAssetUrl(release.manifestUrl)) throw Error('更新清单不属于官方稳定版本。');
  const asset = release.assets?.get('ai-os-update.json');
  if (!asset || trustedAssetUrl(asset) !== release.manifestUrl) throw Error('更新清单没有官方 Release 文件归属。');
  for (const item of release.assets.values()) {
    const url = trustedAssetUrl(item);
    if (!url || (approvedBrowserAssetUrl(url) && url !== `${ASSET_PREFIX}${release.tag}/${item.name}`)) throw Error('更新文件与官方版本归属不符。');
  }
  return 'github-release-assets';
}

function serializedRelease(release) { return {version:release.version,tag:release.tag,manifestUrl:release.manifestUrl,assets:[...release.assets.entries()]}; }
function restoreRelease(receipt) {
  if (!receipt || !Array.isArray(receipt.assets)) return null;
  return {...receipt,assets:new Map(receipt.assets)};
}

function copyManagedRuntime(source, destination, manifest) {
  const files = require('./update-validation').inventory(manifest?.runtimeFiles, '已安装运行时');
  fs.mkdirSync(destination, {recursive:true});
  for (const file of files.values()) copyFileVerified(inside(source, file.path), inside(destination, file.path), file);
}

function parseRelease(release, currentVersion) {
  if (!release || release.draft || release.prerelease) return null;
  const version = parseVersion(release.tag_name || release.name);
  if (version.pre || compareVersions(version.text, currentVersion) <= 0) return null;
  if (!Array.isArray(release.assets)) throw new Error("GitHub Release 缺少更新文件列表。");
  for (const asset of release.assets) {
    if ((asset?.url || asset?.browser_download_url) && !trustedAssetUrl(asset)) {
      throw new Error(`更新文件地址不在 Qlh430/SuperQAI Releases 内：${asset.browser_download_url || asset.url}`);
    }
  }
  const assets = new Map(release.assets.filter((asset) => asset && typeof asset.name === "string").map((asset) => [asset.name, asset]));
  const manifestAsset = assets.get("ai-os-update.json");
  const manifestUrl = trustedAssetUrl(manifestAsset);
  if (!manifestUrl) throw new Error("该 Release 缺少 ai-os-update.json 更新清单。");
  return {
    version: version.text,
    tag: String(release.tag_name || `v${version.text}`),
    notes: String(release.body || "").trim(),
    publishedAt: release.published_at || null,
    manifestUrl,
    assets,
  };
}

function validateManifest(manifest, releaseInfo) {
  if (!manifest || manifest.format !== 1 || manifest.product !== "AI OS") throw new Error("AI OS 更新清单格式不受支持。");
  if (!releaseInfo || compareVersions(manifest.version, releaseInfo.version) !== 0) throw new Error("更新清单版本与 Release 不一致。");
  if (manifest.platform !== "win32" || manifest.arch !== "x64") throw new Error("该更新不是 Windows x64 便携版更新。");
  if (!Number.isInteger(manifest.minUpdaterVersion) || manifest.minUpdaterVersion < 1 || manifest.minUpdaterVersion > UPDATER_VERSION) throw new Error("当前便携版更新器版本过低。");
  if (!FILE_RE.test(String(manifest.fileName || "")) || !/\.zip$/i.test(manifest.fileName)) throw new Error("更新文件名不安全。");
  if (!Number.isSafeInteger(manifest.size) || manifest.size <= 0 || manifest.size > 2_000_000_000) throw new Error("更新文件大小无效。");
  if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || ""))) throw new Error("更新文件 SHA-256 无效。");
  const asset = releaseInfo.assets?.get(manifest.fileName);
  const assetUrl = trustedAssetUrl(asset);
  if (!assetUrl) throw new Error("Release 中找不到受信任的更新文件。");
  if (asset.size != null && Number(asset.size) !== manifest.size) throw new Error("更新清单大小与 Release 不一致。");
  let componentManifestAsset = null;
  if (manifest.components != null) {
    const componentFile = String(manifest.components.fileName || "");
    if (!FILE_RE.test(componentFile) || !/\.json$/i.test(componentFile)) throw new Error("组件清单文件名不安全。");
    if (!Number.isSafeInteger(manifest.components.size) || manifest.components.size <= 0 || manifest.components.size > 10_000_000) throw new Error("组件清单大小无效。");
    if (!/^[a-f0-9]{64}$/i.test(String(manifest.components.sha256 || ""))) throw new Error("组件清单 SHA-256 无效。");
    const componentAsset = releaseInfo.assets?.get(componentFile);
    const componentManifestUrl = trustedAssetUrl(componentAsset);
    if (!componentManifestUrl) throw new Error("Release 中找不到受信任的组件清单。");
    if (componentAsset.size != null && Number(componentAsset.size) !== manifest.components.size) throw new Error("组件清单大小与 Release 不一致。");
    componentManifestAsset = { ...manifest.components, fileName: componentFile, url: componentManifestUrl };
  }
  return { ...manifest, url: assetUrl, componentManifestAsset };
}

function assertSafeRelativePath(value, label = "组件文件") {
  safePath(value);
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/");
  if (!normalized || /^[A-Za-z]:/.test(normalized) || parts.some((part) => !part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part))) {
    throw new Error(`${label}路径不安全：${value}`);
  }
  return normalized;
}

function validateComponentManifest(manifest, releaseInfo, assetInfo) {
  validateConstraints(manifest);
  if (!manifest || manifest.format !== 1 || manifest.product !== "AI OS") throw new Error("AI OS 组件清单格式不受支持。");
  if (!releaseInfo || compareVersions(manifest.version, releaseInfo.version) !== 0) throw new Error("组件清单版本与 Release 不一致。");
  if (manifest.platform !== "win32" || manifest.arch !== "x64") throw new Error("组件清单不是 Windows x64 版本。");
  if (!Array.isArray(manifest.components) || manifest.components.length < 1 || manifest.components.length > 256) throw new Error("组件清单内容无效。");
  const seen = new Set();
  const components = manifest.components.map((component) => {
    const id = String(component?.id || "");
    if (!COMPONENT_ID_RE.test(id) || seen.has(id)) throw new Error(`组件标识无效或重复：${id}`);
    seen.add(id);
    const hash = String(component.hash || "");
    if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error(`组件哈希无效：${id}`);
    const files = Array.isArray(component.files) ? component.files : [];
    if (files.length > 100_000) throw new Error(`组件文件数量过多：${id}`);
    const normalizedFiles = files.map((file) => {
      const filePath = assertSafeRelativePath(file?.path);
      const size = Number(file?.size);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error(`组件文件大小无效：${id}/${filePath}`);
      if (!/^[a-f0-9]{64}$/i.test(String(file?.sha256 || ""))) throw new Error(`组件文件哈希无效：${id}/${filePath}`);
      return { path: filePath, size, sha256: String(file.sha256).toLowerCase() };
    });
    const asset = component.asset || {};
    const fileName = String(asset.fileName || "");
    if (!FILE_RE.test(fileName) || !/\.zip$/i.test(fileName)) throw new Error(`组件包文件名不安全：${id}`);
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 2_000_000_000) throw new Error(`组件包大小无效：${id}`);
    if (!/^[a-f0-9]{64}$/i.test(String(asset.sha256 || ""))) throw new Error(`组件包 SHA-256 无效：${id}`);
    const releaseAsset = releaseInfo.assets?.get(fileName);
    const releaseAssetUrl = trustedAssetUrl(releaseAsset);
    if (!releaseAssetUrl) throw new Error(`Release 中缺少组件包：${fileName}`);
    if (releaseAsset.size != null && Number(releaseAsset.size) !== asset.size) throw new Error(`组件包大小与 Release 不一致：${fileName}`);
    return {
      ...component,
      id,
      label: String(component.label || id),
      version: String(component.version || ""),
      hash: hash.toLowerCase(),
      files: normalizedFiles,
      asset: {
        fileName,
        size: asset.size,
        sha256: String(asset.sha256).toLowerCase(),
        url: releaseAssetUrl,
      },
    };
  });
  return { ...manifest, components, asset: assetInfo };
}

function readInstalledComponentManifest(portableRoot) {
  if (!portableRoot) return null;
  try {
    const active = runtimeName(fs.readFileSync(inside(portableRoot, ".ai-runtime/.active-runtime"), "utf8").trim());
    const file = inside(portableRoot, `.ai-runtime/versions/${active}/resources/app/ai-os-components.json`);
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    return manifest?.format === 1 && manifest.product === "AI OS" ? manifest : null;
  } catch {
    return null;
  }
}

function selectChangedComponents(installed, available) {
  if (!installed || !available || !Array.isArray(installed.components) || !Array.isArray(available.components)) {
    return { requiresFullUpdate: true, reason: "component-manifest-missing", changed: [], downloadSize: 0 };
  }
  try { validateConstraints(available, { installed }); }
  catch (error) { return { requiresFullUpdate: true, reason: "native-runtime-or-dependency-constraint", changed: [], downloadSize: 0 }; }
  const nativeFiles = manifest => (manifest.runtimeFiles || []).filter(file => !file.path.toLowerCase().startsWith("resources/app/")).map(file => `${file.path.toLowerCase()}:${file.size}:${file.sha256.toLowerCase()}`).sort();
  if (!installed.runtimeFiles || !available.runtimeFiles || JSON.stringify(nativeFiles(installed)) !== JSON.stringify(nativeFiles(available))) return { requiresFullUpdate:true, reason:"native-runtime-files-changed", changed:[], downloadSize:0 };
  const previous = new Map(installed.components.map((component) => [String(component.id || ""), component]));
  const nextIds = new Set(available.components.map((component) => component.id));
  if (installed.components.some((component) => !nextIds.has(String(component.id || "")))) {
    return { requiresFullUpdate: true, reason: "component-removed", changed: [], downloadSize: 0 };
  }
  const changed = [];
  for (const component of available.components) {
    const before = previous.get(component.id);
    if (before?.hash === component.hash) continue;
    const nextPaths = new Set(component.files.map((file) => file.path));
    const removedFiles = (before?.files || [])
      .map((file) => String(file.path || ""))
      .filter((filePath) => filePath && !nextPaths.has(filePath));
    changed.push({ ...component, removedFiles });
  }
  return {
    requiresFullUpdate: false,
    reason: "",
    changed,
    downloadSize: changed.reduce((total, component) => total + component.asset.size, 0),
  };
}

function preflightUpdateSpace(portableRoot, update, componentPlan) {
  const install = require("./update-install");
  const runtimeBytes = (update.componentManifest?.runtimeFiles || []).reduce((sum, file) => sum + Number(file.size || 0), 0);
  const extractedBytes = componentPlan && !componentPlan.requiresFullUpdate
    ? componentPlan.changed.reduce((sum, component) => sum + component.files.reduce((size, file) => size + Number(file.size || 0), 0), 0)
    : 0;
  const downloadBytes = componentPlan && !componentPlan.requiresFullUpdate && componentPlan.changed.length
    ? componentPlan.downloadSize
    : update.manifest.size;
  const required = downloadBytes + extractedBytes + runtimeBytes + install.requiredInstallSpace(portableRoot);
  install.assertAvailableSpace(required, install.portableFreeBytes(portableRoot));
  return required;
}
function pruneOrphanedUpdateArtifacts(portableRoot) {
  if (fs.existsSync(inside(portableRoot, ".ai-runtime/updates/install.json")) ||
      fs.existsSync(inside(portableRoot, ".ai-runtime/updates/helper.json"))) return [];
  const updates = inside(portableRoot, ".ai-runtime/updates");
  if (!fs.existsSync(updates)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(updates, { withFileTypes: true })) {
    if (!/^stage-[A-Za-z0-9_-]+$/.test(entry.name) || entry.isSymbolicLink() || !entry.isDirectory()) continue;
    const relative = `.ai-runtime/updates/${entry.name}`;
    removeInside(portableRoot, relative);
    removed.push(entry.name);
  }
  return removed;
}

function normalizeComponentRollback(value) {
  if (!value || !COMPONENT_ID_RE.test(String(value.componentId || ""))) return null;
  const hash = (candidate) => /^[a-f0-9]{64}$/i.test(String(candidate || "")) ? String(candidate).toLowerCase() : "";
  return {
    componentId: String(value.componentId),
    label: String(value.label || value.componentId),
    sourceRuntime: String(value.sourceRuntime || ""),
    fromVersion: String(value.fromVersion || ""),
    toVersion: String(value.toVersion || ""),
    fromHash: hash(value.fromHash),
    toHash: hash(value.toHash),
  };
}

async function readResponseBytes(response, maxBytes) {
  if (!response?.ok) throw new Error(`下载失败（HTTP ${response?.status || 0}）。`);
  const chunks = []; let total = 0;
  for await (const value of response.body || []) {
    const chunk = Buffer.from(value); total += chunk.length;
    if (total > maxBytes) throw new Error("下载文件超过允许大小。");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function networkFailure(error, url) {
  const cause = error?.cause;
  let host = "";
  try { host = new URL(url).hostname; } catch {}
  const message = String(error?.message || "");
  if (!cause && !/fetch failed|network|socket|terminated|aborted|timed?\s*out|连接失败|连接超时/i.test(message)) return error;
  const details = [...new Set([cause?.code || error?.code, cause?.message || message].filter(Boolean))];
  const wrapped = new Error(`网络连接失败${host ? `（${host}）` : ""}：${details.join(": ") || "请求失败"}`, { cause: error });
  if (cause?.code || error?.code) wrapped.code = cause?.code || error.code;
  return wrapped;
}

function retryableDownloadError(error) {
  const code = String(error?.code || "");
  if (/^(?:UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ABORT_ERR|DOWNLOAD_RESTART|DOWNLOAD_TRUNCATED)$/.test(code)) return true;
  if (/^HTTP_(?:408|425|429|5\d\d)$/.test(code)) return true;
  return /fetch failed|network|socket|terminated|aborted|timed?\s*out|连接失败|连接超时/i.test(String(error?.message || ""));
}

function createUpdateFetcher({ electronNet, fallback = globalThis.fetch } = {}) {
  if (typeof electronNet?.fetch === "function") return electronNet.fetch.bind(electronNet);
  if (typeof fallback !== "function") throw new TypeError("更新器缺少可用的网络请求实现。");
  return fallback;
}

async function hashFilePrefix(filename, size) {
  const hash = crypto.createHash("sha256");
  if (!size) return hash;
  const handle = await fsp.open(filename, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < size) {
      const read = await handle.read(buffer, 0, Math.min(buffer.length, size - position), position);
      if (!read.bytesRead) throw new Error("已下载文件无法完整读取。");
      hash.update(buffer.subarray(0, read.bytesRead));
      position += read.bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash;
}

function waitForRetry(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function downloadFile(url, destination, manifest, options = {}) {
  if (!approvedAssetUrl(url)) throw new Error("更新下载地址不受信任。");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const target = path.resolve(destination);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const expectedSize = manifest.size, expectedHash = manifest.sha256.toLowerCase();
  const temporary = `${target}.${expectedHash.slice(0, 12)}.part`;
  const attempts = Number.isInteger(options.attempts) && options.attempts > 0 ? Math.min(options.attempts, 10) : 4;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? Math.max(0, options.retryDelayMs) : 1_500;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let existing = 0;
    try {
      existing = (await fsp.stat(temporary)).size;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (existing > expectedSize) {
      await fsp.unlink(temporary).catch(() => {});
      existing = 0;
    }
    if (existing === expectedSize) {
      const hash = await hashFilePrefix(temporary, existing);
      if (hash.digest("hex") === expectedHash) {
        await fsp.rename(temporary, target);
        options.onProgress?.(1);
        return { path: target, size: existing, sha256: expectedHash };
      }
      await fsp.unlink(temporary).catch(() => {});
      existing = 0;
    }
    let handle;
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(options.timeoutMs || 30 * 60_000),
        headers: {
          Accept: "application/octet-stream",
          "User-Agent": "AI-OS-Updater/1",
          ...(existing > 0 ? { Range: `bytes=${existing}-` } : {}),
        },
      });
      if (!response?.ok) {
        const error = new Error(`下载失败（HTTP ${response?.status || 0}）。`);
        error.code = `HTTP_${response?.status || 0}`;
        throw error;
      }
      let start = existing;
      if (start > 0 && response.status !== 206) {
        if (response.status === 200) {
          await fsp.unlink(temporary).catch(() => {});
          start = 0;
        } else {
          const error = new Error("更新服务器未返回可续传的下载响应。");
          error.code = "DOWNLOAD_RESTART";
          throw error;
        }
      }
      if (start > 0) {
        const contentRange = String(response.headers?.get?.("content-range") || "");
        const match = /^bytes\s+(\d+)-/i.exec(contentRange);
        if (match && Number(match[1]) !== start) {
          await fsp.unlink(temporary).catch(() => {});
          const error = new Error("更新服务器返回了错误的续传范围。");
          error.code = "DOWNLOAD_RESTART";
          throw error;
        }
      }
      handle = await fsp.open(temporary, start > 0 ? "a" : "w");
      const hash = await hashFilePrefix(temporary, start);
      let total = start;
      options.onProgress?.(Math.min(1, total / expectedSize));
      for await (const value of response.body || []) {
        const chunk = Buffer.from(value); total += chunk.length;
        if (total > expectedSize || total > 2_000_000_000) throw Object.assign(new Error("下载文件大小超过清单限制。"), { code: "DOWNLOAD_TRUNCATED" });
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) offset += (await handle.write(chunk, offset, chunk.length - offset)).bytesWritten;
        options.onProgress?.(total / expectedSize);
      }
      await handle.sync();
      await handle.close();
      handle = null;
      if (total !== expectedSize) throw Object.assign(new Error("下载文件大小不匹配。"), { code: "DOWNLOAD_TRUNCATED" });
      if (hash.digest("hex") !== expectedHash) {
        await fsp.unlink(temporary).catch(() => {});
        throw new Error("下载文件 SHA-256 校验失败。");
      }
      await fsp.rename(temporary, target);
      options.onProgress?.(1);
      return { path: target, size: total, sha256: expectedHash };
    } catch (error) {
      try { await handle?.close(); } catch {}
      lastError = networkFailure(error, url);
      if (attempt >= attempts || !retryableDownloadError(lastError)) throw lastError;
      await waitForRetry(retryDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError || new Error("更新下载失败。");
}

async function extractZipSafe(zipPath, destination, expectedRuntime) {
  runtimeName(expectedRuntime);
  await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "extract-update.ps1"), "-Archive", zipPath, "-Destination", destination, "-Runtime", expectedRuntime], { windowsHide: true, timeout: 5 * 60_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(`更新包解压失败：${stderr || error.message}`)) : resolve()));
  const extracted = inside(destination, expectedRuntime);
  require("./update-install").validateRuntime(destination, expectedRuntime, "");
  return extracted;
}

async function extractComponentZipSafe(zipPath, destination, expectedComponent) {
  const component = String(expectedComponent || "");
  if (!COMPONENT_ID_RE.test(component)) throw new Error("组件包标识无效。");
  await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "extract-update.ps1"), "-Archive", zipPath, "-Destination", destination, "-Runtime", component], { windowsHide: true, timeout: 5 * 60_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(`组件包解压失败：${stderr || error.message}`)) : resolve()));
  return inside(destination, component);
}

async function renameWithRetry(source, destination, options = {}) {
  const rename = options.rename || fsp.rename;
  const wait = options.wait || (milliseconds => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 15_000);
  const retryDelayMs = Math.max(1, Number(options.retryDelayMs) || 100);
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return { attempts: attempt + 1 };
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"].includes(error.code) || Date.now() >= deadline) throw error;
      await wait(retryDelayMs);
    }
  }
}

function createUpdater(options = {}) {
  const portableRoot = options.portableRoot ? path.resolve(options.portableRoot) : "";
  const currentVersion = parseVersion(options.currentVersion || "0.0.0").text;
  const fetchImpl = options.fetchImpl || createUpdateFetcher();
  const networkPath = String(options.networkPath || (options.fetchImpl ? "custom" : "node-default"));
  const listeners = new Set();
  let info = null, prepared = null, operation = null, operationName = "";
  let status = { status: portableRoot ? "idle" : "development", currentVersion, progress: 0, networkPath };
  const clone = value => JSON.parse(JSON.stringify(value));
  const publish = patch => {
    status = { ...status, ...patch, currentVersion };
    for (const listener of listeners) { try { listener(clone(status)); } catch {} }
    return clone(status);
  };
  const ensurePortable = () => { if (!portableRoot) throw new Error("只有便携版可以执行在线更新。"); };
  const file = relative => inside(portableRoot, `.ai-runtime/updates/${relative}`);
  const authorizePrepared = ready => {
    if (ready.componentRollback) return; // Locally verified previous component snapshots.
    const signed = ready.authorization?.manifest;
    verifyReleaseAuthentication(signed, restoreRelease(ready.authorization?.release), options.trustPolicy || require('./update-trust.json'), options.trustedKeys);
    if (signed.version !== ready.version || ready.candidate !== `${signed.version}-win-x64` || !signed.components) throw new Error("待安装版本与发布者授权不一致。");
    const componentFile = inside(portableRoot, `.ai-runtime/versions/${ready.candidate}/resources/app/ai-os-components.json`);
    const bytes = fs.readFileSync(componentFile);
    if (bytes.length !== signed.components.size || crypto.createHash("sha256").update(bytes).digest("hex") !== signed.components.sha256.toLowerCase()) throw new Error("待安装候选清单不符合发布者授权。");
  };
  if (portableRoot) {
    try {
      const result = readJson(file("result.json"));
      status = { ...status, status: result.status, error: result.error || null };
    } catch {}
    try {
      status = { ...status, componentState: inspectComponentState(portableRoot) };
    } catch {}
    try {
      const ready = readJson(file("ready.json"));
      const componentRollback = normalizeComponentRollback(ready.componentRollback);
      const versionComparison = compareVersions(ready.version, currentVersion);
      if (versionComparison > 0 || (versionComparison === 0 && componentRollback)) {
        authorizePrepared(ready);
        require("./update-install").validateRuntime(portableRoot, ready.candidate);
        prepared = {
          candidate: String(ready.candidate || ""),
          version: parseVersion(ready.version).text,
          notes: String(ready.notes || ""),
          authorization: ready.authorization,
          ...(componentRollback ? { componentRollback } : {}),
        };
        status = {
          ...status,
          status: "ready",
          availableVersion: componentRollback ? "" : prepared.version,
          notes: prepared.notes,
          progress: 1,
          error: null,
          componentRollback,
        };
      }
    } catch (error) { if (error.code !== "ENOENT") status = { ...status, status:"error", error:error.message }; }
  }
  const requestBytes = async (url, limit, accept = "application/json") => {
    let response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: accept, "User-Agent": "AI-OS-Updater/1", "X-GitHub-Api-Version": "2022-11-28" } });
    } catch (error) {
      throw networkFailure(error, url);
    }
    if (response.status === 404) { const error = new Error("GitHub Releases 尚未发布可用更新。"); error.code = "UNPUBLISHED"; throw error; }
    return readResponseBytes(response, limit);
  };
  const requestJson = async (...args) => JSON.parse((await requestBytes(...args)).toString("utf8"));
  const run = (name, fn) => {
    if (operation) return operationName === name ? operation : Promise.reject(new Error("更新操作正在进行，请稍候。"));
    operationName = name;
    operation = Promise.resolve().then(fn).catch(error => publish({ status: error.code === "UNPUBLISHED" ? "unpublished" : "error", error: error.message, progress: 0 })).finally(() => { operation = null; operationName = ""; });
    return operation;
  };
  async function check() {
    ensurePortable();
    if (prepared) return publish({status:"ready", progress:1, error:null});
    return run("check", async () => {
      info = null;
      publish({ status: "checking", error: null, progress: 0, availableVersion: null, notes: "" });
      const release = parseRelease(await requestJson(UPDATE_SOURCE, 2_000_000), currentVersion);
      if (!release) return publish({ status: "up-to-date" });
      const signedManifest = await requestJson(release.manifestUrl, 64_000, "application/octet-stream");
      const authenticationMode = verifyReleaseAuthentication(signedManifest, release, options.trustPolicy || require('./update-trust.json'), options.trustedKeys);
      const manifest = validateManifest(signedManifest, release);
      let componentManifest = null;
      let componentPlan = null;
      let componentManifestBytes = null;
      if (manifest.componentManifestAsset) {
        componentManifestBytes = await requestBytes(manifest.componentManifestAsset.url, 10_000_000, "application/octet-stream");
        if (componentManifestBytes.length !== manifest.componentManifestAsset.size || crypto.createHash("sha256").update(componentManifestBytes).digest("hex") !== manifest.componentManifestAsset.sha256.toLowerCase()) throw new Error("组件清单大小或 SHA-256 校验失败。");
        componentManifest = validateComponentManifest(
          JSON.parse(componentManifestBytes.toString("utf8")),
          release,
          manifest.componentManifestAsset,
        );
        componentPlan = selectChangedComponents(readInstalledComponentManifest(portableRoot), componentManifest);
      }
      if (!componentManifest) throw new Error("更新缺少精确组件和运行时文件清单，请使用完整便携版受控迁移。");
      info = { release, manifest, signedManifest, componentManifest, componentManifestBytes, componentPlan };
      const componentUpdate = componentPlan && !componentPlan.requiresFullUpdate && componentPlan.changed.length
        ? {
          changedCount: componentPlan.changed.length,
          totalCount: componentManifest.components.length,
          downloadSize: componentPlan.downloadSize,
        }
        : null;
      return publish({
        status: "available",
        authenticationMode,
        authenticationNotice: authenticationMode === 'ed25519' ? '发布清单已通过数字签名验证。' : '来源为官方 GitHub 仓库，通过 HTTPS 与 SHA-256 校验；本版本未启用发布者数字签名。',
        availableVersion: release.version,
        notes: [release.notes, authenticationMode === 'github-release-assets' ? '更新来源：官方 GitHub 仓库，采用 HTTPS 与 SHA-256 校验；未启用发布者数字签名。' : '更新清单已通过数字签名验证。'].filter(Boolean).join('\n\n'),
        size: componentUpdate?.downloadSize || manifest.size,
        fullSize: manifest.size,
        componentUpdate,
      });
    });
  }
  async function downloadComponentUpdate(plan) {
    const candidate = `${info.release.version}-win-x64`;
    const componentCache = `.ai-runtime/updates/components/${info.release.version}`;
    const cachedRoot = inside(portableRoot, componentCache);
    if (fs.existsSync(cachedRoot)) removeInside(portableRoot, componentCache);
    publish({
      status: "downloading",
      progress: 0,
      error: null,
      componentUpdate: {
        changedCount: plan.changed.length,
        totalCount: info.componentManifest.components.length,
        downloadSize: plan.downloadSize,
      },
    });
    let downloaded = 0;
    let lastProgress = 0;
    for (const component of plan.changed) {
      const target = inside(portableRoot, `${componentCache}/${component.asset.fileName}`);
      await downloadFile(component.asset.url, target, component.asset, {
        fetchImpl,
        onProgress: (componentProgress) => {
          const progress = plan.downloadSize
            ? Math.min(1, (downloaded + component.asset.size * componentProgress) / plan.downloadSize)
            : 1;
          if (Date.now() - lastProgress > 100 || progress === 1) {
            lastProgress = Date.now();
            publish({ progress });
          }
        },
      });
      downloaded += component.asset.size;
    }
    publish({ status: "preparing", progress: 1 });
    const staging = await fsp.mkdtemp(file("stage-"));
    try {
      const active = runtimeName(fs.readFileSync(inside(portableRoot, ".ai-runtime/.active-runtime"), "utf8").trim());
      if (active === candidate) throw new Error("不能覆盖正在运行的版本。");
      if (fs.existsSync(file("install.json"))) throw new Error("已有更新等待完成。");
      const activeRoot = inside(portableRoot, `.ai-runtime/versions/${active}`);
      const candidateRoot = path.join(staging, candidate);
      copyManagedRuntime(activeRoot, candidateRoot, readInstalledComponentManifest(portableRoot));
      const candidateApp = path.join(candidateRoot, "resources", "app");
      for (const component of plan.changed) {
        const zip = inside(portableRoot, `${componentCache}/${component.asset.fileName}`);
        const extractRoot = path.join(staging, `component-${component.id}`);
        const extracted = await extractComponentZipSafe(zip, extractRoot, component.id);
        // Reject extra archive files instead of silently ignoring injected payloads.
        const expectedFiles = new Set(component.files.map(file => file.path.toLowerCase()));
        const inspect = (dir, prefix = "") => {
          for (const name of fs.readdirSync(dir)) {
            const relative = prefix ? `${prefix}/${name}` : name, target = inside(extracted, relative), stat = fs.lstatSync(target);
            if (stat.isDirectory()) inspect(target, relative);
            else if (!stat.isFile() || !expectedFiles.delete(relative.toLowerCase())) throw new Error(`组件包精确文件集合不一致：${relative}`);
          }
        };
        inspect(extracted);
        if (expectedFiles.size) throw new Error("组件包缺少清单文件。");
        for (const removedFile of component.removedFiles) {
          removePathStrict(inside(candidateApp, removedFile));
        }
        for (const file of component.files) {
          const source = inside(extracted, file.path);
          const destination = inside(candidateApp, file.path);
          copyFileVerified(source, destination, file);
        }
      }
      atomicWrite(path.join(candidateApp, "ai-os-components.json"), info.componentManifestBytes.toString("utf8"));
      require("./update-install").validateRuntime(staging, candidate, "");
      verifyNativeCompatibility(candidateRoot, info.componentManifest);
      const destination = inside(portableRoot, `.ai-runtime/versions/${candidate}`);
      if (fs.existsSync(destination)) removeInside(portableRoot, `.ai-runtime/versions/${candidate}`);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await renameWithRetry(candidateRoot, destination);
      prepared = {
        authorization: { manifest: info.signedManifest, release: serializedRelease(info.release) },
        candidate,
        version: info.release.version,
        notes: info.release.notes,
        componentUpdate: {
          changedCount: plan.changed.length,
          totalCount: info.componentManifest.components.length,
          downloadSize: plan.downloadSize,
        },
      };
      atomicWrite(file("ready.json"), prepared);
      return publish({ status: "ready", progress: 1, componentUpdate: prepared.componentUpdate });
    } finally {
      removeInside(portableRoot, path.relative(portableRoot, staging).split(path.sep).join("/"));
      removeInside(portableRoot, componentCache);
    }
  }
  async function download() {
    ensurePortable();
    if (prepared) return publish({status:"ready", progress:1, error:null});
    if (!info) await check();
    return run("download", async () => {
      if (!info) throw new Error("没有可下载的更新，请先检查更新。");
      const componentPlan = info.componentManifest
        ? selectChangedComponents(readInstalledComponentManifest(portableRoot), info.componentManifest)
        : null;
      pruneOrphanedUpdateArtifacts(portableRoot);
      preflightUpdateSpace(portableRoot, info, componentPlan);
      if (componentPlan && !componentPlan.requiresFullUpdate && componentPlan.changed.length) {
        return downloadComponentUpdate(componentPlan);
      }
      const zip = file(info.manifest.fileName);
      publish({ status: "downloading", progress: 0, error: null });
      let lastProgress = 0;
      await downloadFile(info.manifest.url, zip, info.manifest, { fetchImpl, onProgress: progress => {
        if (Date.now() - lastProgress > 100 || progress === 1) { lastProgress = Date.now(); publish({progress}); }
      } });
      publish({ status: "preparing", progress: 1 });
      const staging = await fsp.mkdtemp(file("stage-"));
      const candidate = `${info.release.version}-win-x64`;
      try {
        const extracted = await extractZipSafe(zip, staging, candidate);
        const manifestFile = inside(extracted, "resources/app/ai-os-components.json");
        if (!fs.readFileSync(manifestFile).equals(info.componentManifestBytes)) throw new Error("完整更新包内清单与受信发布清单不一致。");
        require("./update-install").validateRuntime(staging, candidate, "");
        verifyNativeCompatibility(extracted, info.componentManifest);
        const destination = inside(portableRoot, `.ai-runtime/versions/${candidate}`);
        const active = fs.readFileSync(inside(portableRoot, ".ai-runtime/.active-runtime"), "utf8").trim();
        if (active === candidate) throw new Error("不能覆盖正在运行的版本。");
        if (fs.existsSync(file("install.json"))) throw new Error("已有更新等待完成。");
        if (fs.existsSync(destination)) removeInside(portableRoot, `.ai-runtime/versions/${candidate}`);
        await fsp.mkdir(path.dirname(destination), { recursive: true });
        await renameWithRetry(extracted, destination);
        prepared = { candidate, version: info.release.version, notes: info.release.notes, authorization: { manifest: info.signedManifest, release: serializedRelease(info.release) } };
        atomicWrite(file("ready.json"), prepared);
        return publish({ status: "ready", progress: 1 });
      } finally {
        removeInside(portableRoot, path.relative(portableRoot, staging).split(path.sep).join("/"));
      }
    });
  }
  async function rollbackComponent(componentId) {
    ensurePortable();
    const id = String(componentId || "");
    if (!COMPONENT_ID_RE.test(id)) throw Object.assign(new Error("组件标识无效。"), { code: "invalid_component" });
    if (prepared) throw new Error("已有更新等待重启完成，请先完成当前更新。");
    if (fs.existsSync(file("install.json"))) throw new Error("已有更新正在安装，请稍候。");
    return run("component-rollback", async () => {
      publish({
        status: "preparing",
        progress: 0,
        error: null,
        availableVersion: "",
        notes: "",
        size: null,
        fullSize: null,
        componentUpdate: null,
        componentRollback: null,
      });
      const rollback = prepareComponentRollback(portableRoot, id, { version: currentVersion });
      require("./update-install").validateRuntime(portableRoot, rollback.candidate);
      prepared = {
        candidate: rollback.candidate,
        version: parseVersion(rollback.version).text,
        notes: "",
        componentRollback: normalizeComponentRollback(rollback.componentRollback),
      };
      atomicWrite(file("ready.json"), prepared);
      return publish({
        status: "ready",
        progress: 1,
        error: null,
        availableVersion: "",
        notes: "",
        size: null,
        fullSize: null,
        componentUpdate: null,
        componentRollback: prepared.componentRollback,
      });
    });
  }
  async function restart() {
    ensurePortable();
    return run("restart", async () => {
      if (!prepared) throw new Error("请先下载更新。");
      authorizePrepared(prepared);
      require("./update-install").validateRuntime(portableRoot, prepared.candidate);
      if (typeof options.onRestart !== "function") throw new Error("桌面宿主不支持更新重启。");
      publish({status:"restarting",error:null});
      await options.onRestart(prepared.candidate);
      return clone(status);
    });
  }
  return Object.freeze({ getStatus: () => clone(status), subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, check, download, stage: download, rollbackComponent, restart });
}
module.exports = {
  UPDATE_SOURCE,
  compareVersions,
  parseRelease,
  validateManifest,
  validateComponentManifest,
  readInstalledComponentManifest,
  selectChangedComponents,
  preflightUpdateSpace,
  pruneOrphanedUpdateArtifacts,
  downloadFile,
  renameWithRetry,
  createUpdater,
  verifyReleaseAuthentication,
  copyManagedRuntime,
  extractZipSafe,
  extractComponentZipSafe,
  createUpdateFetcher,
};
