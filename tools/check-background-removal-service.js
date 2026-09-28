const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const service = require("../background-removal-service");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-background-removal-"));
const dataDir = path.join(workDir, "data");
fs.mkdirSync(dataDir, { recursive: true });

// ── 1. 模型目录在缺少权重时给出可读状态，而不是崩掉 ─────────────────
const emptyBundle = path.join(workDir, "empty-bundle");
fs.mkdirSync(emptyBundle, { recursive: true });
// 内置权重被删掉/改坏时的兜底状态：只在这里模拟，正常安装不会出现。
const instance = service.createBackgroundRemovalService({ dataDir, bundledModelDir: emptyBundle });
const models = instance.listModels();
assert.equal(models.length, 1, "只注册经过验证的 BEN2 Base");
assert.equal(models[0].id, "ben2-base");
assert.equal(models[0].installed, false);
assert.equal(models[0].bundled, false);
assert.equal(models[0].size, 222932053);
assert.match(models[0].description, /CPU/, "界面要能说明不需要显卡");
assert.equal(typeof instance.downloadModel, "undefined", "权重改为内置分发，下载链路必须彻底移除");

// 默认服务直接读应用自带的权重：开箱即用，不需要下载，也不往数据目录复制副本。
const bundledDataDir = path.join(workDir, "bundled-data");
const bundledInstance = service.createBackgroundRemovalService({ dataDir: bundledDataDir });
const bundledModel = bundledInstance.listModels()[0];
assert.equal(bundledModel.installed, true, "权重随应用内置，默认就应该是已就绪");
assert.equal(bundledModel.bundled, true);
assert.equal(bundledModel.source, "bundled");
assert.equal(bundledModel.external, false);
assert.match(bundledInstance.status().bundledDirectory, /assets[\\/]models[\\/]background-removal$/);
assert.equal(
  fs.existsSync(path.join(bundledDataDir, "models", "background-removal", "ben2-base-1.0.0.onnx")),
  false,
  "内置权重不该被复制一份到数据目录",
);

// ── 2. 纯函数：张量、掩膜、阈值重映射、颜色键控 ─────────────────────
const rgb = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
const tensor = service.buildInputTensor(rgb, { input: { width: 2, height: 2, normalize: "zero-one", dtype: "float32" } });
assert.equal(tensor.dtype, "float32");
assert.equal(tensor.data.length, 12);
assert.equal(tensor.data.constructor.name, "Float32Array");
// NCHW：前 4 个是 R 通道
assert.deepEqual(Array.from(tensor.data.slice(0, 4)), [1, 0, 0, 1]);
// imagenet 归一化应改变数值范围
const imagenet = service.buildInputTensor(rgb, { input: { width: 2, height: 2, normalize: "imagenet", dtype: "float32" } });
assert.notDeepEqual(Array.from(imagenet.data.slice(0, 4)), Array.from(tensor.data.slice(0, 4)));
// float16 输入走位模式
const half = service.buildInputTensor(rgb, { input: { width: 2, height: 2, normalize: "zero-one", dtype: "float16" } });
assert.equal(half.dtype, "float16");
assert.equal(half.data.constructor.name, "Uint16Array");
assert.equal(service.halfBitsToFloat(half.data[0]), 1);
assert.equal(service.halfBitsToFloat(service.floatToHalfBits(0.5)), 0.5);

const mask = service.buildMaskBytes(new Float32Array([1, 2, 3, 4]), { sigmoid: false });
assert.deepEqual(Array.from(mask), [0, 85, 170, 255], "min-max 拉伸到 0..255");
assert.deepEqual(Array.from(service.buildMaskBytes(new Float32Array([5, 5, 5]), { sigmoid: false })), [0, 0, 0]);
assert.equal(service.buildMaskBytes(new Float32Array([0]), { sigmoid: true })[0], 0);

const rawAlpha = Buffer.from([0, 64, 128, 255]);
const refined = service.refineSubjectAlpha(rawAlpha, { background: 18, foreground: 78, edge: 2, feather: 8 });
assert.equal(refined.length, 4);
assert.equal(refined[0], 0, "背景保持全透明");
assert.ok(refined[3] > 200, "主体保持不透明");
assert.ok(refined[3] >= refined[2], "过渡区保持单调");
assert.equal(service.normalizeSubjectSettings({ background: 500 }).background, 98, "越界设置被夹到合法范围");
assert.equal(service.normalizeEffectSettings({ high: 9999 }).high, 255);
assert.equal(service.normalizeEffectSettings({ invert: 1 }).invert, true);

const effectSize = 32;
const effectRgb = Buffer.alloc(effectSize * effectSize * 4);
for (let y = 0; y < effectSize; y += 1) {
  for (let x = 0; x < effectSize; x += 1) {
    const index = (y * effectSize + x) * 4;
    const isSubject = x >= 10 && x < 22 && y >= 10 && y < 22;
    effectRgb[index] = isSubject ? 200 : 250;
    effectRgb[index + 1] = isSubject ? 40 : 250;
    effectRgb[index + 2] = isSubject ? 30 : 250;
    effectRgb[index + 3] = 255;
  }
}
const subjectIndex = (16 * effectSize + 16) * 4;
const effect = service.computeEffectAlpha(effectRgb, effectSize, effectSize, { low: 6, high: 190, feather: 18, spill: 86 });
assert.equal(effect.alpha.length, effectSize * effectSize);
assert.ok(effect.alpha[0] < 20, "白色背景被键掉");
assert.ok(effect.alpha[16 * effectSize + 16] > 200, "前景色保留");
assert.ok(effect.background.r > 200 && effect.background.g > 200, "背景色从四边采样");
const inverted = service.computeEffectAlpha(effectRgb, effectSize, effectSize, { low: 6, high: 190, feather: 0, spill: 86, invert: true });
assert.ok(inverted.alpha[0] > 200, "反选后背景变成前景");
assert.ok(inverted.alpha[16 * effectSize + 16] < 20);
const spilled = Buffer.from(effectRgb);
service.applyEffectSpill(spilled, effect.alpha, effect.background, service.normalizeEffectSettings({ spill: 86 }));
assert.ok(spilled[subjectIndex] >= 0 && spilled[subjectIndex] <= 255, "去溢色结果仍是合法像素");

const coverage = service.countCoverage(Buffer.from([0, 0, 255, 255, 128, 10]));
assert.equal(coverage.opaqueRatio, 0.3333);
assert.equal(coverage.clearRatio, 0.3333);

const composed = service.writeAlpha(Buffer.from([10, 20, 30, 0, 10, 20, 30, 0]), Buffer.from([255, 0]), 50);
assert.equal(composed[3], 128);
assert.equal(composed[7], 0);

// ── 3. 缓存与错误分支 ──────────────────────────────────────────────
assert.throws(() => service.createBackgroundRemovalService({}), /data directory/i, "缺少数据目录直接报错");

const noModel = service.createBackgroundRemovalService({ dataDir: path.join(workDir, "empty"), bundledModelDir: emptyBundle });
assert.equal(noModel.listModels()[0].installed, false);
assert.equal(service.smoothstep(0, 1, 0.5), 0.5);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  // 未安装模型时 prepare 必须给出「去安装模型」的中文提示
  const small = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  await assert.rejects(() => instance.prepare(small), (error) => error.code === "model_not_installed", "缺模型时应提示先安装");
  await assert.rejects(() => instance.applySettings("missing-token"), (error) => error.code === "prepared_expired");
  await assert.rejects(() => instance.prepare(Buffer.alloc(0)), (error) => error.code === "missing_image");
  await assert.rejects(() => instance.prepare(small, "not-a-model"), (error) => error.code === "unsupported_model");
  await assert.rejects(
    () => instance.importModelFile(path.join(workDir, "not-there.onnx")),
    (error) => error.code === "model_source_missing",
  );

  // 模型导入必须校验大小，半截文件不会被当成可用模型
  const fakeModel = path.join(workDir, "fake.onnx");
  fs.writeFileSync(fakeModel, Buffer.alloc(1024));
  await assert.rejects(() => instance.importModelFile(fakeModel), (error) => error.code === "model_size_mismatch");
  assert.equal(instance.listModels()[0].installed, false);

  // ── 4. 模型更新：用假发布源跑完整流程，测试全程不联网 ───────────────
  const fakeBytes = Buffer.concat([Buffer.from("BEN2-FAKE-WEIGHTS"), Buffer.alloc(4096, 7)]);
  const fakeHash = crypto.createHash("sha256").update(fakeBytes).digest("hex");
  const upstreamRequests = [];
  const fakeFetch = async (url) => {
    const target = String(url);
    upstreamRequests.push(target);
    if (target.includes("/tree/")) {
      return new Response(JSON.stringify([
        { path: "BEN2.py", size: 53513 },
        { path: "BEN2_Base.onnx", size: fakeBytes.length, lfs: { oid: fakeHash, size: fakeBytes.length } },
      ]), { status: 200 });
    }
    if (target.includes("/api/models/")) {
      return new Response(JSON.stringify({ sha: "rev-1", lastModified: "2026-09-18T00:00:00.000Z" }), { status: 200 });
    }
    return new Response(fakeBytes, { status: 200, headers: { "content-length": String(fakeBytes.length) } });
  };

  const updateStore = path.join(workDir, "update-data", "models", "background-removal");
  const storedFile = path.join(updateStore, "ben2-base-1.0.0.onnx");
  const updater = service.createBackgroundRemovalService({ dataDir: path.join(workDir, "update-data"), fetchImpl: fakeFetch });
  assert.equal(updater.listModels()[0].source, "bundled", "没更新过之前用的是内置权重");

  const checked = await updater.checkForUpdate();
  assert.equal(checked.updateAvailable, true, "上游换了校验值就算有新版本");
  assert.equal(checked.remote.sha256, fakeHash);
  assert.equal(checked.remote.repository, "PramaLLC/BEN2");
  assert.equal(checked.remote.revision, "rev-1");
  assert.equal(checked.remote.publishedAt, "2026-09-18T00:00:00.000Z");
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(updateStore, "ben2-base-upstream.json"), "utf8")).sha256,
    fakeHash,
    "上游版本信息要落盘，离线时也能校验导入的权重",
  );

  const events = [];
  const applied = await updater.downloadUpdate("ben2-base", { onProgress: (event) => events.push(event) });
  assert.ok(events.some((event) => event.phase === "downloading"), "下载过程要报告进度");
  assert.equal(events.at(-1).phase, "done");
  assert.equal(applied.model.installed, true);
  assert.equal(applied.model.sha256, fakeHash);
  assert.equal(applied.model.source, "update", "下载的更新要优先于内置权重生效");
  assert.equal(fs.statSync(storedFile).size, fakeBytes.length);
  assert.equal((await updater.checkForUpdate()).updateAvailable, false, "下载完成后本地与上游一致");

  // 恢复内置版本：删掉数据目录里的更新副本，回落到应用自带的权重
  const restored = updater.removeStoredModel();
  assert.equal(restored.removed, true);
  assert.equal(restored.model.source, "bundled");
  assert.equal(restored.model.sha256, "22cea62108ff53b7ccc20f7a008bf30494228d84b1687f29ecbe76936a998101");
  assert.equal(fs.existsSync(storedFile), false, "回退内置版本要真的删掉数据目录里的副本");

  // 校验不过的下载整份丢弃，绝不留下半截文件
  const brokenDataDir = path.join(workDir, "broken-data");
  const brokenFetch = async (url) => String(url).includes("/tree/")
    ? new Response(JSON.stringify([{ path: "BEN2_Base.onnx", size: fakeBytes.length, lfs: { oid: fakeHash, size: fakeBytes.length } }]), { status: 200 })
    : new Response(Buffer.alloc(fakeBytes.length, 3), { status: 200 });
  const broken = service.createBackgroundRemovalService({ dataDir: brokenDataDir, fetchImpl: brokenFetch });
  await assert.rejects(
    () => broken.downloadUpdate(),
    (error) => error.code === "model_hash_mismatch",
    "下载内容与发布源校验值不一致时必须失败",
  );
  assert.equal(fs.existsSync(path.join(brokenDataDir, "models", "background-removal", "ben2-base-1.0.0.onnx")), false, "校验失败的文件不能落盘");
  assert.equal(fs.existsSync(path.join(brokenDataDir, "models", "background-removal", "ben2-base-1.0.0.onnx.update")), false, "临时文件也要清掉");

  // 发布源连不上时给明确提示，而且不影响本地权重继续可用
  const offline = service.createBackgroundRemovalService({
    dataDir: path.join(workDir, "offline-data"),
    fetchImpl: async () => { throw new Error("getaddrinfo ENOTFOUND huggingface.co"); },
  });
  await assert.rejects(() => offline.checkForUpdate(), (error) => error.code === "upstream_unreachable");
  assert.match(offline.listModels()[0].sha256, /^[a-f0-9]{64}$/, "离线时本地内置权重照样可用");

  // 来源不明的权重不能被导入：大小对得上但校验值不认识
  const strayFile = path.join(workDir, "stray.onnx");
  fs.writeFileSync(strayFile, Buffer.concat([Buffer.from("BEN2-FAKE-WEIGHTS"), Buffer.alloc(4096, 9)]));
  const stray = service.createBackgroundRemovalService({ dataDir: path.join(workDir, "stray-data"), fetchImpl: fakeFetch, bundledModelDir: emptyBundle });
  await stray.checkForUpdate();
  await assert.rejects(
    () => stray.importModelFile(strayFile),
    (error) => error.code === "model_hash_mismatch",
    "只有出厂内置或上游发布过的版本可以导入",
  );
  assert.ok(upstreamRequests.length >= 2, "检查更新要真的去问发布源");

  const realModel = findRealModel();
  if (!realModel) {
    console.log("Background removal service checks passed (会真实推理的部分已跳过：本机没有 BEN2 权重文件)。");
    return;
  }

  const imported = await instance.importModelFile(realModel);
  assert.equal(imported.installed, true);
  assert.match(imported.source, /import/);
  assert.equal(instance.listModels()[0].installed, true);
  assert.ok(fs.existsSync(path.join(instance.storeDirectory, "ben2-base-1.0.0.json")), "导入后写入元数据");

  // 正常路线跑内置权重：不下载、不导入，直接推理。
  const subject = await makeSubjectImage();
  const prepared = await bundledInstance.prepare(subject);
  assert.equal(prepared.width, 256);
  assert.equal(prepared.height, 256);
  assert.ok(prepared.coverage.opaqueRatio > 0.1, "真实推理必须抠出主体，不能是全透明或全不透明");
  assert.ok(prepared.coverage.opaqueRatio < 0.6);
  const preparedAgain = await bundledInstance.prepare(subject);
  assert.equal(preparedAgain.token, prepared.token, "同一张图重复请求命中缓存，不重复推理");
  assert.equal(preparedAgain.cached, true);

  const maskPng = await bundledInstance.maskPng(prepared.token);
  const maskMeta = await sharp(maskPng).metadata();
  assert.equal(maskMeta.width, 256);
  assert.equal(maskMeta.height, 256);
  const alpha = await bundledInstance.applySettings(prepared.token, { mode: "subject", settings: { background: 18, foreground: 78, edge: 2, feather: 8 } });
  const cutoutMeta = await sharp(alpha.buffer).metadata();
  assert.equal(cutoutMeta.hasAlpha, true, "导出必须是带透明通道的 PNG");
  assert.equal(cutoutMeta.width, 256);
  assert.equal(cutoutMeta.height, 256);
  // 原始掩膜与 refine 后的掩膜都是 1 像素 1 字节，长度必须等于宽 × 高
  assert.equal(alpha.alpha.length, 256 * 256);

  const effectResult = await bundledInstance.applySettings(prepared.token, { mode: "effect", settings: { low: 6, high: 190, feather: 18, spill: 86 } });
  assert.equal(effectResult.mode, "effect");
  assert.equal((await sharp(effectResult.buffer).metadata()).hasAlpha, true);

  const direct = await bundledInstance.removeImageBackground(subject, { mode: "subject", settings: { foreground: 90 } });
  assert.equal(direct.width, 256);
  assert.equal((await sharp(direct.buffer).metadata()).hasAlpha, true);

  console.log("Background removal service checks passed.");
}

function findRealModel() {
  const candidates = [
    process.env.AI_OS_BACKGROUND_REMOVAL_TEST_MODEL,
    path.join(__dirname, "..", "assets", "models", "background-removal", "ben2-base-1.0.0.onnx"),
    "F:/DXOS-Portable-0.2.0-win-x64/data/models/background-removal/ben2-base-1.0.0.onnx",
    path.join(dataDir, "models", "background-removal", "ben2-base-1.0.0.onnx"),
  ].filter(Boolean);
  return candidates.find((file) => {
    try {
      return fs.statSync(file).size === 222932053;
    } catch {
      return false;
    }
  }) || "";
}

async function makeSubjectImage() {
  const size = 256;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#f2efe9"/>
    <circle cx="128" cy="128" r="70" fill="#c2452f"/>
  </svg>`;
  return await sharp(Buffer.from(svg)).png().toBuffer();
}
