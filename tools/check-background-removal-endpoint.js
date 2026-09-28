"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function requestJson(port, pathname, options = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: options.method || "GET",
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => { chunks.push(chunk); });
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const contentType = response.headers["content-type"] || "";
        if (!contentType.includes("application/json")) {
          resolve({ status: response.statusCode, contentType, buffer });
          return;
        }
        let data = null;
        try { data = JSON.parse(buffer.toString("utf8")); } catch { data = buffer.toString("utf8"); }
        resolve({ status: response.statusCode, contentType, data });
      });
    });
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitForServer(port, child, diagnostics) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Background removal endpoint server exited with code ${child.exitCode}: ${diagnostics.join("")}`);
    try {
      const response = await requestJson(port, "/api/background-removal/models");
      if (response.status === 200) return response;
    } catch {
      // 端口可能还没绑定好。
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error(`Timed out waiting for the background removal endpoint server: ${diagnostics.join("")}`);
}

// 起一台带独立数据目录的服务，用来验证环境变量覆盖（外部权重 / 镜像目录）这类部署配置。
async function startIsolatedServer(extraEnv = {}) {
  const probe = http.createServer();
  const port = await listen(probe);
  await close(probe);
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-cutout-external-"));
  const diagnostics = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      AI_OS_SKIP_ENV_FILE: "1",
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_DATA_DIR: dataDirectory,
      AI_OS_OUTPUT_DIR: path.join(dataDirectory, "output"),
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));
  const models = await waitForServer(port, child, diagnostics);
  return { port, child, dataDirectory, models };
}

(async () => {
  const probe = http.createServer();
  const appPort = await listen(probe);
  await close(probe);

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-background-removal-endpoint-"));
  const outputDirectory = path.join(tempDirectory, "output");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const diagnostics = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      AI_OS_SKIP_ENV_FILE: "1",
      PORT: String(appPort),
      HOST: "127.0.0.1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_DATA_DIR: tempDirectory,
      AI_OS_OUTPUT_DIR: outputDirectory,
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  try {
    const models = await waitForServer(appPort, child, diagnostics);
    assert.equal(models.data.defaultModel, "ben2-base");
    assert.equal(models.data.models.length, 1);
    assert.equal(models.data.models[0].installed, true, "权重随应用内置，默认即已就绪");
    assert.equal(models.data.models[0].bundled, true, "内置权重不依赖数据目录，也不依赖下载");
    assert.match(models.data.store, /background-removal$/, "模型目录必须落在数据目录下");

    // 下载相关接口必须彻底移除，避免界面又给用户一个「下载模型」的入口。
    const download = await requestJson(appPort, "/api/background-removal/models/download", { method: "POST", body: {} });
    assert.equal(download.status, 404, "下载接口应当已经删掉");
    const progress = await requestJson(appPort, "/api/background-removal/models/progress");
    assert.equal(progress.status, 404, "下载进度接口应当已经删掉");

    const image = await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: 250, g: 250, b: 250 } } })
      .composite([{ input: await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 190, g: 60, b: 40, alpha: 1 } } }).png().toBuffer(), left: 28, top: 28 }])
      .png()
      .toBuffer();
    const dataUrl = `data:image/png;base64,${image.toString("base64")}`;

    const noImage = await requestJson(appPort, "/api/background-removal/prepare", { method: "POST", body: {} });
    assert.equal(noImage.status, 400);
    assert.equal(noImage.data.code, "missing_image");

    const badToken = await requestJson(appPort, "/api/background-removal/apply", { method: "POST", body: { token: "nope" } });
    assert.equal(badToken.status, 410);
    assert.equal(badToken.data.code, "prepared_expired");

    const badMask = await requestJson(appPort, "/api/background-removal/mask?id=nope");
    assert.equal(badMask.status, 410);
    assert.match(badMask.data.error, /重新运行/);

    const badImport = await requestJson(appPort, "/api/background-removal/models/import", { method: "POST", body: { path: path.join(tempDirectory, "missing.onnx") } });
    assert.equal(badImport.status, 400);
    assert.equal(badImport.data.code, "model_source_missing");

    // 本地模型管理：状态要能说明「当前用的是内置权重」以及上游是谁。
    assert.equal(models.data.models[0].source, "bundled");
    assert.equal(models.data.models[0].bundledAvailable, true);
    assert.equal(models.data.models[0].upstreamRepository, "PramaLLC/BEN2");
    assert.match(models.data.models[0].sha256, /^[a-f0-9]{64}$/);

    const modelProgress = await requestJson(appPort, "/api/background-removal/models/update/progress");
    assert.equal(modelProgress.status, 200);
    assert.ok(modelProgress.data.progress === null || typeof modelProgress.data.progress === "object", "进度接口必须始终返回可解析的结果");

    // 没下载过更新时「恢复内置版本」要平静地返回，而不是报错。
    const resetEmpty = await requestJson(appPort, "/api/background-removal/models/reset", { method: "POST", body: {} });
    assert.equal(resetEmpty.status, 200);
    assert.equal(resetEmpty.data.removed, false);
    assert.equal(resetEmpty.data.model.source, "bundled");

    // 检查更新：联网成功要给出上游版本，连不上要给可读的 502，而不是 500。
    const check = await requestJson(appPort, "/api/background-removal/models/check", { method: "POST", body: {} });
    assert.ok([200, 502].includes(check.status), `检查更新不该返回 ${check.status}`);
    if (check.status === 200) {
      assert.equal(typeof check.data.updateAvailable, "boolean");
      assert.match(check.data.remote.sha256, /^[a-f0-9]{64}$/);
    } else {
      assert.equal(check.data.code, "upstream_unreachable");
      assert.match(String(check.data.error), /发布源/);
      const afterCheck = await requestJson(appPort, "/api/background-removal/models");
      assert.equal(afterCheck.data.models[0].installed, true, "连不上发布源也不影响本地权重继续可用");
    }

    const unknown = await requestJson(appPort, "/api/background-removal/nope");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.data.code, "background_removal_not_found");

    // ComfyUI 抠图路由存在，并且沿用放大任务那套参数校验
    const comfyNoImage = await requestJson(appPort, "/api/comfy-remove-background", { method: "POST", body: {} });
    assert.equal(comfyNoImage.status, 400);
    assert.match(String(comfyNoImage.data.error), /Missing image/);

    const comfyTask = await requestJson(appPort, "/api/comfy-remove-background", { method: "POST", body: { image: dataUrl, name: "cutout.png" } });
    assert.equal(comfyTask.status, 202);
    assert.ok(comfyTask.data.task_id, "ComfyUI 抠图必须返回任务 ID");
    const taskStatus = await requestJson(appPort, `/api/upscale/status?id=${encodeURIComponent(comfyTask.data.task_id)}`);
    assert.equal(taskStatus.status, 200);
    assert.ok(["queued", "running", "failed"].includes(taskStatus.data.status));

    const realModel = findRealModel(tempDirectory);
    if (!realModel) {
      console.log("Background removal endpoint checks passed (真实推理部分已跳过：本机没有 BEN2 权重文件)。");
      return;
    }

    // 内置权重被人为删掉/改坏时才走兜底：提示必须明确指向「内置权重缺失」而不是 500。
    const emptyBundle = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-cutout-nobundle-"));
    const broken = await startIsolatedServer({ AI_OS_BACKGROUND_REMOVAL_BUNDLED_DIR: emptyBundle });
    try {
      const status = await requestJson(broken.port, "/api/background-removal/models");
      assert.equal(status.data.models[0].installed, false);
      const missing = await requestJson(broken.port, "/api/background-removal/prepare", { method: "POST", body: { image: dataUrl } });
      assert.equal(missing.status, 409);
      assert.equal(missing.data.code, "model_not_installed");
      assert.match(missing.data.error, /内置/);

      // 兜底通道：内置权重缺失时，导入一份本机 .onnx 就能恢复。
      const imported = await requestJson(broken.port, "/api/background-removal/models/import", { method: "POST", body: { path: realModel } });
      assert.equal(imported.status, 200);
      assert.equal(imported.data.model.installed, true);
    } finally {
      broken.child.kill();
    }

    // 直接复用本机已有的权重文件：不下载、不复制，但校验通过才算已安装。
    const external = await startIsolatedServer({ AI_OS_BACKGROUND_REMOVAL_MODEL_PATH: realModel });
    try {
      const reused = await requestJson(external.port, "/api/background-removal/models");
      assert.equal(reused.data.models[0].installed, true, "外部权重路径必须直接被当作已安装");
      assert.equal(reused.data.models[0].external, true);
      assert.equal(reused.data.modelPath, path.resolve(realModel));
      assert.equal(
        fs.existsSync(path.join(external.dataDirectory, "models", "background-removal", "ben2-base-1.0.0.onnx")),
        false,
        "复用外部权重时不应该再复制一份 213MB 的副本",
      );
    } finally {
      external.child.kill();
    }

    // 默认路线：内置权重直接推理，中间没有任何下载或导入步骤。
    const prepared = await requestJson(appPort, "/api/background-removal/prepare", { method: "POST", body: { image: dataUrl, name: "probe.png" } });
    assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
    assert.equal(prepared.data.width, 96);
    assert.equal(prepared.data.height, 96);
    assert.ok(prepared.data.coverage.opaqueRatio > 0.05, "真实推理必须抠出主体");
    assert.match(prepared.data.mask_url, /^\/api\/background-removal\/mask\?id=/);

    const mask = await requestJson(appPort, prepared.data.mask_url);
    assert.equal(mask.status, 200);
    assert.equal(mask.contentType, "image/png");
    const maskMeta = await sharp(mask.buffer).metadata();
    assert.equal(maskMeta.width, 96);
    assert.equal(maskMeta.height, 96);

    const preview = await requestJson(appPort, prepared.data.preview_url);
    assert.equal(preview.status, 200);
    assert.equal((await sharp(preview.buffer).metadata()).hasAlpha, true);

    const applied = await requestJson(appPort, "/api/background-removal/apply", {
      method: "POST",
      body: { token: prepared.data.token, mode: "subject", settings: { background: 18, foreground: 78, edge: 2, feather: 8 }, name: "probe.png" },
    });
    assert.equal(applied.status, 200, JSON.stringify(applied.data));
    assert.match(applied.data.url, /^\/output\//);
    assert.match(applied.data.filename, /抠图/);
    const savedPath = path.join(outputDirectory, path.basename(decodeURIComponent(applied.data.url)));
    assert.ok(fs.existsSync(savedPath), "抠图结果必须落到输出目录");
    const savedMeta = await sharp(fs.readFileSync(savedPath)).metadata();
    assert.equal(savedMeta.hasAlpha, true, "导出的是透明 PNG");

    const effect = await requestJson(appPort, "/api/background-removal/apply", {
      method: "POST",
      body: { token: prepared.data.token, mode: "effect", settings: { low: 6, high: 190, feather: 18, spill: 86 } },
    });
    assert.equal(effect.status, 200);
    assert.equal(effect.data.mode, "effect");

    console.log("Background removal endpoint checks passed.");
  } finally {
    child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function findRealModel(dataDirectory) {
  const candidates = [
    process.env.AI_OS_BACKGROUND_REMOVAL_TEST_MODEL,
    path.join(ROOT, "assets", "models", "background-removal", "ben2-base-1.0.0.onnx"),
    "F:/DXOS-Portable-0.2.0-win-x64/data/models/background-removal/ben2-base-1.0.0.onnx",
    path.join(dataDirectory, "models", "background-removal", "ben2-base-1.0.0.onnx"),
  ].filter(Boolean);
  return candidates.find((file) => {
    try {
      return fs.statSync(file).size === 222932053;
    } catch {
      return false;
    }
  }) || "";
}
