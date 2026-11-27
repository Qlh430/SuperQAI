const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const featureRegistry = path.resolve(__dirname, "design-sources/canvas-feature-registry.js");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveCanvasFeature(request, parent, ...rest) {
  if (request === "./canvas-feature-registry.js" && parent?.filename?.includes("host-sources\\app")) {
    return featureRegistry;
  }
  return originalResolve.call(this, request, parent, ...rest);
};

const core = require("../host-sources/app/canvas-agent-core");
const runtime = require("../host-sources/app/canvas-agent-runtime");

assert.ok(core.MAX_STEPS > 12, "default Agent budget must permit productive work past 12 turns");
let run = core.createRunState({
  prompt: "仅搭建复杂画布工作流，不执行付费生成。",
});
for (let index = 0; index < 16; index += 1) {
  run = core.advanceRunState(run, {
    responseId: `isolated-response-${index + 1}`,
    toolCalls: [{
      call_id: `isolated-call-${index + 1}`,
      name: "create_text_node",
      arguments: { title: `隔离阶段 ${index + 1}`, content: `阶段 ${index + 1}` },
    }],
  });
}
assert.equal(run.step, 16);
assert.equal(run.pendingToolCalls.length, 1);
assert.equal(run.status, "running");
assert.equal(run.toolCallsUsed, 16);

const skills = runtime.loadCanvasSkillCatalog([{
  directory: path.join(__dirname, "../host-sources/app/skills"),
  origin: "system",
}]);
const request = runtime.buildProviderTurnRequest({
  prompt: "继续完成当前画布工作流。",
  step: 13,
  canvas: { nodes: [], connections: [] },
}, { skills });
assert.ok(request, "backend provider request builder accepts step 13");

assert.throws(
  () => core.advanceRunState({ ...run, step: core.MAX_STEPS }, { toolCalls: [] }),
  /step limit/,
  "the explicit maximum remains a finite safety boundary",
);

console.log("PASS: default Core and Runtime budgets allow 16 productive tool turns beyond the old 12-turn cap");
