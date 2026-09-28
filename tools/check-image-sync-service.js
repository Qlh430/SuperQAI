const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createImageSyncService,
  createRemoteImageUrlValidator,
  validateImageBuffer,
} = require("../image-sync-service");

const validPngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlR3YQAAAAASUVORK5CYII=",
  "base64",
);

function imageResponse(buffer = validPngBytes, contentType = "image/png") {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => String(name).toLowerCase() === "content-type" ? contentType : "" },
    arrayBuffer: async () => buffer,
  };
}

function redirectResponse(location) {
  return {
    ok: false,
    status: 302,
    headers: { get: (name) => String(name).toLowerCase() === "location" ? location : "" },
    arrayBuffer: async () => Buffer.alloc(0),
  };
}

function createFailingService(outputDir, attempts) {
  let calls = 0;
  const service = createImageSyncService({
    outputDir,
    delaysMs: Array.from({ length: attempts }, () => 0),
    fetchImpl: async () => {
      calls += 1;
      throw new Error("download failed");
    },
  });
  return { service, getCalls: () => calls };
}

async function main() {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "image-sync-service-"));
  try {
    let generationCalls = 0;
    let downloadCalls = 0;
    const outboundOptions = [];
    const service = createImageSyncService({
      outputDir,
      delaysMs: [0, 1, 1],
      fetchImpl: async (_url, options) => {
        downloadCalls += 1;
        outboundOptions.push(options.outbound);
        if (downloadCalls === 1) throw new Error("proxy timeout");
        return imageResponse();
      },
    });

    const source = { data: [{ url: "https://cdn.example/result.png" }] };
    generationCalls += 1;
    const result = await service.syncResponse(source);
    assert.equal(generationCalls, 1);
    assert.equal(downloadCalls, 2);
    assert.equal(result.ok, true);
    assert.equal(result.savedImages.length, 1);
    assert.match(result.data[0].local_url, /^\/output\//);
    assert.equal(result.data[0].url, "https://cdn.example/result.png");
    assert.equal(outboundOptions.every((item) => item.requestClass === "idempotent"), true);
    assert.equal(outboundOptions.every((item) => item.purpose === "image-download"), true);
    const savedPath = path.join(outputDir, path.basename(result.data[0].local_url));
    assert.equal(fs.statSync(savedPath).size > 0, true);
    assert.equal(fs.readdirSync(outputDir).some((name) => name.endsWith(".tmp")), false);

    const repeated = await service.recover([{ url: "https://cdn.example/result.png" }]);
    assert.equal(repeated.data[0].local_url, result.data[0].local_url, "the same remote result must reuse one local file");
    const concurrentSource = "https://cdn.example/concurrent.png";
    const concurrent = await Promise.all([
      service.recover([{ url: concurrentSource }]),
      service.recover([{ url: concurrentSource }]),
    ]);
    assert.equal(concurrent[0].data[0].local_url, concurrent[1].data[0].local_url, "concurrent recovery must share one deterministic result");

    assert.equal(validateImageBuffer(Buffer.alloc(0), "image/png").ok, false);
    assert.equal(validateImageBuffer(Buffer.from("<html>bad gateway</html>"), "text/html").reason, "not_an_image");
    assert.equal(validateImageBuffer(Buffer.from("not an image payload"), "application/octet-stream").ok, false);

    const failing = createFailingService(outputDir, 3);
    await assert.rejects(failing.service.syncResponse({ data: [{ url: "https://cdn.example/fail.png" }] }), /download failed/);
    assert.equal(failing.getCalls(), 3);

    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await assert.rejects(service.syncResponse({ data: [{ url: "https://cdn.example/cancel.png" }] }, { signal: controller.signal }), /cancelled/);

    const base64 = await service.syncResponse({ data: [{ b64_json: validPngBytes.toString("base64") }] });
    assert.equal(base64.ok, true);
    assert.match(base64.data[0].local_url, /^\/output\//);

    let recoverGenerationCalls = 0;
    const recovered = await service.recover([{ url: "https://cdn.example/result.png" }]);
    assert.equal(recoverGenerationCalls, 0);
    assert.equal(recovered.ok, true);
    assert.match(recovered.data[0].local_url, /^\/output\//);

    const badPayloadService = createImageSyncService({
      outputDir,
      delaysMs: [0],
      fetchImpl: async () => imageResponse(Buffer.from("<html>upstream error</html>"), "text/html"),
    });
    await assert.rejects(badPayloadService.syncResponse({ data: [{ url: "https://cdn.example/not-image.png" }] }), /not_an_image/);

    const validateRemoteUrl = createRemoteImageUrlValidator({
      lookup: async (hostname) => hostname === "private.example"
        ? [{ address: "127.0.0.1", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }],
    });
    await assert.rejects(validateRemoteUrl("http://127.0.0.1/secret.png"), /private|local/i);
    await assert.rejects(validateRemoteUrl("http://[::ffff:7f00:1]/secret.png"), /private|local/i);
    await assert.rejects(validateRemoteUrl("http://169.254.169.254/latest/meta-data"), /private|local/i);
    await assert.rejects(validateRemoteUrl("https://private.example/secret.png"), /private|local/i);
    await assert.doesNotReject(validateRemoteUrl("https://cdn.example/result.png"));

    let redirectCalls = 0;
    const redirectService = createImageSyncService({
      outputDir,
      delaysMs: [0],
      validateRemoteUrl,
      fetchImpl: async () => {
        redirectCalls += 1;
        return redirectResponse("http://127.0.0.1/secret.png");
      },
    });
    await assert.rejects(
      redirectService.syncResponse({ data: [{ url: "https://cdn.example/redirect.png" }] }),
      /private|local/i,
      "every redirect target must be validated before it is fetched",
    );
    assert.equal(redirectCalls, 1);

    const oversizedService = createImageSyncService({
      outputDir,
      delaysMs: [0],
      maxImageBytes: 32,
      fetchImpl: async () => imageResponse(validPngBytes),
    });
    await assert.rejects(
      oversizedService.syncResponse({ data: [{ url: "https://cdn.example/large.png" }] }),
      /exceeds.*32|too large/i,
    );
    await assert.rejects(
      oversizedService.syncResponse({ data: [{ b64_json: validPngBytes.toString("base64") }] }),
      /exceeds.*32|too large/i,
    );

    const timedBodyService = createImageSyncService({
      outputDir,
      delaysMs: [0],
      fetchTimeoutMs: 20,
      fetchImpl: async (_url, options) => ({
        ...imageResponse(),
        arrayBuffer: () => new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
        }),
      }),
    });
    await assert.rejects(
      timedBodyService.syncResponse({ data: [{ url: "https://cdn.example/stalled.png" }] }),
      /timed out/i,
      "the image timeout must include body download, not only response headers",
    );

    console.log("Image sync service checks passed.");
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
