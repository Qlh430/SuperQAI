"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createProxyAwareFetch } = require("../outbound-fetch");
const { createMediaProtocolAdapters } = require("../media-protocol-adapters");
const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createProtocolEngine } = require("../provider-protocol-engine");
const { createImageJobManager, isAmbiguousSubmissionError } = require("../image-job-manager");
const provider = { id: "p", baseUrl: "https://api.apimart.ai/v1", protocol: "apimart", apiKey: "secret-test-key", metadata: { legacyNetworkMode: "proxy" } };
const model = { id: "gpt-image-2-apimart", protocol: "openai-images", metadata: { upstreamModel: "gpt-image-2" } };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const complete = () => json({ data: { status: "completed", result: { images: [{ url: ["https://cdn.example/image.png"] }] } } });
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function engine(fetch, options = {}) { return createProtocolEngine({ registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters({ wait: async () => {}, ...options }) }), outboundFetch: fetch }); }

test("fresh proxy connection before giving up a safe pre-submit failure", async () => {
  let dispatchers = 0;
  const calls = [];
  const fetch = createProxyAwareFetch({ proxyUrl: "http://127.0.0.1:7890", createProxyDispatcher: () => ({ id: ++dispatchers, close: async () => {} }), fetchImpl: async (_, opts) => {
    calls.push(opts.dispatcher?.id);
    if (calls.length === 1) throw Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" });
    return json({ ok: true });
  }});
  await fetch(provider.baseUrl, { method: "POST", body: "{}", outbound: { mode: "proxy", requestClass: "billable" } });
  assert.deepEqual(calls, [1, 2]);
});

test("pre-submit failures stay distinguishable through protocol wrapping", async () => {
  const fetch = createProxyAwareFetch({ proxyUrl: "auto", discoverProxy: async () => "", fetchImpl: async () => { throw Object.assign(new Error("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }); } });
  await assert.rejects(engine(fetch).execute({ ...provider, metadata: {} }, model, "image.generate", { prompt: "test" }), error => {
    assert.equal(error.submissionState, "not_submitted");
    assert.equal(isAmbiguousSubmissionError(error), false);
    return true;
  });
});

test("temporary polling failures keep one paid task and preserve network mode", async () => {
  const calls = [], events = [];
  const replies = [json({ data: [{ task_id: "paid-once" }] }), new Response("Bad Gateway", { status: 502 }), json({ code: 503, message: "busy" }), new TypeError("fetch failed"), json({ data: { status: "processing" } }), complete()];
  const result = await engine(async (url, opts) => {
    calls.push({ url, opts });
    if (calls.length > 1) assert.equal(events.length, 1, "task must be persisted before polling");
    const next = replies.shift(); if (next instanceof Error) throw next; return next;
  }).execute(provider, model, "image.generate", { prompt: "test" }, {}, { onTaskSubmitted: task => events.push(task) });
  assert.equal(result.task_id, "paid-once");
  assert.equal(result.data[0].url, "https://cdn.example/image.png");
  assert.equal(calls.filter(c => c.opts.method === "POST").length, 1);
  assert.ok(calls.every(c => c.opts.outbound.mode === "proxy"));
  assert.equal(events[0].taskId, "paid-once");
  assert.ok(!JSON.stringify(events).includes(provider.apiKey));
});

test("exhausted polling can resume the same task without a POST", async () => {
  let task, count = 0;
  await assert.rejects(engine(async (_, opts) => {
    count++;
    return opts.method === "POST" ? json({ task_id: "pending-task" }) : json({ message: "busy" }, 503);
  }, { maxPolls: 3 }).execute(provider, model, "image.generate", { prompt: "test" }, {}, { onTaskSubmitted: value => { task = value; } }), e => e.code === "UPSTREAM_TASK_PENDING" && e.retryable === false);
  assert.equal(count, 4);
  const result = await engine(async (url, opts) => { assert.notEqual(opts.method, "POST"); assert.match(url, /\/tasks\/pending-task$/); return complete(); })
    .execute(provider, model, "image.generate", { prompt: "resume" }, {}, { resumeTask: task });
  assert.equal(result.task_id, "pending-task");
  await assert.rejects(engine(async () => { throw new Error("must not request a different host"); }).execute({ ...provider, baseUrl: "https://other.example" }, model, "image.generate", { prompt: "resume" }, {}, { resumeTask: task }), /配置.*变更/);
});

test("HTTP authentication rejection does not trigger repeated polling", async () => {
  let calls = 0;
  await assert.rejects(engine(async () => ++calls === 1 ? json({ task_id: "auth-task" }) : json({ message: "unauthorized" }, 401)).execute(provider, model, "image.generate", { prompt: "test" }), e => e.retryable === false);
  assert.equal(calls, 2);
});

test("synchronous image generation waits for output instead of a false connect timeout", async () => {
  const result = await engine(async () => {
    await new Promise(resolve => setTimeout(resolve, 35));
    return json({ data: [{ url: "https://cdn.example/synchronous.png" }] });
  }).execute({ ...provider, baseUrl: "https://openai-compatible.example/v1", protocol: "openai" }, model, "image.generate", { prompt: "test" }, {}, { connectTimeoutMs: 10, totalTimeoutMs: 150 });
  assert.equal(result.data[0].url, "https://cdn.example/synchronous.png");
});

test("full endpoint URLs are normalized for generation and task lookup", async () => {
  const urls = [];
  await engine(async url => { urls.push(url); return urls.length === 1 ? json({ task_id: "full-url" }) : complete(); }).execute({ ...provider, baseUrl: "https://api.apimart.ai/v1/images/generations" }, model, "image.generate", { prompt: "test" });
  assert.deepEqual(urls, ["https://api.apimart.ai/v1/images/generations", "https://api.apimart.ai/v1/tasks/full-url"]);
});

test("Midjourney model profile selects its task endpoint without relying on the model name", async () => {
  const calls = [];
  const result = await engine(async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? json({ task_id: "midjourney-profile-task" }) : complete();
  }).execute(provider, { id: "illustration-v7", protocol: "midjourney" }, "image.generate", { prompt: "test" });
  assert.equal(result.task_id, "midjourney-profile-task");
  assert.deepEqual(calls.map(call => call.url), [
    "https://api.apimart.ai/v1/midjourney/generations",
    "https://api.apimart.ai/v1/tasks/midjourney-profile-task",
  ]);
  assert.equal(JSON.parse(calls[0].options.body).model, undefined);
});

test("restart retains task identity and concurrent recovery never regenerates", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apimart-recovery-"));
  try {
    const filePath = path.join(dir, "jobs.json");
    const remoteTask = { taskId: "persisted-task", providerId: "p", modelId: model.id, baseUrl: provider.baseUrl, protocol: "apimart" };
    fs.writeFileSync(filePath, JSON.stringify({ jobs: { existing: { id: "existing", state: "running", model: model.id, remoteTask, result: null } } }));
    let recoveries = 0;
    const manager = createImageJobManager({ filePath, execute: async () => { throw new Error("must not regenerate"); }, recoverTask: async (task, ctx) => {
      recoveries++; assert.equal(task.taskId, remoteTask.taskId); assert.ok(ctx.signal);
      await new Promise(r => setTimeout(r, 10));
      return { status: 200, body: { data: [{ local_url: "/output/recovered.png" }] } };
    }});
    assert.equal(manager.get("existing").state, "task_pending");
    assert.equal(manager.get("existing").canResume, true);
    assert.ok(!JSON.stringify(manager.get("existing")).includes(provider.baseUrl));
    const results = await Promise.all([manager.recover("existing"), manager.recover("existing")]);
    assert.ok(results.every(r => r.state === "completed"));
    assert.equal(recoveries, 1);
    assert.equal(JSON.parse(fs.readFileSync(filePath)).jobs.existing.remoteTask.taskId, "persisted-task");
  } finally { if (path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dir, { recursive: true, force: true }); }
});

(async () => {
  let failures = 0;
  for (const { name, run } of tests) { try { await run(); console.log(`PASS ${name}`); } catch(e) { failures++; console.error(`FAIL ${name}: ${e.message}`); } }
  if (failures) process.exitCode = 1;
})();
