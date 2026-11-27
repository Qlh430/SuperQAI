const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
const app = path.join(root, "host-sources/app");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) {
  if (name === "./canvas-feature-registry.js" && parent?.filename.startsWith(app + path.sep)) {
    return path.join(__dirname, "design-sources/canvas-feature-registry.js");
  }
  return resolve.call(this, name, parent, ...rest);
};
const core = require("../host-sources/app/canvas-agent-core");
const runtime = require("../host-sources/app/canvas-agent-runtime");
Module._resolveFilename = resolve;
const { runInNewContext } = require("node:vm");
const bridge = fs.readFileSync(path.join(__dirname, "design-sources/script-before-save-bridge.js"), "utf8");
const poster = runtime.parseSkillDocument(fs.readFileSync(path.join(app, "skills/poster-design/SKILL.md"), "utf8"));

test("a creative poster request is distinct from discussion or prompt editing", () => {
  for (const input of ["以此产品生成一张春节海报。", "用这个产品设计一张春节海报", "帮我设计产品海报", "不要生图，帮我设计一张海报"]) {
    assert.equal(core.isPosterDesignRequest(input), true, input);
  }
  for (const input of ["如何设计一张春节海报？", "先讨论海报设计方案", "帮我优化海报生成提示词", "把这张人像改成海报风格"]) {
    assert.equal(core.isPosterDesignRequest(input), false, input);
  }
});

test("poster Brief accepts only the ordered, verified sources scoped to this run", () => {
  const fn = bridge.slice(bridge.indexOf("function requestAgentDesignBrief("), bridge.indexOf("function getCanvasAgentResolutionNoticeLabel("));
  const context = { scope: { runId: "ours" } };
  let active = { skillId: "poster-design", runId: "ours", sourceNodeIds: ["phone", "style"] };
  let imageAvailable = true;
  const request = runInNewContext(fn + "\nrequestAgentDesignBrief", {
    assertCanvasAgentContext() {},
    findAgentOwnedCanvasNode(id) { return id; },
    window: { CanvasAgentUi: { getSkillWorkflowContext: () => active },
      getCanvasNodeOutput: () => imageAvailable ? { type: "image", url: "/output/a.png" } : null },
  });
  const args = { workflow: "poster", poster_type: "product", source_node_ids: ["phone", "style"],
    image_prompt: "完整海报提示词", questions: [] };
  assert.deepEqual([...request(args, context).source_node_ids], args.source_node_ids);
  assert.equal(request(args, context).image_prompt, args.image_prompt);
  assert.throws(() => request({ ...args, source_node_ids: ["other"] }, context), /素材/);
  assert.throws(() => request({ ...args, source_node_ids: ["style", "phone"] }, context), /素材/);
  imageAvailable = false;
  assert.throws(() => request(args, context), /真实图片/);
  imageAvailable = true;
  active = { ...active, runId: "elsewhere" };
  assert.throws(() => request(args, context), /海报/);
});

test("bundled poster is versioned, uses existing node capabilities, and references real documentation", () => {
  assert.equal(poster.id, "poster-design");
  assert.equal(poster.metadata.version, "1.1.0");
  assert.ok(poster.canvas.capabilities.includes("node.image.create"));
  assert.ok(!poster.instructions.includes("图集"));
  for (const name of ["creative-brief", "poster-playbook", "festival-poster"]) {
    const filename = `references/${name}.md`;
    assert.ok(poster.instructions.includes(filename));
    assert.ok(fs.statSync(path.join(app, "skills/poster-design", filename)).size > 1000);
  }
});

test("a poster planning action with visual material exposes only planning tools to the provider", () => {
  const prompt = "用这个图片设计一张春节海报。";
  const built = runtime.buildProviderTurnRequest({
    prompt, skill_mode: "manual", skill_id: poster.id, skill_workflow: true,
    vision_images: ["data:image/jpeg;base64,/9j/AAAA"],
  }, { skills: [poster] });
  assert.deepEqual(built.tools.map(tool => tool.function.name).sort(), ["read_skill_reference", "request_design_brief"]);
  assert.ok(built.messages.some(message => Array.isArray(message.content)
    && message.content.some(part => part.type === "image_url")));
});
