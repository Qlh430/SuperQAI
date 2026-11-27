"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const CanvasAgentRuntime = require("./canvas-agent-runtime");

const LIMITS = Object.freeze({
  archiveBytes: 24 * 1024 * 1024,
  files: 256,
  fileBytes: 8 * 1024 * 1024,
  skillBytes: 1024 * 1024,
  totalBytes: 40 * 1024 * 1024,
  ratio: 200,
  previewsPerUser: 12,
  previewTtlMs: 5 * 60 * 1000,
});

function createInstallError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      const commentBytes = buffer.readUInt16LE(offset + 20);
      if (offset + 22 + commentBytes === buffer.length) return offset;
    }
  }
  throw createInstallError("invalid_archive", "ZIP 文件目录不完整或格式无效。");
}

function validateArchivePath(rawPath, isDirectory) {
  const value = String(rawPath || "");
  if (!value || value.includes("\0") || value.includes("\\") || value.startsWith("/")
    || /^[a-zA-Z]:/.test(value)) {
    throw createInstallError("unsafe_archive_path", "ZIP 内包含不安全的绝对路径。");
  }
  const normalized = isDirectory ? value.replace(/\/+$/, "") : value;
  const parts = normalized.split("/");
  if (!normalized || parts.some((part) => !part || part === "." || part === ".."
    || /[<>:"|?*]/.test(part) || /[. ]$/.test(part)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw createInstallError("unsafe_archive_path", "ZIP 内包含不安全或无效的文件路径。");
  }
  return { normalized, parts };
}

function parseSkillArchive(input, customLimits = {}) {
  const limits = { ...LIMITS, ...customLimits };
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!buffer.length || buffer.length > limits.archiveBytes) {
    throw createInstallError("archive_too_large", "ZIP 文件为空或超过导入体积限制。", 413);
  }
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const diskEntries = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (diskNumber || centralDisk || diskEntries !== entryCount
    || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
    || entryCount > limits.files
    || centralOffset + centralSize !== eocdOffset) {
    throw createInstallError("unsupported_archive", "不支持分卷、ZIP64 或超出文件数量限制的压缩包。");
  }

  const entries = [];
  const seen = new Set();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw createInstallError("invalid_archive", "ZIP 中央目录条目无效。");
    }
    const madeBy = buffer.readUInt16LE(offset + 4);
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const checksum = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const startDisk = buffer.readUInt16LE(offset + 34);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + filenameLength;
    const entryEnd = nameEnd + extraLength + commentLength;
    if (entryEnd > eocdOffset || startDisk !== 0 || localOffset >= centralOffset) {
      throw createInstallError("invalid_archive", "ZIP 条目的偏移或分卷信息无效。");
    }
    if (flags & 0x0001) throw createInstallError("encrypted_archive", "受密码保护的 ZIP 不能导入。");
    if (method !== 0 && method !== 8) {
      throw createInstallError("unsupported_compression", "ZIP 使用了不支持的压缩算法。");
    }
    const rawName = (flags & 0x0800)
      ? new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(nameStart, nameEnd))
      : buffer.subarray(nameStart, nameEnd).toString("utf8");
    const isDirectory = rawName.endsWith("/");
    const { normalized, parts } = validateArchivePath(rawName, isDirectory);
    const key = normalized.normalize("NFC").toLocaleLowerCase("en-US");
    if (seen.has(key)) throw createInstallError("duplicate_archive_path", "ZIP 内存在重名文件，无法安全导入。");
    seen.add(key);

    const unixHost = (madeBy >>> 8) === 3 || (madeBy >>> 8) === 19;
    const unixMode = unixHost ? externalAttributes >>> 16 : 0;
    const fileType = unixMode & 0o170000;
    if (fileType === 0o120000 || fileType && fileType !== (isDirectory ? 0o040000 : 0o100000)) {
      throw createInstallError("unsafe_archive_link", "ZIP 内含符号链接或特殊文件，无法导入。");
    }
    if (isDirectory) {
      offset = entryEnd;
      continue;
    }
    if (compressedSize > limits.archiveBytes || uncompressedSize > limits.fileBytes) {
      throw createInstallError("archive_file_too_large", `ZIP 文件 ${normalized} 超过单文件体积限制。`, 413);
    }
    if (compressedSize === 0 && uncompressedSize > 0
      || compressedSize > 0 && uncompressedSize / compressedSize > limits.ratio) {
      throw createInstallError("archive_ratio_exceeded", `ZIP 文件 ${normalized} 的压缩比例异常。`, 413);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.totalBytes) {
      throw createInstallError("archive_too_large", "ZIP 解压后总体积超过限制。", 413);
    }
    const localHeaderEnd = localOffset + 30;
    if (localHeaderEnd > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw createInstallError("invalid_archive", `ZIP 文件 ${normalized} 的本地头无效。`);
    }
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localNameStart = localHeaderEnd;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (localFlags !== flags || localMethod !== method || localNameEnd > centralOffset
      || dataEnd > centralOffset || !buffer.subarray(localNameStart, localNameEnd).equals(buffer.subarray(nameStart, nameEnd))) {
      throw createInstallError("invalid_archive", `ZIP 文件 ${normalized} 的本地头与中央目录不一致。`);
    }
    const compressed = buffer.subarray(dataStart, dataEnd);
    let content;
    try {
      content = method === 0
        ? Buffer.from(compressed)
        : zlib.inflateRawSync(compressed, { maxOutputLength: limits.fileBytes });
    } catch {
      throw createInstallError("invalid_archive", `ZIP 文件 ${normalized} 解压失败。`);
    }
    if (content.length !== uncompressedSize || crc32(content) !== checksum) {
      throw createInstallError("invalid_archive", `ZIP 文件 ${normalized} 校验失败。`);
    }
    entries.push({ path: normalized, content });
    offset = entryEnd;
  }
  if (offset !== centralOffset + centralSize) {
    throw createInstallError("invalid_archive", "ZIP 中央目录长度不一致。");
  }
  return normalizeSkillFiles(entries, limits);
}

function normalizeSkillFiles(entries, limits = LIMITS) {
  if (!Array.isArray(entries) || !entries.length || entries.length > limits.files) {
    throw createInstallError("invalid_skill_package", "导入包必须包含有限数量的普通文件。");
  }
  const normalized = [];
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of entries) {
    const rawPath = String(entry?.path || "");
    const { normalized: safePath } = validateArchivePath(rawPath, false);
    const key = safePath.normalize("NFC").toLocaleLowerCase("en-US");
    if (seen.has(key)) throw createInstallError("duplicate_archive_path", "导入包内存在重名文件。");
    seen.add(key);
    const content = Buffer.isBuffer(entry?.content) ? Buffer.from(entry.content)
      : typeof entry?.content === "string" ? Buffer.from(entry.content, "utf8") : null;
    if (!content) throw createInstallError("invalid_skill_package", "导入包包含非普通文件。");
    if (content.length > limits.fileBytes) throw createInstallError("archive_file_too_large", `文件 ${safePath} 超过体积限制。`, 413);
    totalBytes += content.length;
    if (totalBytes > limits.totalBytes) throw createInstallError("archive_too_large", "导入包总体积超过限制。", 413);
    normalized.push({ path: safePath, content });
  }
  const allParts = normalized.map((file) => file.path.split("/"));
  const firstPart = allParts[0][0];
  const stripRoot = allParts.every((parts) => parts.length > 1 && parts[0] === firstPart);
  const files = normalized.map((file) => ({
    path: stripRoot ? file.path.slice(firstPart.length + 1) : file.path,
    content: file.content,
  }));
  const skillFiles = files.filter((file) => file.path.toLowerCase() === "skill.md");
  if (skillFiles.length !== 1) {
    throw createInstallError("invalid_skill_package", "导入包必须且只能包含一个根目录 SKILL.md。");
  }
  if (skillFiles[0].path !== "SKILL.md") {
    throw createInstallError("invalid_skill_package", "Skill 主文件必须准确命名为根目录 SKILL.md。");
  }
  if (skillFiles[0].content.length > limits.skillBytes) {
    throw createInstallError("skill_document_too_large", "SKILL.md 超过 1 MiB 限制。", 413);
  }
  for (const file of files) {
    if (/[\u0000-\u001f\u007f]/.test(file.path) || file.path.split("/").some((part) => part.startsWith("."))) {
      throw createInstallError("unsupported_skill_path", `文件路径 ${file.path} 不受支持。`);
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function decodeUploadFiles(files, limits = LIMITS) {
  if (!Array.isArray(files) || !files.length || files.length > limits.files) {
    throw createInstallError("invalid_skill_package", "请选择一个 Skill 文件或有限数量的 Skill 文件。");
  }
  const decoded = files.map((file) => {
    const encoded = String(file?.content || "");
    if (!encoded || encoded.length > Math.ceil(limits.fileBytes * 4 / 3) + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw createInstallError("invalid_skill_package", "上传文件内容格式不合法或超过大小限制。", 413);
    }
    return { path: String(file?.path || ""), content: Buffer.from(encoded, "base64") };
  });
  return normalizeSkillFiles(decoded, limits);
}

function detectDependencies(skill, files) {
  const text = `${skill.description}\n${skill.instructions}`.toLowerCase();
  const dependencies = new Set();
  const patterns = [
    [/\bpython(?:\s*(?:3(?:\.\d+)?|>=?\s*\d+(?:\.\d+)?))?\b|\.py\b/, "Python"],
    [/\b(?:bash|shell|powershell|cmd(?:\.exe)?)\b|\.sh\b|\.ps1\b/, "Shell"],
    [/\b(?:node\.?js|npm|npx|pnpm|yarn)\b/, "Node.js/CLI"],
    [/\b(?:mcp|model context protocol)\b/, "MCP 服务"],
    [/\b(?:browser|playwright|chrome|chromium)\b/, "浏览器自动化"],
    [/\b(?:pip install|npm install|brew install|apt install|cargo install)\b/, "外部依赖"],
  ];
  for (const [pattern, label] of patterns) if (pattern.test(text)) dependencies.add(label);
  if (files.some((file) => file.path.startsWith("scripts/"))) dependencies.add("包内脚本（不会自动运行）");
  return [...dependencies];
}

function evaluateCompatibility(skill, files) {
  const dependencies = detectDependencies(skill, files);
  const scripts = files.some((file) => file.path.startsWith("scripts/"));
  const external = dependencies.some((item) => item !== "包内脚本（不会自动运行）");
  return {
    status: external ? "缺少外部依赖" : scripts ? "部分兼容" : "可直接使用",
    dependencies,
    detail: external
      ? "Skill 提到了外部工具或服务；AI OS 不会安装依赖或执行包内脚本。"
      : scripts
        ? "已保留 scripts 资源，但 AI OS 不会自动执行脚本。"
        : "未检测到必须的外部执行依赖；是否能完成具体任务仍取决于现有工具能力。",
  };
}

function createSkillImportManager({
  registry,
  dataDir,
  tokenFactory = () => crypto.randomBytes(32).toString("hex"),
  now = () => Date.now(),
  limits = LIMITS,
} = {}) {
  if (!registry || typeof registry.installPersonalSkill !== "function" || typeof registry.listPersonalSkills !== "function") {
    throw new TypeError("Skill Import Manager requires a personal-skill capable registry.");
  }
  if (!String(dataDir || "").trim()) throw new TypeError("Skill Import Manager requires a data directory.");
  const previews = new Map();

  function assertUser(userId) {
    const id = String(userId || "").trim();
    if (!id) throw createInstallError("unauthorized", "需要登录后管理个人 Skill。", 401);
    return id;
  }

  function cleanExpiredPreviews() {
    const current = Number(now());
    for (const [token, preview] of previews) {
      if (preview.expiresAt <= current) previews.delete(token);
    }
  }

  async function getLocalFiles(request, trustedFiles = null) {
    if (trustedFiles) return { files: trustedFiles };
    if (request?.archive) {
      const archiveName = String(request.archiveName || "skill.zip");
      if (!/\.(?:zip|skill)$/i.test(archiveName)) {
        throw createInstallError("unsupported_skill_source", "压缩包需要使用 ZIP 或 .skill 文件格式。");
      }
      const encoded = String(request.archive);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length > Math.ceil(limits.archiveBytes * 4 / 3) + 8) {
        throw createInstallError("archive_too_large", "ZIP 文件编码无效或超过体积限制。", 413);
      }
      return { files: parseSkillArchive(Buffer.from(encoded, "base64"), limits) };
    }
    if (Array.isArray(request?.files)) return { files: decodeUploadFiles(request.files, limits) };
    throw createInstallError("unsupported_skill_source", "请选择本地 SKILL.md、Skill 文件夹或 ZIP；当前不支持联网安装。");
  }

  function validateExecutionPackage(skill, files) {
    if (!files.some((file) => file.path === "agent.skill.json")) return;
    let temporaryRoot = "";
    try {
      temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-skill-preview-"));
      const skillDirectory = path.join(temporaryRoot, skill.id);
      for (const file of files) {
        const relative = String(file.path).replaceAll("\\", "/");
        const target = path.join(skillDirectory, ...relative.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content, { flag: "wx" });
      }
      const catalog = CanvasAgentRuntime.loadCanvasSkillCatalog([
        { directory: temporaryRoot, origin: "custom" },
      ]);
      const validated = catalog.all.find((item) => item.id === skill.id
        && path.resolve(item.directory) === path.resolve(skillDirectory));
      if (!validated) throw new Error("Skill 执行清单未能完成解析。");
    } catch (error) {
      const message = String(error?.message || "Skill 执行清单校验失败。")
        .replaceAll(temporaryRoot, "[Skill 预览目录]");
      throw createInstallError("invalid_skill_execution_manifest", `agent.skill.json 配置无效：${message}`);
    } finally {
      if (temporaryRoot) {
        try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch {}
      }
    }
  }

  async function previewInternal(userId, request = {}, internal = {}) {
    const owner = assertUser(userId);
    cleanExpiredPreviews();
    const scope = request.scope === "public" ? "public" : "personal";
    const local = await getLocalFiles(request, internal.files || null);
    const files = normalizeSkillFiles(local.files, limits);
    const document = files.find((file) => file.path === "SKILL.md");
    let skill;
    try { skill = CanvasAgentRuntime.parseSkillDocument(document.content.toString("utf8"), "SKILL.md"); }
    catch (error) { throw createInstallError("invalid_skill_document", `SKILL.md 格式无效：${error.message}`); }
    validateExecutionPackage(skill, files);
    const existing = scope === "public"
      ? registry.listPublicSkills(owner)
      : registry.listPersonalSkills(owner);
    if (existing.some((entry) => entry.id === skill.id)) {
      throw createInstallError("skill_already_installed", `你已安装「${skill.id}」。`, 409);
    }
    if (scope === "public" && registry.hasPersonalSkillInstalledByAnyUser(skill.id, internal.allowOwnPrivate ? owner : "")) {
      throw createInstallError("skill_id_conflict", `Skill 标识「${skill.id}」已被某个账户的私人 Skill 使用，不能发布到公共库。`, 409);
    }
    const conflicts = scope === "public"
      ? registry.findSharedSkillConflicts(skill.id)
      : registry.findSkillConflicts(owner, skill.id);
    if (conflicts.length) {
      throw createInstallError("skill_id_conflict", `Skill 标识「${skill.id}」与已有 ${conflicts[0].scope === "system" ? "系统" : "共享"} Skill 冲突，不能覆盖。`, 409);
    }
    const source = request?.source || {};
    const sourceUrl = String(source.label || "本地导入").slice(0, 512);
    const sourceType = "upload";
    const sourceRevision = String(skill.metadata?.version || "");
    const compatibility = evaluateCompatibility(skill, files);
    const digest = crypto.createHash("sha256");
    files.forEach((file) => digest.update(file.path).update("\0").update(file.content));
    const contentSha256 = digest.digest("hex");
    const token = String(tokenFactory());
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error("Skill preview token factory returned an invalid token.");
    const userPreviews = [...previews.values()].filter((item) => item.owner === owner);
    if (userPreviews.length >= limits.previewsPerUser) {
      const oldest = userPreviews.sort((left, right) => left.createdAt - right.createdAt)[0];
      if (oldest) previews.delete(oldest.token);
    }
    const installInfo = {
      sourceType,
      scope,
      source: sourceUrl,
      revision: sourceRevision || String(skill.metadata?.version || ""),
      version: String(skill.metadata?.version || sourceRevision || ""),
      license: String(skill.license || ""),
      compatibility,
      dependencies: compatibility.dependencies,
      sha256: contentSha256,
      installedAt: new Date(Number(now())).toISOString(),
      ...(internal.presentation ? { publishedPresentation: internal.presentation } : {}),
    };
    previews.set(token, {
      token,
      owner,
      scope,
      allowOwnPrivate: Boolean(internal.allowOwnPrivate),
      files,
      installInfo,
      skillId: skill.id,
      createdAt: Number(now()),
      expiresAt: Number(now()) + limits.previewTtlMs,
    });
    return {
      status: "ready",
      previewToken: token,
      id: skill.id,
      name: skill.name,
      label: skill.canvas.label,
      description: skill.description,
      license: installInfo.license,
      version: installInfo.version,
      sourceType,
      scope,
      source: sourceUrl,
      files: files.map((file) => ({ path: file.path, bytes: file.content.length })),
      compatibility,
      requiresConfirmation: true,
      executesScripts: false,
    };
  }

  function preview(userId, request = {}) {
    return previewInternal(userId, request);
  }

  function confirm(userId, previewToken) {
    let phase = "preview-credential";
    try {
      const owner = assertUser(userId);
      cleanExpiredPreviews();
      const token = String(previewToken || "");
      const preview = previews.get(token);
      if (!preview || preview.owner !== owner) {
        throw createInstallError("skill_preview_expired", "Skill 预检已失效或不属于当前账户，请重新检查。", 404);
      }
      if (preview.expiresAt <= Number(now())) {
        previews.delete(token);
        throw createInstallError("skill_preview_expired", "Skill 预检已过期，请重新检查。", 410);
      }
      phase = "skill-validation";
      const conflicts = preview.scope === "public"
        ? registry.findSharedSkillConflicts(preview.skillId)
        : registry.findSkillConflicts(owner, preview.skillId);
      if (conflicts.length) throw createInstallError("skill_id_conflict", "预检后发现 Skill 标识冲突；原有 Skill 未更改。", 409);
      if (preview.scope === "public"
        && registry.hasPersonalSkillInstalledByAnyUser(preview.skillId, preview.allowOwnPrivate ? owner : "")) {
        throw createInstallError("skill_id_conflict", "预检后发现私人 Skill 标识冲突；公共库未更改。", 409);
      }
      const existing = preview.scope === "public" ? registry.listPublicSkills(owner) : registry.listPersonalSkills(owner);
      if (existing.some((entry) => entry.id === preview.skillId)) {
        throw createInstallError("skill_already_installed", "该 Skill 已安装；没有覆盖现有文件。", 409);
      }
      phase = "file-processing";
      registry.installPersonalSkill(
        owner,
        preview.skillId,
        preview.files,
        preview.installInfo,
        preview.scope,
        preview.allowOwnPrivate,
      );
      phase = "registration-visibility";
      previews.delete(token);
      const installed = preview.scope === "public" ? registry.listPublicSkills(owner) : registry.listPersonalSkills(owner);
      return installed.find((item) => item.id === preview.skillId);
    } catch (error) {
      if (error && typeof error === "object" && !error.skillInstallPhase) {
        Object.defineProperty(error, "skillInstallPhase", { value: phase, configurable: true });
      }
      throw error;
    }
  }

  function cancelPreview(userId, previewToken) {
    const owner = assertUser(userId);
    const preview = previews.get(String(previewToken || ""));
    if (!preview || preview.owner !== owner) return false;
    previews.delete(preview.token);
    return true;
  }

  function previewScope(userId, previewToken) {
    const owner = assertUser(userId);
    const preview = previews.get(String(previewToken || ""));
    if (!preview || preview.owner !== owner || preview.expiresAt <= Number(now())) return "";
    return preview.scope;
  }

  async function publishPersonal(userId, skillId, authorizeMedia) {
    const owner = assertUser(userId);
    const { files, presentation } = registry.readPersonalSkillFiles(owner, skillId, limits);
    if (presentation) {
      const packagePaths = new Set(files.map(file => file.path));
      const urls = new Set();
      for (const item of presentation.media) {
        if (item.path && !packagePaths.has(item.path)) {
          throw createInstallError("invalid_skill_media", "Skill 包内展示素材已移除，请检查展示资料。");
        }
        if (item.url) urls.add(item.url);
        if (item.posterUrl) urls.add(item.posterUrl);
      }
      for (const url of urls) {
        if (!authorizeMedia) throw createInstallError("forbidden", "无法核验 Skill 展示素材。", 403);
        await authorizeMedia(owner, url);
      }
    }
    const preview = await previewInternal(owner, {
      scope: "public",
      source: { type: "upload", label: "从私人 Skill 发布到本机公共库" },
    }, {
      files,
      presentation,
      allowOwnPrivate: true,
    });
    try { return confirm(owner, preview.previewToken); }
    catch (error) {
      cancelPreview(owner, preview.previewToken);
      throw error;
    }
  }

  return Object.freeze({
    preview,
    confirm,
    cancelPreview,
    previewScope,
    publishPersonal,
    list: (userId) => registry.listPersonalSkills(assertUser(userId)),
    setEnabled: (userId, skillId, enabled) => registry.setPersonalEnabled(assertUser(userId), skillId, enabled),
    uninstall: (userId, skillId) => registry.uninstallPersonalSkill(assertUser(userId), skillId),
    listPublic: (userId) => registry.listPublicSkills(assertUser(userId)),
    setPublicEnabled: (userId, skillId, enabled) => registry.setPublicSkillEnabled(assertUser(userId), skillId, enabled),
    uninstallPublic: (userId, skillId) => registry.uninstallPublicSkill(assertUser(userId), skillId),
  });
}

module.exports = {
  LIMITS,
  createSkillImportManager,
  decodeUploadFiles,
  evaluateCompatibility,
  normalizeSkillFiles,
  parseSkillArchive,
};
