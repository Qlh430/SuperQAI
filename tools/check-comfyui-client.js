"use strict";

const assert = require("node:assert/strict");
const { createComfyUiClient } = require("../comfyui-client");

async function run() {
  const writes = new Map();
  const requests = [];
  const client = createComfyUiClient({
    getDefaultUrl: () => "127.0.0.1:8188",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/upload/image") {
        return Response.json({ name: "uploaded.png", subfolder: "input" });
      }
      if (pathname === "/prompt") {
        return Response.json({ prompt_id: "prompt-1" });
      }
      if (pathname === "/history/prompt-1") {
        return Response.json({
          "prompt-1": {
            outputs: {
              230: { videos: [{ filename: "video.mp4", type: "output" }] },
              591: { images: [{ filename: "image.png", type: "output" }] },
            },
          },
        });
      }
      if (pathname === "/queue") return Response.json({ queue_running: [], queue_pending: [] });
      if (pathname === "/view") {
        const filename = new URL(String(url)).searchParams.get("filename");
        const contentType = filename.endsWith(".mp4") ? "video/mp4" : "image/png";
        return new Response(Buffer.from(filename), { headers: { "content-type": contentType } });
      }
      return new Response("", { status: 404 });
    },
    imageReferenceToFile: async (url, filename) => ({
      filename,
      blob: new Blob(["fixture"], { type: "image/png" }),
    }),
    outputDir: "C:/fixture-output",
    inspectHistory: () => ({ state: "success", message: "" }),
    collectVideoOutputs: () => [{ filename: "video.mp4", type: "output" }],
    formatErrorMessage: error => error?.message || String(error),
    crypto: {
      randomUUID: () => "client-id",
      randomBytes: () => ({ toString: () => "abcd" }),
    },
    fs: {
      writeFileSync: (filePath, buffer) => writes.set(filePath.replace(/\\/g, "/"), Buffer.from(buffer)),
    },
    setTimeoutFn: (callback) => {
      callback();
      return 1;
    },
    clearTimeoutFn: () => {},
  });

  assert.equal(client.normalizeUrl(""), "http://127.0.0.1:8188");
  assert.equal(client.normalizeUrl("127.0.0.1:8189/"), "http://127.0.0.1:8189");

  const uploaded = await client.uploadDataUrl("127.0.0.1:8188", "data:image/png;base64,AA==", "input.png");
  assert.deepEqual(uploaded, { name: "uploaded.png", subfolder: "input" });
  assert.equal(requests[0].url, "http://127.0.0.1:8188/upload/image");
  assert.ok(requests[0].options.body instanceof FormData);

  const promptId = await client.submitPrompt("127.0.0.1:8188", { node: { inputs: {} } });
  assert.equal(promptId, "prompt-1");
  assert.equal(requests[1].url, "http://127.0.0.1:8188/prompt");

  const history = await client.waitForHistory("127.0.0.1:8188", "prompt-1");
  assert.equal(history.outputs[230].videos[0].filename, "video.mp4");

  const images = await client.saveHistoryImages("127.0.0.1:8188", history, "image_", ["591"]);
  assert.deepEqual(images, ["/output/image_abcd.png"]);
  assert.ok(writes.has("C:/fixture-output/image_abcd.png"));

  const videos = await client.saveHistoryVideos("127.0.0.1:8188", history, "video_", ["230"]);
  assert.deepEqual(videos, ["/output/video_abcd.mp4"]);
  assert.ok(writes.has("C:/fixture-output/video_abcd.mp4"));

  console.log("ComfyUI client checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
