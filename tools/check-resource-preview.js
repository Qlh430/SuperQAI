"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const {
  mediaKind,
  imageRecordSource,
  jobResultSource,
  boardPreviewSource,
  resolveResourcePreview,
  resolveResourceStats,
} = require(path.join(ROOT, "resource-preview.js"));

const failures = [];
function check(label, run) {
  try {
    run();
  } catch (error) {
    failures.push(`${label} :: ${error.message}`);
  }
}

const OUTPUT_IMAGE = "/output/image_abc123.png";
const OUTPUT_VIDEO = "/output/minimax_h3_1.mp4";

/* ------------------------------------------------------------ media kinds */

check("媒体类型：按 mime 优先、按扩展名兜底", () => {
  assert.equal(mediaKind(OUTPUT_IMAGE, "image/png"), "image");
  assert.equal(mediaKind(OUTPUT_VIDEO, "video/mp4"), "video");
  assert.equal(mediaKind(OUTPUT_VIDEO, ""), "video");
  assert.equal(mediaKind("/output/thumbnails/a.webp", ""), "image");
  assert.equal(mediaKind("/output/audio.mp3", ""), "audio");
  assert.equal(mediaKind("/output/noext", ""), "");
  assert.equal(mediaKind(OUTPUT_IMAGE + "?v=2", "image/png"), "image");
});

/* --------------------------------------------------------- source digging */

check("生图历史：取第一张图，src 优先于 savedUrl", () => {
  assert.equal(imageRecordSource({ images: [{ src: "/output/a.png", savedUrl: "/output/b.png" }] }), "/output/a.png");
  assert.equal(imageRecordSource({ images: [{ savedUrl: "/output/b.png" }] }), "/output/b.png");
  assert.equal(imageRecordSource({ images: [] }), "");
  assert.equal(imageRecordSource(null), "");
});

check("图片任务：saved_images 优先于 data", () => {
  assert.equal(jobResultSource({ result: { saved_images: [{ url: OUTPUT_IMAGE }] } }), OUTPUT_IMAGE);
  assert.equal(jobResultSource({ result: { data: [{ local_url: "/output/local.png", url: "https://cdn/x.png" }] } }), "/output/local.png");
  assert.equal(jobResultSource({ result: {} }), "");
  assert.equal(jobResultSource({}), "");
});

check("画布：取预览图数组第一张", () => {
  assert.equal(boardPreviewSource({ previewImages: ["/output/a.png", "/output/b.png"] }), "/output/a.png");
  assert.equal(boardPreviewSource({ previewImage: "/output/c.png" }), "/output/c.png");
  assert.equal(boardPreviewSource(["", "/output/d.png"]), "/output/d.png");
  assert.equal(boardPreviewSource({ previewImages: [] }), "");
});

/* -------------------------------------------------------------- resolver */

check("输出媒体：metadata.url 给出图片缩略图", () => {
  const preview = resolveResourcePreview({
    type: "image",
    refType: "output_media",
    refId: OUTPUT_IMAGE,
    metadata: { url: "/output/thumbnails/a.webp", mimeType: "image/webp" },
  });
  assert.deepEqual(preview, { kind: "image", url: "/output/thumbnails/a.webp", local: true });
});

check("输出媒体：没有 metadata.url 时退回 refId", () => {
  const preview = resolveResourcePreview({
    type: "video",
    refType: "output_media",
    refId: OUTPUT_VIDEO,
    metadata: {},
  });
  assert.deepEqual(preview, { kind: "video", url: OUTPUT_VIDEO, local: true });
});

check("生图历史资源：从 record.images 取图", () => {
  const preview = resolveResourcePreview({
    type: "image",
    refType: "history_image",
    refId: "rec-1",
    metadata: { record: { images: [{ src: OUTPUT_IMAGE, width: 2560, height: 2048 }] } },
  });
  assert.deepEqual(preview, { kind: "image", url: OUTPUT_IMAGE, local: true });
});

check("图片任务资源：用批量任务表解析出图", () => {
  const jobs = new Map([["imgjob_1", { state: "completed", result: { saved_images: [{ url: OUTPUT_IMAGE }] } }]]);
  const preview = resolveResourcePreview(
    { type: "job", refType: "image_job", refId: "imgjob_1", metadata: { boardId: "b", nodeId: "n" } },
    { jobs },
  );
  assert.deepEqual(preview, { kind: "image", url: OUTPUT_IMAGE, local: true });
});

check("图片任务资源：还在跑或失败的任务没有缩略图", () => {
  const jobs = new Map([["imgjob_2", { state: "failed", error: "额度不足" }]]);
  const preview = resolveResourcePreview({ type: "job", refType: "image_job", refId: "imgjob_2" }, { jobs });
  assert.equal(preview, null);
  assert.equal(resolveResourcePreview({ type: "job", refType: "image_job", refId: "missing" }, { jobs }), null);
});

check("画布资源：用画布元数据的预览图", () => {
  const boards = new Map([["board-1", { id: "board-1", previewImages: [OUTPUT_IMAGE] }]]);
  const preview = resolveResourcePreview({ type: "canvas", refType: "canvas", refId: "board-1" }, { boards });
  assert.deepEqual(preview, { kind: "image", url: OUTPUT_IMAGE, local: true });
  assert.equal(resolveResourcePreview({ type: "canvas", refType: "canvas", refId: "board-2" }, { boards }), null);
});

check("对话与音频资源不给缩略图", () => {
  assert.equal(resolveResourcePreview({ type: "chat", refType: "history_chat", refId: "c1" }), null);
  assert.equal(resolveResourcePreview({ type: "audio", refId: "/output/a.mp3", metadata: { url: "/output/a.mp3" } }), null);
});

check("远程地址：local 为 false，交给浏览器直接取", () => {
  const preview = resolveResourcePreview({
    type: "image",
    refType: "output_media",
    refId: "https://cdn.example.com/a.png",
    metadata: { url: "https://cdn.example.com/a.png" },
  });
  assert.equal(preview.local, false);
  assert.equal(preview.kind, "image");
});

check("已删除资源不给缩略图", () => {
  assert.equal(resolveResourcePreview({ type: "image", refType: "output_media", refId: OUTPUT_IMAGE, deletedAt: "2026-01-01" }), null);
});

/* ------------------------------------------------------- card stats */

check("卡片规模：画布卡片带上节点数", () => {
  const boards = new Map([["board-a", { id: "board-a", nodeCount: 12, connectionCount: 7 }]]);
  assert.deepEqual(
    resolveResourceStats({ type: "canvas", refType: "canvas", refId: "board-a" }, { boards }),
    { nodeCount: 12, connectionCount: 7 },
  );
  assert.deepEqual(
    resolveResourceStats({ type: "canvas", refType: "canvas", refId: "board-empty" }, {
      boards: { "board-empty": { id: "board-empty", nodeCount: 0 } },
    }),
    { nodeCount: 0, connectionCount: 0 },
    "空画布也要报 0 个节点，而不是被吞掉",
  );
  assert.deepEqual(
    resolveResourceStats({ type: "canvas", refType: "canvas", refId: "board-legacy" }, {
      boards: { "board-legacy": { id: "board-legacy", nodeCount: "8" } },
    }),
    { nodeCount: 8, connectionCount: 0 },
    "字符串数字也要认",
  );
});

check("卡片规模：只在能确定时给出", () => {
  const boards = new Map([["board-a", { id: "board-a", nodeCount: 3 }]]);
  assert.equal(resolveResourceStats({ type: "canvas", refType: "canvas", refId: "ghost" }, { boards }), null, "仓库里没有这块画布就不标");
  assert.equal(resolveResourceStats({ type: "canvas", refType: "canvas", refId: "board-a" }, {}), null, "没有画布表就不标");
  assert.equal(resolveResourceStats({ type: "image", refType: "output_media", refId: OUTPUT_IMAGE }, { boards }), null, "图片没有节点概念");
  assert.equal(resolveResourceStats({ type: "canvas", refType: "canvas", refId: "board-a", deletedAt: "2026-01-01" }, { boards }), null);
  assert.equal(resolveResourceStats({ type: "canvas", refType: "canvas", refId: "board-a" }, { boards: new Map([["board-a", { id: "board-a" }]]) }), null, "没有 nodeCount 就不硬编一个 0");
});

/* --------------------------------------------------------------- wiring */

check("服务端：资源列表附带 preview，且口令锁定的资源不带图", () => {
  const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const resourceApi = fs.readFileSync(path.join(ROOT, "resource-http-api.js"), "utf8");
  assert.match(server, /require\("\.\/resource-preview"\)/, "服务端要引用缩略图解析模块");
  assert.match(resourceApi, /preview: previewContext && !entry\.access\?\.locked/, "列表接口要输出 preview 并且跳过锁定资源");
  assert.match(resourceApi, /stats: previewContext && !entry\.access\?\.locked/, "列表接口要输出卡片规模信息，锁定的资源也不给");
  assert.match(resourceApi, /resolveStats\(entry\.resource, previewContext\)/, "规模信息要复用同一份批量数据");
  assert.match(server, /readResourcePreviewJobs\(\)/, "任务表要批量取一次");
  assert.match(server, /readResourcePreviewBoards\(\)/, "画布预览要批量取一次");
  // 画布仓库是懒加载单例：一定要走 getCanvasStorage()。裸 repository 只是
  // getCanvasStorage() 的局部变量，写在这里会抛 ReferenceError 被 catch 吞掉，
  // 结果所有画布卡片静默地没有封面。所以只在这段函数体里做断言。
  const boardsStart = server.indexOf("async function readResourcePreviewBoards");
  const boardsEnd = server.indexOf("function getLegacyOwnerUserId");
  assert.ok(boardsStart > 0 && boardsEnd > boardsStart, "能定位到画布预览函数");
  const boardsFunction = server.slice(boardsStart, boardsEnd);
  assert.match(boardsFunction, /getCanvasStorage\(\)\.repository\.listBoards\(\)/, "画布预览要走懒加载的画布仓库");
  assert.doesNotMatch(boardsFunction, /await repository\.listBoards\(\)/, "不要在模块作用域直接用 repository");
  assert.match(boardsFunction, /readLegacyCanvasSummaries\(\)/, "旧版画布文件里的画布也要补进索引，卡片才不会缺节点数");
  assert.match(server, /legacyCanvasSummaryCache\.mtimeMs === stats\.mtimeMs/, "旧版画布摘要按文件 mtime 缓存，不要每次请求都去解析");
});

check("前端：卡片只渲染预览占位，地址交给共享图片管线", () => {
  const client = fs.readFileSync(path.join(ROOT, "account-management-ui.js"), "utf8");
  assert.match(client, /data-resource-preview-src=/, "图片卡要有延迟加载地址");
  assert.match(client, /data-resource-preview-video=/, "视频卡要有封面来源");
  assert.match(client, /imageResources\.observe\(img, source/, "缩略图要交给共享图片管线");
  assert.match(client, /is-preview-failed/, "取图失败要退回类型图标");
  assert.match(client, /bindResourcePreviews\(\);/);
  assert.ok(!/loader-circle/.test(client), "生成任务不该再用转圈图标冒充加载中");
  assert.match(client, /function resourceMetaLabel\(/, "卡片第二行要单独成函数");
  assert.match(client, /个节点/, "画布卡片要标出节点数");
  assert.match(client, /entry\?\.stats\?\.nodeCount/, "节点数取自接口的 stats");
});

check("样式与缓存号：卡片缩略图有样式，资源有版本号", () => {
  const css = fs.readFileSync(path.join(ROOT, "desktop-shell.css"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(css, /\.ai-os-resource-thumb \{/, "缩略图要有铺满卡片的样式");
  assert.match(css, /is-preview-ready/, "加载完成后要隐藏类型图标");
  assert.match(html, /desktop-shell\.css\?v=[A-Za-z0-9._-]+/);
  assert.match(html, /account-management-ui\.js\?v=20260921-share-permission/);
});

if (failures.length) {
  console.error(`resource preview: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log("resource preview: all checks passed");
}
