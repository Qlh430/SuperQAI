"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const featureRegistry = path.resolve(__dirname, "design-sources/canvas-feature-registry.js");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveCanvasFeature(request, parent, ...rest) {
  if (request === "./canvas-feature-registry.js" && parent?.filename?.includes("host-sources\\app")) {
    return featureRegistry;
  }
  return originalResolve.call(this, request, parent, ...rest);
};
const CanvasAgentRuntime = require("../host-sources/app/canvas-agent-runtime");
const { createSkillRegistry } = require("../host-sources/app/skill-registry");
const { createSkillImportManager, parseSkillArchive } = require("../host-sources/app/skill-import-manager");
const { createSkillHttpApi } = require("../host-sources/app/skill-http-api");

const standardSkill = `---
name: premium-product-photography
description: Plan premium product photography and prepare a reusable prompt.
license: CC-BY-4.0
metadata:
  version: 1.2.0
---

# Product Photography

Plan composition, lighting, materials, background and a production-ready prompt.
`;

function writeSkill(root, id, markdown, extra = {}) {
  const directory = path.join(root, id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "SKILL.md"), markdown, "utf8");
  for (const [relative, content] of Object.entries(extra)) {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return directory;
}

function tempFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-skill-install-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, "shared-data");
  const systemDir = path.join(root, "system");
  const sharedDir = path.join(dataDir, "skills");
  writeSkill(systemDir, "canvas-agent-core", standardSkill.replace(
    "premium-product-photography",
    "canvas-agent-core",
  ).replace("Plan premium product photography and prepare a reusable prompt.", "Core canvas instructions."));
  writeSkill(sharedDir, "shared-photography", standardSkill.replace(
    "premium-product-photography",
    "shared-photography",
  ));
  const registry = createSkillRegistry({ dataDir, systemDir, customDir: sharedDir });
  const manager = createSkillImportManager({
    registry,
    dataDir,
    fetchImpl: async () => { throw new Error("Unexpected network request in local import test."); },
    validateRemoteUrl: async (url) => new URL(url),
    tokenFactory: () => crypto.randomBytes(24).toString("hex"),
  });
  return { root, dataDir, systemDir, sharedDir, registry, manager };
}

function uploadFile(filePath, content) {
  return {
    path: filePath,
    content: Buffer.from(content).toString("base64"),
  };
}

function checksum32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const [name, content, externalAttributes = 0] of entries) {
    const filename = Buffer.from(name, "utf8");
    const bytes = Buffer.from(content);
    const crc = checksum32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(externalAttributes, 38);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, filename);
    localOffset += local.length + filename.length + bytes.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

function apiHarness({
  manager,
  registry,
  runtime = CanvasAgentRuntime,
  onInstallDiagnostic,
  onSkillApiDiagnostic,
  readJson: readJsonOverride,
  authorizePresentationMedia,
} = {}) {
  const api = createSkillHttpApi({
    skillRegistry: registry,
    skillImportManager: manager,
    agentModelSettings: { get: () => ({ models: [], settings: { primary: null, candidates: [] }, configured: false, unavailable: [] }) },
    canvasAgentRuntime: runtime,
    capabilityResolver: null,
    requireSuperAdmin: async (req, res) => req.admin ? { user: { id: req.userId || "admin" } } : null,
    requireAuth: async (req, res) => req.userId ? { user: { id: req.userId, role: req.admin ? "superadmin" : "user" } } : null,
    readJson: readJsonOverride || (async (req) => req.body || {}),
    sendJson: (res, status, body, headers) => Object.assign(res, { status, body, headers }),
    authorizePresentationMedia,
    onInstallDiagnostic,
    onSkillApiDiagnostic,
  });
  return async ({ method = "GET", url = "/api/skills/mine", userId = "user-a", admin = false, body = {} } = {}) => {
    const req = { method, url, headers: { host: "localhost" }, userId, admin, body, auth: userId ? { user: { id: userId, role: admin ? "superadmin" : "user" } } : null };
    const res = {};
    return { handled: await api.handle(req, res), ...res };
  };
}

test("Skill preview rejects execution manifests that require references missing from the package", async (t) => {
  const fixture = tempFixture(t);
  const skill = standardSkill.replace("premium-product-photography", "reference-dependent-photography");
  const agentManifest = JSON.stringify({
    format: "canvas-agent-skill/v1",
    mode: "guided",
    exposure: "manual",
    stages: [{ id: "planning", mustRead: ["references/lighting.md"], tools: [] }],
  });

  await assert.rejects(
    () => fixture.manager.preview("user-a", {
      files: [
        uploadFile("SKILL.md", skill),
        uploadFile("agent.skill.json", agentManifest),
      ],
      source: { type: "upload", label: "incomplete-folder" },
    }),
    (error) => error.code === "invalid_skill_execution_manifest"
      && /references\/lighting\.md/.test(error.message),
  );
  assert.equal(fs.existsSync(path.join(fixture.dataDir, "users")), false);

  const complete = await fixture.manager.preview("user-a", {
    files: [
      uploadFile("reference-dependent-photography/SKILL.md", skill),
      uploadFile("reference-dependent-photography/agent.skill.json", agentManifest),
      uploadFile("reference-dependent-photography/references/lighting.md", "# Lighting"),
    ],
    source: { type: "upload", label: "complete-folder" },
  });
  assert.equal(complete.status, "ready");
  const installed = await fixture.manager.confirm("user-a", complete.previewToken);
  const agentSkill = fixture.registry.loadAgentCatalog("user-a").business.find((item) => item.id === installed.id);
  assert.deepEqual(agentSkill.references.map((item) => item.path), ["references/lighting.md"]);
});

test("Skill library registry failures return a safe 500 with a diagnostic id", async (t) => {
  const fixture = tempFixture(t);
  const diagnostics = [];
  const registry = Object.freeze({
    ...fixture.registry,
    listLibrary() {
      throw new Error("Skill package validation failed at C:\\private\\account\\skills\\broken");
    },
  });
  const api = apiHarness({
    ...fixture,
    registry,
    onSkillApiDiagnostic: (record) => diagnostics.push(record),
  });
  const response = await api({ url: "/api/skills/library" });

  assert.equal(response.status, 500);
  assert.equal(response.body.code, "skill_registry_read_failed");
  assert.match(response.body.error, /诊断编号/);
  assert.doesNotMatch(JSON.stringify(response.body), /C:\\private|user-a|account\\skills/i);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].endpoint, "/api/skills/library");
  assert.equal(diagnostics[0].category, "registry");
  assert.ok(diagnostics[0].diagnosticId);
  assert.doesNotMatch(JSON.stringify(diagnostics[0]), /C:\\private|user-a|message|stack/i);
});

test("standard SKILL.md preview is non-mutating until the authenticated user confirms", async (t) => {
  const fixture = tempFixture(t);
  const file = uploadFile("SKILL.md", standardSkill);
  const preview = await fixture.manager.preview("user-a", {
    files: [file],
    source: { type: "upload", label: "local SKILL.md" },
  });
  assert.equal(preview.id, "premium-product-photography");
  assert.equal(preview.compatibility.status, "可直接使用");
  assert.equal(preview.license, "CC-BY-4.0");
  assert.equal(fs.existsSync(path.join(fixture.dataDir, "users")), false);
  const installed = await fixture.manager.confirm("user-a", preview.previewToken);
  assert.equal(installed.id, "premium-product-photography");
  assert.equal(fs.readFileSync(path.join(fixture.registry.getPersonalSkillsDir("user-a"), installed.id, "SKILL.md"), "utf8"), standardSkill);
  assert.ok(fixture.registry.loadAgentCatalog("user-a").business.some((skill) => skill.id === installed.id));
  assert.ok(!fixture.registry.loadAgentCatalog("user-b").business.some((skill) => skill.id === installed.id));
});

test("settings module loads in browsers when optional admin panels are isolated", () => {
  const sandbox = {
    module: { exports: {} },
    AiOsDisplay: {
      THEMES: [], SCALES: [], DEFAULT_PREFERENCES: {},
      normalizePreferences: value => value, resolveTheme: () => "dark", applyPreferences: () => {},
    },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../host-sources/app/system-settings-ui.js"), "utf8"),
    sandbox,
    { filename: "system-settings-ui.js" },
  );
  assert.equal(typeof sandbox.AiOsSystemSettings.createSettingsApp, "function");
});

test("the manifest filename is exactly SKILL.md", async (t) => {
  const fixture = tempFixture(t);
  await assert.rejects(
    () => fixture.manager.preview("user-a", {
      files: [uploadFile("skill.md", standardSkill)],
      source: { type: "upload", label: "skill.md" },
    }),
    (error) => error.code === "invalid_skill_package",
  );
  assert.equal(fs.existsSync(path.join(fixture.dataDir, "users")), false);
});

test("references and assets survive install and references remain owner scoped", async (t) => {
  const fixture = tempFixture(t);
  const preview = await fixture.manager.preview("user-a", {
    files: [
      uploadFile("bundle/SKILL.md", standardSkill),
      uploadFile("bundle/references/摄影 灯光.md", "# Lighting reference\nSoftbox"),
      uploadFile("bundle/assets/产品 色板.txt", "graphite/warm-gray"),
    ],
    source: { type: "upload", label: "photography-skill.zip" },
  });
  await fixture.manager.confirm("user-a", preview.previewToken);
  const reference = fixture.registry.readReference("premium-product-photography", "references/摄影 灯光.md", "user-a");
  assert.equal(reference.content, "# Lighting reference\nSoftbox");
  assert.throws(
    () => fixture.registry.readReference("premium-product-photography", "references/摄影 灯光.md", "user-b"),
    (error) => error.code === "unknown_skill",
  );
  assert.equal(
    fs.readFileSync(path.join(fixture.registry.getPersonalSkillsDir("user-a"), preview.id, "assets/产品 色板.txt"), "utf8"),
    "graphite/warm-gray",
  );
});

test("a valid local ZIP installs unchanged Skill resources after confirmation", async (t) => {
  const fixture = tempFixture(t);
  const archive = makeZip([
    ["photography/SKILL.md", standardSkill],
    ["photography/references/lighting setup.md", "# Lighting\nUse a large softbox."],
    ["photography/assets/palette.txt", "white/graphite"],
  ]);
  const preview = await fixture.manager.preview("user-a", {
    archive: archive.toString("base64"),
    archiveName: "photography.zip",
    source: { type: "upload", label: "photography.zip" },
  });
  assert.equal(preview.status, "ready");
  assert.equal(fs.existsSync(path.join(fixture.dataDir, "users")), false);
  fixture.manager.confirm("user-a", preview.previewToken);
  const root = path.join(fixture.registry.getPersonalSkillsDir("user-a"), preview.id);
  assert.equal(fs.readFileSync(path.join(root, "SKILL.md"), "utf8"), standardSkill);
  assert.equal(fs.readFileSync(path.join(root, "assets/palette.txt"), "utf8"), "white/graphite");
  assert.equal(
    fixture.registry.readReference(preview.id, "references/lighting setup.md", "user-a").content,
    "# Lighting\nUse a large softbox.",
  );
});

test("scripts and external requirements are reported without execution", async (t) => {
  const fixture = tempFixture(t);
  const preview = await fixture.manager.preview("user-a", {
    files: [
      uploadFile("skill/SKILL.md", `${standardSkill}\nRequires Python 3.11 and external MCP server "photo-mcp".`),
      uploadFile("skill/scripts/generate.py", "raise SystemExit('must never execute')"),
    ],
    source: { type: "upload", label: "script-skill.zip" },
  });
  assert.equal(preview.compatibility.status, "缺少外部依赖");
  assert.ok(preview.compatibility.dependencies.some((item) => /python/i.test(item)));
  assert.ok(preview.compatibility.dependencies.some((item) => /mcp/i.test(item)));
  assert.ok(!fs.existsSync(path.join(fixture.dataDir, "users")));
});

test("ZIP traversal and symbolic-link entries are rejected before installation", async (t) => {
  const fixture = tempFixture(t);
  const traversal = makeZip([["../escape.txt", "escape"], ["SKILL.md", standardSkill]]);
  await assert.rejects(
    () => fixture.manager.preview("user-a", {
      archive: traversal.toString("base64"),
      archiveName: "unsafe.zip",
      source: { type: "upload", label: "unsafe.zip" },
    }),
    (error) => error.code === "unsafe_archive_path",
  );
  const symlinkMode = (0o120777 << 16) >>> 0;
  const symlink = makeZip([["skill/SKILL.md", standardSkill], ["skill/assets/link", "target", symlinkMode]]);
  assert.throws(
    () => parseSkillArchive(symlink),
    (error) => error.code === "unsafe_archive_link",
  );
  assert.equal(fs.existsSync(path.join(fixture.dataDir, "users")), false);
});

test("shared and personal IDs cannot overwrite; uninstall only removes the requesting account copy", async (t) => {
  const fixture = tempFixture(t);
  await assert.rejects(
    () => fixture.manager.preview("user-a", {
      files: [uploadFile("SKILL.md", standardSkill.replace("premium-product-photography", "shared-photography"))],
      source: { type: "upload", label: "conflict" },
    }),
    (error) => error.code === "skill_id_conflict",
  );
  const preview = await fixture.manager.preview("user-a", {
    files: [uploadFile("SKILL.md", standardSkill)],
    source: { type: "upload", label: "local" },
  });
  await fixture.manager.confirm("user-a", preview.previewToken);
  await assert.rejects(
    () => fixture.manager.preview("user-a", {
      files: [uploadFile("SKILL.md", standardSkill)],
      source: { type: "upload", label: "duplicate" },
    }),
    (error) => error.code === "skill_already_installed",
  );
  assert.equal(fixture.registry.setPersonalEnabled("user-a", preview.id, false).enabled, false);
  assert.equal(fixture.registry.loadAgentCatalog("user-a").business.some((skill) => skill.id === preview.id), false);
  assert.equal(fixture.registry.loadAgentCatalog("user-b").business.some((skill) => skill.id === preview.id), false);
  assert.equal(fixture.manager.uninstall("user-b", preview.id), false);
  assert.equal(fixture.manager.uninstall("user-a", preview.id), true);
  assert.equal(fs.existsSync(path.join(fixture.registry.getPersonalSkillsDir("user-a"), preview.id)), false);
  assert.ok(fixture.registry.loadAgentCatalog("user-b").business.some((skill) => skill.id === "shared-photography"));
});

test("Skill install APIs require user auth and preserve the install confirmation step", async (t) => {
  const fixture = tempFixture(t);
  const api = apiHarness(fixture);
  const anonymous = await api({ userId: "", method: "POST", url: "/api/skills/install/preview" });
  assert.equal(anonymous.status, 401);
  const previewResponse = await api({
    method: "POST",
    url: "/api/skills/install/preview",
    body: { files: [uploadFile("SKILL.md", standardSkill)], source: { type: "upload" } },
  });
  assert.equal(previewResponse.status, 200);
  assert.equal(fs.existsSync(path.join(fixture.dataDir, "users")), false);
  const installed = await api({
    method: "POST",
    url: "/api/skills/install/confirm",
    body: { previewToken: previewResponse.body.previewToken },
  });
  assert.equal(installed.status, 201);
  assert.ok(installed.body.skills.some((skill) => skill.id === "premium-product-photography"));
});

test("unexpected confirmation storage failures return a safe server error with stage diagnostics", async (t) => {
  const fixture = tempFixture(t);
  const diagnostics = [];
  const registry = Object.freeze({
    ...fixture.registry,
    installPersonalSkill() {
      const error = new Error("EACCES: denied at C:\\private\\user\\path");
      error.code = "EACCES";
      throw error;
    },
  });
  const manager = createSkillImportManager({ registry, dataDir: fixture.dataDir });
  const api = createSkillHttpApi({
    skillRegistry: registry,
    skillImportManager: manager,
    agentModelSettings: { get: () => ({ models: [], settings: { primary: null, candidates: [] }, configured: false, unavailable: [] }) },
    canvasAgentRuntime: CanvasAgentRuntime,
    capabilityResolver: null,
    requireSuperAdmin: async () => null,
    requireAuth: async (req) => req.userId ? { user: { id: req.userId } } : null,
    readJson: async (req) => req.body || {},
    sendJson: (res, status, body, headers) => Object.assign(res, { status, body, headers }),
    onInstallDiagnostic: (record) => diagnostics.push(record),
  });
  const request = async (url, body = {}) => {
    const req = { method: "POST", url, headers: { host: "localhost" }, userId: "user-a",
      auth: { user: { id: "user-a", role: "user" } }, body };
    const res = {};
    await api.handle(req, res);
    return res;
  };
  const preview = await request("/api/skills/install/preview", {
    files: [uploadFile("SKILL.md", standardSkill)],
    source: { type: "upload", label: "local" },
  });
  const failed = await request("/api/skills/install/confirm", { previewToken: preview.body.previewToken });

  assert.equal(failed.status, 500);
  assert.equal(failed.body.code, "skill_storage_permission_denied");
  assert.match(failed.body.error, /账户 Skill 目录/);
  assert.doesNotMatch(JSON.stringify(failed.body), /C:\\private|user-a|previewToken/i);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].category, "file_processing");
  assert.equal(diagnostics[0].phase, "file-processing");
  assert.equal(diagnostics[0].errorCode, "EACCES");
  assert.ok(diagnostics[0].diagnosticId);
  assert.doesNotMatch(JSON.stringify(diagnostics[0]), /C:\\private|user-a|previewToken|message|stack/i);
});

test("confirmation diagnostics separate session, malformed parameters, and expired preview credentials", async (t) => {
  const fixture = tempFixture(t);
  const diagnostics = [];
  const api = apiHarness({ ...fixture, onInstallDiagnostic: (record) => diagnostics.push(record) });
  const call = async ({ userId = "user-a", body = {} } = {}) => api({
    userId,
    method: "POST",
    url: "/api/skills/install/confirm",
    body,
  });

  const anonymous = await call({ userId: "" });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.code, "unauthorized");
  assert.ok(anonymous.body.diagnosticId);
  assert.equal(diagnostics.at(-1).category, "session");

  const malformed = await call({ body: {} });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.code, "invalid_preview_credential");
  assert.equal(diagnostics.at(-1).category, "parameters");

  const invalidJsonApi = apiHarness({
    ...fixture,
    onInstallDiagnostic: (record) => diagnostics.push(record),
    readJson: async () => { throw new Error("Invalid JSON body."); },
  });
  const invalidJson = await invalidJsonApi({
    userId: "user-a",
    method: "POST",
    url: "/api/skills/install/confirm",
  });
  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJson.body.code, "invalid_install_request");
  assert.match(invalidJson.body.error, /请求格式无效/);
  assert.equal(diagnostics.at(-1).category, "parameters");

  const expired = await call({ body: { previewToken: "a".repeat(64) } });
  assert.equal(expired.status, 404);
  assert.equal(expired.body.code, "skill_preview_expired");
  assert.equal(diagnostics.at(-1).category, "preview_credential");
  assert.equal(diagnostics.length, 4);
});

test("private Skill install, visibility, enable state, reload, duplicate protection, and uninstall stay in one account", async (t) => {
  const fixture = tempFixture(t);
  const retainedSkill = standardSkill.replace("premium-product-photography", "retained-standard-skill");
  const retainedPreview = await fixture.manager.preview("user-a", {
    files: [uploadFile("SKILL.md", retainedSkill)],
    source: { type: "upload", label: "existing-standard-skill" },
  });
  await fixture.manager.confirm("user-a", retainedPreview.previewToken);

  const api = apiHarness(fixture);
  const targetFile = uploadFile("SKILL.md", standardSkill);
  const preview = await api({
    method: "POST",
    url: "/api/skills/install/preview",
    body: { files: [targetFile], source: { type: "upload", label: "local-standard-skill" } },
  });
  assert.equal(preview.status, 200);
  const confirmed = await api({
    method: "POST",
    url: "/api/skills/install/confirm",
    body: { previewToken: preview.body.previewToken },
  });
  assert.equal(confirmed.status, 201);
  assert.ok(confirmed.body.skills.some((skill) => skill.id === preview.body.id && skill.enabled));
  assert.ok(confirmed.body.skills.some((skill) => skill.id === "retained-standard-skill"));

  const agentCatalog = await api({ url: "/api/canvas-agent/skills" });
  assert.equal(agentCatalog.status, 200);
  assert.ok(agentCatalog.body.pickerSkills.some((skill) => skill.id === preview.body.id));
  const library = await api({ url: "/api/skills/library" });
  assert.equal(library.status, 200);
  assert.ok(library.body.skills.some((skill) => skill.id === preview.body.id && skill.scope === "personal"));

  const disabled = await api({
    method: "POST",
    url: "/api/skills/mine/enabled",
    body: { id: preview.body.id, enabled: false },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.skills.find((skill) => skill.id === preview.body.id).enabled, false);
  assert.ok(!(await api({ url: "/api/canvas-agent/skills" })).body.pickerSkills.some((skill) => skill.id === preview.body.id));

  const enabled = await api({
    method: "POST",
    url: "/api/skills/mine/enabled",
    body: { id: preview.body.id, enabled: true },
  });
  assert.equal(enabled.status, 200);
  assert.ok((await api({ url: "/api/canvas-agent/skills" })).body.pickerSkills.some((skill) => skill.id === preview.body.id));

  const duplicate = await api({
    method: "POST",
    url: "/api/skills/install/preview",
    body: { files: [targetFile], source: { type: "upload", label: "duplicate" } },
  });
  assert.equal(duplicate.status, 409);

  const reloadedRegistry = createSkillRegistry({ dataDir: fixture.dataDir, systemDir: fixture.systemDir, customDir: fixture.sharedDir });
  const reloadedManager = createSkillImportManager({ registry: reloadedRegistry, dataDir: fixture.dataDir });
  const reloadedApi = apiHarness({ manager: reloadedManager, registry: reloadedRegistry });
  const afterReload = await reloadedApi({ url: "/api/skills/mine" });
  assert.ok(afterReload.body.skills.some((skill) => skill.id === preview.body.id && skill.enabled));
  assert.ok(afterReload.body.skills.some((skill) => skill.id === "retained-standard-skill"));
  assert.ok((await reloadedApi({ url: "/api/skills/library" })).body.skills.some((skill) => skill.id === preview.body.id && skill.scope === "personal"));
  assert.ok(!(await reloadedApi({ userId: "user-b", url: "/api/skills/mine" })).body.skills.some((skill) => skill.id === preview.body.id));

  const removed = await reloadedApi({
    method: "DELETE",
    url: `/api/skills/mine/${preview.body.id}`,
  });
  assert.equal(removed.status, 200);
  assert.ok(!removed.body.skills.some((skill) => skill.id === preview.body.id));
  assert.ok(removed.body.skills.some((skill) => skill.id === "retained-standard-skill"));
  assert.ok(!(await reloadedApi({ url: "/api/canvas-agent/skills" })).body.pickerSkills.some((skill) => skill.id === preview.body.id));

  const reinstallPreview = await reloadedApi({
    method: "POST",
    url: "/api/skills/install/preview",
    body: { files: [targetFile], source: { type: "upload", label: "reinstall-after-uninstall" } },
  });
  assert.equal(reinstallPreview.status, 200);
  const reinstalled = await reloadedApi({
    method: "POST",
    url: "/api/skills/install/confirm",
    body: { previewToken: reinstallPreview.body.previewToken },
  });
  assert.equal(reinstalled.status, 201);
});

test("online sources are not accepted by the local installer", async (t) => {
  const fixture = tempFixture(t);
  await assert.rejects(() => fixture.manager.preview("user-a", {
    source: { type: "github", url: "https://github.com/owner/repo/tree/main/demo" },
  }), (error) => error.code === "unsupported_skill_source");
  assert.equal(fs.existsSync(path.join(fixture.dataDir, "users")), false);
});

test("public local imports require admin confirmation and are available to both accounts", async (t) => {
  const fixture = tempFixture(t);
  const api = apiHarness(fixture);
  const privatePreview = await fixture.manager.preview("user-a", {
    files: [uploadFile("SKILL.md", standardSkill)],
    source: { type: "upload", label: "private.md" },
  });
  await fixture.manager.confirm("user-a", privatePreview.previewToken);
  const collidingPublicBody = {
    scope: "public",
    files: [uploadFile("SKILL.md", standardSkill)],
    source: { type: "upload", label: "host-library.zip" },
  };
  assert.equal((await api({ method: "POST", url: "/api/skills/install/preview", body: collidingPublicBody })).status, 403);
  const deniedCollision = await api({
    userId: "admin", admin: true, method: "POST", url: "/api/skills/install/preview", body: collidingPublicBody,
  });
  assert.equal(deniedCollision.status, 409);
  const publicSkill = standardSkill.replace("premium-product-photography", "shared-commercial-photo");
  const body = { ...collidingPublicBody, files: [uploadFile("SKILL.md", publicSkill)] };
  const preview = await api({ userId: "admin", admin: true, method: "POST", url: "/api/skills/install/preview", body });
  assert.equal(preview.status, 200);
  assert.equal(fixture.registry.loadAgentCatalog("user-b").business.some(skill => skill.id === "premium-product-photography"), false);
  const installed = await api({
    userId: "admin", admin: true, method: "POST", url: "/api/skills/install/confirm",
    body: { previewToken: preview.body.previewToken },
  });
  assert.equal(installed.status, 201);
  for (const userId of ["user-a", "user-b"]) {
    const catalog = fixture.registry.loadAgentCatalog(userId);
    const skill = catalog.business.find(skill => skill.id === "shared-commercial-photo");
    assert.ok(skill);
    const request = CanvasAgentRuntime.buildResponsesRequest({
      prompt: "只创建策划节点，不执行付费生成。",
      skill_mode: "manual", skill_id: skill.id, canvas: { nodes: [] },
    }, { skills: catalog });
    assert.ok(request.instructions.includes("Plan composition, lighting, materials"));
    assert.ok(request.tools.some(tool => /create.*node/.test(tool.name)));
    assert.equal(fixture.registry.listPersonalSkills(userId).some(item => item.id === skill.id), false);
  }
  assert.ok(fixture.registry.loadAgentCatalog("user-a").business.some(skill => skill.id === "premium-product-photography"));
  assert.ok(!fixture.registry.loadAgentCatalog("user-b").business.some(skill => skill.id === "premium-product-photography"));
  const publicList = await api({ userId: "user-b", url: "/api/skills/public" });
  assert.equal(publicList.status, 200);
  assert.ok(publicList.body.skills.some(skill => skill.id === "shared-commercial-photo"));
  assert.equal((await api({ method: "DELETE", url: "/api/skills/public/premium-product-photography" })).status, 403);
  const removed = await api({
    userId: "admin", admin: true, method: "DELETE", url: "/api/skills/public/shared-commercial-photo",
  });
  assert.equal(removed.status, 200);
  assert.ok(!fixture.registry.loadAgentCatalog("user-a").business.some(skill => skill.id === "shared-commercial-photo"));
  assert.ok(fixture.registry.loadAgentCatalog("user-a").business.some(skill => skill.id === "shared-photography"));
  assert.ok(fixture.registry.loadAgentCatalog("user-a").business.some(skill => skill.id === "premium-product-photography"));
});

test("a user can explicitly publish their own private Skill into the instance library", async (t) => {
  const fixture = tempFixture(t);
  const api = apiHarness(fixture);
  const preview = await fixture.manager.preview("user-a", {
    files: [uploadFile("SKILL.md", standardSkill)],
    source: { type: "upload", label: "local-skill.zip" },
  });
  await fixture.manager.confirm("user-a", preview.previewToken);
  const otherOwnerPreview = await fixture.manager.preview("user-b", {
    files: [uploadFile("SKILL.md", standardSkill)],
    source: { type: "upload", label: "another-local-skill.zip" },
  });
  await fixture.manager.confirm("user-b", otherOwnerPreview.previewToken);
  const blocked = await api({
    userId: "user-a", method: "POST",
    url: "/api/skills/mine/premium-product-photography/publish",
  });
  assert.equal(blocked.status, 409);
  fixture.manager.uninstall("user-b", "premium-product-photography");
  const response = await api({
    userId: "user-a", method: "POST",
    url: "/api/skills/mine/premium-product-photography/publish",
  });
  assert.equal(response.status, 201);
  assert.ok(response.body.skill);
  assert.ok(fixture.registry.listPersonalSkills("user-a").some(skill => skill.id === "premium-product-photography" && skill.published));
  const ownerSkill = fixture.registry.loadAgentCatalog("user-a").business.find(skill => skill.id === "premium-product-photography");
  const teammateSkill = fixture.registry.loadAgentCatalog("user-b").business.find(skill => skill.id === "premium-product-photography");
  assert.ok(ownerSkill.directory.startsWith(fixture.registry.getPersonalSkillsDir("user-a")));
  assert.ok(teammateSkill.directory.startsWith(fixture.sharedDir));
  assert.equal(fixture.registry.listPersonalSkills("user-b").length, 0);
  const removed = await api({
    userId: "admin", admin: true, method: "DELETE",
    url: "/api/skills/public/premium-product-photography",
  });
  assert.equal(removed.status, 200);
  assert.ok(fixture.registry.listPersonalSkills("user-a").some(skill => skill.id === "premium-product-photography"));
  assert.ok(!fixture.registry.loadAgentCatalog("user-b").business.some(skill => skill.id === "premium-product-photography"));
});

test("publishing a private Skill snapshots its presentation for public viewers", async (t) => {
  const { registry, manager, dataDir, systemDir } = tempFixture(t);
  const checked = [];
  const api = apiHarness({ registry, manager, authorizePresentationMedia: async (userId, url) => {
    assert.equal(userId, "user-a");
    checked.push(url);
    return url;
  } });
  const id = "premium-product-photography";
  const preview = await manager.preview("user-a", {
    files: [uploadFile("SKILL.md", standardSkill), uploadFile("assets/cover.png", "packaged image")],
  });
  manager.confirm("user-a", preview.previewToken);
  const presentation = {
    displayName: "服装电商 · AI 模特动态展示", summary: "效果简介", categories: ["marketing"],
    coverId: "clip",
    media: [
      { id: "clip", title: "视频案例", url: "/output/clip.mp4", posterUrl: "/output/poster.png" },
      { id: "photo", title: "图片案例", url: "/output/photo.webp" },
      { id: "package-cover", path: "assets/cover.png" },
    ],
  };
  const original = registry.setPresentation(id, "user-a", presentation, {
    authorizedUrls: new Set(["/output/clip.mp4", "/output/poster.png", "/output/photo.webp"]),
  }).presentation;
  assert.equal((await api({ userId: "user-b", url: `/api/skills/detail?skill_id=${id}` })).status, 404);
  const response = await api({ method: "POST", url: `/api/skills/mine/${id}/publish` });
  assert.equal(response.status, 201);
  assert.deepEqual(checked.sort(), ["/output/clip.mp4", "/output/photo.webp", "/output/poster.png"]);

  const reopened = createSkillRegistry({ dataDir, systemDir });
  const otherAccount = apiHarness({ registry: reopened, manager });
  const square = (await otherAccount({ userId: "user-b", url: "/api/skills/library" })).body.skills;
  const card = square.find((skill) => skill.id === id);
  assert.equal(card.scope, "public");
  assert.deepEqual(card.presentation, original);
  assert.equal(card.coverMedia.id, "clip");
  const detail = (await otherAccount({ userId: "user-b", url: `/api/skills/detail?skill_id=${id}&scope=public` })).body;
  assert.deepEqual(detail.presentation, original);
  assert.equal(detail.canManagePresentation, false);
  assert.deepEqual(reopened.getDetail(id, "user-a").presentation, original);
  assert.deepEqual(reopened.readMedia(id, "assets/cover.png", "user-b", { scope: "public" }).content,
    Buffer.from("packaged image"));

  registry.setPresentation(id, "user-a", { summary: "私人后续调整", media: [] });
  assert.deepEqual(reopened.getDetail(id, "user-b", "public").presentation, original);
});

test("publication refuses revoked presentation media without changing either library", async (t) => {
  const { registry, manager } = tempFixture(t);
  const id = "premium-product-photography";
  const preview = await manager.preview("user-a", { files: [uploadFile("SKILL.md", standardSkill)] });
  manager.confirm("user-a", preview.previewToken);
  const media = [{ id: "clip", url: "/output/clip.mp4", posterUrl: "/output/poster.png" }];
  const original = registry.setPresentation(id, "user-a", { media, coverId: "clip" }, {
    authorizedUrls: new Set(["/output/clip.mp4", "/output/poster.png"]),
  }).presentation;
  const api = apiHarness({ registry, manager, authorizePresentationMedia: async (userId, url) => {
    assert.equal(userId, "user-a");
    if (url.endsWith(".png")) throw Object.assign(new Error("原素材不可访问。"), { statusCode: 403 });
    return url;
  } });
  const response = await api({ method: "POST", url: `/api/skills/mine/${id}/publish` });
  assert.equal(response.status, 403);
  assert.deepEqual(registry.listLibrary("user-b"), []);
  assert.deepEqual(registry.getDetail(id, "user-a").presentation, original);
});

