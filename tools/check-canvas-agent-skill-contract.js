const assert = require("node:assert/strict");
const contractRules = require("../canvas-agent-skill-contract");

const skill = {
  id: "ai-video-director",
  label: "AI 视频导演",
  references: [
    { path: "references/script-and-story.md", bytes: 1000 },
    { path: "references/shot-and-rhythm.md", bytes: 1000 },
  ],
};

const completeScript = [
  "# 脚本阶段交付物",
  "",
  "## 已确认输入、暂定假设和待确认项",
  "- 已确认输入：30 秒充电宝广告。",
  "- 暂定假设：面向短视频信息流。",
  "- 待确认项：产品品牌与外观。",
  "",
  "## 九项脚本骨架",
  "| 项目 | 回答 |",
  "|---|---|",
  "| 传播目标 | 记住充电宝能救场 |",
  "| 核心表达 | 关键时刻的一次补电让故事继续 |",
  "| 目标观众 | 短视频用户 |",
  "| 主角 | 倒吊小偷 |",
  "| 初始状态 | 即将拿到钻石 |",
  "| 核心问题 | 手机低电导致绳索停止 |",
  "| 关键行动 | 玩家接入充电宝 |",
  "| 最大变化 | 警报也被恢复 |",
  "| 最终落点 | 回到品牌和口号 |",
  "",
  "## 一句话核心表达",
  "一次及时补电会让停住的故事继续，也会让被忽略的后果一起复活。",
  "",
  "## 故事发动机与因果链",
  "故事发动机：低电让行动停摆。",
  "因果链：初始状态 → 问题出现 → 主角行动 → 状态变化 → 结果 → 主题落点。",
  "",
  "## 带段落时间的脚本表",
  "| 段落时间 | 行动 | 可见变化 | 声音 | 功能动机 | 段落任务 |",
  "|---|---|---|---|---|---|",
  "| 0—5 秒 | 绳索下降 | 停在钻石前一厘米 | 电机声突然停止 | 建立低电问题 | 建立目标与危机 |",
  "| 5—15 秒 | 小偷求助 | 玩家揭示 | 同步嘘声 | 连接现实玩家 | 完成世界揭示 |",
  "| 15—26 秒 | 接入充电宝 | 绳索和警报恢复 | 充电提示音与警报 | 证明接电有效 | 完成反转 |",
  "| 26—30 秒 | 慌忙逃跑 | 品牌落版 | 明快收束音 | 形成品牌记忆 | 完成闭环 |",
  "",
  "## 视听分工",
  "画面负责动作与状态变化，声音负责断电、恢复和警报预告。",
  "",
  "## 情绪曲线与视觉母题变化",
  "情绪曲线：潜行、受阻、希望、虚假胜利、警报反转、喜剧收束。",
  "视觉母题变化：绳索运动从停滞到恢复，红光从无到铺满。",
  "",
  "## 开头、高潮和结尾闭环说明",
  "开头建立一厘米距离和低电问题。高潮是钻石得手后警报同时复活。结尾用品牌口号回收“继续”的主题形成闭环。",
  "",
  "## 删除测试与可执行性检查",
  "删除测试：删除玩家同步嘘声会削弱跨屏呼应。",
  "可执行性检查：目标时长可以容纳因果节点；品牌事实确认后即可进入主镜头表。",
  "",
  "## 脚本确认结论",
  "有条件批准。",
  "",
  "## 阶段交接",
  "这个脚本阶段的效果是否满意？如果满意，我继续进入主镜头表；如果需要调整，请指出最想修改的部分。",
].join("\n");

const contract = contractRules.createContract(skill, {
  prompt: "跑一下这个故事脚本并写出完整脚本",
  manualActivated: true,
});
assert.equal(contract.skillId, "ai-video-director");
assert.equal(contract.stage, "script");
assert.deepEqual(contract.requiredReferences, ["references/script-and-story.md"]);

const incomplete = contractRules.inspectToolResult(contract, {
  name: "create_text_node",
  arguments: {
    content: [
      "状态：有条件批准",
      "因果链：低电让绳索停止，充电让警报恢复。",
      "风险：品牌信息待确认。",
    ].join("\n"),
  },
}, { ok: true });
assert.equal(incomplete.violation.code, "skill_deliverable_incomplete");
assert.ok(incomplete.violation.missing.includes("九项脚本骨架"));
assert.ok(incomplete.violation.missing.includes("读取参考文档 references/script-and-story.md"));
assert.ok(incomplete.violation.missing.includes("唯一的阶段交接问题"));

const guardedOutput = contractRules.buildToolViolationOutput({ ok: true, node_id: "node-1" }, incomplete.violation);
assert.equal(guardedOutput.ok, true);
assert.equal(guardedOutput.node_id, "node-1");
assert.equal(guardedOutput.skill_contract.ok, false);
assert.match(guardedOutput.skill_contract.instruction, /create_text_node|update_node/);
assert.match(guardedOutput.skill_contract.instruction, /九项脚本骨架/);

const readContract = contractRules.recordToolResult(contract, {
  name: "read_skill_reference",
  arguments: { skill_id: "ai-video-director", path: "references/script-and-story.md" },
}, {
  ok: true,
  path: "references/script-and-story.md",
});
assert.deepEqual(readContract.readReferences, ["references/script-and-story.md"]);

const failedTextWrite = contractRules.recordToolResult(readContract, {
  name: "create_text_node",
  arguments: { content: completeScript },
}, {
  ok: false,
  code: "invalid_arguments",
  error: "参数.x缺失。",
});
assert.equal(failedTextWrite.lastDeliverableText, "");
assert.equal(failedTextWrite.deliverableCompleted, false);

const complete = contractRules.inspectToolResult(readContract, {
  name: "create_text_node",
  arguments: { content: completeScript },
}, { ok: true });
assert.equal(complete.violation, null);
assert.equal(complete.contract.deliverableCompleted, true);
assert.equal(contractRules.inspectCompletion(complete.contract, "已写入画布文字节点。").ok, true);

const completionViolation = contractRules.inspectCompletion(readContract, "有条件批准，因果链和风险如下。");
assert.equal(completionViolation.ok, false);
assert.ok(completionViolation.missing.includes("把完整交付物写入画布文字节点"));
assert.match(
  contractRules.buildCorrectionInstruction(completionViolation, "有条件批准"),
  /不能把聊天摘要当作交付完成/,
);

const otherStage = contractRules.createContract(skill, {
  prompt: "根据已批准脚本拆主镜头和视频提示词",
  manualActivated: true,
});
assert.equal(otherStage.stage, "general");
assert.equal(otherStage.deliverable, null);
assert.equal(contractRules.inspectCompletion(otherStage, "已拆出主镜头表。").ok, true);

const genericSkill = {
  id: "custom-reference-skill",
  label: "参考文档 Skill",
  references: [{ path: "references/workflow.md", bytes: 1000 }],
};
const genericContract = contractRules.createContract(genericSkill, {
  prompt: "按流程给出完整方案",
  manualActivated: true,
});
const genericViolation = contractRules.inspectToolResult(genericContract, {
  name: "create_text_node",
  arguments: { content: "方案正文" },
}, { ok: true });
assert.equal(genericViolation.violation.code, "skill_reference_required");
assert.equal(contractRules.inspectCompletion(genericViolation.contract, "方案已写入节点。").ok, false);
const genericRead = contractRules.recordToolResult(genericViolation.contract, {
  name: "read_skill_reference",
  arguments: { skill_id: "custom-reference-skill", path: "references/workflow.md" },
}, {
  ok: true,
  path: "references/workflow.md",
});
assert.equal(contractRules.inspectCompletion(genericRead, "方案已写入节点。").ok, true);

const manifestSkill = {
  id: "manifest-driven-skill",
  label: "清单驱动 Skill",
  references: [
    { path: "references/guide.md", bytes: 1000 },
  ],
  execution: {
    format: "canvas-agent-skill/v1",
    mode: "procedure",
    exposure: "manual",
    allowImplicitInvocation: false,
    limits: { maxRounds: 12, maxToolCalls: 16 },
    stages: [
      {
        id: "script",
        label: "脚本阶段",
        whenAny: ["脚本"],
        whenNone: ["分镜"],
        mustRead: ["references/guide.md"],
        tools: ["create_text_node", "update_node"],
        deliverable: {
          code: "manifest-script",
          label: "清单脚本阶段",
          requireCanvasTextNode: true,
          rules: [
            { key: "foundation", label: "完整脚本骨架", groups: [["九项脚本骨架"]] },
            { key: "status", label: "脚本确认结论", groups: [["脚本确认结论"]] },
          ],
        },
      },
    ],
  },
};
const manifestContract = contractRules.createContract(manifestSkill, {
  prompt: "完整写出脚本",
  manualActivated: true,
});
assert.equal(manifestContract.stage, "script");
assert.deepEqual(manifestContract.requiredReferences, ["references/guide.md"]);
assert.equal(manifestContract.deliverable.label, "清单脚本阶段");
const manifestBlockedByReference = contractRules.inspectToolCall(manifestContract, {
  name: "create_text_node",
  arguments: { content: completeScript },
});
assert.equal(manifestBlockedByReference.violation.code, "skill_reference_required");
assert.equal(manifestBlockedByReference.contract.textDeliverableAttempted, false);

const manifestRead = contractRules.recordToolResult(manifestContract, {
  name: "read_skill_reference",
  arguments: { skill_id: "manifest-driven-skill", path: "references/guide.md" },
}, {
  ok: true,
  path: "references/guide.md",
});
const manifestBlockedByDeliverable = contractRules.inspectToolCall(manifestRead, {
  name: "create_text_node",
  arguments: { content: "只有脚本确认结论。\n| 字段 | 值 |\n|---|---|" },
});
assert.equal(manifestBlockedByDeliverable.violation.code, "skill_deliverable_incomplete");
assert.ok(manifestBlockedByDeliverable.violation.missing.includes("完整脚本骨架"));
assert.equal(manifestBlockedByDeliverable.violation.blockedBeforeExecution, true);
assert.equal(manifestBlockedByDeliverable.contract.textDeliverableAttempted, false);

const manifestAllowed = contractRules.inspectToolCall(manifestRead, {
  name: "update_node",
  arguments: {
    node_id: "node-1",
    changes: { content: completeScript },
  },
});
assert.equal(manifestAllowed.violation, null);
const manifestBlockedOutput = contractRules.buildToolViolationOutput({
  ok: false,
  tool: "create_text_node",
  code: manifestBlockedByDeliverable.violation.code,
}, manifestBlockedByDeliverable.violation, { blocked: true });
assert.match(manifestBlockedOutput.skill_contract.instruction, /没有执行/);
assert.equal(manifestBlockedOutput.node_id, undefined);

console.log(JSON.stringify({
  contract: true,
  scriptStage: true,
  incompleteRejected: true,
  referenceGate: true,
  completeAccepted: true,
  otherStageUnaffected: true,
  genericReferenceSkill: true,
  manifestDrivenSkill: true,
  preflightGate: true,
}, null, 2));
