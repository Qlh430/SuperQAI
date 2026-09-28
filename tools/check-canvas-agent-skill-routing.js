const assert = require("node:assert/strict");
const path = require("node:path");
const runtime = require("../canvas-agent-runtime");

const ROOT = path.join(__dirname, "..");
const catalog = runtime.loadCanvasSkills(path.join(ROOT, "skills"));

assert.equal(catalog.core.id, "canvas-agent-core");
assert.equal(catalog.core.canvas.hidden, true);
assert.equal(catalog.core.canvas.core, true);
assert.ok(catalog.core.canvas.capabilities.includes("image.generate-to-gallery"));
assert.ok(catalog.core.canvas.capabilities.includes("image.existing-node-choice"));
assert.ok(catalog.core.canvas.capabilities.includes("canvas.node.focus"));
assert.ok(catalog.core.canvas.capabilities.includes("canvas.node.organize"));
assert.ok(catalog.core.canvas.capabilities.includes("image.crop"));
assert.ok(catalog.core.canvas.capabilities.includes("image.mask.edit"));
assert.match(catalog.core.instructions, /generate_image_to_gallery/);
assert.match(catalog.core.instructions, /request_image_node_choice/);
assert.match(catalog.core.instructions, /focus_canvas_nodes/);
assert.match(catalog.core.instructions, /organize_canvas_nodes/);
assert.match(catalog.core.instructions, /连线关系/);
assert.match(catalog.core.instructions, /默认.*image2|image2.*默认/);
assert.match(catalog.core.instructions, /用户明确指定模型/);
assert.match(catalog.core.instructions, /不得.*update_gallery/);
assert.match(catalog.core.instructions, /只创建节点/);
assert.equal(runtime.getPublicSkillMetadata(catalog).some((item) => item.id === "canvas-agent-core"), false);
assert.equal(runtime.getPublicSkillMetadata(catalog).length, 14);
// 系统 Skill 覆盖对话与文本、图像、视频三类，文本类随应用内置部署。
["writing", "rewrite", "code", "analysis"].forEach((id) => {
  const skill = catalog.business.find((item) => item.id === id);
  assert.ok(skill, `${id} should ship as a system skill`);
  assert.equal(skill.canvas.category, "text");
  assert.ok(skill.canvas.capabilities.length >= 2, `${id} should declare capabilities`);
  assert.ok(skill.canvas.triggers.length >= 3, `${id} should declare trigger words`);
  assert.ok(skill.instructions.length >= 120, `${id} should contain an executable workflow`);
});
assert.equal(runtime.getPublicSkillMetadata(catalog).every((item) => item.origin === "system"), true);

// 原子能力 Skill：生图、编辑图片、放大图片、识别图片必须真实存在，并且只声明画布上真实存在的能力。
const coreCapabilities = new Set(catalog.core.canvas.capabilities);
[
  ["generate-image", "生成图片", "image.generate-to-gallery"],
  ["edit-image", "编辑图片", "node.image.create"],
  ["upscale-image", "放大图片", "node.comfy.create"],
  ["describe-image", "识别图片", "node.llm.create"],
  ["remove-background", "一键抠图", "image.remove-background"],
].forEach(([id, label, capability]) => {
  const skill = catalog.business.find((item) => item.id === id);
  assert.ok(skill, `${id} should ship as a system capability skill`);
  assert.equal(skill.canvas.label, label);
  assert.equal(skill.canvas.category, "image");
  assert.ok(skill.canvas.capabilities.includes(capability), `${id} should declare ${capability}`);
  assert.ok(skill.canvas.capabilities.every((item) => coreCapabilities.has(item)), `${id} must only use real canvas capabilities`);
  assert.ok(skill.canvas.triggers.length >= 4, `${id} should declare trigger words`);
  assert.ok(skill.instructions.length >= 120, `${id} should contain an executable workflow`);
});
const generateImage = catalog.business.find((item) => item.id === "generate-image");
assert.match(generateImage.instructions, /generate_image_to_gallery/, "生图 Skill 必须指向真实生图工具");
assert.match(generateImage.instructions, /reference_node_ids/);
assert.match(catalog.business.find((item) => item.id === "upscale-image").instructions, /upscale2/, "放大 Skill 必须写明真实的 ComfyUI 模式");
assert.match(catalog.business.find((item) => item.id === "upscale-image").instructions, /6144/, "放大 Skill 必须写明 6K 档位");
assert.match(catalog.business.find((item) => item.id === "remove-background").instructions, /remove_canvas_image_background/, "抠图 Skill 必须指向真实抠图工具");
assert.match(catalog.business.find((item) => item.id === "remove-background").instructions, /remove-background/, "抠图 Skill 必须写明 ComfyUI 抠图模式");

const automatic = runtime.resolveCanvasAgentSkillContext({ skill_mode: "auto" }, catalog);
assert.equal(automatic.mode, "auto");
assert.equal(automatic.activeSkill, null);
assert.match(automatic.instructions, /当前画布/);
assert.match(automatic.instructions, /可选业务 Skill 路由目录/);
assert.doesNotMatch(automatic.instructions, /工作流程\s*\n\s*1\./);
assert.ok(automatic.capabilityIds.includes("skill.activate"));
// 系统 Skill 必须出现在 Agent 的路由目录里，Agent 才会自动激活它们。
["writing", "rewrite", "code", "analysis", "poster-design", "generate-image", "edit-image", "upscale-image", "describe-image", "remove-background"].forEach((id) => {
  assert.match(automatic.instructions, new RegExp(`- ${id}（`), `${id} should appear in the routing table`);
});
assert.match(automatic.instructions, /写作生成/);
assert.match(automatic.instructions, /文本分析/);

// 停用的 Skill 不进入路由目录，Agent 也就不会自动激活它。
const filtered = runtime.loadCanvasSkills(path.join(ROOT, "skills"), { enabledIds: new Set(["poster-design"]) });
const filteredContext = runtime.resolveCanvasAgentSkillContext({ skill_mode: "auto" }, filtered);
assert.match(filteredContext.instructions, /- poster-design（/);
assert.doesNotMatch(filteredContext.instructions, /- writing（/);
assert.equal(filtered.business.map((skill) => skill.id).join(","), "poster-design");
assert.equal(runtime.getPublicSkillMetadata(filtered).length, 1);

const poster = catalog.business.find((item) => item.id === "poster-design");
assert.ok(poster);
assert.ok(poster.canvas.triggers.includes("海报"));
assert.ok(poster.canvas.capabilities.includes("node.image.create"));

const activated = runtime.resolveCanvasAgentSkillContext({
  skill_mode: "auto",
  active_skill_id: "poster-design",
}, catalog);
assert.equal(activated.mode, "activated");
assert.equal(activated.activeSkill.id, "poster-design");
assert.match(activated.instructions, /当前业务 Skill：poster-design/);
assert.match(activated.instructions, /海报设计/);
assert.equal(activated.capabilityIds.includes("skill.activate"), false);
assert.equal(activated.capabilityIds.includes("node.video.create"), false);

const manual = runtime.resolveCanvasAgentSkillContext({
  skill_mode: "manual",
  skill_id: "poster-design",
}, catalog);
assert.equal(manual.mode, "manual");
assert.equal(manual.activeSkill.id, "poster-design");

assert.throws(() => runtime.resolveCanvasAgentSkillContext({
  skill_mode: "auto",
  active_skill_id: "missing",
}, catalog), /missing/);

assert.throws(() => runtime.parseSkillDocument(`---
name: invalid-capability
description: invalid
canvas:
  capabilities: [node.does-not-exist]
---
invalid
`, "invalid/SKILL.md"), /unknown capabilities/);

const request = runtime.buildResponsesRequest({
  skill_mode: "auto",
  prompt: "帮我设计一张海报",
  canvas: { id: "board-1", nodes: [] },
  step: 0,
}, {
  model: "test-model",
  reasoningEffort: "low",
  skills: catalog,
});
// 触发词唯一命中时不再等模型主动激活：正文直接预加载，但切换入口和路由目录都要留着。
assert.equal(request.instructions.includes(poster.instructions), true);
assert.ok(request.tools.some((tool) => tool.name === "activate_canvas_skill"));
assert.match(request.instructions, /本次需求已预加载上述专业流程/);
assert.match(request.instructions, /- generate-image（生成图片）/);
assert.equal(request.tools.some((tool) => tool.name === "create_video_node"), false);

// 直接生图：generate-image 的正文和真实生图工具都必须到位，否则 Agent 会只建节点不出图。
const imageRequest = runtime.buildResponsesRequest({
  skill_mode: "auto",
  prompt: "帮我生成一张赛博朋克城市夜景图片",
  canvas: { id: "board-1", nodes: [] },
  step: 0,
}, {
  model: "test-model",
  reasoningEffort: "low",
  skills: catalog,
});
assert.ok(imageRequest.tools.some((tool) => tool.name === "activate_canvas_skill"));
assert.ok(imageRequest.tools.some((tool) => tool.name === "generate_image_to_gallery"));
assert.match(imageRequest.instructions, /当前业务 Skill：generate-image/);
assert.match(imageRequest.instructions, /不要只创建节点/);
assert.equal(imageRequest.tools.some((tool) => tool.name === "create_video_node"), false);

const upscaleRequest = runtime.buildResponsesRequest({
  skill_mode: "auto",
  prompt: "把这张图片放大到4K",
  canvas: { id: "board-1", nodes: [] },
  step: 0,
}, {
  model: "test-model",
  reasoningEffort: "low",
  skills: catalog,
});
assert.ok(upscaleRequest.tools.some((tool) => tool.name === "create_comfy_node"));
assert.ok(upscaleRequest.tools.some((tool) => tool.name === "activate_canvas_skill"));
assert.match(upscaleRequest.instructions, /当前业务 Skill：upscale-image/);
assert.match(upscaleRequest.instructions, /upscale2/);
assert.equal(upscaleRequest.tools.some((tool) => tool.name === "generate_image_to_gallery"), false);

// 续跑每一轮都必须带回同一个预加载流程；skill_auto 表示这是"软"激活，仍可切换。
const autoContinued = runtime.resolveCanvasAgentSkillContext({
  skill_mode: "auto",
  active_skill_id: "generate-image",
  skill_auto: true,
  prompt: "帮我生成一张赛博朋克城市夜景图片",
}, catalog);
assert.equal(autoContinued.mode, "auto");
assert.equal(autoContinued.softActivated, true);
assert.equal(autoContinued.activeSkill.id, "generate-image");
assert.ok(autoContinued.capabilityIds.includes("skill.activate"));
assert.match(autoContinued.instructions, /当前业务 Skill：generate-image/);
assert.match(autoContinued.instructions, /- upscale-image（放大图片）/);

// 用户手动选择或模型自己激活的流程是"硬"的：不再注入路由目录，也不再提供切换工具。
const hardActivated = runtime.resolveCanvasAgentSkillContext({
  skill_mode: "auto",
  active_skill_id: "generate-image",
  prompt: "帮我生成一张赛博朋克城市夜景图片",
}, catalog);
assert.equal(hardActivated.mode, "activated");
assert.equal(hardActivated.softActivated, false);
assert.equal(hardActivated.capabilityIds.includes("skill.activate"), false);
assert.doesNotMatch(hardActivated.instructions, /可选业务 Skill 路由目录/);

// 纯聊天和提问不预加载，避免把讨论变成执行。
["你好", "我们在聊聊画布的整体风格", "这张图能不能放大到 4K？"].forEach((prompt) => {
  assert.equal(runtime.inferCanvasAgentBusinessSkill(prompt, catalog.business), null, prompt);
});
assert.equal(runtime.inferCanvasAgentBusinessSkill("帮我换背景", catalog.business), null, "并列触发词交给模型路由");
assert.equal(runtime.inferCanvasAgentBusinessSkill("帮我抠图", catalog.business).id, "remove-background");
assert.equal(runtime.inferCanvasAgentBusinessSkill("帮我生成一张赛博朋克城市夜景图片", catalog.business).id, "generate-image");
assert.equal(runtime.inferCanvasAgentBusinessSkill("把这张图片放大到 4K", catalog.business).id, "upscale-image");

// 被停用的流程不会被预加载，也不会出现在路由目录里。
assert.equal(runtime.inferCanvasAgentBusinessSkill("帮我生成一张图", filtered.business), null);

const activatedImage = runtime.buildResponsesRequest({
  skill_mode: "auto",
  active_skill_id: "generate-image",
  prompt: "继续执行",
  canvas: { id: "board-1", nodes: [] },
  step: 1,
}, {
  model: "test-model",
  reasoningEffort: "low",
  skills: catalog,
});
assert.equal(activatedImage.instructions.includes(generateImage.instructions), true);
assert.ok(activatedImage.tools.some((tool) => tool.name === "generate_image_to_gallery"));
assert.equal(activatedImage.tools.some((tool) => tool.name === "create_video_node"), false);

const activatedRequest = runtime.buildResponsesRequest({
  skill_mode: "auto",
  active_skill_id: "poster-design",
  prompt: "继续执行",
  canvas: { id: "board-1", nodes: [] },
  step: 1,
}, {
  model: "test-model",
  reasoningEffort: "low",
  skills: catalog,
});
assert.equal(activatedRequest.tools.some((tool) => tool.name === "activate_canvas_skill"), false);
assert.equal(activatedRequest.tools.some((tool) => tool.name === "create_video_node"), false);
assert.equal(activatedRequest.instructions.includes(poster.instructions), true);

// 参考文档只把清单放进提示词，正文必须靠 read_skill_reference 按需取，
// 否则一份几十 KB 的规范会挤掉每一轮真正需要的上下文。
const referenceCheckFs = require("node:fs");
const referenceCheckOs = require("node:os");
const referenceRoot = referenceCheckFs.mkdtempSync(path.join(referenceCheckOs.tmpdir(), "ai-os-skill-reference-"));
try {
  const referenceSkillDir = path.join(referenceRoot, "reference-routing");
  referenceCheckFs.mkdirSync(path.join(referenceSkillDir, "references"), { recursive: true });
  referenceCheckFs.writeFileSync(path.join(referenceSkillDir, "references", "spec.md"), "REFERENCE-BODY-PLACEHOLDER", "utf8");
  referenceCheckFs.writeFileSync(path.join(referenceSkillDir, "SKILL.md"), [
    "---",
    "name: reference-routing",
    "description: 参考文档路由测试",
    "canvas:",
    "  label: 参考文档流程",
    "  category: video",
    "  icon: type",
    "  required_selection: none",
    "  triggers: [参考文档测试]",
    "  capabilities: [node.text.create, skill.reference.read]",
    "---",
    "",
    "# 参考文档流程",
    "",
    "## 工作流程",
    "",
    "占位正文，用来验证参考文档清单会进入提示词，而正文本身不会。",
  ].join("\n"), "utf8");

  const referenceCatalog = runtime.loadCanvasSkills(referenceRoot);
  const referenceSkill = referenceCatalog.business.find((item) => item.id === "reference-routing");
  assert.ok(referenceSkill, "reference-routing should load from the custom directory");
  assert.deepEqual(referenceSkill.references.map((item) => item.path), ["references/spec.md"]);
  assert.equal(referenceSkill.references[0].bytes, Buffer.byteLength("REFERENCE-BODY-PLACEHOLDER", "utf8"));

  const referenceRequest = runtime.buildResponsesRequest({
    skill_mode: "manual",
    skill_id: "reference-routing",
    prompt: "按流程写一段",
    canvas: { id: "board-1", nodes: [] },
    step: 0,
  }, {
    model: "test-model",
    reasoningEffort: "low",
    skills: referenceCatalog,
  });
  assert.match(referenceRequest.instructions, /本流程的参考文档/);
  assert.match(referenceRequest.instructions, /references\/spec\.md/);
  assert.match(
    referenceRequest.instructions,
    /开始专业交付前[\s\S]*read_skill_reference 读取原文/,
    "手动 Skill 的专业交付必须先读取当前阶段的参考文档",
  );
  assert.match(
    referenceRequest.instructions,
    /默认交付物、字段、表格、检查项或阶段交接格式[\s\S]*逐项覆盖/,
    "参考文档规定的交付格式必须成为强制输出契约",
  );
  assert.doesNotMatch(referenceRequest.instructions, /REFERENCE-BODY-PLACEHOLDER/, "参考文档正文不能进提示词");
  assert.ok(referenceRequest.tools.some((tool) => tool.name === "read_skill_reference"));
} finally {
  referenceCheckFs.rmSync(referenceRoot, { recursive: true, force: true });
}

console.log("Canvas agent on-demand skill routing checks passed.");
