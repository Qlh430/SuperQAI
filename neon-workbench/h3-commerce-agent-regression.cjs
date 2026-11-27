const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request === "./canvas-feature-registry.js" && parent?.filename?.includes("host-sources")) {
    return path.join(__dirname, "design-sources/canvas-feature-registry.js");
  }
  return originalResolve.call(this, request, parent, ...rest);
};

const capabilities = require("../host-sources/app/canvas-agent-capabilities");
const adapters = require("../host-sources/app/canvas-agent-tool-adapters");
const seen = [];
const selectedTarget = {
  dataset: { minimaxH3Model: "h3-commerce" },
  ownerDocument: { querySelectorAll: () => [selectedTarget] },
};
const api = {
  createNode: (kind, args) => ({ kind, args }),
  getNode: () => selectedTarget,
  saveH3CommercePackage: args => ({ saved: true, args }),
  fillH3CommerceNode: args => ({ filled: true, args }),
};
const tools = adapters.create({
  canvasApi: api,
  fetchImpl: async () => ({ ok: true, json: async () => ({
    node_id: "node-1",
    image_references: [1, 2, 3, 4].map(i => ({ slot: i, node_id: String(i), url: "/output/test.png" })),
    contents: { "prompt-a.txt": "A", "prompt-b.txt": "B" },
  }) }),
  getNodeOutput: () => ({ url: "/output/test.png" }),
});
assert.equal(tools.create_video_node({ engine: "h3-commerce", prompt: "A" }).kind, "minimax-h3");
assert.equal(tools.create_video_node({ engine: "h3-commerce" }).args.model, "h3-commerce");
assert.ok(tools.save_h3_commerce_package({ node_id: "node-1", prompt_a: "A", result_json: "{}" }).saved);
const filled = tools.fill_h3_commerce_node({ node_id: "node-1", package_id: "qa" }, { scope: { boardId: "test" }, assertActive() {} });
for (const name of ["save_h3_commerce_package", "fill_h3_commerce_node"]) {
  const definition = capabilities.getCapabilityByToolName(name);
  assert.ok(definition, `${name} capability is registered`);
  assert.equal(definition.risk, "safe");
  seen.push({ name, required: definition.tool.inputSchema.required });
}
assert.deepEqual(seen.map(item => item.name), ["save_h3_commerce_package", "fill_h3_commerce_node"]);
filled.then(result => {
  assert.ok(result.filled);
  console.log(JSON.stringify({ ok: true, checks: 8, tools: seen }));
}).catch(error => { console.error(error); process.exitCode = 1; });
