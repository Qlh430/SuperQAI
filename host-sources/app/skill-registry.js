"use strict";

// Skill 注册表：把「随应用部署的系统 Skill」和「用户自建/导入的功能 Skill」
// 统一成一份目录，并用 data/skills.json 保存启用状态。
// 参考 DX OS 的 skills.json：{ enabled: { id: false } }，缺省即启用。

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const CanvasAgentRuntime = require("./canvas-agent-runtime");

const SKILLS_STORE_FILE = "skills.json";
const PERSONAL_SKILL_INSTALLS_FILE = "skill-installs.json";
const ORIGIN_SYSTEM = "system";
const ORIGIN_CUSTOM = "custom";
const BUNDLED_SHOWCASE_SKILL_IDS = new Set([
  "commercial-product-photography-10",
  "fashion-ecommerce-ai-model-video",
  "natural-aesthetic-product-photography",
]);
const SKILL_VALIDATION_STATES = new Set(["unverified", "testing", "partial", "verified", "needs_fix", "deprecated"]);
const SKILL_VALIDATION_STAGES = ["agentInvocation", "informationCollection", "planGeneration", "nodeCreation", "workflowExecution", "outputQuality"];
const STAGE_EVIDENCE = new Set(["live", "isolated", "issue", "unverified", "not_applicable"]);

// 分类分组：与 DX OS「系统 Skill」一致的四类归档，用于设置界面折叠展示。
const SKILL_GROUPS = Object.freeze([
  Object.freeze({
    id: "text",
    label: "对话与文本",
    description: "写作、改写、代码与文本分析。",
    categories: Object.freeze(["text", "general"]),
  }),
  Object.freeze({
    id: "image",
    label: "图像",
    description: "图片生成、编辑与视觉理解能力。",
    categories: Object.freeze(["image", "ecommerce", "marketing", "social"]),
  }),
  Object.freeze({
    id: "video",
    label: "视频",
    description: "视频生成与多模态参考素材处理能力。",
    categories: Object.freeze(["video"]),
  }),
  Object.freeze({
    id: "audio",
    label: "音频",
    description: "语音、音乐与音频生成处理能力。",
    categories: Object.freeze(["audio"]),
  }),
]);

const CATEGORY_LABELS = Object.freeze({
  text: "对话与文本",
  general: "通用",
  image: "图像",
  ecommerce: "电商",
  marketing: "营销",
  social: "社媒",
  video: "视频",
  audio: "音频",
});

// 展示分类独立于 canvas.category；不参与工具路由或权限判断。
const SHOWCASE_CATEGORIES = Object.freeze([
  { id: "image", label: "图像创作" }, { id: "video", label: "视频创作" },
  { id: "marketing", label: "商业广告" }, { id: "ecommerce", label: "电商设计" },
  { id: "storyboard", label: "分镜与脚本" }, { id: "audio", label: "音频创作" },
  { id: "text", label: "文本创作" }, { id: "productivity", label: "效率工具" },
  { id: "general", label: "通用" },
].map(Object.freeze));

const DEFAULT_GROUP_ID = "text";

function groupForCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  return SKILL_GROUPS.find((group) => group.categories.includes(value)) || SKILL_GROUPS.find((group) => group.id === DEFAULT_GROUP_ID);
}

function categoryLabel(category) {
  const value = String(category || "").trim().toLowerCase();
  return CATEGORY_LABELS[value] || SKILL_GROUPS.find((group) => group.id === DEFAULT_GROUP_ID).label;
}

function createError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, safeMessage: message, statusCode });
}

function safeRelativeSkillPath(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)
    || normalized.includes("\0")
    || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw createError("invalid_skill_path", "Skill 文件路径不安全。");
  }
  return normalized;
}

function assertNoSymlinks(root, target, { allowMissing = true } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw createError("invalid_skill_path", "Skill 路径超出个人目录。");
  }
  const inspect = (base, parts) => {
    let cursor = base;
    for (const part of parts) {
      cursor = path.join(cursor, part);
      try {
        if (fs.lstatSync(cursor).isSymbolicLink()) {
          throw createError("unsafe_skill_storage", "Skill 存储目录不能包含符号链接。");
        }
      } catch (error) {
        if (error?.code === "ENOENT" && allowMissing) continue;
        throw error;
      }
    }
  };
  const rootDrive = path.parse(resolvedRoot).root;
  inspect(rootDrive, resolvedRoot.slice(rootDrive.length).split(path.sep).filter(Boolean));
  inspect(resolvedRoot, relative.split(path.sep).filter(Boolean));
  return resolvedTarget;
}

/**
 * 解析 skill 目录树，返回 `{ core, business, all }`。
 * 与 CanvasAgentRuntime.loadCanvasSkills 共用同一套 SKILL.md 解析器。
 */
function parseSkillSources(specs = []) {
  const normalized = (Array.isArray(specs) ? specs : [])
    .map((spec) => (typeof spec === "string" ? { directory: spec, origin: ORIGIN_SYSTEM } : spec))
    .filter((spec) => spec && String(spec.directory || "").trim());
  return CanvasAgentRuntime.loadCanvasSkillCatalog(
    normalized.map((spec) => ({
      directory: String(spec.directory),
      origin: spec.origin === ORIGIN_CUSTOM ? ORIGIN_CUSTOM : ORIGIN_SYSTEM,
    })),
  );
}

function createSkillRegistry(options = {}) {
  const dataDir = String(options.dataDir || "").trim();
  if (!dataDir) throw new TypeError("Skill registry requires a data directory.");
  const systemDir = String(options.systemDir || "").trim();
  if (!systemDir) throw new TypeError("Skill registry requires a system skills directory.");

  const resolvedDataDir = path.resolve(dataDir);
  const resolvedSystemDir = path.resolve(systemDir);
  const resolvedBundledCustomDir = String(options.bundledCustomDir || "").trim()
    ? path.resolve(String(options.bundledCustomDir))
    : "";
  const resolvedCustomDir = path.resolve(String(options.customDir || path.join(resolvedDataDir, "skills")));
  const storeFile = path.join(resolvedDataDir, SKILLS_STORE_FILE);
  const usersRoot = path.join(resolvedDataDir, "users");

  function getPersonalUserRoot(userId, create = false, scope = "personal") {
    const id = String(userId || "").trim();
    if (!id) throw createError("unauthorized", "需要登录后管理个人 Skill。", 401);
    if (scope === "public") return resolvedDataDir;
    const directoryId = `${id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "user"}-${crypto.createHash("sha256").update(id).digest("hex").slice(0, 20)}`;
    const userRoot = path.join(usersRoot, directoryId);
    assertNoSymlinks(resolvedDataDir, userRoot, { allowMissing: true });
    if (create) fs.mkdirSync(userRoot, { recursive: true });
    return userRoot;
  }

  function getPersonalSkillsDir(userId, scope = "personal") {
    return scope === "public" ? resolvedCustomDir : path.join(getPersonalUserRoot(userId), "skills");
  }

  function personalManifestPath(userId, scope = "personal") {
    return path.join(getPersonalUserRoot(userId, false, scope), PERSONAL_SKILL_INSTALLS_FILE);
  }

  function personalStorePath(userId, scope = "personal") {
    return path.join(getPersonalUserRoot(userId, false, scope), SKILLS_STORE_FILE);
  }

  function readPersonalManifest(userId, scope = "personal") {
    const filename = personalManifestPath(userId, scope);
    try {
      const parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (!parsed || parsed.version !== 1 || !parsed.packages
        || typeof parsed.packages !== "object" || Array.isArray(parsed.packages)) {
        throw createError("invalid_skill_manifest", "个人 Skill 安装清单格式无效。", 500);
      }
      return { version: 1, packages: { ...parsed.packages } };
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, packages: {} };
      if (error instanceof SyntaxError) throw createError("invalid_skill_manifest", "个人 Skill 安装清单无法解析。", 500);
      throw error;
    }
  }

  function atomicWriteJson(filename, value) {
    const parent = path.dirname(filename);
    fs.mkdirSync(parent, { recursive: true });
    const temporaryPath = path.join(parent, `.${path.basename(filename)}.${crypto.randomBytes(12).toString("hex")}.tmp`);
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      fs.renameSync(temporaryPath, filename);
    } catch (error) {
      try { fs.rmSync(temporaryPath, { force: true }); } catch {}
      throw error;
    }
  }

  function readPersonalStore(userId, scope = "personal") {
    try {
      const raw = JSON.parse(fs.readFileSync(personalStorePath(userId, scope), "utf8"));
      const enabled = raw && typeof raw.enabled === "object" && raw.enabled ? raw.enabled : {};
      const reviews = raw.reviews && typeof raw.reviews === "object" && !Array.isArray(raw.reviews) ? raw.reviews : {};
      return { version: 1, enabled: { ...enabled }, reviews: { ...reviews } };
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, enabled: {} };
      if (error instanceof SyntaxError) throw createError("invalid_skill_store", "个人 Skill 状态文件无法解析。", 500);
      throw error;
    }
  }

  function writePersonalStore(userId, value, scope = "personal") {
    atomicWriteJson(personalStorePath(userId, scope), value);
  }

  function personalSkillId(value) {
    const id = String(value || "").trim();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw createError("invalid_skill_id", "Skill 标识无效。");
    return id;
  }

  function readStore() {
    try {
      const raw = JSON.parse(fs.readFileSync(storeFile, "utf8"));
      const enabled = raw && typeof raw.enabled === "object" && raw.enabled ? raw.enabled : {};
      const reviews = raw.reviews && typeof raw.reviews === "object" && !Array.isArray(raw.reviews) ? raw.reviews : {};
      return { version: 1, enabled: { ...enabled }, reviews: { ...reviews } };
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, enabled: {} };
      if (error instanceof SyntaxError) return { version: 1, enabled: {} };
      throw error;
    }
  }

  function writeStore(store) {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    const temporaryPath = `${storeFile}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, storeFile);
  }

  function loadCatalog(userId = "") {
    const personalDir = userId ? getPersonalSkillsDir(userId) : "";
    const parsed = parseSkillSources([
      { directory: resolvedSystemDir, origin: ORIGIN_SYSTEM },
      ...(resolvedBundledCustomDir ? [{ directory: resolvedBundledCustomDir, origin: ORIGIN_CUSTOM }] : []),
      { directory: resolvedCustomDir, origin: ORIGIN_CUSTOM },
      ...(personalDir ? [{ directory: personalDir, origin: ORIGIN_CUSTOM }] : []),
    ]);
    const personalManifest = userId ? readPersonalManifest(userId) : null;
    const personalPrefix = personalDir ? `${path.resolve(personalDir)}${path.sep}` : "";
    const all = parsed.all
      .filter((skill) => !personalDir || !String(skill.directory || "").startsWith(personalPrefix)
        || Boolean(personalManifest.packages[skill.id]))
      .map((skill) => (
        personalDir && String(skill.directory || "").startsWith(personalPrefix)
          ? { ...skill, scope: "personal" }
          : skill
      ));
    return {
      ...parsed,
      all,
      business: parsed.business
        .filter((skill) => all.some((item) => item.id === skill.id))
        .map((skill) => all.find((item) => item.id === skill.id) || skill),
      core: all.find((skill) => skill.canvas.core) || parsed.core,
    };
  }

  function enabledIdSet(userId = "") {
    const store = readStore();
    const personalStore = userId ? readPersonalStore(userId) : null;
    const catalog = loadCatalog(userId);
    const ids = new Set();
    for (const skill of catalog.all) {
      if (skill.canvas.core) continue;
      const enabled = skill.scope === "personal"
        ? personalStore.enabled[skill.id] !== false
        : store.enabled[skill.id] !== false;
      if (enabled) ids.add(skill.id);
    }
    return ids;
  }

  function withValidation(skill, store, enabled) {
    const reviewKey = `${skill.origin}/${skill.id}`;
    const review = Object.hasOwn(store.reviews || {}, reviewKey) ? store.reviews[reviewKey] : null;
    let fingerprint = "";
    try { fingerprint = skillDefinitionFingerprint(skill); } catch {}
    const currentReview = fingerprint && review?.fingerprint === fingerprint && SKILL_VALIDATION_STATES.has(review.status) ? review : null;
    const unresolvedDependencies = skill.install?.compatibility?.status === "缺少外部依赖"
      ? (skill.install.dependencies || []).filter(item => item !== "包内脚本（不会自动运行）") : [];
    return { ...skill, enabled, validation_status: !fingerprint ? "needs_fix" : currentReview?.status || "unverified",
      validationFingerprint: fingerprint, unresolvedDependencies,
      validationEvidence: currentReview?.evidence || null,
      last_tested_at: /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(currentReview?.testedAt || "") ? currentReview.testedAt : "" };
  }

  function entryFor(skill, store) {
    const origin = skill.origin === ORIGIN_CUSTOM ? ORIGIN_CUSTOM : ORIGIN_SYSTEM;
    const group = groupForCategory(skill.canvas.category);
    const skillPackage = origin === ORIGIN_CUSTOM
      ? CanvasAgentRuntime.resolveSkillPackage(skill, origin)
      : null;
    const checked = withValidation(skill, store, Boolean(skill.canvas.core) || store.enabled[skill.id] !== false);
    const { publishedPresentation, ...install } = skill.install || {};
    return {
      id: skill.id,
      name: skill.name,
      label: skill.canvas.label,
      description: skill.description,
      category: skill.canvas.category,
      categoryLabel: categoryLabel(skill.canvas.category),
      group: group.id,
      groupLabel: group.label,
      groupKey: skillPackage?.id || group.id,
      packageId: skillPackage?.id || "",
      packageLabel: skillPackage?.label || "",
      standalone: Boolean(skillPackage?.standalone),
      icon: skill.canvas.icon,
      origin,
      scope: skill.scope || (origin === ORIGIN_CUSTOM ? "shared" : "system"),
      visibility: skill.scope === "personal" ? "personal" : "public",
      builtin: origin === ORIGIN_SYSTEM,
      enabled: checked.enabled,
      validationFingerprint: checked.validationFingerprint,
      version: String(skill.install?.version || skill.metadata?.version || ""),
      validation_status: checked.validation_status,
      last_tested_at: checked.last_tested_at,
      invocation_mode: CanvasAgentRuntime.canAutoInvokeSkill(checked) ? "automatic" : "manual",
      autoInvocationAllowed: skill.execution?.exposure === "agent" && skill.execution.allowImplicitInvocation === true,
      interaction_mode: skill.metadata?.canvas_agent_wizard ? "collection" : "standard",
      references: (skill.references || []).map(item => item.path),
      execution_stages: (skill.execution?.stages || []).map(item => item.label),
      unresolvedDependencies: checked.unresolvedDependencies,
      validationEvidence: checked.validationEvidence,
      locked: Boolean(skill.canvas.core),
      requiredSelection: skill.canvas.required_selection,
      approval: skill.canvas.approval,
      license: String(skill.license || ""),
      compatibility: String(skill.compatibility || ""),
      metadata: { ...(skill.metadata || {}) },
      allowedTools: [...(skill.allowedTools || [])],
      allowedToolsDeclared: skill.allowedToolsDeclared === true,
      toolBindingDeclared: skill.canvas.toolBindingDeclared === true,
      install: skill.install && typeof skill.install === "object" ? install : null,
      triggers: [...skill.canvas.triggers],
      capabilities: [...skill.canvas.capabilities],
      tools: [...skill.canvas.tools],
      source: skill.source,
    };
  }

  function listEntries() {
    const store = readStore();
    const publicManifest = readPersonalManifest("instance", "public");
    return loadCatalog().all
      .filter((skill) => skill.canvas.core || !skill.canvas.hidden)
      .map((skill) => ({ ...entryFor({
        ...skill,
        install: publicManifest.packages[skill.id] || skill.install,
      }, store), ...displayFields(skill, "instance") }));
  }

  // Presentation is a view of the same catalog used by Agent, including the
  // same account boundary and enabled store. It never creates a second library.
  function visibleSkill(id, userId, scope) {
    const owner = String(userId || "").trim();
    if (!owner) throw createError("unauthorized", "请先登录。", 401);
    const skill = (scope === "public" ? loadCatalog() : loadCatalog(owner)).all.find((item) => item.id === String(id || "")
      && !item.canvas.core && !item.canvas.hidden);
    if (!skill) throw createError("unknown_skill", "未找到可访问的 Skill。", 404);
    return skill;
  }

  const showcaseFile = path.join(resolvedDataDir, "skill-showcase.json");
  function readShowcase() {
    try {
      const value = JSON.parse(fs.readFileSync(showcaseFile, "utf8"));
      if (!value || value.version !== 1 || !value.featured || typeof value.featured !== "object") throw new Error();
      return value;
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, featured: {} };
      throw createError("invalid_skill_showcase", "Skill 精选配置无法读取。", 500);
    }
  }

  function presentationEntry(skill, userId, featured) {
    const personal = skill.scope === "personal";
    const manifest = readPersonalManifest(userId, personal ? "personal" : "public");
    const install = manifest.packages[skill.id] || skill.install;
    const entry = entryFor({ ...skill, install }, personal ? readPersonalStore(userId) : readStore());
    return {
      ...entry,
      ...displayFields(skill, userId),
      scope: personal ? "personal" : install?.scope === "public" || isBundledShowcaseSkill(skill) ? "public" : entry.scope,
      featured: !personal && featured[skill.id] === true,
    };
  }

  function isBundledShowcaseSkill(skill) {
    return resolvedBundledCustomDir && BUNDLED_SHOWCASE_SKILL_IDS.has(skill.id)
      && path.resolve(skill.directory) === path.join(resolvedBundledCustomDir, skill.id);
  }

  function listLibrary(userId) {
    if (!String(userId || "").trim()) throw createError("unauthorized", "请先登录。", 401);
    const featured = readShowcase().featured;
    const published = readPersonalManifest(userId, "public").packages;
    const catalog = [
      ...loadCatalog().all.filter(skill => isBundledShowcaseSkill(skill)
        || (skill.id === "h3-commerce-video" && skill.origin === ORIGIN_SYSTEM)
        || (skill.origin === ORIGIN_CUSTOM && published[skill.id]?.scope === "public")),
      ...loadCatalog(userId).all.filter(skill => skill.scope === "personal"),
    ];
    return catalog.filter((skill) => !skill.canvas.core && !skill.canvas.hidden)
      .map((skill) => {
        const presentation = skillPresentation(skill, userId);
        const media = presentation.media;
        const cover = media.find(item => item.id === presentation.coverId) || media[0];
        return { ...presentationEntry(skill, userId, featured), presentation, coverId: cover?.id || "",
          cover: cover?.path || "", coverMedia: cover || null };
      });
  }

  const mediaTypes = Object.freeze({
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
    ".mp4": "video/mp4", ".webm": "video/webm",
  });
  function skillMedia(skill) {
    const items = [];
    const root = path.resolve(skill.directory);
    function walk(directory, prefix, depth) {
      if (depth > 4 || items.length >= 32 || !fs.existsSync(directory)) return;
      assertNoSymlinks(root, directory, { allowMissing: false });
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).slice(0, 256)) {
        if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
        const relative = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) walk(path.join(directory, entry.name), relative, depth + 1);
        else if (entry.isFile() && mediaTypes[path.extname(entry.name).toLowerCase()]) {
          items.push({ path: relative, type: mediaTypes[path.extname(entry.name).toLowerCase()] });
        }
        if (items.length >= 32) break;
      }
    }
    for (const directory of ["assets", "references"]) walk(path.join(root, directory), directory, 0);
    return items.sort((a, b) => Number(/(?:^|\/)cover\./i.test(b.path)) - Number(/(?:^|\/)cover\./i.test(a.path)) || a.path.localeCompare(b.path));
  }

  function presentationFile(skill, userId) {
    return skill.scope === "personal" ? path.join(getPersonalUserRoot(userId), "skill-showcase.json") : showcaseFile;
  }
  function presentationStore(skill, userId) {
    const filename = presentationFile(skill, userId);
    assertNoSymlinks(resolvedDataDir, filename, { allowMissing: true });
    try {
      const value = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (value?.version !== 1 || typeof value !== "object" || Array.isArray(value)) throw new Error();
      return value;
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, featured: {}, presentations: {} };
      throw createError("invalid_skill_showcase", "Skill 展示资料无法读取，原资料未被修改。", 500);
    }
  }
  function configuredPresentation(skill, userId) {
    const presentations = presentationStore(skill, userId).presentations;
    return presentations && Object.hasOwn(presentations, skill.id) ? presentations[skill.id] : null;
  }
  function skillPresentation(skill, userId) {
    const configured = configuredPresentation(skill, userId);
    if (configured) return configured;
    if (skill.scope !== "personal" && skill.origin === ORIGIN_CUSTOM
      && path.resolve(skill.directory) === path.join(resolvedCustomDir, skill.id)) {
      const published = readPersonalManifest("instance", "public").packages[skill.id];
      if (published?.scope === "public" && published.publishedPresentation) return published.publishedPresentation;
    }
    return { displayName: "", categories: [], summary: "", capabilities: "", inputs: "", outputs: "", coverId: "",
      media: skillMedia(skill).map((item, index) => ({ ...item, id: `package-${index}`, title: "" })) };
  }
  function displayFields(skill, userId) {
    const presentation = skillPresentation(skill, userId);
    const heading = String(skill.instructions || "").match(/^#\s+(.+)$/m)?.[1]?.trim();
    const fallback = skill.canvas.label === skill.name && heading ? heading : skill.canvas.label;
    const configured = Array.isArray(presentation.categories) ? presentation.categories : [];
    const ids = configured.length ? configured : [skill.canvas.category === "social" ? "marketing" : skill.canvas.category];
    const categories = ids.map(id => SHOWCASE_CATEGORIES.find(item => item.id === id)).filter(Boolean);
    return { label: presentation.displayName || fallback,
      categories: categories.length ? categories : [SHOWCASE_CATEGORIES.find(item => item.id === "general")] };
  }
  function setPresentation(id, userId, payload, options = {}) {
    const skill = visibleSkill(id, userId, options.scope);
    if (skill.scope !== "personal" && options.isAdmin !== true) throw createError("forbidden", "只有管理员可以修改公共 Skill 展示资料。", 403);
    if (!payload || !Array.isArray(payload.media) || payload.media.length > 16) throw createError("invalid_skill_presentation", "最多配置 16 个案例。");
    const text = (value, max) => {
      if ((value !== undefined && typeof value !== "string") || String(value || "").length > max) throw createError("invalid_skill_presentation", "展示文字格式或长度不正确。");
      return String(value || "").trim();
    };
    const ids = new Set();
    const media = payload.media.map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw createError("invalid_skill_presentation", "案例资料格式不正确。");
      const itemId = String(item?.id || "");
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(itemId) || ids.has(itemId)) throw createError("invalid_skill_presentation", "案例标识重复或无效。");
      ids.add(itemId);
      const result = { id: itemId, title: text(item.title, 120) };
      if (item.path) {
        const relative = safeRelativeSkillPath(item.path);
        const file = readMedia(id, relative, userId, { metadataOnly: true, scope: options.scope });
        Object.assign(result, { path: relative, type: file.contentType });
      } else {
        if (!options.authorizedUrls?.has(item.url)) throw createError("forbidden", "只能引用已核验归属的本机素材。", 403);
        const type = mediaTypes[path.extname(String(item.url)).toLowerCase()];
        if (!type) throw createError("invalid_skill_media", "请选择支持的本机图片或视频。");
        Object.assign(result, { url: item.url, type });
      }
      if (item.posterUrl) {
        if (!options.authorizedUrls?.has(item.posterUrl) || !/^image\//.test(mediaTypes[path.extname(item.posterUrl).toLowerCase()] || "")) throw createError("invalid_skill_media", "视频封面必须是已授权图片。");
        result.posterUrl = item.posterUrl;
      }
      return result;
    });
    const coverId = text(payload.coverId, 64);
    if (coverId && !ids.has(coverId)) throw createError("invalid_skill_presentation", "封面案例不存在。");
    const previous = skillPresentation(skill, userId);
    const displayName = text(payload.displayName === undefined ? previous.displayName : payload.displayName, 100);
    if (/[\u0000-\u001f\u007f]/.test(displayName)) throw createError("invalid_skill_presentation", "显示名称不能包含换行或控制字符。");
    const requestedCategories = payload.categories === undefined ? previous.categories || [] : payload.categories;
    if (!Array.isArray(requestedCategories) || requestedCategories.length > 4
      || requestedCategories.some(id => typeof id !== "string" || !SHOWCASE_CATEGORIES.some(item => item.id === id))) {
      throw createError("invalid_skill_presentation", "请选择最多 4 个有效分类。");
    }
    const presentation = { displayName, categories: [...new Set(requestedCategories)],
      summary: text(payload.summary, 240), capabilities: text(payload.capabilities, 1200),
      inputs: text(payload.inputs, 1200), outputs: text(payload.outputs, 1200), media, coverId,
      updatedAt: new Date().toISOString() };
    const value = presentationStore(skill, userId);
    value.presentations = { ...value.presentations, [skill.id]: presentation };
    const filename = presentationFile(skill, userId);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    assertNoSymlinks(resolvedDataDir, filename);
    atomicWriteJson(filename, value);
    return getDetail(id, userId, options.scope);
  }

  function getDetail(id, userId, scope) {
    const skill = visibleSkill(id, userId, scope);
    const presentation = skillPresentation(skill, userId);
    const media = presentation.media;
    return {
      ...presentationEntry(skill, userId, readShowcase().featured),
      categoryOptions: SHOWCASE_CATEGORIES,
      instructions: String(skill.instructions || ""),
      references: (skill.references || []).map(({ path: referencePath, ...item }) => ({ ...item, path: referencePath })),
      presentation, media, coverId: presentation.coverId || media[0]?.id || "",
      cover: media.find((item) => item.type.startsWith("image/"))?.path || "",
    };
  }

  function readMedia(id, relativePath, userId, options = {}) {
    const skill = visibleSkill(id, userId, options.scope);
    const relative = safeRelativeSkillPath(relativePath);
    const type = mediaTypes[path.extname(relative).toLowerCase()];
    if (!type || !/^(assets|references)\//.test(relative)) throw createError("invalid_skill_media", "不支持这类 Skill 展示文件。");
    const root = path.resolve(skill.directory);
    const target = assertNoSymlinks(root, path.resolve(root, ...relative.split("/")), { allowMissing: false });
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size > 40 * 1024 * 1024) throw createError("invalid_skill_media", "展示素材不可读取或超过大小限制。");
    return { contentType: type, filePath: target, ...(options.metadataOnly ? {} : { content: fs.readFileSync(target) }) };
  }

  function presentationMedia(id, mediaId, userId, scope) {
    const skill = visibleSkill(id, userId, scope);
    const item = skillPresentation(skill, userId).media.find(media => media.id === mediaId);
    if (!item) throw createError("not_found", "案例素材不存在或已移除。", 404);
    return item;
  }

  function setFeatured(id, featured) {
    const published = readPersonalManifest("instance", "public").packages;
    const skill = loadCatalog().all.find((item) => item.id === String(id || "") && item.origin === ORIGIN_CUSTOM
      && published[item.id]?.scope === "public" && !item.canvas.core && !item.canvas.hidden);
    if (!skill) throw createError("unknown_skill", "只能精选本实例已公开的 Skill。", 404);
    const showcase = readShowcase();
    if (featured) showcase.featured[skill.id] = true;
    else delete showcase.featured[skill.id];
    assertNoSymlinks(resolvedDataDir, showcaseFile);
    atomicWriteJson(showcaseFile, showcase);
    return { id: skill.id, featured: Boolean(featured) };
  }

  function groupsMarkupModel(entries) {
    const byId = new Map(SKILL_GROUPS.map((group, order) => [
      group.id,
      { ...group, categories: undefined, kind: "system", order, skills: [] },
    ]));
    for (const entry of entries) {
      const groupId = entry.origin === ORIGIN_CUSTOM ? entry.groupKey : entry.group;
      let group = byId.get(groupId);
      if (!group) {
        group = {
          id: groupId,
          label: entry.packageLabel || groupForCategory(entry.category).label,
          description: entry.standalone
            ? "未归入安装包的功能 Skill，可独立启用。"
            : "功能 Skill 安装包，可逐项启用。",
          kind: "custom",
          standalone: Boolean(entry.standalone),
          order: SKILL_GROUPS.length,
          skills: [],
        };
        byId.set(groupId, group);
      }
      group.skills.push(entry);
    }
    return [...byId.values()]
      .filter((group) => group.skills.length)
      .sort((left, right) => (
        Number(left.kind === "custom") - Number(right.kind === "custom")
        || Number(Boolean(left.standalone)) - Number(Boolean(right.standalone))
        || left.order - right.order
        || left.label.localeCompare(right.label, "zh-CN")
      ))
      .map((group) => ({
        id: group.id,
        label: group.label,
        description: group.description,
        kind: group.kind,
        standalone: Boolean(group.standalone),
        skills: group.skills,
      }));
  }

  /** 设置界面用的快照：按分组折叠，附带系统/功能计数。 */
  function snapshot() {
    const entries = listEntries();
    const system = entries.filter((entry) => entry.origin === ORIGIN_SYSTEM);
    const custom = entries.filter((entry) => entry.origin === ORIGIN_CUSTOM);
    return {
      groups: groupsMarkupModel(entries),
      systemCount: system.length,
      customCount: custom.length,
      enabledCount: entries.filter((entry) => entry.enabled).length,
      totalCount: entries.length,
      storeFile,
      customDir: resolvedCustomDir,
      bundledCustomDir: resolvedBundledCustomDir,
    };
  }

  function setEnabled(id, enabled) {
    const skillId = String(id || "").trim();
    if (!skillId) throw createError("invalid_skill_id", "缺少 Skill 标识。");
    const catalog = loadCatalog();
    const skill = catalog.all.find((item) => item.id === skillId && !item.canvas.core);
    if (!skill) throw createError("unknown_skill", `未找到 Skill「${skillId}」。`, 404);
    if (skill.canvas.core) throw createError("locked_skill", "核心 Skill 不能停用。");
    const store = readStore();
    if (enabled === false) store.enabled[skillId] = false;
    else delete store.enabled[skillId];
    writeStore(store);
    return snapshot();
  }

  function setValidation(id, status, evidence = {}, userId = "", scope = "shared", expectedFingerprint = "") {
    const skillId = personalSkillId(id);
    if (!SKILL_VALIDATION_STATES.has(status)) throw createError("invalid_skill_validation", "Skill 验证状态无效。");
    const owner = String(userId || "").trim();
    if (scope === "personal" && !owner) throw createError("unauthorized", "需要登录后登记私人 Skill 验收。", 401);
    const catalog = loadCatalog(scope === "personal" ? owner : "");
    const skill = catalog.all.find(item => item.id === skillId && !item.canvas.hidden
      && (scope === "personal" ? item.scope === "personal" : item.scope !== "personal"));
    if (!skill) throw createError("unknown_skill", "未找到需要验证的 Skill。", 404);
    const checks = ["routing", "falseTriggers", "informationCollection", "toolsAndMaterials", "revision",
      "cancellation", "recovery", "delivery", "browser", "model"];
    const normalizedEvidence = Object.fromEntries(checks.map(key => [key, evidence?.[key] === true]));
    if (evidence?.stages && typeof evidence.stages === "object") {
      normalizedEvidence.stages = Object.fromEntries(SKILL_VALIDATION_STAGES.map(key => [key,
        STAGE_EVIDENCE.has(evidence.stages[key]) ? evidence.stages[key] : "unverified"]));
    }
    if (Array.isArray(evidence?.sources)) {
      normalizedEvidence.sources = evidence.sources.filter(value => typeof value === "string").slice(0, 8).map(value => value.slice(0, 280));
    }
    if (status === "verified" && checks.some(key => !normalizedEvidence[key])) {
      throw createError("skill_review_incomplete", "路由、误触发、信息收集、素材与工具、修改、取消、恢复、交付、浏览器和模型验收全部通过后才能标记为已验证。");
    }
    const store = scope === "personal" ? readPersonalStore(owner) : readStore();
    const fingerprint = skillDefinitionFingerprint(skill);
    if (expectedFingerprint && expectedFingerprint !== fingerprint) {
      throw createError("skill_review_stale", "Skill 内容已变化，请检查证据与当前版本后重新登记。", 409);
    }
    const reviews = { ...(store.reviews || {}), [`${skill.origin}/${skillId}`]: {
      status, fingerprint, testedAt: new Date().toISOString(), reviewer: owner || "instance-admin",
      evidence: normalizedEvidence,
    } };
    if (scope === "personal") writePersonalStore(owner, { ...store, reviews });
    else writeStore({ ...store, reviews });
    return scope === "personal" ? listPersonalSkills(owner).find(item => item.id === skillId) : snapshot();
  }

  /** 画布 Agent 用的目录：只保留已启用的业务 Skill。 */
  function loadAgentCatalog(userId = "") {
    const owner = String(userId || "").trim();
    const catalog = loadCatalog(owner);
    const enabled = enabledIdSet(owner);
    const store = readStore();
    const personalStore = owner ? readPersonalStore(owner) : null;
    const manifest = owner ? readPersonalManifest(owner) : null;
    const publicManifest = owner ? readPersonalManifest(owner, "public") : null;
    const business = catalog.business
      .filter((skill) => enabled.has(skill.id))
      .filter((skill) => skill.scope !== "personal" || Boolean(manifest?.packages[skill.id]))
      .map((skill) => {
        const install = skill.scope === "personal" ? manifest?.packages[skill.id] : publicManifest?.packages[skill.id];
        skill = withValidation({ ...skill, install }, skill.scope === "personal" ? personalStore : store, true);
        skill = { ...skill, canvas: { ...skill.canvas, label: displayFields(skill, owner || "instance").label } };
        if (skill.scope === "personal") return { ...skill, install: { ...(manifest?.packages[skill.id] || {}) } };
        if (skill.origin === ORIGIN_CUSTOM && publicManifest?.packages[skill.id]) {
          return { ...skill, install: { ...publicManifest.packages[skill.id] } };
        }
        return skill;
      });
    return { core: catalog.core, business, all: catalog.all };
  }

  function findSharedSkillConflicts(skillId) {
    const id = personalSkillId(skillId);
    const shared = loadCatalog().all.find((skill) => skill.id === id);
    return shared ? [{ id, scope: shared.canvas.core ? "system" : "shared" }] : [];
  }

  function hasPersonalSkillInstalledByAnyUser(skillId, excludeUserId = "") {
    const id = personalSkillId(skillId);
    const excludedUserId = String(excludeUserId || "").trim();
    const excludedDirectory = excludedUserId
      ? `${excludedUserId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "user"}-${crypto.createHash("sha256").update(excludedUserId).digest("hex").slice(0, 20)}`
      : "";
    let users;
    const safeUsersRoot = assertNoSymlinks(resolvedDataDir, usersRoot, { allowMissing: true });
    try { users = fs.readdirSync(safeUsersRoot, { withFileTypes: true }); }
    catch (error) { if (error?.code === "ENOENT") return false; throw error; }
    for (const entry of users) {
      if (entry.isSymbolicLink()) throw createError("unsafe_skill_storage", "个人 Skill 目录不能包含符号链接。", 409);
      if (!entry.isDirectory()) continue;
      if (entry.name === excludedDirectory) continue;
      const userRoot = assertNoSymlinks(resolvedDataDir, path.join(usersRoot, entry.name), { allowMissing: false });
      const manifestFile = assertNoSymlinks(userRoot, path.join(userRoot, PERSONAL_SKILL_INSTALLS_FILE), { allowMissing: true });
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
        if (!manifest || manifest.version !== 1 || !manifest.packages
          || typeof manifest.packages !== "object" || Array.isArray(manifest.packages)) {
          throw createError("invalid_skill_manifest", "私人 Skill 安装清单格式无效，无法检查公共名称冲突。", 500);
        }
        if (manifest.packages[id]) return true;
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        if (error instanceof SyntaxError) throw createError("invalid_skill_manifest", "个人 Skill 安装清单无法解析。", 500);
        throw error;
      }
    }
    return false;
  }

  function findSkillConflicts(userId, skillId) {
    const id = personalSkillId(skillId);
    const shared = findSharedSkillConflicts(id);
    if (shared.length) return shared;
    if (readPersonalManifest(userId).packages[id]) return [{ id, scope: "personal" }];
    return [];
  }

  function readPersonalSkillFiles(userId, skillId, limits = {}) {
    const owner = String(userId || "").trim();
    if (!owner) throw createError("unauthorized", "需要登录后管理个人 Skill。", 401);
    const id = personalSkillId(skillId);
    const manifest = readPersonalManifest(owner);
    if (!manifest.packages[id]) throw createError("unknown_skill", `未找到你的个人 Skill「${id}」。`, 404);
    const maxFiles = Math.max(1, Number(limits.files) || 256);
    const maxFileBytes = Math.max(1, Number(limits.fileBytes) || 8 * 1024 * 1024);
    const maxTotalBytes = Math.max(1, Number(limits.totalBytes) || 40 * 1024 * 1024);
    const root = assertNoSymlinks(
      resolvedDataDir,
      path.join(getPersonalSkillsDir(owner), id),
      { allowMissing: false },
    );
    const rootStat = fs.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw createError("unsafe_skill_storage", "个人 Skill 安装目录类型无效。", 409);
    }
    const files = [];
    let totalBytes = 0;
    function walk(directory, prefix = "") {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relative = safeRelativeSkillPath(prefix ? `${prefix}/${entry.name}` : entry.name);
        if (relative.split("/").some((part) => part.startsWith("."))) {
          throw createError("unsafe_skill_storage", "个人 Skill 包含隐藏路径，无法发布。", 409);
        }
        const target = assertNoSymlinks(root, path.join(root, ...relative.split("/")), { allowMissing: false });
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink() || stat.nlink > 1 || !stat.isDirectory() && !stat.isFile()) {
          throw createError("unsafe_skill_storage", "个人 Skill 包含链接或特殊文件，无法发布。", 409);
        }
        if (stat.isDirectory()) {
          walk(target, relative);
          continue;
        }
        if (files.length >= maxFiles || stat.size > maxFileBytes || (totalBytes += stat.size) > maxTotalBytes) {
          throw createError("skill_package_too_large", "个人 Skill 文件数量或体积超过发布限制。", 413);
        }
        files.push({ path: relative, content: fs.readFileSync(target) });
      }
    }
    walk(root);
    return { files, install: { ...manifest.packages[id] },
      presentation: configuredPresentation({ id, scope: "personal" }, owner) };
  }

  function listPersonalSkills(userId, scope = "personal") {
    const owner = String(userId || "").trim();
    if (!owner) throw createError("unauthorized", "需要登录后管理个人 Skill。", 401);
    const manifest = readPersonalManifest(owner, scope);
    const publicManifest = scope === "personal" ? readPersonalManifest(owner, "public") : null;
    const store = readPersonalStore(owner, scope);
    const catalog = loadCatalog(scope === "public" ? "" : owner);
    return catalog.all
      .filter((skill) => (scope === "public" ? skill.origin === ORIGIN_CUSTOM : skill.scope === "personal") && manifest.packages[skill.id])
      .filter((skill) => !skill.canvas.hidden && !skill.canvas.core)
      .map((skill) => ({
        ...entryFor({
          ...skill,
          install: manifest.packages[skill.id],
        }, store),
        ...displayFields(skill, owner),
        ...(scope === "personal" ? { published: Boolean(publicManifest.packages[skill.id]) } : {}),
      }));
  }

  function setPersonalEnabled(userId, skillId, enabled, scope = "personal") {
    const owner = String(userId || "").trim();
    if (!owner) throw createError("unauthorized", "需要登录后管理个人 Skill。", 401);
    const id = personalSkillId(skillId);
    const manifest = readPersonalManifest(owner, scope);
    if (!manifest.packages[id]) throw createError("unknown_skill", `未找到你的个人 Skill「${id}」。`, 404);
    const store = readPersonalStore(owner, scope);
    if (enabled === false) store.enabled[id] = false;
    else delete store.enabled[id];
    writePersonalStore(owner, store, scope);
    return listPersonalSkills(owner, scope).find((skill) => skill.id === id);
  }

  function installPersonalSkill(userId, skillId, files, installInfo = {}, scope = "personal", allowOwnPrivate = false) {
    const owner = String(userId || "").trim();
    if (!owner) throw createError("unauthorized", "需要登录后安装个人 Skill。", 401);
    const id = personalSkillId(skillId);
    const conflicts = scope === "public"
      ? findSharedSkillConflicts(id)
      : findSkillConflicts(owner, id);
    if (conflicts.length) {
      throw createError("skill_id_conflict", `Skill「${id}」与现有 Skill 冲突。`, 409);
    }
    if (scope === "public" && hasPersonalSkillInstalledByAnyUser(id, allowOwnPrivate ? owner : "")) {
      throw createError("skill_id_conflict", `Skill「${id}」与其他账户的私人 Skill 冲突。`, 409);
    }
    if (!Array.isArray(files) || !files.length) throw createError("invalid_skill_package", "Skill 安装包没有文件。");
    const skillDocument = files.find((file) => String(file?.path || "") === "SKILL.md");
    if (!skillDocument) throw createError("invalid_skill_package", "安装包必须包含根目录 SKILL.md。");
    const parsed = CanvasAgentRuntime.parseSkillDocument(Buffer.from(skillDocument.content).toString("utf8"), "SKILL.md");
    if (parsed.id !== id) throw createError("invalid_skill_id", "Skill 标识在预检后发生变化，请重新检查。");

    getPersonalUserRoot(owner, true, scope);
    const skillsDir = getPersonalSkillsDir(owner, scope);
    const storageRoot = scope === "public" ? resolvedCustomDir : resolvedDataDir;
    assertNoSymlinks(storageRoot, skillsDir, { allowMissing: true });
    fs.mkdirSync(skillsDir, { recursive: true });
    assertNoSymlinks(storageRoot, skillsDir, { allowMissing: false });
    const target = path.join(skillsDir, id);
    try {
      fs.lstatSync(target);
      throw createError("skill_already_installed", `Skill「${id}」已安装，未覆盖现有内容。`, 409);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    const stage = path.join(skillsDir, `.install-${crypto.randomBytes(16).toString("hex")}`);
    fs.mkdirSync(stage, { recursive: false });
    let movedToTarget = false;
    try {
      for (const file of files) {
        const relative = safeRelativeSkillPath(file.path);
        const destination = path.join(stage, ...relative.split("/"));
        assertNoSymlinks(stage, destination, { allowMissing: true });
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const descriptor = fs.openSync(destination, "wx");
        try { fs.writeFileSync(descriptor, Buffer.from(file.content)); } finally { fs.closeSync(descriptor); }
      }
      const stagedDocument = fs.readFileSync(path.join(stage, "SKILL.md"), "utf8");
      if (CanvasAgentRuntime.parseSkillDocument(stagedDocument, "SKILL.md").id !== id) {
        throw createError("invalid_skill_id", "安装内容的 Skill 标识与预检结果不一致。");
      }
      fs.renameSync(stage, target);
      movedToTarget = true;
      const manifest = readPersonalManifest(owner, scope);
      manifest.packages[id] = {
        ...installInfo,
        installedAt: String(installInfo.installedAt || new Date().toISOString()),
      };
      try {
        atomicWriteJson(personalManifestPath(owner, scope), manifest);
      } catch (error) {
        fs.rmSync(target, { recursive: true, force: true });
        movedToTarget = false;
        throw error;
      }
      return listPersonalSkills(owner, scope).find((skill) => skill.id === id);
    } catch (error) {
      if (movedToTarget) {
        try { fs.rmSync(target, { recursive: true, force: true }); } catch {}
      }
      throw error;
    } finally {
      try { if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true }); } catch {}
    }
  }

  function uninstallPersonalSkill(userId, skillId, scope = "personal") {
    const owner = String(userId || "").trim();
    if (!owner) throw createError("unauthorized", "需要登录后卸载个人 Skill。", 401);
    const id = personalSkillId(skillId);
    const manifest = readPersonalManifest(owner, scope);
    if (!manifest.packages[id]) return false;
    const skillsDir = getPersonalSkillsDir(owner, scope);
    const storageRoot = scope === "public" ? resolvedCustomDir : resolvedDataDir;
    const target = assertNoSymlinks(storageRoot, path.join(skillsDir, id), { allowMissing: false });
    const info = fs.lstatSync(target);
    if (!info.isDirectory() || info.isSymbolicLink()) throw createError("unsafe_skill_storage", "个人 Skill 安装目录类型无效。", 409);
    const tombstone = path.join(skillsDir, `.remove-${crypto.randomBytes(16).toString("hex")}`);
    const store = readPersonalStore(owner, scope);
    const previousStore = { version: 1, enabled: { ...store.enabled } };
    fs.renameSync(target, tombstone);
    try {
      delete store.enabled[id];
      writePersonalStore(owner, store, scope);
      delete manifest.packages[id];
      atomicWriteJson(personalManifestPath(owner, scope), manifest);
    } catch (error) {
      try { writePersonalStore(owner, previousStore, scope); } catch {}
      try { fs.renameSync(tombstone, target); } catch {}
      throw error;
    }
    try { fs.rmSync(tombstone, { recursive: true, force: true }); } catch {}
    return true;
  }

  const MAX_REFERENCE_BYTES = 512 * 1024;
  const REFERENCE_PATH_PATTERN = /^references\/.+$/u;

  /**
   * 读取功能 Skill 自带的参考文档。只允许读取目录清单里声明过的文件，
   * 路径必须落在 `references/` 之下，避免顺着 `..` 读到应用目录之外。
   */
  function readReference(skillId, referencePath, userId = "") {
    const id = String(skillId || "").trim();
    const relative = String(referencePath || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!id) throw createError("invalid_skill_id", "缺少 Skill 标识。");
    if (!REFERENCE_PATH_PATTERN.test(relative)
      || /[\u0000-\u001f\u007f<>:"|?*]/.test(relative)
      || relative.split("/").some((part, index) => index > 0 && (!part || part === "." || part === ".." || part.startsWith(".")))) {
      throw createError("invalid_reference_path", "参考文档路径不合法。");
    }
    const owner = String(userId || "").trim();
    const manifest = owner ? readPersonalManifest(owner) : null;
    const skill = loadCatalog(owner).all.find((item) => item.id === id
      && (item.scope !== "personal" || Boolean(manifest?.packages[id])));
    if (!skill) throw createError("unknown_skill", `未找到 Skill「${id}」。`, 404);
    const declared = (Array.isArray(skill.references) ? skill.references : [])
      .find((item) => item.path === relative);
    if (!declared) throw createError("unknown_reference", `Skill「${id}」没有这份参考文档。`, 404);
    const root = path.resolve(String(skill.directory || ""));
    if (!skill.directory) throw createError("unknown_reference", `Skill「${id}」没有参考文档目录。`, 404);
    const target = path.resolve(root, ...relative.split("/"));
    if (target !== path.join(root, ...relative.split("/")) || !target.startsWith(`${root}${path.sep}`)) {
      throw createError("invalid_reference_path", "参考文档路径不合法。");
    }
    assertNoSymlinks(root, target, { allowMissing: false });
    let stat = null;
    try {
      stat = fs.statSync(target);
    } catch {
      throw createError("unknown_reference", `Skill「${id}」的参考文档已不存在。`, 404);
    }
    if (!stat.isFile()) throw createError("unknown_reference", `Skill「${id}」的参考文档已不存在。`, 404);
    if (stat.size > MAX_REFERENCE_BYTES) {
      throw createError("reference_too_large", `参考文档超过 ${Math.round(MAX_REFERENCE_BYTES / 1024)} KB，无法读取。`, 413);
    }
    return {
      skill_id: id,
      path: relative,
      bytes: stat.size,
      content: fs.readFileSync(target, "utf8"),
    };
  }

  return Object.freeze({
    storeFile,
    systemDir: resolvedSystemDir,
    bundledCustomDir: resolvedBundledCustomDir,
    customDir: resolvedCustomDir,
    list: listEntries,
    listLibrary,
    categoryOptions: SHOWCASE_CATEGORIES,
    getDetail,
    setPresentation,
    presentationMedia,
    readMedia,
    setFeatured,
    snapshot,
    setEnabled,
    setValidation,
    readReference,
    enabledIds: () => [...enabledIdSet()],
    loadAgentCatalog,
    getPersonalSkillsDir,
    listPersonalSkills,
    findSkillConflicts,
    findSharedSkillConflicts,
    hasPersonalSkillInstalledByAnyUser,
    readPersonalSkillFiles,
    installPersonalSkill,
    setPersonalEnabled,
    listPublicSkills: (userId) => listPersonalSkills(userId, "public"),
    setPublicSkillEnabled: (userId, skillId, enabled) => setPersonalEnabled(userId, skillId, enabled, "public"),
    uninstallPublicSkill: (userId, skillId) => uninstallPersonalSkill(userId, skillId, "public"),
    uninstallPersonalSkill,
  });
}

function skillDefinitionFingerprint(skill) {
  const documents = (skill.references || []).map(reference => {
    const file = assertNoSymlinks(skill.directory, path.join(skill.directory, reference.path), { allowMissing: false });
    return [reference.path, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")];
  });
  const definition = [skill.id, skill.description, skill.metadata, skill.canvas, skill.instructions, skill.execution, documents];
  return crypto.createHash("sha256").update(JSON.stringify(definition)).digest("hex");
}

module.exports = {
  SKILLS_STORE_FILE,
  SKILL_GROUPS,
  ORIGIN_SYSTEM,
  ORIGIN_CUSTOM,
  groupForCategory,
  categoryLabel,
  parseSkillSources,
  createSkillRegistry,
};
