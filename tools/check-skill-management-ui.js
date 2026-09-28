"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const settings = require("../system-settings-ui");

const ROOT = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

const ui = read("system-settings-ui.js");
const css = read("system-settings.css");
const server = require("./server-source").readServerSource();
const skillHttpApi = read("skill-http-api.js");
const html = read("index.html");
const registry = read("skill-registry.js");
const canvasAgentUi = read("canvas-agent-ui.js");

// ── 设置界面入口 ────────────────────────────────────────────────────
assert.ok(settings.sectionIdsForRole("superadmin").includes("skills"), "Skill 管理 should be an admin settings section");
assert.equal(settings.sectionIdsForRole("user").includes("skills"), false, "Skill 管理 stays behind the admin role");
assert.match(ui, /\{ id: "skills", label: "Skill 管理"/);
assert.match(ui, /if \(state\.section === "skills" && isAdmin\(\)\) return skillsMarkup\(\);/);
assert.match(ui, /function skillsMarkup\(\)/);
assert.match(ui, /async function toggleSkill\(id, enabled, label\)/);
assert.match(ui, /options\.request\("\/api\/skills"\)/, "settings load should fetch the skill catalog");
assert.match(ui, /options\.request\("\/api\/skills\/enabled", \{ method: "POST"/, "the toggle should persist through the skill endpoint");

// 分类筛选、分组折叠和逐个开关都必须在界面上真实存在。
assert.match(ui, /data-skill-filter="\$\{id\}"/);
assert.match(ui, /data-skill-group="\$\{escapeHtml\(group\.id\)\}"/);
assert.match(ui, /data-skill-group-kind="\$\{escapeHtml\(group\.kind \|\| "system"\)\}"/);
assert.match(ui, /settings-skill-group-kind/, "功能 Skill 安装包与独立添加项必须有可见分组标识");
assert.match(ui, /功能 Skill 按安装包分组/, "设置页必须说明功能 Skill 的分组规则");
assert.match(ui, /data-skill-toggle data-skill-id="\$\{escapeHtml\(skill\.id\)\}"/);
assert.match(ui, /if \(event\.target\.matches\("\[data-skill-toggle\]"\)\)/);
assert.match(ui, /event\.target\.closest\("\[data-skill-group\]"\)/);
assert.match(ui, /const skillFilter = event\.target\.closest\("\[data-skill-filter\]"\)/);
assert.match(ui, /settings-skill-badge">\$\{isPresetSkill\(skill\) \? "官方预设" : "系统能力"\}/, "文本类系统 Skill 标为官方预设，图像/视频类标为系统能力");
assert.match(ui, /\["text", "general"\]\.includes\(String\(item\.category/, "官方预设的判定必须基于 Skill 分类");

// ── 样式 ───────────────────────────────────────────────────────────
[".settings-skill-page", ".settings-skill-filters", ".settings-skill-group", ".settings-skill-grid", ".settings-skill-card", ".settings-skill-toggle", ".settings-skill-badge"].forEach((selector) => {
  assert.ok(css.includes(selector), `${selector} should be styled`);
});
assert.match(css, /\.settings-skill-group-kind/, "the custom package badge should be styled");
assert.match(css, /\.settings-skill-toggle > input[\s\S]{0,120}position: absolute/, "the skill toggle should reuse the shared switch");
assert.match(css, /\.settings-skill-toggle > input:checked \+ i[\s\S]{0,200}var\(--settings-green\)/);

// ── 服务端接口 ──────────────────────────────────────────────────────
assert.match(server, /const \{ createSkillRegistry \} = require\("\.\/skill-registry"\);/);
assert.match(server, /createSkillRegistry\(\{/);
assert.match(server, /const \{ createSkillHttpApi \} = require\("\.\/skill-http-api"\)/);
assert.match(server, /"skill-http-api": createSkillHttpApiComponent/);
assert.match(skillHttpApi, /url\.pathname === "\/api\/skills"/);
assert.match(skillHttpApi, /url\.pathname === "\/api\/skills\/enabled"/);
assert.match(skillHttpApi, /async function handleCatalog\(req, res\)/);
assert.match(skillHttpApi, /async function handleEnabled\(req, res\)/);
assert.match(skillHttpApi, /skillRegistry\.setEnabled\(payload\?\.id, payload\?\.enabled !== false\)/);
assert.equal(server.includes("CanvasAgentRuntime.loadCanvasSkills(CANVAS_SKILLS_DIR)"), false, "the agent must read skills through the registry so停用 immediately applies");
assert.match(skillHttpApi, /const skills = skillRegistry\.loadAgentCatalog\(\);/);
assert.match(server, /const CUSTOM_SKILLS_DIR = resolvePath\(env\.AI_OS_SKILLS_DIR/);
assert.match(server, /const BUNDLED_SKILLS_DIR = pathImpl\.join\(rootDir, "bundled-skills"\)/);
assert.match(server, /bundledCustomDir: BUNDLED_SKILLS_DIR/);

// ── 注册表自身 ─────────────────────────────────────────────────────
assert.match(registry, /const SKILLS_STORE_FILE = "skills\.json";/);
assert.match(registry, /bundledCustomDir/, "bundled functional skills must load separately from user skills");
assert.match(registry, /store\.enabled\[skill\.id\] !== false/, "skills default to enabled");
assert.match(registry, /if \(enabled === false\) store\.enabled\[skillId\] = false;[\s\S]{0,80}else delete store\.enabled\[skillId\];/);

// ── 静态资源引用 ───────────────────────────────────────────────────
assert.match(html, /system-settings-ui\.js\?v=[^"]+/);
assert.match(html, /system-settings\.css\?v=[^"]+/);

// 画布 Agent 只承认已启用的 Skill：模型请求已停用的 ID 时给出可读提示而不是崩掉。
const activationGuard = canvasAgentUi.slice(
  canvasAgentUi.indexOf("function applyCanvasAgentSkillActivation"),
  canvasAgentUi.indexOf("async function executeCanvasAgentToolsAndContinue"),
);
assert.match(activationGuard, /const skill = state\.skills\.find\(\(item\) => item\.id === requestedSkillId\)/);
assert.match(activationGuard, /if \(!skill\)[\s\S]{0,160}code: "unknown_skill"/);
assert.match(activationGuard, /请求的专业流程当前不可用/);

console.log("Skill management UI checks passed.");
