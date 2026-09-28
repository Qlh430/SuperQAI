const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("../canvas-agent-runtime");
const capabilities = require("../canvas-agent-capabilities");
const toolAdapters = require("../canvas-agent-tool-adapters");

const ROOT = path.join(__dirname, "..");
const catalog = runtime.loadCanvasSkills(path.join(ROOT, "skills"));
const poster = catalog.business.find((skill) => skill.id === "poster-design");

assert.ok(poster, "poster-design should ship as a system skill");
assert.ok(
  poster.canvas.capabilities.includes("design.brief.request"),
  "poster-design should require a structured design brief before production",
);
assert.ok(
  poster.canvas.capabilities.includes("skill.reference.read"),
  "poster-design should read its professional references on demand",
);
assert.deepEqual(
  poster.references.map((item) => item.path),
  [
    "references/creative-brief.md",
    "references/festival-poster.md",
    "references/poster-playbook.md",
  ],
  "poster-design should ship the brief, poster, and festival references",
);
poster.references.forEach((item) => {
  const filename = path.join(ROOT, "skills", "poster-design", item.path);
  assert.ok(fs.existsSync(filename), `${item.path} should exist`);
  assert.ok(item.bytes > 0, `${item.path} should not be empty`);
});
assert.match(
  poster.instructions,
  /request_design_brief/,
  "poster workflow should call the structured brief tool before creating nodes",
);
assert.match(
  poster.instructions,
  /春节/,
  "poster workflow should explicitly cover Spring Festival posters",
);

const capability = capabilities.getCapability("design.brief.request");
assert.equal(capability?.tool?.name, "request_design_brief");
assert.equal(capabilities.getRisk("request_design_brief", {}), "safe");
const briefSchema = capability.tool.inputSchema.properties;
assert.ok(briefSchema.known_context, "the brief tool should carry already confirmed context");
assert.ok(briefSchema.questions, "the brief tool should carry only missing questions");
assert.equal(briefSchema.questions.maxItems, 5);
assert.deepEqual(
  briefSchema.questions.items.required,
  ["id", "label", "kind", "options", "required", "recommended"],
);

const adapterCalls = [];
const adapters = toolAdapters.create({
  canvasApi: {
    requestDesignBrief: (args, context) => {
      adapterCalls.push({ args, context });
      return { ok: true, kind: "design_brief" };
    },
  },
});
assert.deepEqual(
  adapters.request_design_brief({ workflow: "poster" }, { scope: { boardId: "board-1" } }),
  { ok: true, kind: "design_brief" },
);
assert.equal(adapterCalls.length, 1);
assert.equal(adapterCalls[0].args.workflow, "poster");

const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
assert.match(script, /function requestAgentDesignBrief/);
assert.match(script, /decision_required:\s*true/);
assert.match(script, /kind:\s*["']design_brief["']/);
assert.match(script, /requestDesignBrief:\s*requestAgentDesignBrief/);

const ui = fs.readFileSync(path.join(ROOT, "canvas-agent-ui.js"), "utf8");
assert.match(ui, /function showCanvasAgentDesignBrief/);
assert.match(ui, /function submitCanvasAgentDesignBrief/);
assert.match(ui, /pendingDesignBrief/);
assert.match(ui, /data-agent-brief-submit/);
assert.match(ui, /data-agent-brief-recommended/);
assert.match(ui, /data-agent-brief-cancel/);
assert.match(ui, /已确认海报设计需求/);
assert.match(ui, /waiting-brief/);

const css = fs.readFileSync(path.join(ROOT, "canvas-agent.css"), "utf8");
assert.match(css, /\.canvas-agent-brief\s*\{/);
assert.match(css, /\.canvas-agent-brief-actions\s*\{/);

console.log("Canvas agent design brief checks passed.");
