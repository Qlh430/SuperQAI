"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createProtocolCenter } = require("../protocol-center");
const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createSystemDb } = require("../system-db");
const { createProviderStore } = require("../provider-store");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createProtocolEngine } = require("../provider-protocol-engine");
const { createCapabilityResolver } = require("../provider-capability-resolver");
const { createMediaProtocolAdapters } = require("../media-protocol-adapters");

const protocolCenterUiSource = fs.readFileSync(path.join(__dirname, "..", "protocol-center-ui.js"), "utf8");
assert.match(protocolCenterUiSource, /protocol\.modelLabel\s*\|\|\s*protocol\.label/);
assert.match(protocolCenterUiSource, /displayGroup/);
assert.match(protocolCenterUiSource, /data-protocol-json/);
assert.match(protocolCenterUiSource, /operation\.parameters/);
const { createProviderHttpApi } = require("../provider-http-api");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "protocol-center-"));
  let db = createSystemDb({ dbPath: path.join(dir, "system.sqlite") });
  const requests = [];
  try {
    db.migrate();
    const registry = createProtocolRegistry({ getCustomProtocols: () => db.getSetting("custom_protocols") || [], adapters: createMediaProtocolAdapters() });
    const store = createProviderStore({ db, vault: createProviderSecretVault({ dataDir: dir }), registry });
    const engine = createProtocolEngine({ registry, outboundFetch: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(options.method === "GET" ? { data: [{ id: "some-chat" }] } : { choices: [{ message: { content: "ok" } }] }), { status: 200 });
    } });
    const resolver = createCapabilityResolver({ store, candidateHealth: ({ provider }) => ({ rank: provider.id === "second" ? -1 : 0 }) });
    const center = createProtocolCenter({ db, store, registry, resolver, engine });
    const catalog = center.list();
    assert.ok(catalog.platformProtocols.some(item => item.id === "openai"));
    assert.ok(catalog.modelProtocols.some(item => item.id === "openai"));
    assert.equal(catalog.modelProtocols.some(item => item.id === "openai-images"), false);
    assert.equal(catalog.platformProtocols.some(item => item.id === "openai-responses"), false);
    assert.equal(catalog.platformProtocols.some(item => item.id === "audio-adapter"), false);
    assert.equal(catalog.platformProtocols.some(item => item.id === "apimart"), false);
    assert.equal(JSON.stringify(catalog).includes("APIMart 旧版图片任务"), false);
    assert.equal(catalog.modelProtocols.some(item => item.id === "apimart"), false);
    assert.equal(catalog.modelProtocols.find(item => item.id === "midjourney").label, "Midjourney 专用协议");
    assert.deepEqual(catalog.modelProtocols.find(item => item.id === "midjourney").compatiblePlatformProtocols, ["openai"]);
    assert.deepEqual(catalog.modelProtocols.find(item => item.id === "midjourney").operations.map(item => item.path), ["/v1/midjourney/generations", "/v1/midjourney/generations"]);
    assert.equal(catalog.modelProtocols.find(item => item.id === "audio-adapter").label, "通用音频任务");
    assert.deepEqual(catalog.platformProtocols.find(item => item.id === "openai").operations, []);
    assert.deepEqual(catalog.modelProtocols.find(item => item.id === "openai").operations.map(item => item.intent), ["llm.chat", "llm.chat.stream", "llm.chat.vision", "llm.tools", "image.generate", "image.edit"]);
    assert.ok(catalog.modelProtocols.find(item => item.id === "openai").operationCatalog.some(item => item.id === "responses.create"));
    assert.equal(catalog.platformProtocols.find(item => item.id === "cli:jimeng").connectionType, "cli");
    assert.deepEqual(catalog.modelProtocols.filter(item => item.id.includes(":")).map(item => item.id), ["cli:jimeng"]);
    assert.ok(catalog.modelProtocols.find(item => item.id === "openai").capabilities.includes("llm.tools"));
    assert.deepEqual(catalog.modelProtocols.find(item => item.id === "comfyui").capabilities, ["video.generate"]);
    assert.equal(catalog.modelProtocols.find(item => item.id === "comfyui").runnable, false);
    console.log("PASS catalog reflects actual runtime scopes and capabilities");
    const platform = { id: "private-site", label: "自定义站点", scope: "platform", runtimeProtocol: "openai", schemaVersion: "dx-protocol/v2", kind: "provider", executor: { type: "declarative", engine: ">=1.0.0" }, auth: { type: "bearer", header: "authorization", prefix: "Bearer ", credentialRef: "api_key" }, headers: { "x-client": "protocol-center-test" }, models: { method: "GET", path: "/v1/models", response: { data: "$.data", id: "$.id", name: "$.name" } } };
    const modelProfile = { id: "private-chat", label: "仅聊天", scope: "model", runtimeProtocol: "openai", capabilities: ["llm.chat"] };
    center.save(platform);
    center.save(modelProfile);
    const storedPlatform = db.getSetting("custom_protocols").find(item => item.id === platform.id);
    assert.equal(Object.hasOwn(storedPlatform, "capabilities"), false, "platform protocols must not persist model capabilities");
    assert.deepEqual(center.list().platformProtocols.find(item => item.id === platform.id).capabilities, [], "platform protocols expose no model capabilities");
    assert.throws(() => center.save({ ...platform, id: "openai" }), error => error.code === "protocol_id_reserved");
    assert.throws(() => center.save({ ...platform, id: "../bad" }), error => error.code === "invalid_protocol_id");
    assert.throws(() => center.save({ ...modelProfile, capabilities: ["video.generate"] }), error => error.code === "invalid_protocol_capabilities");
    assert.throws(() => center.save({ ...platform, runtimeProtocol: "private-chat" }), error => error.code === "invalid_runtime_protocol");
    assert.throws(() => center.save({ ...platform, auth: { type: "unsupported" } }), error => error.code === "invalid_protocol_auth");
    assert.equal(center.list().platformProtocols.find(item => item.id === platform.id).builtin, false);
    assert.equal(registry.get(platform.id).id, "openai");
    assert.deepEqual(registry.describe(platform.id).models, platform.models);
    assert.equal(registry.describe(platform.id).headers["x-client"], "protocol-center-test");
    console.log("PASS custom profiles persist and reject unsupported contracts");
    store.save({ id: "first", name: "First", baseUrl: "https://relay.test/v1", protocol: platform.id, apiKey: "fake-private-key", models: [
      { id: "chat", protocol: modelProfile.id }, { id: "image", protocol: "openai-images", capabilities: ["image.generate"] },
    ] });
    const saved = store.reveal("first");
    assert.equal(saved.protocol, platform.id);
    assert.equal(saved.models[0].protocol, modelProfile.id);
    assert.deepEqual(saved.models[0].capabilities, ["llm.chat"]);
    await engine.execute(saved, saved.models[0], "llm.chat", { prompt: "ping" });
    assert.equal(requests.at(-1).url, "https://relay.test/v1/chat/completions");
    const count = requests.length;
    await assert.rejects(() => engine.execute(saved, saved.models[0], "llm.tools", {}), error => error.code === "UPSTREAM_PROTOCOL");
    assert.equal(requests.length, count);
    assert.equal((await engine.verifyProtocol(saved)).selectedProtocol, platform.id);
    assert.equal(store.save({ id:"first", protocol:"PRIVATE-SITE" }).protocol, platform.id);
    await assert.rejects(() => engine.stream(saved,saved.models[0],"llm.tools",{}, {},()=>{}),error=>error.code==="UPSTREAM_PROTOCOL");
    await assert.rejects(() => engine.executeWithTools(saved,saved.models[0],[]),error=>error.code==="UPSTREAM_PROTOCOL");
    assert.throws(() => store.save({ ...saved, protocol: modelProfile.id }), error => error.code === "invalid_protocol_scope");
    assert.throws(() => store.save({ ...saved, models: [{ id: "bad", protocol: platform.id }] }), error => error.code === "invalid_protocol_scope");
    assert.throws(() => center.remove(modelProfile.id), error => error.statusCode === 409);
    assert.throws(() => center.save({ ...modelProfile, runtimeProtocol: "anthropic" }), error => error.statusCode === 409);
    center.save({ ...modelProfile, label: "聊天配置" });
    console.log("PASS saved profiles drive execution and protect referenced protocols");
    store.save({ id: "second", name: "Second", baseUrl: "https://relay.test/v1", protocol: "openai", sortOrder: 10, models: [{ id: "preferred", protocol: "openai", capabilities: ["llm.chat"] }] });
    const beforeRoute = requests.length;
    const toolsRoute = center.routeTest({ intent: "llm.tools", providerId: "first", modelId: "chat" });
    assert.equal(toolsRoute.ok, false);
    assert.equal(toolsRoute.readOnly, true);
    assert.ok(toolsRoute.issues.some(issue => issue.missingCapabilities.includes("llm.tools")));
    const route = center.routeTest({ intent: "llm.chat" });
    assert.equal(route.selected.providerId, resolver.resolve({ intent: "llm.chat" }).provider.id);
    assert.equal(route.selected.providerId, "second");
    assert.equal(route.selected.operation.path, "/v1/chat/completions");
    assert.equal(requests.length, beforeRoute);
    assert.ok(!JSON.stringify(route).includes("fake-private-key"));
    store.save({ id: "apimart", name: "APIMart", baseUrl: "https://api.apimart.ai/v1", protocol: "apimart", models: [{ id: "gpt-image-2", protocol: "openai-images", capabilities: ["image.generate"] }] });
    assert.equal(store.reveal("apimart").protocol, "openai");
    const imageRoute = center.routeTest({ intent: "image.generate", providerId: "apimart", modelId: "gpt-image-2" });
    assert.equal(imageRoute.selected.runtimeProtocol, "apimart");
    assert.equal(imageRoute.selected.operation.mode, "task-or-result");
    assert.equal(JSON.stringify(imageRoute).includes("APIMart 旧版图片任务"), false);
    console.log("PASS readonly diagnostics share actual selection and host-specific execution");
    const api = createProviderHttpApi({ store, registry, engine, protocolCenter: center,
      requireSignedIn: async req => req.auth,
      requireRole: async auth => { if(auth.user.role !== "superadmin") throw Object.assign(new Error("Forbidden"), {statusCode:403}); },
      readJson: async req => req.body || {}, sendJson: (res, status, body) => Object.assign(res, {status,body}) });
    async function call(method, url, body, role = "superadmin") { const res={}; assert.equal(await api.handle({ method,url,body,headers:{host:"localhost"},auth:{user:{id:"test",role}} },res),true); return res; }
    assert.equal((await call("GET", "/api/protocols", null, "user")).status,403);
    assert.ok((await call("GET", "/api/protocols")).body.modelProtocols.some(item => item.id === modelProfile.id));
    assert.equal((await call("POST", "/api/protocols/route-test", {intent:"llm.chat"})).body.readOnly,true);
    assert.equal((await call("POST", "/api/protocols/custom", {...platform,id:"unused"})).status,201);
    assert.equal((await call("DELETE", "/api/protocols/custom/unused")).status,200);
    assert.equal((await call("DELETE", `/api/protocols/custom/${platform.id}`)).status,409);
    assert.equal((await call("GET", "/api/protocols")).body.platformProtocols.find(item=>item.id===platform.id).usageCount,1);
    console.log("PASS admin HTTP CRUD and route checking");
    db.close();
    db = createSystemDb({ dbPath: path.join(dir,"system.sqlite") });
    assert.equal(registry.get(platform.id).id,"openai");
    assert.equal(db.getSetting("custom_protocols").find(item=>item.id===modelProfile.id).label,"聊天配置");
    console.log("PASS custom protocols survive database reopen");
  } finally {
    db.close();
    if (path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode=1; });
