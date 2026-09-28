"use strict";

const assert = require("node:assert/strict");
const { createProtocolRegistry } = require("../provider-protocol-registry");
const { createProtocolEngine } = require("../provider-protocol-engine");
const { createMediaProtocolAdapters } = require("../media-protocol-adapters");

const tests = [];
const test = (name, run) => tests.push({ name, run });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const reference = "data:image/png;base64,YQ==";
const image = { id: "gpt-image-1", protocol: "openai-images" };
const apib = { id: "apib", baseUrl: "https://apib.ai/v1", protocol: "openai", apiKey: "test-only" };
function engine(fetch, options = {}) {
  return createProtocolEngine({
    registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters({ wait: async () => {}, maxPolls: 3, ...options }) }),
    outboundFetch: fetch,
  });
}

test("APIB accepts synchronous base64 with its image parameters", async () => {
  const calls = [];
  const result = await engine(async (url, options) => {
    calls.push({ url, options });
    return json({ data: [{ b64_json: "YQ==" }] });
  }).execute(apib, image, "image.generate", { prompt: "test" }, { size: "4:3" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://apib.ai/v1/images/generations");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.official_fallback, false);
  assert.equal(body.size, "4:3");
  assert.equal(body.resolution, "1k");
  assert.ok(result.data[0].b64_json === "YQ==" || result.data[0].url === reference);
});

test("APIB image edits use image_urls and subdomain host matching", async () => {
  let captured;
  await engine(async (url, options) => { captured = { url, options }; return json({ data: [{ url: "https://output.test/image.png" }] }); })
    .execute({ ...apib, baseUrl: "https://api.apib.ai" }, image, "image.edit", { prompt: "test", inputImages: [{ blob: new Blob(["a"], { type: "image/png" }) }] }, { size: "2048x1024" });
  assert.equal(captured.url, "https://api.apib.ai/v1/images/generations");
  const body = JSON.parse(captured.options.body);
  assert.deepEqual(body.image_urls, [reference]);
  assert.equal(body.size, "16:9");
  assert.equal(body.resolution, "2k");
  assert.equal(body.official_fallback, false);
});

test("APIB task responses keep one POST and resume the existing task", async () => {
  let submitted, posts = 0;
  const first = engine(async (url, options) => {
    if (options.method === "POST") { posts++; return json({ task_id: "one-task" }); }
    return json({ status: "processing" });
  }, { maxPolls: 1 });
  await assert.rejects(first.execute(apib, image, "image.generate", { prompt: "test" }, {}, { onTaskSubmitted: value => { submitted = value; } }), error => error.code === "UPSTREAM_TASK_PENDING");
  assert.equal(posts, 1);
  const result = await engine(async (url, options) => {
    assert.notEqual(options.method, "POST");
    assert.equal(url, "https://apib.ai/v1/tasks/one-task");
    return json({ data: { status: "completed", result: { data: [{ b64_json: "YQ==" }] } } });
  }).execute(apib, image, "image.generate", {}, {}, { resumeTask: submitted });
  assert.equal(result.task_id, "one-task");
  assert.equal(result.data.length, 1);
});

test("Jimeng CLI submits once and polls the existing task until media is ready", async () => {
  const calls = [];
  const marked = [];
  const service = {
    async generate(request) {
      calls.push(request);
      if (!request.resumeTask) {
        await request.onTaskSubmitted?.({ taskId: "jimeng-task" });
        return { data: [], task_id: "jimeng-task" };
      }
      const polls = calls.filter((call) => Boolean(call.resumeTask)).length;
      if (polls === 1) return { data: [], task_id: "jimeng-task" };
      return { data: [{ url: "https://media.example.test/jimeng.png" }], task_id: "jimeng-task" };
    },
  };
  const result = await engine(async () => {
    throw new Error("the local CLI must not make an HTTP request");
  }, { jimengCliService: service, maxPolls: 3 }).execute(
    { id: "jimeng-main", protocol: "cli:jimeng", baseUrl: "" },
    { id: "jimeng-5.0Pro", protocol: "cli:jimeng" },
    "image.generate",
    { prompt: "paper portrait" },
    { resolution: "2k" },
    { onTaskSubmitted: (task) => marked.push(task) },
  );
  assert.deepEqual(result, {
    data: [{ url: "https://media.example.test/jimeng.png" }],
    task_id: "jimeng-task",
  });
  assert.equal(calls.filter((call) => !call.resumeTask).length, 1, "generation must be submitted only once");
  assert.equal(calls.filter((call) => call.resumeTask).length, 2, "the same task must be queried after submission");
  assert.deepEqual(marked, [{
    protocol: "cli:jimeng",
    providerId: "jimeng-main",
    modelId: "jimeng-5.0Pro",
    baseUrl: "",
    taskId: "jimeng-task",
  }]);
});

test("a queued Jimeng clip reports its queue position instead of failing", async () => {
  const calls = [];
  let submitted = null;
  const service = {
    async generate(request) {
      calls.push(request);
      if (!request.resumeTask) {
        await request.onTaskSubmitted?.({ taskId: "queued-clip" });
        return { data: [], task_id: "queued-clip" };
      }
      return {
        data: [],
        task_id: "queued-clip",
        progress: { state: "queued", position: 93_831, length: 309_790 },
      };
    },
  };
  const client = engine(async () => {
    throw new Error("the local CLI must not make an HTTP request");
  }, { jimengCliService: service, maxPolls: 3 });
  const provider = { id: "jimeng-main", protocol: "cli:jimeng", baseUrl: "" };
  const model = { id: "seedance2.0", protocol: "cli:jimeng" };

  const queued = await client.execute(
    provider, model, "video.generate",
    { prompt: "a cinematic drone shot" },
    { ratio: "16:9", video_resolution: "720p", duration: 4 },
    { onTaskSubmitted: (task) => { submitted = task; } },
  );
  assert.equal(queued.task_id, "queued-clip");
  assert.deepEqual(queued.data, []);
  assert.equal(calls.length, 1, "a queued clip must hand back its task id without blocking on polling");
  assert.deepEqual(submitted, {
    protocol: "cli:jimeng",
    providerId: "jimeng-main",
    modelId: "seedance2.0",
    baseUrl: "",
    taskId: "queued-clip",
  });

  const polled = await client.execute(
    provider, model, "video.generate",
    { prompt: "a cinematic drone shot" },
    { ratio: "16:9", video_resolution: "720p", duration: 4 },
    { resumeTask: submitted },
  );
  assert.equal(polled.task_id, "queued-clip");
  assert.deepEqual(polled.progress, { state: "queued", position: 93_831, length: 309_790 });
  assert.equal(calls.filter((call) => call.resumeTask).length, 1, "a resume call queries the same task once");
});

test("APIMart aspect ratios cannot request a higher resolution", async () => {
  for (const size of ["4:3", "3:2", "1:2"]) {
    let body;
    await engine(async (url, options) => { body = JSON.parse(options.body); return json({ data: [{ url: "https://output.test/image.png" }] }); })
      .execute({ ...apib, baseUrl: "https://api.apimart.ai", protocol: "apimart" }, image, "image.generate", { prompt: "test" }, { size });
    assert.equal(body.resolution, "1k", size);
  }
});

test("relay Gemini edit uses JSON generations with all prepared reference images", async () => {
  let captured;
  await engine(async (url, options) => { captured = { url, options }; return json({ data: [{ url: "https://output.test/image.png" }] }); })
    .execute({ ...apib, baseUrl: "https://relay.test/v1" }, { id: "gemini-3.1-flash-image-preview", protocol: "openai-images" }, "image.edit", {
      prompt: "test", inputImages: [reference, { blob: new Blob(["a"], { type: "image/png" }) }],
    }, { size: "16:9" });
  assert.equal(captured.url, "https://relay.test/v1/images/generations");
  assert.equal(captured.options.headers["content-type"], "application/json");
  const body = JSON.parse(captured.options.body);
  assert.deepEqual(body.image, [reference, reference]);
  assert.equal(body.size, "16:9");
});

test("ordinary OpenAI image edit retains multipart and mask", async () => {
  let captured;
  await engine(async (url, options) => { captured = { url, options }; return json({ data: [{ b64_json: "YQ==" }] }); })
    .execute({ ...apib, baseUrl: "https://api.openai.com/v1" }, image, "image.edit", { prompt: "test", inputImages: [reference], mask: reference });
  assert.equal(captured.url, "https://api.openai.com/v1/images/edits");
  assert.ok(captured.options.body instanceof FormData);
  assert.ok(captured.options.body.has("mask"));
});

test("native Gemini preserves Blob references and requested image dimensions", async () => {
  let captured;
  await engine(async (url, options) => { captured = { url, options }; return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "YQ==" } }] } }] }); })
    .execute({ ...apib, baseUrl: "https://generativelanguage.googleapis.com/v1beta", protocol: "gemini" }, { id: "gemini-3.1-flash-image-preview", protocol: "gemini" }, "image.edit", {
      prompt: "test", inputImages: [{ blob: new Blob(["a"], { type: "image/png" }) }],
    }, { size: "16:9", resolution: "2k" });
  const body = JSON.parse(captured.options.body);
  assert.deepEqual(body.contents[0].parts.find(part => part.inlineData)?.inlineData, { mimeType: "image/png", data: "YQ==" });
  assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: "16:9", imageSize: "2K" });
  assert.equal(captured.options.headers["x-goog-api-key"], "test-only");
});

test("image edits reject missing or unprepared native references before submission", async () => {
  let calls = 0;
  const client = engine(async () => { calls++; return json({ data: [] }); });
  await assert.rejects(client.execute(apib, image, "image.edit", { prompt: "test", inputImages: [] }), /image|reference|参考图/i);
  await assert.rejects(client.execute({ ...apib, protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com" }, { id: "gemini-image", protocol: "gemini" }, "image.edit", { prompt: "test", inputImages: ["https://example.test/reference.png"] }), /image|reference|参考图/i);
  assert.equal(calls, 0);
});

test("APIMart Gemini images use Bearer and root v1beta", async () => {
  let captured;
  await engine(async (url, options) => { captured = { url, options }; return json({ data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "YQ==" } }] } }] } }); })
    .execute({ ...apib, baseUrl: "https://api.apimart.ai/v1", protocol: "apimart" }, { id: "gemini-3.1-flash-image-preview", protocol: "gemini" }, "image.generate", { prompt: "test" }, { size: "3:2", resolution: "1k" });
  assert.equal(captured.url, "https://api.apimart.ai/v1beta/models/gemini-3.1-flash-image-preview:generateContent");
  assert.equal(captured.options.headers.authorization, "Bearer test-only");
  assert.equal(captured.options.headers["x-goog-api-key"], undefined);
  assert.deepEqual(JSON.parse(captured.options.body).generationConfig.imageConfig, { aspectRatio: "3:2", imageSize: "1K" });
});

test("adapter model discovery reports authentication and availability codes", async () => {
  for (const [status, code] of [[401, "UPSTREAM_AUTH"], [403, "UPSTREAM_AUTH"], [429, "UPSTREAM_RATE_LIMIT"], [503, "UPSTREAM_UNAVAILABLE"], [400, "UPSTREAM_PROTOCOL"]]) {
    await assert.rejects(engine(async () => json({ message: "test rejection" }, status)).fetchModels({ ...apib, protocol: "apimart" }), error => error.code === code);
  }
  await assert.rejects(engine(async () => json({ code: 429, message: "test rejection" })).fetchModels({ ...apib, protocol: "apimart" }), error => error.code === "UPSTREAM_RATE_LIMIT");
});

test("protocol verification stops on authentication rejection or rate limiting", async () => {
  for (const [status, code] of [[401, "UPSTREAM_AUTH"], [429, "UPSTREAM_RATE_LIMIT"]]) {
    let calls = 0;
    await assert.rejects(engine(async () => { calls++; return json({ message: "test rejection" }, status); })
      .verifyProtocol({ ...apib, baseUrl: "https://api.anthropic.com", protocol: "anthropic" }), error => {
        assert.equal(error.code, code);
        assert.equal(error.attempts.length, 1);
        return true;
      });
    assert.equal(calls, 1);
  }
});

(async () => {
  let failed = 0;
  for (const { name, run } of tests) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack || error}`); }
  }
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
