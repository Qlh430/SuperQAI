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
assert.equal(runtime.getPublicSkillMetadata(catalog).length, 5);

const automatic = runtime.resolveCanvasAgentSkillContext({ skill_mode: "auto" }, catalog);
assert.equal(automatic.mode, "auto");
assert.equal(automatic.activeSkill, null);
assert.match(automatic.instructions, /当前画布/);
assert.match(automatic.instructions, /可选业务 Skill 路由目录/);
assert.doesNotMatch(automatic.instructions, /工作流程\s*\n\s*1\./);
assert.ok(automatic.capabilityIds.includes("skill.activate"));

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
assert.ok(request.tools.some((tool) => tool.name === "activate_canvas_skill"));
assert.equal(request.instructions.includes(poster.instructions), false);

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

console.log("Canvas agent on-demand skill routing checks passed.");
