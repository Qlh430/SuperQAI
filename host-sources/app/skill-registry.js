"use strict";

// Skill 注册表：把「随应用部署的系统 Skill」和「用户自建/导入的功能 Skill」
// 统一成一份目录，并用 data/skills.json 保存启用状态。
// 参考 DX OS 的 skills.json：{ enabled: { id: false } }，缺省即启用。

const fs = require("node:fs");
const path = require("node:path");
const CanvasAgentRuntime = require("./canvas-agent-runtime");

const SKILLS_STORE_FILE = "skills.json";
const ORIGIN_SYSTEM = "system";
const ORIGIN_CUSTOM = "custom";

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

  function readStore() {
    try {
      const raw = JSON.parse(fs.readFileSync(storeFile, "utf8"));
      const enabled = raw && typeof raw.enabled === "object" && raw.enabled ? raw.enabled : {};
      return { version: 1, enabled: { ...enabled } };
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

  function loadCatalog() {
    return parseSkillSources([
      { directory: resolvedSystemDir, origin: ORIGIN_SYSTEM },
      ...(resolvedBundledCustomDir ? [{ directory: resolvedBundledCustomDir, origin: ORIGIN_CUSTOM }] : []),
      { directory: resolvedCustomDir, origin: ORIGIN_CUSTOM },
    ]);
  }

  function enabledIdSet() {
    const store = readStore();
    const catalog = loadCatalog();
    const ids = new Set();
    for (const skill of catalog.all) {
      if (skill.canvas.core) continue;
      if (store.enabled[skill.id] !== false) ids.add(skill.id);
    }
    return ids;
  }

  function entryFor(skill, store) {
    const origin = skill.origin === ORIGIN_CUSTOM ? ORIGIN_CUSTOM : ORIGIN_SYSTEM;
    const group = groupForCategory(skill.canvas.category);
    const skillPackage = origin === ORIGIN_CUSTOM
      ? CanvasAgentRuntime.resolveSkillPackage(skill, origin)
      : null;
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
      builtin: origin === ORIGIN_SYSTEM,
      enabled: skill.canvas.core ? true : store.enabled[skill.id] !== false,
      locked: Boolean(skill.canvas.core),
      requiredSelection: skill.canvas.required_selection,
      approval: skill.canvas.approval,
      triggers: [...skill.canvas.triggers],
      capabilities: [...skill.canvas.capabilities],
      tools: [...skill.canvas.tools],
      source: skill.source,
    };
  }

  function listEntries() {
    const store = readStore();
    return loadCatalog().all
      .filter((skill) => !skill.canvas.core && !skill.canvas.hidden)
      .map((skill) => entryFor(skill, store));
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

  /** 画布 Agent 用的目录：只保留已启用的业务 Skill。 */
  function loadAgentCatalog() {
    const catalog = loadCatalog();
    const enabled = enabledIdSet();
    const business = catalog.business.filter((skill) => enabled.has(skill.id));
    return { core: catalog.core, business, all: catalog.all };
  }

  const MAX_REFERENCE_BYTES = 512 * 1024;
  const REFERENCE_PATH_PATTERN = /^references\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;

  /**
   * 读取功能 Skill 自带的参考文档。只允许读取目录清单里声明过的文件，
   * 路径必须落在 `references/` 之下，避免顺着 `..` 读到应用目录之外。
   */
  function readReference(skillId, referencePath) {
    const id = String(skillId || "").trim();
    const relative = String(referencePath || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!id) throw createError("invalid_skill_id", "缺少 Skill 标识。");
    if (!REFERENCE_PATH_PATTERN.test(relative)) {
      throw createError("invalid_reference_path", "参考文档路径不合法。");
    }
    const skill = loadCatalog().all.find((item) => item.id === id);
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
    snapshot,
    setEnabled,
    readReference,
    enabledIds: () => [...enabledIdSet()],
    loadAgentCatalog,
  });
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
