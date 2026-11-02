"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const helper = path.join(__dirname, "component-deploy.mjs");
const loaded = fs.existsSync(helper) ? import(pathToFileURL(helper)) : Promise.resolve({ deployComponents: async () => { throw new Error("未实现组件独立部署。"); } });
const mapping = {
  cutout: [["design-sources/background-removal-ui.js", "background-removal-ui.js"], ["design-sources/background-removal-service.js", "background-removal-service.js"], ["design-sources/canvas-features/tool-cutout.js", "canvas-features/tool-cutout.js"]],
  h3: ["comfyui-client.js", "minimax-h3-workflow.js", "minimax-h3-task-service.js", "canvas-h3-node-renderer.js"].map(name => [`design-sources/${name}`, name]),
  chat: ["provider-protocol-engine.js", "chat-http-api.js"].map(name => [`design-sources/${name}`, name]),
  naming: [["dist/workbench.js", "neon-workbench.js"], ["host-bridge.js", "neon-host-bridge.js"]],
  "canvas-feature-core": [["design-sources/canvas-feature-registry.js", "canvas-feature-registry.js"]],
  "canvas-light-visual": [["design-sources/canvas-representation-host.js", "canvas-representation-host.js"]],
  "canvas-group-visual": [
    ["design-sources/script-before-save-bridge.js", "script.js"],
    ["design-sources/canvas-node-visuals.js", "canvas-node-visuals.js"],
    ["design-sources/canvas-scene-layer.js", "canvas-scene-layer.js"],
    ["design-sources/canvas-representation-host.js", "canvas-representation-host.js"],
    ["design-sources/neon-canvas-surface.css", "neon-canvas-surface.css"],
  ],
};
for (const name of ["tool-crop", "tool-outpaint", "tool-angle", "tool-upscale", "node-image", "node-video", "node-audio", "node-text", "node-note", "node-script", "node-upload"]) mapping[name] = [[`design-sources/canvas-features/${name}.js`, `canvas-features/${name}.js`]];
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function snapshot(directory) {
  const entries = [];
  function walk(current, prefix = "") { for (const entry of fs.readdirSync(current, { withFileTypes: true })) { const name = `${prefix}${entry.name}`; if (entry.isDirectory()) walk(path.join(current, entry.name), `${name}/`); else entries.push([name, fs.readFileSync(path.join(current, entry.name)).toString("base64")]); } }
  walk(directory); return entries.sort((a, b) => a[0].localeCompare(b[0]));
}
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-component-deploy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "neon-workbench"), runtime = path.join(root, "runtime");
  for (const [name, pairs] of Object.entries(mapping)) for (const [input, target] of pairs) {
    write(path.join(source, input), input === "design-sources/script-before-save-bridge.js" ? "window.CanvasWorkspace = {\n  loadCanvasWorkspace,\n};\n" : `// new ${name} ${target}\n`);
    const installed = path.join(runtime, target);
    if (!fs.existsSync(installed)) write(installed, `// installed ${name} ${target}\n`);
  }
  write(path.join(runtime, "script.js"), "// shared canvas core\n");
  write(path.join(source, "design-sources/canvas-script-production.js"), "// production append\n");
  write(path.join(source, "design-sources/canvas-asset-entry.js"), "// asset append\n");
  write(path.join(runtime, "assets/models/background-removal/ben2-base-1.0.0.onnx"), "DO NOT TOUCH MODEL");
  write(path.join(runtime, "data/users/settings.json"), "DO NOT TOUCH USER DATA");
  write(path.join(runtime, "workflows/minimax-h3-video.json"), "DO NOT TOUCH WORKFLOW");
  write(path.join(runtime, "index.html"), '<script src="./canvas-feature-registry.js?v=old-core"></script>\n<script src="./background-removal-ui.js?v=old-cutout"></script>\n<script src="./canvas-features/tool-cutout.js?v=old-tool"></script>\n<script src="./canvas-features/tool-crop.js?v=old-crop"></script>\n<script src="./neon-host-bridge.js?v=old-host"></script>\n<script src="./module-manifest.js?v=old-manifest"></script>\n<script src="./unrelated.js?v=keep"></script>');
  write(path.join(runtime, "module-manifest.js"), 'const scripts = ["./background-removal-ui.js?v=old-cutout", "./canvas-features/tool-cutout.js?v=old-tool", "./canvas-features/tool-crop.js?v=old-crop", "./canvas-h3-node-renderer.js?v=old-h3", "./unrelated.js?v=keep"];');
  write(path.join(runtime, "neon-workbench.html"), '<script src="./neon-workbench.js?v=old-naming"></script>');
  return { root, source, runtime, args: { source, runtime, build: false } };
}
test("cutout updates only its files and their cache URLs, with restorable backups", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  const before = snapshot(fixture.runtime);
  const result = await deployComponents({ ...fixture.args, names: ["cutout"] });
  assert.deepEqual(result.components, ["cutout"]);
  for (const [input, target] of mapping.cutout) { assert.equal(fs.readFileSync(path.join(fixture.source, input), "utf8"), fs.readFileSync(path.join(fixture.runtime, target), "utf8")); assert.equal(fs.readFileSync(path.join(result.backupDir, target), "utf8"), `// installed cutout ${target}\n`); }
  const after = new Map(snapshot(fixture.runtime));
  const allowed = new Set([...mapping.cutout.map(pair => pair[1]), "index.html", "module-manifest.js"]);
  for (const [name, value] of before) if (!allowed.has(name)) assert.equal(after.get(name), value, `${name} must remain unchanged`);
  const index = fs.readFileSync(path.join(fixture.runtime, "index.html"), "utf8");
  assert.ok(!index.includes("old-cutout") && !index.includes("old-tool")); assert.ok(index.includes("old-crop") && index.includes("unrelated.js?v=keep"));
  assert.match(result.backupDir, /-components$/);
});
test("unchanged selected files perform no writes or cache invalidation", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  for (const [input, target] of mapping.cutout) fs.copyFileSync(path.join(fixture.source, input), path.join(fixture.runtime, target));
  const before = snapshot(fixture.runtime), stamp = fs.statSync(path.join(fixture.runtime, "index.html")).mtimeMs;
  const result = await deployComponents({ ...fixture.args, names: ["cutout"] });
  assert.deepEqual(result.changed, []); assert.equal(result.backupDir, null); assert.deepEqual(snapshot(fixture.runtime), before); assert.equal(fs.statSync(path.join(fixture.runtime, "index.html")).mtimeMs, stamp);
});
test("multiple components are deduplicated and unrelated bundle stays unchanged", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  const bundleBefore = fs.readFileSync(path.join(fixture.runtime, "neon-workbench.js"), "utf8");
  const result = await deployComponents({ ...fixture.args, names: ["cutout", "tool-crop", "cutout", "chat"] });
  assert.deepEqual(result.components, ["cutout", "tool-crop", "chat"]);
  assert.equal(new Set(result.changed).size, result.changed.length); assert.equal(fs.readFileSync(path.join(fixture.runtime, "neon-workbench.js"), "utf8"), bundleBefore);
});
test("Light visual hotfix changes only its host and matching cache references", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  write(path.join(fixture.runtime, "module-manifest.js"), 'const scripts = ["./canvas-representation-host.js?v=old-light", "./unrelated.js?v=keep"];');
  const before = snapshot(fixture.runtime);
  const result = await deployComponents({ ...fixture.args, names: ["canvas-light-visual"] });
  const after = new Map(snapshot(fixture.runtime));
  const allowed = new Set(["canvas-representation-host.js", "module-manifest.js", "index.html"]);
  for (const [name, value] of before) if (!allowed.has(name)) assert.equal(after.get(name), value, `${name} must remain unchanged`);
  assert.equal(result.restartRequired, false);
  assert.equal(fs.readFileSync(path.join(result.backupDir, "canvas-representation-host.js"), "utf8"), "// installed canvas-light-visual canvas-representation-host.js\n");
  assert.ok(!fs.readFileSync(path.join(fixture.runtime, "module-manifest.js"), "utf8").includes("old-light"));
});

test("group visual hotfix assembles the canonical bridge and touches only its whitelist", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  write(path.join(fixture.runtime, "module-manifest.js"), 'const scripts = ["./script.js?v=old-script", "./canvas-node-visuals.js?v=old-node", "./canvas-scene-layer.js?v=old-scene", "./canvas-representation-host.js?v=old-host", "./unrelated.js?v=keep"];');
  const before = snapshot(fixture.runtime);
  const result = await deployComponents({ ...fixture.args, names: ["canvas-group-visual"] });
  const after = new Map(snapshot(fixture.runtime));
  const allowed = new Set(["script.js", "canvas-node-visuals.js", "canvas-scene-layer.js", "canvas-representation-host.js", "neon-canvas-surface.css", "module-manifest.js", "index.html"]);
  for (const [name, value] of before) if (!allowed.has(name)) assert.equal(after.get(name), value, `${name} must remain unchanged`);
  const script = fs.readFileSync(path.join(fixture.runtime, "script.js"), "utf8");
  assert.match(script, /saveForNavigation: async function/); assert.match(script, /production append/); assert.match(script, /asset append/);
  assert.ok(!fs.readFileSync(path.join(fixture.runtime, "module-manifest.js"), "utf8").includes("old-script"));
  assert.ok(fs.existsSync(path.join(result.backupDir, "script.js")));
  assert.equal(result.restartRequired, false);
});

test("canvas navigation bridge is preserved whenever the canonical script is replaced", async t => {
  const { ensureCanvasNavigationBridge } = await loaded;
  assert.equal(typeof ensureCanvasNavigationBridge, "function");
  const source = "window.CanvasWorkspace = {\n  loadCanvasWorkspace,\n};";
  const assembled = ensureCanvasNavigationBridge(source);
  assert.match(assembled, /saveForNavigation: async function/);
  assert.match(assembled, /loadCanvasWorkspace/);
  assert.equal(ensureCanvasNavigationBridge(assembled), assembled, "bridge injection must be idempotent");
  assert.throws(() => ensureCanvasNavigationBridge("window.CanvasWorkspace = Object.create(null);"), /入口|anchor|CanvasWorkspace/);
});

test("final canvas preview includes note owner sources and preserves unrelated runtime files", async t => {
  const f = setup(t), { deployComponents } = await loaded;
  const owned = [
    ["design-sources/script-before-save-bridge.js", "script.js"],
    ["design-sources/canvas-text-node-renderer.js", "canvas-text-node-renderer.js"],
    ["design-sources/canvas-node-visuals.js", "canvas-node-visuals.js"],
    ["design-sources/canvas-scene-layer.js", "canvas-scene-layer.js"],
    ["design-sources/canvas-representation-host.js", "canvas-representation-host.js"],
    ["design-sources/flora-connection-interaction.js", "flora-connection-interaction.js"],
    ["design-sources/flora-node-shell.css", "flora-node-shell.css"],
    ["../host-sources/app/canvas-note-node-renderer.js", "canvas-note-node-renderer.js"],
    ["../host-sources/app/styles.css", "styles.css"],
  ];
  for (const [input, target] of owned) write(path.join(f.source, input), target === "script.js" ? "window.CanvasWorkspace = {\n  loadCanvasWorkspace,\n};\n" : `// final ${target}\n`);
  write(path.join(f.runtime, "module-manifest.js"), 'const scripts = ["./canvas-note-node-renderer.js?v=old-note", "./script.js?v=old-script"];');
  const before = snapshot(f.runtime);
  const result = await deployComponents({ ...f.args, names: ["canvas-final-adjustments"] });
  const allowed = new Set([...owned.map(x => x[1]), "index.html", "module-manifest.js"]);
  const after = new Map(snapshot(f.runtime));
  for (const [name, value] of before) if (!allowed.has(name)) assert.equal(after.get(name), value, name);
  for (const [input, target] of owned.filter(x => x[1] !== "script.js")) assert.equal(fs.readFileSync(path.join(f.runtime, target), "utf8"), fs.readFileSync(path.join(f.source, input), "utf8"));
  assert.match(fs.readFileSync(path.join(f.runtime, "script.js"), "utf8"), /production append[\s\S]*asset append/);
  assert.doesNotMatch(fs.readFileSync(path.join(f.runtime, "module-manifest.js"), "utf8"), /old-note|old-script/);
  assert.ok(result.backupDir);
});

test("unknown names and empty selections fail before any runtime write", async t => {
  const fixture = setup(t), { deployComponents } = await loaded; const before = snapshot(fixture.runtime);
  for (const names of [["cutout", "../data"], [], ["toString"], "cutout"]) await assert.rejects(deployComponents({ ...fixture.args, names }), /组件|选择/);
  assert.deepEqual(snapshot(fixture.runtime), before);
});
test("missing source and missing installed canvas core fail before writes", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  fs.rmSync(path.join(fixture.source, "design-sources/background-removal-service.js")); const before = snapshot(fixture.runtime);
  await assert.rejects(deployComponents({ ...fixture.args, names: ["cutout"] }), /源文件|来源文件/); assert.deepEqual(snapshot(fixture.runtime), before);
  write(path.join(fixture.source, "design-sources/background-removal-service.js"), "new service"); fs.rmSync(path.join(fixture.runtime, "canvas-feature-registry.js")); const withoutCore = snapshot(fixture.runtime);
  await assert.rejects(deployComponents({ ...fixture.args, names: ["cutout"] }), /共享核心|完整部署/); assert.deepEqual(snapshot(fixture.runtime), withoutCore);
});
test("a mid-deploy failure restores every changed runtime byte", async t => {
  const fixture = setup(t), { deployComponents } = await loaded; const before = snapshot(fixture.runtime);
  const original = fs.writeFileSync; let writes = 0;
  fs.writeFileSync = function(file, ...args) { if (path.resolve(String(file)).startsWith(path.resolve(fixture.runtime) + path.sep) && ++writes === 2) throw new Error("fixture write failure"); return original.call(this, file, ...args); };
  try { await assert.rejects(deployComponents({ ...fixture.args, names: ["cutout"] }), /回滚|恢复/); }
  finally { fs.writeFileSync = original; }
  assert.deepEqual(snapshot(fixture.runtime), before);
});
test("naming changes only its bundle/bridge and the matching HTML cache references", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  await deployComponents({ ...fixture.args, names: ["naming"] });
  assert.ok(!fs.readFileSync(path.join(fixture.runtime, "neon-workbench.html"), "utf8").includes("old-naming"));
  assert.ok(!fs.readFileSync(path.join(fixture.runtime, "index.html"), "utf8").includes("old-host"));
});
test("a backend-only change does not invalidate unchanged browser modules", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  for (const [input, target] of mapping.cutout.filter(pair => pair[1] !== "background-removal-service.js")) fs.copyFileSync(path.join(fixture.source, input), path.join(fixture.runtime, target));
  const index = fs.readFileSync(path.join(fixture.runtime, "index.html"), "utf8"), manifest = fs.readFileSync(path.join(fixture.runtime, "module-manifest.js"), "utf8");
  const result = await deployComponents({ ...fixture.args, names: ["cutout"] });
  assert.deepEqual(result.changed, ["background-removal-service.js"]); assert.equal(result.restartRequired, true);
  assert.equal(fs.readFileSync(path.join(fixture.runtime, "index.html"), "utf8"), index); assert.equal(fs.readFileSync(path.join(fixture.runtime, "module-manifest.js"), "utf8"), manifest);
});
test("a failed metadata write restores changed modules and earlier HTML", async t => {
  const fixture = setup(t), { deployComponents } = await loaded; const before = snapshot(fixture.runtime);
  const original = fs.writeFileSync; let writes = 0;
  fs.writeFileSync = function(file, ...args) { if (path.resolve(String(file)).startsWith(path.resolve(fixture.runtime) + path.sep) && ++writes === 5) throw new Error("fixture manifest write failure"); return original.call(this, file, ...args); };
  try { await assert.rejects(deployComponents({ ...fixture.args, names: ["cutout"] }), /回滚/); }
  finally { fs.writeFileSync = original; }
  assert.deepEqual(snapshot(fixture.runtime), before);
});
test("a dangling link in a target path is rejected before any selected file changes", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  const featurePath = path.join(fixture.runtime, "canvas-features"), outside = path.join(fixture.root, "outside");
  fs.rmSync(featurePath, { recursive: true }); fs.mkdirSync(outside);
  try { fs.symlinkSync(outside, featurePath, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error.code === "EPERM") return t.skip("host does not permit symlink fixtures"); throw error; }
  fs.rmSync(outside, { recursive: true });
  const before = fs.readFileSync(path.join(fixture.runtime, "background-removal-ui.js"), "utf8");
  await assert.rejects(deployComponents({ ...fixture.args, names: ["cutout"] }), /链接/);
  assert.equal(fs.readFileSync(path.join(fixture.runtime, "background-removal-ui.js"), "utf8"), before);
});
test("new module manifest source survives cache URL updates and verification is read-only", async t => {
  const fixture = setup(t), { deployComponents } = await loaded;
  write(path.join(fixture.root, 'host-sources/app/canvas-agent-core.js'), '// current agent core');
  write(path.join(fixture.root, 'host-sources/app/module-manifest.js'), 'const scripts = ["./canvas-agent-core.js?v=source"]; // current manifest');
  const args = { ...fixture.args, names: ['canvas-agent-context'] };
  const before = snapshot(fixture.runtime);
  assert.ok((await deployComponents({ ...args, verifyOnly: true })).changed.length);
  assert.deepEqual(snapshot(fixture.runtime), before);
  await deployComponents(args);
  assert.match(fs.readFileSync(path.join(fixture.runtime, 'module-manifest.js'), 'utf8'), /current manifest/);
  assert.deepEqual((await deployComponents({ ...args, verifyOnly: true })).changed, []);
});
