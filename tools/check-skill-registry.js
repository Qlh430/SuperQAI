"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createSkillRegistry, SKILLS_STORE_FILE, SKILL_GROUPS, groupForCategory } = require("../skill-registry");

const ROOT = path.join(__dirname, "..");
const SYSTEM_DIR = path.join(ROOT, "skills");

function writeSkill(directory, id, label, category, pack = "") {
  const folder = path.join(directory, id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "SKILL.md"), [
    "---",
    `name: ${id}`,
    `description: ${label} 的自定义实现`,
    ...(pack ? ["metadata:", `  pack: ${pack}`] : []),
    "canvas:",
    `  label: ${label}`,
    `  category: ${category}`,
    "  icon: sparkle",
    "  required_context: none",
    "  triggers: [测试触发, 自定义]",
    "  capabilities: [node.text.create, node.update]",
    "---",
    "",
    `# ${label}`,
    "",
    "## 工作流程",
    "",
    "这是一个用于校验自定义 Skill 目录加载与覆盖行为的占位实现，正文长度需要满足可执行工作流的最低要求。",
    "它不会被真实用户使用，只在检查脚本中验证注册表能正确合并系统 Skill 与功能 Skill。",
  ].join("\n"), "utf8");
  return folder;
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-skill-registry-"));
try {
  // ── 1. 系统 Skill 默认全部启用 ──────────────────────────────────────
  const systemDataDir = path.join(workDir, "system-only");
  const systemRegistry = createSkillRegistry({
    dataDir: systemDataDir,
    systemDir: SYSTEM_DIR,
    customDir: path.join(systemDataDir, "skills"),
  });
  const initial = systemRegistry.snapshot();
  assert.equal(initial.systemCount, 14, "AI OS should ship fourteen system skills");
  assert.equal(initial.customCount, 0);
  assert.equal(initial.enabledCount, initial.totalCount, "system skills are enabled by default");
  assert.deepEqual(initial.groups.map((group) => group.id), ["text", "image", "video"]);
  const textGroup = initial.groups.find((group) => group.id === "text");
  assert.deepEqual(textGroup.skills.map((skill) => skill.id).sort(), ["analysis", "code", "rewrite", "writing"]);
  assert.equal(initial.groups.flatMap((group) => group.skills).some((skill) => skill.id === "canvas-agent-core"), false, "the hidden core skill stays out of the catalog");
  assert.ok(initial.groups.flatMap((group) => group.skills).every((skill) => skill.builtin && skill.origin === "system"));
  assert.equal(path.basename(systemRegistry.storeFile), SKILLS_STORE_FILE);

  // ── 2. 停用后画布 Agent 目录不再包含该 Skill ────────────────────────
  const afterDisable = systemRegistry.setEnabled("writing", false);
  assert.equal(afterDisable.enabledCount, initial.totalCount - 1);
  const disabledEntry = afterDisable.groups.flatMap((group) => group.skills).find((skill) => skill.id === "writing");
  assert.equal(disabledEntry.enabled, false);
  const stored = JSON.parse(fs.readFileSync(systemRegistry.storeFile, "utf8"));
  assert.equal(stored.enabled.writing, false);

  const agentCatalog = systemRegistry.loadAgentCatalog();
  assert.equal(agentCatalog.business.some((skill) => skill.id === "writing"), false, "disabled skills leave the agent routing catalog");
  assert.equal(agentCatalog.business.some((skill) => skill.id === "poster-design"), true);
  assert.equal(agentCatalog.business.length, initial.totalCount - 1);
  assert.equal(agentCatalog.core.id, "canvas-agent-core");
  assert.equal(agentCatalog.all.length, initial.totalCount + 1, "all keeps the hidden core skill for the runtime");
  assert.ok(systemRegistry.enabledIds().includes("poster-design"));
  assert.equal(systemRegistry.enabledIds().includes("writing"), false);

  // ── 3. 重新启用会回到默认状态（不留下覆盖项） ──────────────────────
  const reEnabled = systemRegistry.setEnabled("writing", true);
  assert.equal(reEnabled.enabledCount, initial.totalCount);
  assert.equal(JSON.parse(fs.readFileSync(systemRegistry.storeFile, "utf8")).enabled.writing, undefined);
  assert.equal(systemRegistry.loadAgentCatalog().business.some((skill) => skill.id === "writing"), true);

  assert.throws(() => systemRegistry.setEnabled("missing-skill", false), (error) => error.code === "unknown_skill");
  assert.throws(() => systemRegistry.setEnabled("", false), (error) => error.code === "invalid_skill_id");
  assert.throws(() => systemRegistry.setEnabled("canvas-agent-core", false), (error) => error.code === "unknown_skill");

  // ── 4. 功能 Skill 独立存储，并可以覆盖同名系统 Skill ────────────────
  const customDataDir = path.join(workDir, "with-custom");
  const customDir = path.join(customDataDir, "skills");
  writeSkill(customDir, "my-custom-skill", "自定义测试", "text");
  writeSkill(customDir, "poster-design", "海报设计（覆盖）", "marketing");
  const customRegistry = createSkillRegistry({
    dataDir: customDataDir,
    systemDir: SYSTEM_DIR,
    customDir,
  });
  const mixed = customRegistry.snapshot();
  assert.equal(mixed.systemCount, 13, "an overridden system skill counts as a functional skill");
  assert.equal(mixed.customCount, 2);
  assert.equal(mixed.totalCount, 15);
  const entries = mixed.groups.flatMap((group) => group.skills);
  const overridden = entries.find((skill) => skill.id === "poster-design");
  assert.equal(overridden.origin, "custom");
  assert.equal(overridden.builtin, false);
  assert.equal(overridden.label, "海报设计（覆盖）");
  assert.equal(entries.find((skill) => skill.id === "my-custom-skill").group, "text");
  assert.equal(customRegistry.loadAgentCatalog().business.some((skill) => skill.id === "my-custom-skill"), true);

  // ── 5. 功能 Skill 按安装包分组；独立添加的技能不混进官方包 ───────────
  const packagedDataDir = path.join(workDir, "with-packaged-custom");
  const packagedDir = path.join(packagedDataDir, "skills");
  writeSkill(packagedDir, "pack-alpha", "安装包成员 A", "video", "MiniMax H3 Skills");
  writeSkill(packagedDir, "h3-prompt-writing", "H3 视频提示词", "video");
  writeSkill(packagedDir, "ai-video-director", "AI 视频导演", "video");
  const packagedRegistry = createSkillRegistry({
    dataDir: packagedDataDir,
    systemDir: SYSTEM_DIR,
    customDir: packagedDir,
  });
  const packaged = packagedRegistry.snapshot();
  const customGroups = packaged.groups.filter((group) => group.kind === "custom");
  assert.deepEqual(
    customGroups.map((group) => group.id),
    ["custom-pack:minimax-h3-skills", "custom:standalone"],
    "功能 Skill must be separate from standalone additions",
  );
  assert.equal(customGroups[0].label, "MiniMax H3 Skills");
  assert.deepEqual(
    customGroups[0].skills.map((skill) => skill.id).sort(),
    ["h3-prompt-writing", "pack-alpha"],
    "an explicit pack and the known MiniMax pack must stay together",
  );
  assert.deepEqual(
    customGroups[1].skills.map((skill) => skill.id),
    ["ai-video-director"],
    "the newly added skill must be listed as a separate functional skill",
  );

  // ── 6. 随包功能 Skill 可分发，并被用户目录中的同名实现覆盖 ─────────
  const bundledDataDir = path.join(workDir, "with-bundled-custom");
  const bundledDir = path.join(workDir, "bundled-skills");
  const bundledUserDir = path.join(bundledDataDir, "skills");
  writeSkill(bundledDir, "bundled-only-skill", "随包功能 Skill", "video");
  writeSkill(bundledDir, "poster-design", "海报设计（随包覆盖）", "marketing");
  writeSkill(bundledUserDir, "poster-design", "海报设计（用户覆盖）", "marketing");
  fs.mkdirSync(path.join(bundledDir, "bundled-only-skill", "references"), { recursive: true });
  fs.writeFileSync(path.join(bundledDir, "bundled-only-skill", "references", "guide.md"), "随包参考正文", "utf8");
  fs.mkdirSync(path.join(bundledDir, "poster-design", "references"), { recursive: true });
  fs.writeFileSync(path.join(bundledDir, "poster-design", "references", "guide.md"), "随包覆盖参考", "utf8");
  fs.mkdirSync(path.join(bundledUserDir, "poster-design", "references"), { recursive: true });
  fs.writeFileSync(path.join(bundledUserDir, "poster-design", "references", "guide.md"), "用户覆盖参考", "utf8");
  const bundledRegistry = createSkillRegistry({
    dataDir: bundledDataDir,
    systemDir: SYSTEM_DIR,
    bundledCustomDir: bundledDir,
    customDir: bundledUserDir,
  });
  const bundled = bundledRegistry.snapshot();
  const bundledEntries = bundled.groups.flatMap((group) => group.skills);
  assert.equal(bundledEntries.find((skill) => skill.id === "bundled-only-skill").origin, "custom");
  assert.equal(bundledEntries.find((skill) => skill.id === "poster-design").label, "海报设计（用户覆盖）");
  assert.equal(
    bundledRegistry.readReference("bundled-only-skill", "references/guide.md").content,
    "随包参考正文",
    "bundled skills must keep their references on a fresh installation",
  );
  assert.equal(
    bundledRegistry.readReference("poster-design", "references/guide.md").content,
    "用户覆盖参考",
    "a user override must also replace the bundled skill references",
  );

  // ── 7. 分组映射覆盖所有内置分类 ─────────────────────────────────────
  assert.deepEqual(SKILL_GROUPS.map((group) => group.id), ["text", "image", "video", "audio"]);
  assert.equal(groupForCategory("ecommerce").id, "image");
  assert.equal(groupForCategory("marketing").id, "image");
  assert.equal(groupForCategory("social").id, "image");
  assert.equal(groupForCategory("video").id, "video");
  assert.equal(groupForCategory("audio").id, "audio");
  assert.equal(groupForCategory("text").id, "text");
  assert.equal(groupForCategory("unknown-category").id, "text");
  assert.equal(groupForCategory("").id, "text");

  // ── 8. 缺少必需目录时直接报错，避免静默出空列表 ─────────────────────
  assert.throws(() => createSkillRegistry({ systemDir: SYSTEM_DIR }), TypeError);
  assert.throws(() => createSkillRegistry({ dataDir: customDataDir }), TypeError);

  // ── 9. 参考文档读取：只放行 references/ 下且清单里声明过的文件 ───────
  function rejectsReference(skillId, referencePath) {
    assert.throws(
      () => customRegistry.readReference(skillId, referencePath),
      (error) => ["invalid_skill_id", "invalid_reference_path", "unknown_skill", "unknown_reference"].includes(error.code),
      `readReference("${skillId}", "${referencePath}") should be rejected`,
    );
  }

  const referenceSkillDir = writeSkill(customDir, "reference-skill", "参考文档测试", "text");
  fs.mkdirSync(path.join(referenceSkillDir, "references", "nested"), { recursive: true });
  fs.writeFileSync(path.join(referenceSkillDir, "references", "base.txt"), "规格正文 base", "utf8");
  fs.writeFileSync(path.join(referenceSkillDir, "references", "nested", "deep.md"), "规格正文 deep", "utf8");
  fs.writeFileSync(path.join(referenceSkillDir, "secret.txt"), "不该被读到", "utf8");

  const listed = customRegistry.loadAgentCatalog().business.find((skill) => skill.id === "reference-skill");
  assert.deepEqual(
    listed.references.map((item) => item.path),
    ["references/base.txt", "references/nested/deep.md"],
    "only files under references/ belong to the reference manifest",
  );

  const loadedReference = customRegistry.readReference("reference-skill", "references/base.txt");
  assert.equal(loadedReference.skill_id, "reference-skill");
  assert.equal(loadedReference.path, "references/base.txt");
  assert.equal(loadedReference.content, "规格正文 base");
  assert.equal(loadedReference.bytes, Buffer.byteLength("规格正文 base", "utf8"));
  assert.equal(customRegistry.readReference("reference-skill", "references/nested/deep.md").content, "规格正文 deep");
  assert.equal(
    customRegistry.readReference("reference-skill", "./references\\base.txt").content,
    "规格正文 base",
    "common Windows-style relative paths should still resolve inside references/",
  );

  rejectsReference("reference-skill", "secret.txt");
  rejectsReference("reference-skill", "references/../secret.txt");
  rejectsReference("reference-skill", "references/");
  rejectsReference("reference-skill", "references/missing.txt");
  rejectsReference("reference-skill", "");
  rejectsReference("", "references/base.txt");
  rejectsReference("missing-skill", "references/base.txt");

  console.log("Skill registry checks passed.");
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
