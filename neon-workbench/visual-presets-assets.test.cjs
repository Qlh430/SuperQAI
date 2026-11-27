"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileGeneratorComposer, mappedAsset } = require("./visual-presets-build.cjs");

const compiled = compileGeneratorComposer(__dirname);
assert.doesNotMatch(compiled, /data:image\/[^;]+;base64,/, "生产脚本不能内嵌图片 Base64");
const loadedWindow = {};
const install = compiled.indexOf("(function installFloraVisualPresets");
require("node:vm").runInNewContext(compiled.slice(0, install), { window: loadedWindow, globalThis: loadedWindow });
const real01 = loadedWindow.FloraVisualPresetConfig.presets.find(preset => preset.libraryId === "R01");
const function01 = loadedWindow.FloraVisualPresetConfig.presets.find(preset => preset.libraryId === "FN01");
const failedFunction = loadedWindow.FloraVisualPresetConfig.presets.find(preset => preset.libraryId === "FN10");
const missingCamera = loadedWindow.FloraVisualPresetConfig.presets.find(preset => preset.libraryId === "CAM01");
assert.equal(real01.thumbnail, "/visual-presets/style/real/real-01.webp");
assert.equal(real01.assetStatus, "available");
assert.equal(function01.thumbnail, "/visual-presets/preset/functions/preset-function-01.webp");
assert.equal(function01.assetStatus, "available");
assert.equal(failedFunction.assetStatus, "missing", "失败的功能预设保留选项并继续使用占位");
assert.equal(missingCamera.assetStatus, "missing", "没有摄像机原图时不伪造缩略图");
assert.equal(missingCamera.previewSource || "", "", "没有摄像机原图时不设置高清预览地址");

const assetRoot = path.join(__dirname, "public/visual-presets");
const assetManifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, "design-sources/visual-preset-assets.json"),
  "utf8",
));
const characterManifest = JSON.parse(fs.readFileSync(
  "Q:/音乐/Documents/AI_OS_CHARACTER_PREVIEWS/manifest.json",
  "utf8",
));
const characterDoneCount = characterManifest.items.filter(item => item.status === "done").length;
assert.ok(fs.existsSync(assetRoot), "应用静态目录应保存轻量预览缩略图");
const previews = [];
function visit(directory, bucket = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file, bucket || entry.name);
    else if (/\.webp$/i.test(entry.name)) previews.push({ file, bucket });
  }
}
visit(assetRoot);
assert.equal(previews.filter(item => item.bucket === "style" || item.bucket === "preset").length, 109,
  "已有 109 张风格与预设缩略图应保留");
assert.equal(previews.filter(item => item.bucket === "character").length, characterDoneCount,
  "已验证角色缩略图数量须与最新 manifest 一致");
assert.ok(previews.every(item => fs.statSync(item.file).size < 350_000), "缩略图应保持轻量");
const characterEntries = JSON.parse(fs.readFileSync(
  path.join(__dirname, "design-sources/visual-preset-library.json"),
  "utf8",
)).entries.filter(entry => entry.batch === "character");
assert.equal(characterEntries.filter(entry => assetManifest.assets[entry.previewPath]?.status === "available").length, characterDoneCount,
  "角色缩略图数量必须跟随最新 manifest 的 SHA 校验通过项");
assert.ok(characterEntries.filter(entry => assetManifest.assets[entry.previewPath]?.status === "available")
  .every(entry => assetManifest.assets[entry.previewPath].sourceSha256
    && assetManifest.assets[entry.previewPath].thumbnailSha256),
"角色原图与缩略图都应记录内容 SHA-256");
assert.deepEqual(assetManifest.totals.camera, { available: 0, missing: 12, conflict: 0 },
  "相机素材目录和 manifest 缺失时，12 项保持占位");
const compiledCamera = loadedWindow.FloraVisualPresetConfig.presets.find(preset => preset.libraryId === "CAM01");
assert.equal(compiledCamera.previewSource || "", "", "无摄像机原图时不暴露虚假的高清地址");
assert.equal(compiledCamera.name, "Hasselblad X2D 100C（哈苏）", "相机稳定 ID 使用原始型号全名");
const cameraEntries = loadedWindow.FloraVisualPresetConfig.presets.filter(preset => ["camera", "lens"].includes(preset.group));
assert.equal(cameraEntries.filter(preset => ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05", "CAM06", "LEN01", "LEN02", "LEN03", "LEN04", "LEN05", "LEN06"].includes(preset.libraryId)).length, 12);
assert.ok(compiled.includes("/visual-presets/style/real/real-01.webp"));
assert.ok(compiled.includes("/visual-presets/preset/filters/general/filter-general-01.webp"));
assert.ok(compiled.includes("/visual-presets/character/look/costume/LOOK-COSTUME-01.webp"));

const tempAssetRoot = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "visual-preset-assets-"));
const cameraThumb = path.join(tempAssetRoot, "camera", "cameras", "camera-01.webp");
const cameraOriginal = path.join(tempAssetRoot, "camera", "originals", "cameras", "camera-01.png");
fs.mkdirSync(path.dirname(cameraThumb), { recursive: true });
fs.mkdirSync(path.dirname(cameraOriginal), { recursive: true });
fs.writeFileSync(cameraThumb, Buffer.from("thumbnail"));
fs.writeFileSync(cameraOriginal, Buffer.from("original"));
const sourceSha256 = require("node:crypto").createHash("sha256").update(Buffer.from("original")).digest("hex");
const mappedCamera = mappedAsset({
  id: "CAM01",
  batch: "camera",
  previewPath: "/visual-presets/camera/cameras/camera-01.webp",
}, tempAssetRoot, {
  assets: {
    "/visual-presets/camera/cameras/camera-01.webp": {
      status: "available",
      sourcePath: "AI_OS_CAMERA_PREVIEWS/cameras/camera-01.png",
      sourceSha256,
      thumbnailSha256: require("node:crypto").createHash("sha256").update(Buffer.from("thumbnail")).digest("hex"),
    },
  },
});
assert.equal(mappedCamera.previewSource, "/visual-presets/camera/originals/cameras/camera-01.png",
  "camera sourceSha256 must map to the verified original path");

console.log("visual-presets-assets contract passed");
