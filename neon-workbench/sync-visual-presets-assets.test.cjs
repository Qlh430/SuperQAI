"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildAssetPlan } = require("./sync-visual-presets-assets.cjs");

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "visual-preset-asset-plan-"));
const tempRoot = path.resolve(os.tmpdir());
const rootRelative = path.relative(tempRoot, path.resolve(root));
if (path.isAbsolute(rootRelative) || rootRelative === ".." || rootRelative.startsWith(`..${path.sep}`)) {
  throw new Error("Temporary test directory escaped the OS temporary root.");
}
try {
  const characterRoot = path.join(root, "character");
  const cameraRoot = path.join(root, "camera");
  const assetRoot = path.join(root, "public");
  fs.mkdirSync(path.join(characterRoot, "look"), { recursive: true });
  fs.mkdirSync(path.join(cameraRoot, "cameras"), { recursive: true });
  fs.writeFileSync(path.join(characterRoot, "look/LOOK-01.png"), pixel);
  fs.writeFileSync(path.join(characterRoot, "look/LOOK-FAILED.png"), pixel);
  fs.writeFileSync(path.join(cameraRoot, "cameras/camera-01.png"), pixel);
  const cameraTarget = path.join(assetRoot, "camera/cameras/camera-02.webp");
  fs.mkdirSync(path.dirname(cameraTarget), { recursive: true });
  const existingWebp = Buffer.from("keep-existing-target");
  fs.writeFileSync(cameraTarget, existingWebp);

  const entries = [
    {
      id: "LOOK-01", batch: "character", name: "日常",
      sourcePath: "CHARACTER/look/LOOK-01.png",
      previewPath: "/visual-presets/character/look/LOOK-01.webp",
    },
    {
      id: "LOOK-FAILED", batch: "character", name: "失败项",
      sourcePath: "CHARACTER/look/LOOK-FAILED.png",
      previewPath: "/visual-presets/character/look/LOOK-FAILED.webp",
    },
    {
      id: "CAM01", batch: "camera", name: "机身",
      sourcePath: "CAMERA/cameras/camera-01.png",
      previewPath: "/visual-presets/camera/cameras/camera-01.webp",
    },
    {
      id: "CAM02", batch: "camera", name: "机身冲突",
      sourcePath: "CAMERA/cameras/camera-01.png",
      previewPath: "/visual-presets/camera/cameras/camera-02.webp",
    },
  ];
  const manifests = {
    character: { items: [
      { id: "LOOK-01", label: "日常", filePath: "look/LOOK-01.png", status: "done", width: 1, height: 1, sha256: digest(pixel) },
      { id: "LOOK-FAILED", label: "失败项", filePath: "look/LOOK-FAILED.png", status: "failed", width: 1, height: 1, sha256: digest(pixel) },
    ] },
    camera: { items: [
      { id: "CAM01", name: "机身", filePath: "cameras/camera-01.png", status: "completed", imageSize: "1x1" },
      { id: "CAM02", name: "机身冲突", filePath: "cameras/camera-01.png", status: "completed", imageSize: "1x1" },
    ] },
  };
  const plan = buildAssetPlan({
    entries,
    roots: { CHARACTER: characterRoot, CAMERA: cameraRoot },
    manifests,
    assetRoot,
    previousAssets: {
      "/visual-presets/camera/cameras/camera-02.webp": {
        sourceSha256: "different-source",
        thumbnailSha256: digest(existingWebp),
      },
    },
  });

  assert.deepEqual(plan.jobs.map(job => job.entry.id), ["LOOK-01", "CAM01"],
    "仅合格的 done/completed 源图片进入缩略图转换");
  assert.deepEqual(plan.originalJobs.map(job => job.record.id), ["CAM01"],
    "相机高清原图独立进入原图复制清单");
  assert.equal(plan.records[entries[0].previewPath].sourceSha256, digest(pixel));
  assert.equal(plan.records[entries[1].previewPath].reason, "source_failed");
  assert.equal(plan.records[entries[3].previewPath].status, "conflict");
  assert.equal(plan.records[entries[3].previewPath].reason, "source_changed_existing_target_preserved");
  assert.equal(fs.readFileSync(cameraTarget, "utf8"), existingWebp.toString("utf8"),
    "冲突同名目标不被覆盖");
} finally {
  const verified = path.resolve(root);
  const relative = path.relative(tempRoot, verified);
  if (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)) {
    fs.rmSync(verified, { recursive: true, force: true });
  }
}

console.log("sync-visual-presets-assets planning contract passed");
