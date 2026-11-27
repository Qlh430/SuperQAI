"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request === "./canvas-feature-registry.js" && parent?.filename?.includes("host-sources")) {
    return path.join(__dirname, "design-sources/canvas-feature-registry.js");
  }
  return resolve.call(this, request, parent, ...rest);
};
const { createSkillRegistry } = require("../host-sources/app/skill-registry");
const { createSkillHttpApi } = require("../host-sources/app/skill-http-api");
const markdown = `---
name: product-plan
description: 商业产品摄影策划。
---
# 商业产品摄影 · 十种创意方案
## 输入要求
提供一张产品图片。
## 使用说明
先分析材质，再制定方案，只规划时不要生成。
`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-square-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const registry = createSkillRegistry({ dataDir: path.join(root, "data"), systemDir: path.join(root, "system") });
  const files = [
    { path: "SKILL.md", content: Buffer.from(markdown) },
    { path: "references/method.md", content: Buffer.from("真实摄影方法") },
    { path: "assets/cover.png", content: Buffer.from("89504e470d0a1a0a00000000", "hex") },
    { path: "assets/unsafe.html", content: Buffer.from("<script>alert(1)</script>") },
  ];
  registry.installPersonalSkill("alice", "product-plan", files, { source: "本地样本", scope: "personal" });
  return { root, registry, files };
}
test("square shares the registry and keeps private detail and media private", t => {
  const { registry } = fixture(t);
  const library = registry.listLibrary("alice");
  assert.equal(library.length, 1);
  assert.equal(library[0].label, "商业产品摄影 · 十种创意方案");
  assert.equal(library[0].scope, "personal");
  assert.equal(registry.listLibrary("bob").length, 0);
  const detail = registry.getDetail("product-plan", "alice");
  assert.match(detail.instructions, /先分析材质/);
  assert.equal(detail.references[0].path, "references/method.md");
  assert.equal(detail.media.length, 1);
  assert.equal(detail.cover, "assets/cover.png");
  assert.equal(registry.readMedia("product-plan", "assets/cover.png", "alice").contentType, "image/png");
  for (const method of [() => registry.getDetail("product-plan", "bob"),
    () => registry.readMedia("product-plan", "assets/cover.png", "bob"),
    () => registry.readMedia("product-plan", "../SKILL.md", "alice"),
    () => registry.readMedia("product-plan", "assets/unsafe.html", "alice")]) assert.throws(method);
});
test("public featured state persists and enabled status agrees with Agent catalog", t => {
  const { root, registry, files } = fixture(t);
  registry.installPersonalSkill("alice", "product-plan", files, { scope: "public" }, "public", true);
  registry.setFeatured("product-plan", true);
  assert.equal(registry.listLibrary("bob")[0].scope, "public");
  assert.equal(registry.listLibrary("bob")[0].featured, true);
  registry.setEnabled("product-plan", false);
  assert.equal(registry.listLibrary("bob")[0].enabled, false);
  assert.equal(registry.loadAgentCatalog("bob").business.length, 0);
  const reopened = createSkillRegistry({ dataDir: path.join(root, "data"), systemDir: path.join(root, "system") });
  assert.equal(reopened.getDetail("product-plan", "bob").featured, true);
});
test("media reads reject a symlink even inside the Skill asset directory", t => {
  const { root, registry } = fixture(t);
  const skillRoot = path.join(registry.getPersonalSkillsDir("alice"), "product-plan");
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "private.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  fs.symlinkSync(outside, path.join(skillRoot, "assets", "escape"), "junction");
  assert.throws(() => registry.readMedia("product-plan", "assets/escape/private.png", "alice"),
    error => error.code === "unsafe_skill_storage");
});

test("square HTTP routes authenticate details and reserve featured changes for admin", async t => {
  const { registry } = fixture(t);
  const api = createSkillHttpApi({
    skillRegistry: registry, skillImportManager: { preview() {} },
    agentModelSettings: { get() {} }, canvasAgentRuntime: { getPublicSkillMetadata() {} },
    requireAuth: async req => req.auth,
    requireSuperAdmin: async req => req.auth?.user?.role === "superadmin" ? req.auth : null,
    readJson: async req => req.payload,
    sendJson: (res, status, body) => { res.status = status; res.body = body; res.writableEnded = true; },
  });
  async function call(url, user, method = "GET", payload) {
    const res = {};
    assert.equal(await api.handle({ url, method, headers: {}, auth: user ? { user } : null, payload }, res), true);
    return res;
  }
  assert.equal((await call("/api/skills/library")).status, 401);
  const bob = { id: "bob", role: "user" };
  assert.deepEqual((await call("/api/skills/library", bob)).body.skills, []);
  assert.equal((await call("/api/skills/detail?skill_id=product-plan", bob)).status, 404);
  assert.equal((await call("/api/skills/featured", bob, "POST", { id: "product-plan", featured: true })).status, 403);
  const alice = { id: "alice", role: "superadmin" };
  assert.equal((await call("/api/skills/detail?skill_id=product-plan", alice)).body.label, "商业产品摄影 · 十种创意方案");
  assert.equal((await call("/api/skills/featured", alice, "POST", { id: "product-plan", featured: true })).status, 404, "a private Skill cannot be featured before publication");
});

test("展示资料独立保存，卡片与详情共用封面，不改专业内容且私人资料隔离", t => {
  const { root, registry } = fixture(t);
  const before = registry.getDetail("product-plan", "alice").instructions;
  registry.setPresentation("product-plan", "alice", {
    summary: "上传产品图，规划十种商业摄影创意", inputs: "产品参考图、产品描述、品牌配色",
    outputs: "十个独立中文提示词节点，共用一张参考图",
    media: [{ id: "case1", path: "assets/cover.png", title: "真实案例" }], coverId: "case1",
  });
  const reopened = createSkillRegistry({ dataDir: path.join(root, "data"), systemDir: path.join(root, "system") });
  const detail = reopened.getDetail("product-plan", "alice");
  assert.equal(detail.presentation.inputs, "产品参考图、产品描述、品牌配色");
  assert.equal(detail.instructions, before);
  assert.equal(detail.media[0].id, "case1");
  assert.equal(reopened.listLibrary("alice")[0].coverId, "case1");
  assert.throws(() => reopened.setPresentation("product-plan", "bob", { media: [] }));
  assert.equal(reopened.listLibrary("bob").length, 0);
  assert.throws(() => reopened.setPresentation("product-plan", "alice", { media: [{ id: "escape", path: "../secret.png" }] }));
  assert.throws(() => reopened.setPresentation("product-plan", "alice", { media: [null] }), /案例资料格式/);
  assert.equal(reopened.getDetail("product-plan", "alice").media[0].id, "case1", "失败保留原资料");
});

test("公共展示只允许管理员编辑，清空案例不回退成无关资源", t => {
  const { registry, files } = fixture(t);
  registry.installPersonalSkill("alice", "product-plan", files, { scope: "public" }, "public", true);
  assert.throws(() => registry.setPresentation("product-plan", "bob", { summary: "覆盖" }), /权限|管理员/);
  registry.setPresentation("product-plan", "alice", { summary: "公共简介", media: [], coverId: "" }, { isAdmin: true, scope: "public" });
  assert.equal(registry.getDetail("product-plan", "bob").media.length, 0);
  assert.equal(registry.listLibrary("bob")[0].presentation.summary, "公共简介");
});

test("显示名称和多分类独立保存，管理、广场和 Agent 同步且 ID、工具与原文不变", t => {
  const { root, registry } = fixture(t);
  const before = registry.loadAgentCatalog("alice").business[0];
  const source = fs.readFileSync(path.join(registry.getPersonalSkillsDir("alice"), "product-plan/SKILL.md"), "utf8");
  registry.setPresentation("product-plan", "alice", {
    displayName: "商业产品摄影 · 十种创意方案", categories: ["image", "marketing", "ecommerce"],
    summary: "上传产品图，规划十种创意", media: [],
  });
  const reopened = createSkillRegistry({ dataDir: path.join(root, "data"), systemDir: path.join(root, "system") });
  for (const entry of [reopened.listPersonalSkills("alice")[0], reopened.listLibrary("alice")[0], reopened.getDetail("product-plan", "alice")]) {
    assert.equal(entry.id, "product-plan");
    assert.equal(entry.label, "商业产品摄影 · 十种创意方案");
    assert.deepEqual(entry.categories.map(item => item.id), ["image", "marketing", "ecommerce"]);
  }
  const agent = reopened.loadAgentCatalog("alice").business[0];
  assert.equal(agent.id, before.id);
  assert.equal(agent.name, before.name);
  assert.equal(agent.canvas.label, "商业产品摄影 · 十种创意方案");
  assert.deepEqual(agent.canvas.tools, before.canvas.tools);
  assert.equal(agent.canvas.category, before.canvas.category);
  assert.equal(fs.readFileSync(path.join(registry.getPersonalSkillsDir("alice"), "product-plan/SKILL.md"), "utf8"), source);
  assert.equal(reopened.listLibrary("bob").length, 0);
  // An older client saving media must not silently erase new metadata.
  reopened.setPresentation("product-plan", "alice", { summary: "更新简介", media: [] });
  assert.equal(reopened.getDetail("product-plan", "alice").presentation.displayName, "商业产品摄影 · 十种创意方案");
  assert.throws(() => reopened.setPresentation("product-plan", "alice", { displayName: "x\n名字", media: [] }), /显示名称/);
  assert.throws(() => reopened.setPresentation("product-plan", "alice", { categories: ["unknown"], media: [] }), /分类/);
  reopened.setPresentation("product-plan", "alice", { displayName: "", categories: [], media: [] });
  assert.equal(reopened.getDetail("product-plan", "alice").label, "商业产品摄影 · 十种创意方案", "清空后回退原文标题");
});

test("广场仅收录明确发布的公共及本人私人 Skill，系统调用与约束保持不变", t => {
  const { root, registry, files } = fixture(t);
  const system = path.join(root, "system", "code-helper");
  const shared = path.join(root, "data", "skills", "legacy-helper");
  for (const [directory, name] of [[system, "code-helper"], [shared, "legacy-helper"]]) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: 基础能力\ncanvas:\n  tools: [update_node]\n---\n# 基础能力\n按工具权限执行。\n`);
  }
  assert.deepEqual(registry.listLibrary("alice").map(skill => skill.id), ["product-plan"]);
  assert.deepEqual(registry.listLibrary("bob"), []);
  const original = registry.loadAgentCatalog("bob").business;
  assert.ok(original.some(skill => skill.id === "code-helper"));
  assert.ok(original.some(skill => skill.id === "legacy-helper"));
  registry.installPersonalSkill("alice", "product-plan", files, { scope: "public" }, "public", true);
  registry.setPresentation("product-plan", "alice", { displayName: "公共摄影", categories: ["marketing"], media: [] }, { isAdmin: true, scope: "public" });
  const ownerLibrary = registry.listLibrary("alice");
  assert.equal(ownerLibrary.filter(skill => skill.id === "product-plan").length, 2, "发布后仍分别展示公共资料和自己的私人资料");
  assert.equal(registry.listLibrary("bob")[0].label, "公共摄影");
  assert.equal(registry.listPublicSkills("bob")[0].label, "公共摄影");
  assert.equal(registry.loadAgentCatalog("bob").business.find(skill => skill.id === "product-plan").canvas.label, "公共摄影");
  assert.deepEqual(registry.loadAgentCatalog("bob").business.find(skill => skill.id === "code-helper").canvas.tools,
    original.find(skill => skill.id === "code-helper").canvas.tools);
  assert.equal(registry.getDetail("code-helper", "bob").enabled, true);
});

test("Agent 快捷目录复用同一份展示资料，保留真实工具定义和账户边界", async t => {
  const { registry } = fixture(t);
  registry.setPresentation("product-plan", "alice", { displayName: "中文策划名称", categories: ["image", "marketing"],
    summary: "十种摄影方向", coverId: "photo", media: [{ id: "photo", path: "assets/cover.png" }] });
  const api = createSkillHttpApi({
    skillRegistry: registry, skillImportManager: { preview() {} },
    agentModelSettings: { get: () => ({ models: [], settings: { primary: null, candidates: [] }, unavailable: [] }) },
    canvasAgentRuntime: require("../host-sources/app/canvas-agent-runtime"),
    requireAuth: async req => req.auth, requireSuperAdmin: async () => null, readJson: async req => req.payload,
    sendJson: (res, status, body) => { res.status = status; res.body = body; res.writableEnded = true; },
  });
  for (const user of ["alice", "bob"]) {
    const res = {};
    await api.handle({ url: "/api/canvas-agent/skills", method: "GET", headers: {}, auth: { user: { id: user } } }, res);
    assert.equal(res.status, 200);
    if (user === "bob") assert.deepEqual(res.body.pickerSkills, []);
    else {
      const picker = res.body.pickerSkills[0];
      const detail = registry.getDetail("product-plan", user);
      assert.equal(picker.label, detail.label);
      assert.deepEqual(picker.presentation, detail.presentation);
      assert.deepEqual(picker.categories, detail.categories);
      assert.equal(picker.coverMedia.id, detail.coverId);
      assert.deepEqual(picker.tools, res.body.skills[0].tools);
    }
  }
});

test("Agent 目录排除无安装清单、已停用和已缺失的私人 Skill，不改安装记录", t => {
  const { registry } = fixture(t);
  const directory = registry.getPersonalSkillsDir("alice");
  const manifest = path.join(directory, "..", "skill-installs.json");
  const before = fs.readFileSync(manifest, "utf8");
  const ids = user => registry.loadAgentCatalog(user).business.map(skill => skill.id);
  assert.ok(ids("alice").includes("product-plan"));
  assert.equal(ids("bob").includes("product-plan"), false);
  const orphan = path.join(directory, "orphan-plan");
  fs.mkdirSync(orphan, { recursive: true });
  fs.writeFileSync(path.join(orphan, "SKILL.md"), markdown.replaceAll("product-plan", "orphan-plan"));
  assert.equal(ids("alice").includes("orphan-plan"), false);
  registry.setPersonalEnabled("alice", "product-plan", false);
  assert.equal(ids("alice").includes("product-plan"), false);
  registry.setPersonalEnabled("alice", "product-plan", true);
  assert.ok(ids("alice").includes("product-plan"));
  fs.renameSync(path.join(directory, "product-plan/SKILL.md"), path.join(directory, "product-plan/SKILL.disabled"));
  assert.equal(ids("alice").includes("product-plan"), false);
  assert.deepEqual(registry.listLibrary("alice"), []);
  assert.equal(fs.readFileSync(manifest, "utf8"), before);
});

test("正式内置 Skill 出现在广场，其他系统 Skill 保留高级阶段与工具约束", t => {
  const { root } = fixture(t);
  const { parseSkillSources } = require("../host-sources/app/skill-registry");
  const systemDir = path.resolve(__dirname, "../host-sources/app/skills");
  const bundledCustomDir = path.resolve(__dirname, "../host-sources/app/bundled-skills");
  const catalog = parseSkillSources([{ directory: systemDir }, { directory: bundledCustomDir, origin: "custom" },
    { directory: path.join(__dirname, "design-sources/script-production-skills") }]);
  const registry = createSkillRegistry({ dataDir: path.join(root, "builtin-check"), systemDir, bundledCustomDir });
  const expectedShowcase = [
    "commercial-product-photography-10",
    "fashion-ecommerce-ai-model-video",
    "h3-commerce-video",
  ];
  assert.deepEqual(registry.listLibrary("alice").map(skill => skill.id).sort(), expectedShowcase);
  const agent = registry.loadAgentCatalog("alice");
  for (const skill of agent.business) {
    const original = catalog.business.find(item => item.id === skill.id);
    assert.ok(original);
    assert.deepEqual(skill.canvas.tools, original.canvas.tools, skill.id);
    assert.deepEqual(skill.canvas.capabilities, original.canvas.capabilities, skill.id);
    assert.deepEqual(skill.execution, original.execution, skill.id);
    for (const reference of skill.references || []) assert.equal(fs.existsSync(path.join(skill.directory, reference.path)), true, reference.path);
  }
  const director = agent.business.find(skill => skill.id === "ai-video-director");
  assert.ok(director.execution.stages.length > 0);
  assert.equal(director.execution.allowImplicitInvocation, false);
  assert.equal(director.origin, "custom", "随运行时提供的可选业务 Skill，与系统基础 Skill 分开");
  assert.equal(director.directory, path.join(bundledCustomDir, "ai-video-director"));
  assert.equal(registry.list().find(skill => skill.id === director.id).enabled, true);
  registry.setEnabled(director.id, false);
  assert.equal(registry.loadAgentCatalog("alice").business.some(skill => skill.id === director.id), false, "停用后退出 Agent 的实际可用目录");
  registry.setEnabled(director.id, true);
  assert.equal(registry.loadAgentCatalog("alice").business.some(skill => skill.id === director.id), true);
  assert.deepEqual(registry.listLibrary("alice").map(skill => skill.id).sort(), expectedShowcase,
    "启用其他可选内置流程不会改变公共广场");
  const contract = require("../host-sources/app/canvas-agent-skill-contract").createContract(director, { prompt: "写一个产品脚本" });
  assert.ok(require("../host-sources/app/canvas-agent-skill-contract").inspectToolCall(contract, { name: "create_image_node", arguments: {} }).violation);
  const output = path.join(__dirname, "../.planning/skill-discovery-20261105");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "system-skill-catalog.json"), JSON.stringify(catalog.all.map(skill => ({
    id: skill.id, label: skill.canvas.label, origin: skill.origin, core: skill.canvas.core,
    tools: skill.canvas.tools, capabilities: skill.canvas.capabilities, references: skill.references?.map(item => item.path),
    advancedStages: skill.execution?.stages?.map(stage => stage.id) || [],
  })), null, 2));
});

test("展示编辑 HTTP 限制账户、公共范围和本机素材授权", async t => {
  const { registry } = fixture(t);
  const api = createSkillHttpApi({
    skillRegistry: registry, skillImportManager: { preview() {} },
    agentModelSettings: { get() {} }, canvasAgentRuntime: { getPublicSkillMetadata() {} },
    requireAuth: async req => req.auth,
    requireSuperAdmin: async req => req.auth?.user?.role === "superadmin" ? req.auth : null,
    authorizePresentationMedia: async (userId, url) => {
      if (url !== "/output/owned.mp4" || userId !== "alice") throw Object.assign(Error("无权使用此素材"), { statusCode: 403 });
      return url;
    },
    readJson: async req => req.payload,
    sendJson: (res, status, body) => { res.status = status; res.body = body; res.writableEnded = true; },
  });
  const call = async (user, payload) => {
    const res = {};
    assert.equal(await api.handle({ url: "/api/skills/presentation?skill_id=product-plan", method: "POST", headers: {},
      auth: { user: { id: user, role: "user" } }, payload }, res), true);
    return res;
  };
  assert.equal((await call("bob", { media: [] })).status, 404);
  assert.equal((await call("alice", { media: [{ id: "bad", url: "https://example.com/a.mp4" }] })).status, 403);
  assert.equal((await call("alice", { media: [{ id: "clip", url: "/output/owned.mp4" }] })).status, 200);
  assert.equal(registry.getDetail("product-plan", "alice").media[0].type, "video/mp4");
});

test("案例视频复用真实 Range 文件响应，未授权账户不能读取，读取不加载整个视频", async t => {
  const http = require("node:http");
  const { createStaticHttpApi } = require("../host-sources/app/static-http-api");
  const { root, registry } = fixture(t);
  const directory = path.join(registry.getPersonalSkillsDir("alice"), "product-plan");
  const filename = path.join(directory, "assets/sample.mp4");
  const content = Buffer.from("0123456789-video-fixture");
  fs.writeFileSync(filename, content);
  registry.setPresentation("product-plan", "alice", { media: [{ id: "clip", path: "assets/sample.mp4" }] });
  assert.equal(registry.readMedia("product-plan", "assets/sample.mp4", "alice", { metadataOnly: true }).content, undefined);
  const sendJson = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  const staticApi = createStaticHttpApi({ publicDir: root, outputDir: root, mimeTypes: {}, getAuthDisabledUser() {},
    publicUser() {}, requireAuth() {}, assertOutputMediaRead() {}, sendJson, sendAuthError() {} });
  const api = createSkillHttpApi({ skillRegistry: registry, skillImportManager: { preview() {} },
    agentModelSettings: { get() {} }, canvasAgentRuntime: { getPublicSkillMetadata() {} },
    requireAuth: async req => ({ user: { id: req.headers["x-test-user"] } }), requireSuperAdmin() {},
    readJson() {}, sendJson, servePresentationMedia: (req, res, media) => staticApi.serveFile(req, res,
      media.filePath, fs.statSync(media.filePath), { "Content-Type": media.contentType }) });
  const server = http.createServer((req, res) => { void api.handle(req, res); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/api/skills/media?skill_id=product-plan&media_id=clip`;
  const partial = await fetch(url, { headers: { "x-test-user": "alice", Range: "bytes=2-5" } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), `bytes 2-5/${content.length}`);
  assert.equal(partial.headers.get("content-type"), "video/mp4");
  assert.equal(await partial.text(), "2345");
  const denied = await fetch(url, { headers: { "x-test-user": "bob" } });
  assert.equal(denied.status, 404);
  const invalid = await fetch(url, { headers: { "x-test-user": "alice", Range: "bytes=999-" } });
  assert.equal(invalid.status, 416);
});
