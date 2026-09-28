"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const target = path.join(__dirname, "../canvas-image-info.js");
const scriptSource = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");
const nameRulesPath = path.join(__dirname, "../canvas-image-name.js");
assert.ok(fs.existsSync(nameRulesPath), "canvas image name rules module exists");
const { ensureUnique } = require(nameRulesPath);
assert.ok(fs.existsSync(target), "canvas hover info module exists");
const { getInfo } = require(target);
const image = (dataset = {}, naturalWidth = 640, naturalHeight = 480, alt = "原图.png") => ({
  dataset, naturalWidth, naturalHeight, alt,
  currentSrc: "http://local.test/thumb.webp",
  getAttribute: name => name === "data-original-src" ? "/output/original.png" : "",
});
assert.deepEqual(getInfo(image({ originalWidth: "3840", originalHeight: "2160", imageQuality: "thumbnail" })),
  { name: "原图.png", dimensions: "3840 × 2160" });
assert.equal(getInfo(image({ imageQuality: "thumbnail" })).dimensions, "尺寸未知", "640px preview must not masquerade as original dimensions");
assert.equal(getInfo(image({ imageQuality: "original" }, 2048, 1536)).dimensions, "2048 × 1536");
assert.deepEqual(getInfo(image(), { name: "图集成员.png", width: 4096, height: 3072 }),
  { name: "图集成员.png", dimensions: "4096 × 3072" });
assert.equal(getInfo(image({ originalWidth: "2000" }), { width: 3000, height: 1500 }).dimensions, "3000 × 1500", "never combine halves from different dimension pairs");
assert.equal(getInfo(image({ originalWidth: "Infinity", originalHeight: "2000" })).dimensions, "尺寸未知");
assert.equal(getInfo(image({}, 0, 0, ""), { source: "/output/%E5%9B%BE%20%231.png?token=hidden" }).name, "图 #1.png");
assert.equal(getInfo(image({}, 0, 0, ""), { source: "data:image/png;base64,secret" }).name, "图片");
assert.equal(getInfo(image({}, 0, 0, "<img src=x onerror=alert(1)>")).name, "<img src=x onerror=alert(1)>", "names are text, not markup");
const transformFunction = scriptSource.match(/function applyCanvasTransformNow\(\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.match(transformFunction, /canvasImageInfo\?\.\s*refresh\(\{\s*immediate:\s*true\s*\}\)/, "canvas transform must refresh image info anchoring immediately");
assert.equal(ensureUnique("生成图", ["生成图"]), "生成图 2");
assert.equal(ensureUnique("生成图", ["生成图", "生成图 2"]), "生成图 3");
assert.equal(ensureUnique("生成图 2", ["生成图", "生成图 2"]), "生成图 3", "existing numeric suffixes increment naturally");
assert.equal(ensureUnique("apple.png", ["apple.png"]), "apple 2.png", "duplicate suffix stays before extension");
assert.equal(ensureUnique("  ", ["图片"]), "图片 2", "blank names use the image fallback");
console.log("Canvas image hover info rules passed.");
