"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const localModels = require("../local-models-ui");

const ROOT = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

const settings = read("system-settings-ui.js");
const css = read("system-settings.css");
const server = require("./server-source").readServerSource();
const backgroundRemovalHttp = read("background-removal-http-api.js");
const html = read("index.html");
const service = read("background-removal-service.js");

const BUNDLED_HASH = "22cea62108ff53b7ccc20f7a008bf30494228d84b1687f29ecbe76936a998101";
const REMOTE_HASH = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function modelPayload(overrides = {}) {
  return {
    id: "ben2-base",
    name: "BEN2 Base",
    description: "通用前景分割模型，人物、商品、动物都能抠，纯 CPU 运行。",
    version: "1.0.0",
    size: 222932053,
    installed: true,
    source: "bundled",
    stored: false,
    bundled: true,
    bundledAvailable: true,
    external: false,
    sha256: BUNDLED_HASH,
    upstreamRepository: "PramaLLC/BEN2",
    upstreamLicense: "MIT",
    upstream: null,
    error: null,
    ...overrides,
  };
}

// ── 纯函数：体积与短校验值的展示格式 ───────────────────────────────
assert.equal(localModels.create({ root: {}, request: async () => ({}) }).formatBytes(222932053), "213 MB");
assert.equal(localModels.create({ root: {}, request: async () => ({}) }).shortHash(BUNDLED_HASH), "22cea621");

async function main() {
  // ── 1. 首次进入：还没读到状态时给加载提示，而不是空白 ───────────────
  const calls = [];
  let payload = { models: [modelPayload()] };
  const request = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body || null });
    return payload;
  };
  let renders = 0;
  const notes = [];
  const ui = localModels.create({
    root: { querySelector: () => null },
    request,
    notify: (message) => notes.push(message),
    render: () => { renders += 1; },
  });

  assert.match(ui.markup(), /正在读取模型状态/, "未加载时先给加载态");
  const clickCheck = () => ({ target: { closest: (selector) => (selector === "[data-local-model-check]" ? {} : null) } });
  const clickUpdate = () => ({ target: { closest: (selector) => (selector === "[data-local-model-update]" ? {} : null) } });
  const clickReset = () => ({ target: { closest: (selector) => (selector === "[data-local-model-reset]" ? {} : null) } });

  // ── 2. 内置且已是最新：不出现任何更新按钮 ──────────────────────────
  await ui.load();
  assert.equal(calls.at(-1).url, "/api/background-removal/models");
  let markup = ui.markup();
  assert.match(markup, /data-local-model="ben2-base"/);
  assert.match(markup, /随应用内置/, "要写明当前生效的是内置权重");
  assert.match(markup, /已就绪/);
  assert.match(markup, /213 MB/, "要展示权重体积");
  assert.match(markup, /PramaLLC\/BEN2/, "要展示上游发布源");
  assert.equal(markup.includes("下载更新"), false, "已是最新时不该出现下载更新");
  assert.equal(markup.includes("data-local-model-reset"), false, "没下载过更新时不该出现回退按钮");
  assert.equal(markup.includes(".env 里 AI_OS_BACKGROUND_REMOVAL_MODEL_PATH"), false);

  // ── 3. 上游有新版：出现「可更新」和下载按钮 ─────────────────────────
  payload = {
    models: [modelPayload({ upstream: { sha256: REMOTE_HASH, size: 222932053, checkedAt: "2026-09-18T02:00:00.000Z" } })],
  };
  await ui.load();
  markup = ui.markup();
  assert.match(markup, /可更新/);
  assert.match(markup, /data-local-model-update/, "有新版时必须能点下载更新");
  assert.match(markup, /bbbbbbbb/, "要展示上游版本的校验值");

  // ── 4. 已下载的更新：出现「恢复内置版本」 ──────────────────────────
  payload = { models: [modelPayload({ source: "update", stored: true, sha256: REMOTE_HASH })] };
  await ui.load();
  markup = ui.markup();
  assert.match(markup, /已下载的更新/);
  assert.match(markup, /data-local-model-reset/, "下载过更新后要能回退内置版本");

  // ── 5. .env 指定了自定义路径：说明更新不会生效，并且不给下载按钮 ────
  payload = { models: [modelPayload({ source: "external", external: true, upstream: { sha256: REMOTE_HASH, size: 1, checkedAt: "" } })] };
  await ui.load();
  markup = ui.markup();
  assert.match(markup, /AI_OS_BACKGROUND_REMOVAL_MODEL_PATH/, "外部路径优先级最高必须说明");
  assert.equal(markup.includes("data-local-model-update"), false, "外部权重生效时下载更新没有意义");

  // ── 6. 点「检查更新」→ 走检查接口，并把结果写成提示 ────────────────
  payload = { models: [modelPayload()] };
  await ui.load();
  payload = {
    model: modelPayload({ upstream: { sha256: REMOTE_HASH, size: 222932053, checkedAt: "2026-09-18T02:00:00.000Z" } }),
    remote: { sha256: REMOTE_HASH, size: 222932053, publishedAt: "2026-09-18T00:00:00.000Z" },
    updateAvailable: true,
  };
  assert.equal(await ui.onClick(clickCheck()), true);
  assert.deepEqual(calls.at(-1), { url: "/api/background-removal/models/check", method: "POST", body: { id: "ben2-base" } });
  markup = ui.markup();
  assert.match(markup, /上游有新版本/, "检查结果要落在界面上");
  assert.match(markup, /data-local-model-update/);

  // ── 7. 点「下载更新」→ 走下载接口，并提示已完成 ─────────────────────
  payload = { model: modelPayload({ source: "update", stored: true, sha256: REMOTE_HASH }), remote: { sha256: REMOTE_HASH, size: 222932053 } };
  assert.equal(await ui.onClick(clickUpdate()), true);
  assert.equal(calls.at(-1).url, "/api/background-removal/models/update");
  assert.match(ui.markup(), /更新完成/);
  assert.deepEqual(notes, ["抠图模型已更新"]);

  // ── 8. 点「恢复内置版本」→ 走 reset 接口 ───────────────────────────
  payload = { removed: true, model: modelPayload() };
  assert.equal(await ui.onClick(clickReset()), true);
  assert.equal(calls.at(-1).url, "/api/background-removal/models/reset");
  assert.match(ui.markup(), /改回使用随应用内置的版本/);

  // ── 9. 检查失败（离线/代理不通）要显示原因，而不是静默失败 ──────────
  const failing = localModels.create({
    root: { querySelector: () => null },
    request: async () => { throw new Error("连不上模型发布源（PramaLLC/BEN2）"); },
    notify: () => {},
    render: () => {},
  });
  await failing.load();
  await failing.onClick(clickCheck());
  assert.match(failing.markup(), /检查更新失败：连不上模型发布源/);

  assert.ok(renders > 0, "状态变化后必须触发重绘");
  ui.leave();
  ui.dispose();
  console.log("Local model management UI checks passed.");
}

// ── 设置界面接线 ────────────────────────────────────────────────────
assert.ok(localModels.create({}).SOURCE_LABELS.bundled, "内置来源要有中文标签");
assert.match(settings, /\{ id: "models", label: "本地模型"/, "设置里要有本地模型分区");
assert.match(settings, /const localModels = localModelsUi\.create\(\{ root: host, request: options\.request/);
assert.match(settings, /if \(state\.section === "models" && isAdmin\(\)\) return localModels\.markup\(\);/);
assert.match(settings, /if \(isAdmin\(\) && state\.section === "models" && await localModels\.onClick\(event\)\) return;/);
assert.match(settings, /localModels\.dispose\(\);/, "关闭设置要停掉进度轮询");
assert.match(html, /<script src="\.\/local-models-ui\.js/, "页面要加载本地模型管理模块");
assert.match(css, /\.settings-local-model-page \.settings-update-heading > strong\[data-kind="warning"\]/);

// ── 服务端接口与下载来源 ────────────────────────────────────────────
assert.match(server, /createBackgroundRemovalService\(\{ dataDir: DATA_DIR, fetchImpl: fetch \}\)/, "模型更新要走带代理自动选择的 fetch");
assert.match(backgroundRemovalHttp, /pathname === "\/api\/background-removal\/models\/check"/);
assert.match(backgroundRemovalHttp, /pathname === "\/api\/background-removal\/models\/update"/);
assert.match(backgroundRemovalHttp, /pathname === "\/api\/background-removal\/models\/update\/progress"/);
assert.match(backgroundRemovalHttp, /pathname === "\/api\/background-removal\/models\/reset"/);
assert.match(backgroundRemovalHttp, /service\.downloadUpdate\(payload\.id \|\| undefined/);
assert.match(backgroundRemovalHttp, /service\.removeStoredModel\(payload\.id \|\| undefined\)/);
assert.match(service, /repository: "PramaLLC\/BEN2"/, "更新源必须是官方仓库");
assert.match(service, /AI_OS_BACKGROUND_REMOVAL_DOWNLOAD_URL/, "下载地址要能用环境变量换成镜像");
assert.match(service, /AI_OS_BACKGROUND_REMOVAL_UPSTREAM_URL/, "发布源地址要能用环境变量换成镜像");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
