"use strict";

// Guards the update granularity of the component split.
//
// Component packages are derived from module-manifest.js, so a file filed under
// the wrong component silently turns one node fix into a broader update. This
// check stages real node-component files in a temporary app root, runs the real
// packaging code and asserts two things:
//   1. every staged node file lands in exactly the component that owns it, and
//   2. a single-file edit to a node component changes that component's hash and
//      nothing else.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildComponentPackages } = require("./component-package-manifest");

const ROOT = path.resolve(__dirname, "..");

// Real node-component files, grouped by the component that must own them. The
// list covers renderer+plugin pairs, a component with extra rules/UI files, and
// shared engine scripts that must stay out of the node packages.
const EXPECTED_OWNERS = new Map([
  ["canvas-h3-controls-ui.js", "canvas-node-minimax-h3"],
  ["canvas-h3-node-renderer.js", "canvas-node-minimax-h3"],
  ["canvas-node-minimax-h3-plugin.js", "canvas-node-minimax-h3"],
  ["canvas-comfy-rules.js", "canvas-node-comfy"],
  ["canvas-comfy-outpaint-ui.js", "canvas-node-comfy"],
  ["canvas-comfy-qwen-ui.js", "canvas-node-comfy"],
  ["canvas-comfy-node-renderer.js", "canvas-node-comfy"],
  ["canvas-node-comfy-plugin.js", "canvas-node-comfy"],
  ["canvas-media-node-renderer.js", "canvas-node-media"],
  ["canvas-node-media-plugin.js", "canvas-node-media"],
  ["canvas-gallery-node-renderer.js", "canvas-node-gallery"],
  ["canvas-node-gallery-plugin.js", "canvas-node-gallery"],
  ["canvas-llm-preset-rules.js", "canvas-node-llm"],
  ["canvas-llm-preset-ui.js", "canvas-node-llm"],
  ["canvas-llm-node-renderer.js", "canvas-node-llm"],
  ["canvas-node-llm-plugin.js", "canvas-node-llm"],
  ["canvas-view-rules.js", "canvas-engine"],
  ["canvas-agent-markdown.js", "canvas-agent-ui"],
  ["script.js", "canvas-runtime"],
]);

const EDITED_FILE = "canvas-h3-node-renderer.js";
const EDITED_COMPONENT = "canvas-node-minimax-h3";

function stageAppRoot(stagingRoot) {
  const appRoot = path.join(stagingRoot, "app");
  fs.mkdirSync(appRoot, { recursive: true });
  for (const relativePath of EXPECTED_OWNERS.keys()) {
    fs.copyFileSync(path.join(ROOT, relativePath), path.join(appRoot, relativePath));
  }
  return appRoot;
}

function componentHashes(releaseRoot) {
  const manifestPath = path.join(releaseRoot, "ai-os-components.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return new Map(manifest.components.map((component) => [component.id, component.hash]));
}

const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-component-isolation-"));
try {
  const appRoot = stageAppRoot(stagingRoot);

  const beforeRoot = path.join(stagingRoot, "release-before");
  fs.mkdirSync(beforeRoot, { recursive: true });
  const before = buildComponentPackages({ sourceRoot: ROOT, appRoot, releaseRoot: beforeRoot, version: "before" });
  assert.ok(before, "the component packaging run must produce a manifest");

  const ownersFromPackaging = new Map();
  for (const component of before.manifest.components) {
    for (const file of component.files) ownersFromPackaging.set(file.path, component.id);
  }
  for (const [relativePath, expectedComponent] of EXPECTED_OWNERS) {
    assert.equal(
      ownersFromPackaging.get(relativePath),
      expectedComponent,
      `${relativePath} must be packaged into ${expectedComponent}`,
    );
  }

  const beforeHashes = componentHashes(beforeRoot);

  // A developer editing one node file must only invalidate that node package.
  fs.appendFileSync(path.join(appRoot, EDITED_FILE), "\n// component isolation probe\n");

  const afterRoot = path.join(stagingRoot, "release-after");
  fs.mkdirSync(afterRoot, { recursive: true });
  const after = buildComponentPackages({ sourceRoot: ROOT, appRoot, releaseRoot: afterRoot, version: "after" });
  assert.ok(after, "the second component packaging run must produce a manifest");
  const afterHashes = componentHashes(afterRoot);

  assert.deepEqual(
    [...afterHashes.keys()].sort(),
    [...beforeHashes.keys()].sort(),
    "the component list must not change when a file is edited",
  );
  const changed = [...afterHashes.keys()].filter((id) => beforeHashes.get(id) !== afterHashes.get(id));
  assert.deepEqual(
    changed,
    [EDITED_COMPONENT],
    `editing ${EDITED_FILE} must only change ${EDITED_COMPONENT}, but changed: ${changed.join(", ") || "nothing"}`,
  );

  console.log(
    "Component isolation checks passed: node files are packaged under their own component and a single-file fix invalidates exactly one package.",
  );
} finally {
  const realStaging = fs.realpathSync(stagingRoot);
  if (!path.basename(realStaging).startsWith("ai-os-component-isolation-")) {
    throw new Error("Temporary staging path changed; cleanup refused.");
  }
  fs.rmSync(realStaging, { recursive: true, force: true });
}
