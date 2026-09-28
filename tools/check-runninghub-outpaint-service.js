"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createRunningHubOutpaintService } = require("../runninghub-outpaint-service");

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-runninghub-outpaint-"));
  const realRoot = fs.realpathSync(root);
  const taskUpdates = [];
  let submittedNodes = null;
  try {
    const fetchImpl = async (url, options = {}) => {
      const value = String(url);
      if (value.endsWith("/openapi/v2/media/upload/binary")) {
        return Response.json({ code: 0, data: { fileName: "uploaded-input.png" } });
      }
      if (value.endsWith("/uc/openapi/accountStatus")) {
        return Response.json({ code: 0, data: { status: "ok" } });
      }
      if (value.endsWith("/task/openapi/create")) {
        submittedNodes = JSON.parse(String(options.body || "{}"));
        return Response.json({ code: 0, data: { taskId: "runninghub-fixture-task" } });
      }
      if (value.endsWith("/task/openapi/status")) {
        return Response.json({ code: 0, data: { taskStatus: "SUCCESS" } });
      }
      if (value.endsWith("/task/openapi/outputs")) {
        return Response.json({ code: 0, data: { fileUrl: "https://cdn.example.test/outpaint.png" } });
      }
      if (value === "https://cdn.example.test/outpaint.png") {
        return new Response(Buffer.from("fixture-png"), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response("not found", { status: 404 });
    };

    const service = createRunningHubOutpaintService({
      updateTask: (taskId, patch) => {
        taskUpdates.push({ taskId, patch });
        return { id: taskId, ...patch };
      },
      imageReferenceToFile: async (source, filename) => ({
        filename,
        blob: new Blob([String(source)], { type: "image/png" }),
      }),
      fetchImpl,
      normalizeOutpaintPadding: () => ({ left: 16, top: 0, right: 32, bottom: 0 }),
      outputDir: root,
      baseUrl: "https://www.runninghub.cn",
      apiKey: "fixture-key",
      workflowId: "fixture-workflow",
      formatErrorMessage: (error) => error?.message || String(error),
      crypto: {
        randomInt: () => 7,
        randomBytes: () => ({ toString: () => "abcdef01" }),
      },
      fs,
      now: () => 1000,
      setTimeoutFn: (resolve) => resolve(),
    });

    assert.deepEqual(
      service.extractImageUrls({ data: [{ nested: { imageUrl: "https://cdn.example.test/a.png" } }] }),
      ["https://cdn.example.test/a.png"],
    );

    await service.runOutpaintTask("fixture-task", {
      image: "data:image/png;base64,fixture",
      left: 16,
      right: 32,
    });

    const final = taskUpdates.at(-1).patch;
    assert.equal(final.status, "success");
    assert.equal(final.progress, 100);
    assert.equal(
      taskUpdates.some((entry) => entry.patch.runninghub_task_id === "runninghub-fixture-task"),
      true,
    );
    assert.equal(final.images.length, 1);
    assert.match(final.images[0], /^\/output\/runninghub_outpaint_1000_1_abcdef01\.png$/);
    assert.equal(fs.existsSync(path.join(root, path.basename(final.images[0]))), true);
    assert.equal(submittedNodes.workflowId, "fixture-workflow");
    assert.deepEqual(
      submittedNodes.nodeInfoList.filter((item) => item.nodeId === "237").map((item) => item.fieldValue),
      ["16", "0", "32", "0"],
    );

    const missingKeyService = createRunningHubOutpaintService({
      updateTask: () => {},
      imageReferenceToFile: async () => ({}),
      fetchImpl,
      normalizeOutpaintPadding: () => ({}),
      outputDir: root,
      baseUrl: "https://www.runninghub.cn",
      apiKey: "",
      workflowId: "fixture-workflow",
      formatErrorMessage: (error) => error?.message || String(error),
    });
    await assert.rejects(missingKeyService.runOutpaintTask("missing-key", {}), /RUNNINGHUB_API_KEY/);

    console.log("RunningHub outpaint service checks passed: account check, upload, task assembly, polling and output persistence.");
  } finally {
    if (fs.realpathSync(root) !== realRoot || !path.basename(realRoot).startsWith("ai-os-runninghub-outpaint-")) {
      throw new Error("Temporary fixture path changed; cleanup refused.");
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
