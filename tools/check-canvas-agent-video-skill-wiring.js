/**
 * 视频类业务 Skill 的落地质量验收。
 *
 * 背景：用户手动挂上 h3-prompt-writing 后，Agent 建出了文字节点和视频节点，却没有连线，
 * 也没有先问清「做哪个产品」。根因是 Skill 自己的 capabilities 里没有 node.connect，
 * 模型手上根本没有「连接节点」这个工具。
 *
 * 这里把四件事锁成断言：
 * 1. 任何声明 node.video.create 的 Skill 都必须同时声明 node.connect，否则一定会出现孤立的节点；
 * 2. 即使 Skill 漏声明，运行时也要把 node.connect 作为保底能力补回去；
 * 3. 核心提示词必须包含「主体说不清就先问」和「创建下游节点必须连线」两条硬约束；
 * 4. h3-prompt-writing 不能有重复的落地段落，必须写清先读规范、只写一份提示词、三段齐全；
 * 5. 视频模型单次生成上限只能影响生成打包，不能反向决定分镜或平均拆分总时长。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("../canvas-agent-runtime");

const ROOT = path.join(__dirname, "..");
const CUSTOM_SKILLS = path.join(ROOT, "data", "skills");

const custom = runtime.loadCanvasSkillCatalog([{ directory: CUSTOM_SKILLS, origin: "custom" }]);

// 1. 视频类 Skill 必须能连线
const videoSkills = custom.business.filter((skill) => skill.canvas.capabilities.includes("node.video.create"));
assert.ok(videoSkills.length >= 5, `预期至少 5 个自带视频 Skill，实际 ${videoSkills.length}`);
videoSkills.forEach((skill) => {
  assert.ok(
    skill.canvas.capabilities.includes("node.connect"),
    `${skill.id} 会创建视频节点，capabilities 里必须有 node.connect，否则节点建好也连不上线`,
  );
  assert.match(
    skill.instructions,
    /问清/,
    `${skill.id} 必须在主体说不清时先问清楚，别拿默认值替用户决定创作对象`,
  );
});

// 2. 运行时保底：Skill 漏声明也要补回 node.connect
const system = runtime.loadCanvasSkills(path.join(ROOT, "skills"));
const merged = {
  core: system.core,
  business: [...system.business, ...custom.business],
  all: [...system.all, ...custom.all],
};
const manual = runtime.resolveCanvasAgentSkillContext({
  skill_mode: "manual",
  skill_id: "h3-prompt-writing",
}, merged);
assert.equal(manual.mode, "manual");
assert.equal(manual.activeSkill.id, "h3-prompt-writing");
assert.ok(manual.capabilityIds.includes("node.video.create"), "手动挂 H3 Skill 后必须能建视频节点");
assert.ok(manual.capabilityIds.includes("node.connect"), "手动挂 Skill 后必须保留 node.connect 保底能力");
assert.ok(manual.capabilityIds.includes("skill.reference.read"), "H3 Skill 必须能读参考文档");

// 保底只补连线，不放宽付费/生成类能力
assert.equal(manual.capabilityIds.includes("image.generate-to-gallery"), false);
assert.equal(manual.capabilityIds.includes("node.delete"), false);

// 保底层独立验证：故意造一个漏声明 node.connect 的视频 Skill，运行时必须兜住
const synthetic = runtime.resolveCanvasAgentSkillContext({
  skill_mode: "manual",
  skill_id: "synthetic-video",
}, {
  core: system.core,
  business: [{
    id: "synthetic-video",
    name: "synthetic-video",
    instructions: "合成用例：只建视频节点，不声明连线能力。",
    canvas: { label: "合成视频", category: "video", capabilities: ["node.video.create"], triggers: [] },
  }],
  all: [],
});
assert.ok(
  synthetic.capabilityIds.includes("node.connect"),
  "Skill 漏声明 node.connect 时，运行时必须补回保底能力",
);
assert.equal(synthetic.capabilityIds.includes("node.delete"), false, "保底不能顺手放开危险能力");
assert.equal(synthetic.capabilityIds.includes("node.image.create"), false, "保底不能顺手放开无关能力");

// 3. 核心提示词的两条硬约束
const coreText = system.core.instructions;
assert.match(coreText, /问清/, "核心提示词必须要求先问清创作主体");
assert.match(coreText, /reference_node_ids/, "核心提示词必须点名 reference_node_ids 自动连线");
assert.match(coreText, /connect_nodes/, "核心提示词必须要求用 connect_nodes 补连线");
assert.match(coreText, /模型单次生成上限只约束生成片段/, "核心提示词必须区分模型生成上限和分镜时长");
assert.match(coreText, /不得把总时长除以模型上限机械平均拆分/, "核心提示词必须禁止按模型上限平均拆分总时长");
assert.match(coreText, /用户未选择视频模型前/, "核心提示词必须禁止在未选模型时把模型上限写成项目约束");

// 4. AI 视频导演必须坚持先分镜定时长，再做生成打包
const videoDirector = custom.business.find((skill) => skill.id === "ai-video-director");
assert.ok(videoDirector, "ai-video-director 必须存在");
assert.equal(videoDirector.execution?.format, "canvas-agent-skill/v1", "视频导演必须加载 agent.skill.json");
assert.equal(videoDirector.execution?.mode, "procedure", "视频导演必须声明 procedure 执行模式");
assert.equal(videoDirector.execution?.exposure, "manual", "导入工作流必须只允许手动调用");
assert.equal(videoDirector.execution?.allowImplicitInvocation, false, "导入工作流不得隐式路由");
const inferredManualOnly = runtime.inferCanvasAgentBusinessSkill("请按脚本流程工作", [{
  id: "manual-only-skill",
  execution: videoDirector.execution,
  canvas: { triggers: ["脚本"] },
}]);
assert.equal(inferredManualOnly, null, "manual exposure 的导入工作流不得被自动预加载");
const scriptStage = videoDirector.execution?.stages?.find((stage) => stage.id === "script");
assert.ok(scriptStage, "视频导演必须声明脚本阶段");
assert.deepEqual(scriptStage.mustRead, ["references/script-and-story.md"]);
assert.deepEqual(scriptStage.tools, ["create_text_node", "update_node"]);
assert.ok(scriptStage.deliverable?.rules?.some((rule) => rule.key === "nine_part_foundation"));
const videoDirectorText = videoDirector.instructions;
assert.match(videoDirectorText, /先确定成片总时长、镜头结构和每镜使用时长/, "视频导演必须先确定总时长、镜头结构和每镜时长");
assert.match(videoDirectorText, /单镜不等于单次生成/, "视频导演必须区分镜头与模型单次生成片段");
assert.match(videoDirectorText, /生成上限只影响生成打包和提示词任务拆分/, "视频导演必须限定模型上限只影响生成打包");
assert.match(videoDirectorText, /不得反向改写分镜结构/, "视频导演不得让模型上限倒推分镜");
assert.match(videoDirectorText, /脚本阶段强制交付（AI OS）/, "视频导演必须声明脚本阶段的强制交付契约");
assert.match(videoDirectorText, /完整交付[\s\S]*默认脚本交付物/, "脚本阶段必须完整交付默认脚本交付物");
assert.match(videoDirectorText, /九项脚本骨架必须逐项回答/, "脚本阶段不得只列九项骨架标题");
assert.match(videoDirectorText, /情绪曲线、视觉母题变化[\s\S]*开头、高潮、结尾的闭环说明/, "脚本阶段必须包含情绪曲线、视觉母题和结尾闭环");
assert.match(videoDirectorText, /节点正文必须是完整的脚本阶段交付物/, "画布节点正文不能比聊天摘要更空");

const videoWorkflow = fs.readFileSync(
  path.join(CUSTOM_SKILLS, "ai-video-director", "references", "workflow.md"),
  "utf8",
);
assert.match(videoWorkflow, /主镜头表和每镜时长确认后，再根据用户实际选定的视频模型评估生成打包/, "工作流必须把生成打包放在镜头时长确认之后");
assert.match(videoWorkflow, /不得用“成片总时长 ÷ 模型上限”机械平均拆分/, "工作流必须禁止按模型上限平均拆分");

// 5. h3-prompt-writing 自身的质量
const h3 = custom.business.find((skill) => skill.id === "h3-prompt-writing");
assert.ok(h3, "h3-prompt-writing 必须存在");
const h3Text = h3.instructions;
assert.match(h3Text, /read_skill_reference/, "H3 Skill 必须要求先读参考规范再写");
assert.match(h3Text, /reference_node_ids/, "H3 Skill 必须要求把文字节点接进视频节点");
assert.match(h3Text, /没有连线的节点不算完成/, "H3 Skill 必须明确「没连线不算完成」");
assert.match(h3Text, /integrated_multimodal_description/, "H3 Skill 必须点名第一段字段");
assert.match(h3Text, /问清/, "H3 Skill 必须要求先问清主体");
assert.match(h3Text, /overall_soundscape/);
assert.match(h3Text, /non_diegetic_music/);

// 重复的「AI OS 落地方式」段落会让模型看到两套互相冲突的先读指令，必须只剩一份
const raw = fs.readFileSync(path.join(CUSTOM_SKILLS, "h3-prompt-writing", "SKILL.md"), "utf8");
const landingHeadings = raw.match(/AI OS 落地方式/g) || [];
assert.equal(landingHeadings.length, 1, `「AI OS 落地方式」段落重复了 ${landingHeadings.length} 次，模型会读到冲突指令`);

// 参考文档必须真实存在，否则 read_skill_reference 会 404
["references/base-en.txt", "references/ref-en.txt"].forEach((referencePath) => {
  const declared = h3.references.some((item) => item.path === referencePath);
  assert.ok(declared, `H3 Skill 必须声明 ${referencePath}`);
  assert.ok(fs.existsSync(path.join(CUSTOM_SKILLS, "h3-prompt-writing", referencePath)), `${referencePath} 缺失`);
});
["base-en.txt", "ref-en.txt"].forEach((name) => {
  const stat = fs.statSync(path.join(CUSTOM_SKILLS, "h3-prompt-writing", "references", name));
  assert.ok(stat.size >= 12000, `${name} 只有 ${stat.size} 字节，规范内容过薄`);
});

// 建好的请求里，手动挂 Skill 的那一轮必须真的把 connect_nodes 递给模型
const request = runtime.buildResponsesRequest({
  skill_mode: "manual",
  skill_id: "h3-prompt-writing",
  prompt: "用这张番茄图做一个产品展示视频",
  canvas: { id: "board-1", nodes: [] },
  step: 0,
}, { skills: merged, model: "test-model", reasoningEffort: "medium" });
const toolNames = request.tools.map((tool) => tool.name);
assert.ok(toolNames.includes("connect_nodes"), "H3 任务里模型必须拿到 connect_nodes 工具");
assert.ok(toolNames.includes("create_video_node"));
assert.ok(toolNames.includes("create_text_node"));
assert.ok(toolNames.includes("read_skill_reference"));
assert.match(
  request.instructions,
  /开始专业交付前[\s\S]*read_skill_reference 读取原文/,
  "视频导演的手动流程必须先读取与当前阶段相关的参考文档",
);
assert.match(
  request.instructions,
  /默认交付物、字段、表格、检查项或阶段交接格式[\s\S]*逐项覆盖/,
  "视频导演必须按参考文档里的默认交付物逐项交付，不能只给概念总结",
);
const directorRequest = runtime.buildResponsesRequest({
  skill_mode: "manual",
  skill_id: "ai-video-director",
  prompt: "跑一下这个故事脚本并完整写出脚本阶段交付物",
  canvas: { id: "board-1", nodes: [] },
  step: 0,
}, { skills: merged, model: "test-model", reasoningEffort: "medium" });
assert.match(
  directorRequest.instructions,
  /执行模式：procedure；调用边界：仅限用户手动选择/,
  "运行时提示词必须来自 agent.skill.json 的执行边界",
);
assert.match(
  directorRequest.instructions,
  /当前阶段写任何交付节点之前，必须先调用 read_skill_reference 成功读取：references\/script-and-story\.md/,
  "脚本阶段必须先读取 agent.skill.json 声明的必读文档",
);

// 工具描述本身也要讲清「传了 reference_node_ids 就会自动连线」
const capabilities = require("../canvas-agent-capabilities");
const videoTool = capabilities.getCapabilityByToolName("create_video_node");
assert.ok(videoTool, "create_video_node 能力必须存在");
assert.match(videoTool.tool.description, /自动连好线|自动连线/, "create_video_node 的说明必须点明自动连线");
assert.match(videoTool.tool.description, /不代表整个项目必须使用 H3/, "create_video_node 的说明不得暗示整个项目必须使用 H3");
assert.match(
  videoTool.tool.inputSchema.properties.duration.description,
  /单次生成片段时长，不是成片总时长或单个分镜镜头时长/,
  "duration 必须明确是 H3 单次生成片段时长",
);
assert.match(
  videoTool.tool.inputSchema.properties.duration.description,
  /不得按此上限机械平均拆分项目总时长/,
  "duration 必须禁止按 H3 上限平均拆分项目总时长",
);
assert.match(
  videoTool.tool.inputSchema.properties.reference_node_ids.description,
  /自动连线/,
  "reference_node_ids 的说明必须点明自动连线",
);

console.log("canvas agent video skill wiring checks passed");
