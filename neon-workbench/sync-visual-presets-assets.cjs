"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");

const PREVIEW_MANIFEST = "visual-preset-assets.json";
const successfulStates = new Set(["completed", "done"]);

function readJson(file, fallback = null) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function relativeSource(entry, roots) {
  const [rootName, ...parts] = String(entry.sourcePath || "").split("/");
  const root = roots[rootName];
  return root && parts.length ? path.join(root, ...parts) : "";
}

function safePreviewTarget(assetRoot, previewPath) {
  if (!String(previewPath || "").startsWith("/visual-presets/")) return "";
  const target = path.resolve(assetRoot, previewPath.replace(/^\/visual-presets\//, ""));
  const rel = path.relative(path.resolve(assetRoot), target);
  if (path.isAbsolute(rel) || rel === ".." || rel.startsWith(`..${path.sep}`)) return "";
  return target;
}

function rowName(row) {
  return String(row?.styleName || row?.name || row?.label || "");
}

function manifestPath(row) {
  return String(row?.filePath || row?.file || "");
}

function dimensionsMatch(row, dimensions) {
  if (!dimensions) return false;
  if (Number(row?.width) > 0 && Number(row?.height) > 0) {
    return dimensions.width === Number(row.width) && dimensions.height === Number(row.height);
  }
  const value = String(row?.imageSize || "");
  const match = value.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  return !match || dimensions.width === Number(match[1]) && dimensions.height === Number(match[2]);
}

function buildAssetPlan({ entries, roots, manifests, assetRoot, previousAssets = {} }) {
  const manifestMaps = Object.fromEntries(Object.entries(manifests).map(([batch, manifest]) => [
    batch,
    new Map((manifest?.items || []).map(row => [String(row.id || ""), row])),
  ]));
  const records = {};
  const jobs = [];
  const originalJobs = [];
  const sourceIssues = [];
  const seenTargets = new Set();

  for (const entry of entries) {
    const target = safePreviewTarget(assetRoot, entry.previewPath);
    const record = {
      id: entry.id,
      batch: entry.batch,
      name: entry.name,
      sourcePath: entry.sourcePath,
      previewPath: entry.previewPath,
      status: "missing",
      sourceStatus: "",
    };
    if (!target || seenTargets.has(target)) {
      record.reason = target ? "target_collision" : "invalid_preview_path";
      sourceIssues.push({ id: entry.id, reason: record.reason });
      records[entry.previewPath] = record;
      continue;
    }
    seenTargets.add(target);

    const row = manifestMaps[entry.batch]?.get(String(entry.id));
    const currentState = String(row?.status || entry.taskStatus || "manifest_missing");
    record.sourceStatus = currentState;
    const source = relativeSource(entry, roots);
    if (!row) record.reason = "manifest_entry_missing";
    else if (!successfulStates.has(currentState)) record.reason = `source_${currentState}`;
    else if (!source || !fs.existsSync(source)) record.reason = "source_file_missing";
    else {
      const expectedRelative = String(entry.sourcePath || "").split("/").slice(1).join("/");
      const listedRelative = manifestPath(row).replace(/\\/g, "/");
      const sourceName = rowName(row);
      if (expectedRelative !== listedRelative) record.reason = "source_path_mismatch";
      else if (sourceName && sourceName !== String(entry.name || "")) record.reason = "source_name_mismatch";
      else if (!/\.png$/i.test(source)) record.reason = "source_not_png";
      else {
        const bytes = fs.readFileSync(source);
        const dimensions = pngDimensions(bytes);
        const sourceSha256 = sha256(bytes);
        if (!dimensions || !dimensionsMatch(row, dimensions)) record.reason = "source_dimensions_mismatch";
        else if (row.sha256 && row.sha256 !== sourceSha256) record.reason = "source_sha256_mismatch";
        else {
          record.sourceSha256 = sourceSha256;
          record.sourceWidth = dimensions.width;
          record.sourceHeight = dimensions.height;
          const previous = previousAssets[entry.previewPath];
          if (fs.existsSync(target)) {
            const targetSha256 = sha256(fs.readFileSync(target));
            if (previous?.sourceSha256 && previous.sourceSha256 !== sourceSha256) {
              record.status = "conflict";
              record.reason = "source_changed_existing_target_preserved";
              record.thumbnailSha256 = targetSha256;
            } else if (previous?.thumbnailSha256 && previous.thumbnailSha256 !== targetSha256) {
              record.status = "conflict";
              record.reason = "thumbnail_changed_existing_target_preserved";
              record.thumbnailSha256 = targetSha256;
            } else {
              record.status = "available";
              record.thumbnailSha256 = targetSha256;
              record.delivery = "preserved-existing";
            }
          } else {
            record.status = "queued";
            jobs.push({ entry, source, target, record });
          }

          if (entry.batch === "camera" && record.status !== "conflict") {
            const originalPath = entry.previewPath.replace(/\/(cameras|lenses)\//, "/originals/$1/")
              .replace(/\.webp$/i, ".png");
            const originalTarget = safePreviewTarget(assetRoot, originalPath);
            record.originalPath = originalPath;
            if (originalTarget && fs.existsSync(originalTarget)) {
              const originalSha256 = sha256(fs.readFileSync(originalTarget));
              if (originalSha256 === sourceSha256) record.originalSha256 = originalSha256;
              else {
                record.originalConflict = true;
                record.reason = record.reason || "original_conflict_preserved";
              }
            } else if (originalTarget) {
              record.originalQueued = true;
              originalJobs.push({ source, originalTarget, record });
            }
          }
        }
      }
    }
    if (record.reason && record.status === "missing") sourceIssues.push({ id: entry.id, reason: record.reason });
    records[entry.previewPath] = record;
  }
  return { records, jobs, originalJobs, sourceIssues };
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function manifestTotals(assets) {
  return Object.values(assets).reduce((totals, item) => {
    const bucket = totals[item.batch] ||= { available: 0, missing: 0, conflict: 0 };
    if (item.status === "available") bucket.available += 1;
    else if (item.status === "conflict") bucket.conflict += 1;
    else bucket.missing += 1;
    return totals;
  }, {});
}

async function syncAssets(options = {}) {
  const sourceRoot = path.join(__dirname, "design-sources");
  const library = readJson(path.join(sourceRoot, "visual-preset-library.json"));
  const manifestFile = path.join(sourceRoot, PREVIEW_MANIFEST);
  const previous = readJson(manifestFile, { version: 1, assets: {} });
  const assetRoot = path.join(__dirname, "public/visual-presets");
  const roots = {
    AI_OS_STYLE_PREVIEWS: options.styleRoot || "Q:/音乐/Documents/AI_OS_STYLE_PREVIEWS",
    AI_OS_PRESET_PREVIEWS: options.presetRoot || "Q:/音乐/Documents/AI_OS_PRESET_PREVIEWS",
    AI_OS_CAMERA_PREVIEWS: options.cameraRoot || "Q:/音乐/Documents/AI_OS_CAMERA_PREVIEWS",
    AI_OS_CHARACTER_PREVIEWS: options.characterRoot || "Q:/音乐/Documents/AI_OS_CHARACTER_PREVIEWS",
  };
  const manifests = Object.fromEntries(Object.entries(roots).map(([name, root]) => [
    name.replace(/^AI_OS_/, "").replace(/_PREVIEWS$/, "").toLowerCase(),
    readJson(path.join(root, "manifest.json")),
  ]));
  const normalizedManifests = Object.fromEntries(["style", "preset", "camera", "character"].map(batch => [
    batch,
    manifests[batch] || null,
  ]));
  const plan = buildAssetPlan({
    entries: library.entries,
    roots,
    manifests: normalizedManifests,
    assetRoot,
    previousAssets: previous.assets,
  });
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    assets: plan.records,
    issues: plan.sourceIssues,
    totals: manifestTotals(plan.records),
  };
  atomicWriteJson(manifestFile, next);

  if (plan.jobs.length) {
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.AI_OS_TEST_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    });
    try {
      const page = await browser.newPage();
      let converted = 0;
      for (const job of plan.jobs) {
        const { entry, source, target, record } = job;
        if (fs.existsSync(target)) {
          record.status = "conflict";
          record.reason = "target_appeared_during_sync_preserved";
          continue;
        }
        const bytes = fs.readFileSync(source);
        const mime = "image/png";
        const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
        const maxSide = entry.batch === "character" ? 320 : 480;
        const output = await page.evaluate(async ({ dataUrl: input, maxSide: limit }) => {
          const image = new Image();
          image.src = input;
          await image.decode();
          const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
          return {
            bytes: canvas.toDataURL("image/webp", 0.84).split(",")[1],
            width: canvas.width,
            height: canvas.height,
          };
        }, { dataUrl, maxSide });
        const webpBytes = Buffer.from(output.bytes, "base64");
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, webpBytes, { flag: "wx" });
        record.thumbnailSha256 = sha256(webpBytes);
        record.thumbnailWidth = output.width;
        record.thumbnailHeight = output.height;
        record.status = "available";
        record.delivery = "created";
        converted += 1;

        atomicWriteJson(manifestFile, {
          version: 1,
          updatedAt: new Date().toISOString(),
          assets: plan.records,
          issues: plan.sourceIssues,
          totals: manifestTotals(plan.records),
        });
        if (converted % 25 === 0 || converted === plan.jobs.length) {
          console.log(`预览缩略图转换进度：${converted}/${plan.jobs.length}`);
        }
      }
    } finally {
      await browser.close();
    }
  }
  for (const job of plan.originalJobs) {
    const { originalTarget, source, record } = job;
    if (!fs.existsSync(originalTarget)) {
      fs.mkdirSync(path.dirname(originalTarget), { recursive: true });
      fs.copyFileSync(source, originalTarget, fs.constants.COPYFILE_EXCL);
    }
    const originalSha256 = sha256(fs.readFileSync(originalTarget));
    if (originalSha256 === record.sourceSha256) record.originalSha256 = originalSha256;
    else record.originalConflict = true;
    delete record.originalQueued;
    atomicWriteJson(manifestFile, {
      version: 1,
      updatedAt: new Date().toISOString(),
      assets: plan.records,
      issues: plan.sourceIssues,
      totals: manifestTotals(plan.records),
    });
  }

  next.updatedAt = new Date().toISOString();
  next.totals = manifestTotals(plan.records);
  atomicWriteJson(manifestFile, next);
  console.log(JSON.stringify({
    created: plan.jobs.filter(job => plan.records[job.entry.previewPath].delivery === "created").length,
    totals: next.totals,
    issues: plan.sourceIssues.length,
    output: assetRoot,
    manifest: manifestFile,
  }, null, 2));
  return next;
}

if (require.main === module) syncAssets().catch(error => {
  console.error(`预览资源同步失败：${error.message}`);
  process.exitCode = 1;
});

module.exports = { syncAssets, buildAssetPlan };
