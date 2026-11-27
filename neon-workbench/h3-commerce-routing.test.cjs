const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const h3Root = process.env.AI_OS_H3_RUNTIME_ROOT || path.join(__dirname, "design-sources");

function load(name) {
  const file = path.join(h3Root, name);
  const module = { exports: {} };
  new Function("require", "module", "exports", fs.readFileSync(file, "utf8"))(createRequire(file), module, module.exports);
  return module.exports;
}

test("media HTTP routes ordinary and commerce requests independently", async () => {
  const calls = [];
  const unused = () => assert.fail("unrelated route");
  const api = load("media-generation-http-api.js").createMediaGenerationHttpApi({
    handleApiVideo: unused, handleApiVideoResume: unused, handleQwenImage21: unused,
    handleQwenImage21Redraw: unused, handleUpscale: unused, handleUpscaleStatus: unused,
    handleMinimaxH3Video: () => calls.push("ordinary"),
    handleH3CommerceCapabilities: () => calls.push("capability"),
    handleH3CommerceVideo: () => calls.push("commerce"),
  });
  const endpoint = "/api/minimax-h3-video/commerce-v1";
  for (const [method, url] of [["POST", "/api/minimax-h3-video"], ["GET", endpoint], ["POST", endpoint]]) {
    assert.equal(await api.handle({ method, url }, {}), true);
  }
  assert.deepEqual(calls, ["ordinary", "capability", "commerce"]);
});

test("dedicated executor validates all images before queueing and submits only the original commerce graph", async () => {
  const { createMinimaxH3TaskService } = load("minimax-h3-task-service.js");
  const workflow = load("h3-commerce-workflow.js");
  const templateFile = path.join(h3Root, "workflows/h3-commerce-video.json");
  const legacyFile = path.join(h3Root, "workflows/minimax-h3-video.json");
  const template = JSON.parse(fs.readFileSync(templateFile, "utf8"));
  const tasks = new Map();
  const calls = [];
  let complete;
  let authorized = [];
  const invalid = new Set();
  let templateMissing = false;
  const service = createMinimaxH3TaskService({
    mediaTaskService: tasks, cleanupTasks() {},
    updateTask: (id, changes) => {
      Object.assign(tasks.get(id), changes);
      if (["success", "failed"].includes(changes.status)) complete?.(tasks.get(id));
    },
    workflowFile: legacyFile,
    commerceWorkflowFile: templateFile,
    fs: { ...fs, existsSync: file => !(templateMissing && file === templateFile) && fs.existsSync(file) },
    normalizeRequest: ({ prompt }) => ({ mode: "reference", prompt, images: [], videos: [], audios: [], seed: 1 }),
    prepareWorkflow: () => ({ legacy: { class_type: "SaveVideo" } }),
    ...workflow,
    sanitizeReferenceName: name => name,
    makeUploadToken: id => id,
    makeUploadFilename: name => name,
    mediaReferenceToFile: async (url, filename, kind) => {
      assert.equal(kind, "image");
      if (invalid.has(url)) throw new Error("broken or missing");
      return { filename, blob: new Blob(["mock"]) };
    },
    comfyClient: {
      normalizeUrl: url => url,
      uploadFile: async (_url, media) => ({ subfolder: "qa", name: media.filename }),
      submitPrompt: async (_url, graph) => { calls.push(graph); return "mock-id"; },
      waitForHistory: async () => ({}),
      saveHistoryVideos: async (_url, _history, _name, ids) => {
        assert.deepEqual(ids, calls.at(-1)?.["604"] ? ["604"] : ["legacy"]);
        return ["/output/mock.mp4"];
      },
    },
    formatErrorMessage: error => error.message,
  });
  const req = { auth: { user: { id: "qa" } } };
  const basic = {
    commerce_mode: true, prompt: "A", prompt_b: "B",
    images: [1, 2, 3, 4].map(i => ({ url: `/output/${i}.png`, name: `${i}.png` })),
  };
  let reply;
  const sendJson = (_res, status, body) => { reply = { status, body }; };
  const deps = payload => ({
    sendJson, readJson: async () => payload, getComfyUrl: () => "mock",
    authorizeImage: async (user, ref) => { assert.equal(user, "qa"); authorized.push(ref); },
  });
  service.handleCommerceCapabilities(req, {}, { sendJson });
  assert.deepEqual(reply, { status: 200, body: { protocol: "ai-os.h3-commerce.v1", available: true, resolution_parameters: true } });
  templateMissing = true;
  service.handleCommerceCapabilities(req, {}, { sendJson });
  assert.equal(reply.status, 503);
  await service.handleCommerceVideoRequest(req, {}, deps(basic));
  assert.equal(reply.status, 503);
  assert.equal(tasks.size, 0);
  templateMissing = false;
  for (const payload of [
    { ...basic, commerce_mode: "true" }, { ...basic, commerce_mode: false },
    { ...basic, mode: "unknown" }, { ...basic, images: [] },
    { ...basic, images: [{ url: "/output/audio.mp3", name: "audio.mp3" }, ...basic.images.slice(1)] },
    { ...basic, prompt_b: "" }, { ...basic, aspect_ratio: "5:7" }, { ...basic, megapixels: 16 },
  ]) {
    await service.handleCommerceVideoRequest(req, {}, deps(payload));
    assert.equal(reply.status, 400);
    assert.equal(tasks.size, 0);
    assert.equal(authorized.length, 0);
  }
  invalid.add(basic.images[2].url);
  await service.handleCommerceVideoRequest(req, {}, deps(basic));
  assert.equal(reply.status, 400);
  assert.equal(tasks.size, 0);
  assert.equal(calls.length, 0);
  invalid.clear();
  authorized = [];
  const finishedCommerce = new Promise(resolve => { complete = resolve; });
  await service.handleCommerceVideoRequest(req, {}, deps({ ...basic, aspect_ratio: "16:9", megapixels: 1 }));
  assert.equal(reply.status, 202);
  assert.equal((await finishedCommerce).status, "success");
  assert.deepEqual(authorized, basic.images.map(item => item.url));
  template[254].inputs.prompt = "A";
  template[454].inputs.prompt = "B";
  Object.assign(template[115].inputs, { aspect_ratio: "16:9 (Widescreen)", megapixels: 1 });
  [705, 704, 703, 701].forEach((id, index) => { template[id].inputs.image = `qa/${index + 1}.png`; });
  template[604].inputs.filename_prefix = calls[0][604].inputs.filename_prefix;
  assert.deepEqual(calls[0], template);
  for (const [payload, expectedRatio, expectedMegapixels] of [
    [{ ...basic, aspect_ratio: "9:16", megapixels: 1 }, "9:16 (Portrait Widescreen)", 1],
    [basic, "9:16 (Portrait Widescreen)", 0.6],
  ]) {
    const finished = new Promise(resolve => { complete = resolve; });
    await service.handleCommerceVideoRequest(req, {}, deps(payload));
    assert.equal(reply.status, 202);
    assert.equal((await finished).status, "success");
    const graph = calls.at(-1);
    assert.deepEqual(graph[115].inputs, { aspect_ratio: expectedRatio, megapixels: expectedMegapixels, multiple: 32 });
    for (const id of ["254", "454"]) {
      assert.deepEqual(graph[id].inputs.width, ["115", 0]);
      assert.deepEqual(graph[id].inputs.height, ["115", 1]);
    }
    assert.deepEqual(["705", "704", "703", "701"].map(id => graph[id].inputs.image),
      ["qa/1.png", "qa/2.png", "qa/3.png", "qa/4.png"]);
    assert.equal(graph["254"].inputs.prompt, "A");
    assert.equal(graph["454"].inputs.prompt, "B");
  }
  for (const payload of [basic, { prompt: "A", commerce_mode: 2 }, { prompt: "A", mode: "commerce" },
    { prompt: "A", model: "h3-commerce" }, { prompt: "A", mode: "unknown" }]) {
    await service.handleVideoRequest(req, {}, {
      ...deps(payload), generateVideo: () => assert.fail("must not fall back"),
    });
    assert.equal(reply.status, 400);
  }
  const finishedLegacy = new Promise(resolve => { complete = resolve; });
  await service.handleVideoRequest(req, {}, {
    ...deps({ prompt: "legacy", mode: "reference" }),
    generateVideo: ({ params, prompt }) => {
      assert.deepEqual(params, { mode: "reference" });
      return service.executeComfyVideoProvider({ provider: { baseUrl: "mock" }, input: { prompt }, params });
    },
  });
  assert.equal(reply.status, 202);
  assert.equal((await finishedLegacy).status, "success");
  assert.deepEqual(calls.at(-1), { legacy: { class_type: "SaveVideo" } });
});
