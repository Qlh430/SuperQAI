"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");

// Import only configured preview files. Original assets and user media stay in place.
async function syncPreviews(assetRoot = "Q:/assets") {
  const source = path.join(__dirname, "design-sources");
  const output = path.join(source, "visual-preset-previews.json");
  const { presets } = JSON.parse(fs.readFileSync(path.join(source, "visual-presets.json"), "utf8"));
  const previous = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : { version: 1, images: {} };
  const images = { ...previous.images };
  const imports = [];
  for (const preset of presets) {
    if (!preset.thumbnail?.startsWith("asset:")) continue;
    const relative = preset.thumbnail.slice(6);
    const file = path.resolve(assetRoot, relative);
    const within = path.relative(path.resolve(assetRoot), file);
    if (path.isAbsolute(within) || within.startsWith("..") || !/\.(png|jpe?g|webp)$/i.test(file)) {
      throw new Error(`预览资源路径无效：${preset.id}`);
    }
    if (!fs.existsSync(file)) continue;
    const maxSide = relative.startsWith("visual-presets/role/") ? 320 : 480;
    const bytes = fs.readFileSync(file);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const cached = images[preset.thumbnail];
    if (cached?.sha256 === sha256 && (maxSide !== 320 || cached.maxSide === maxSide)) continue;
    const mime = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg";
    imports.push({
      key: preset.thumbnail,
      sha256,
      maxSide,
      source: `data:${mime};base64,${bytes.toString("base64")}`,
    });
  }
  if (imports.length) {
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.AI_OS_TEST_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    });
    try {
      const page = await browser.newPage();
      await page.route("**/*", route => route.abort());
      for (const item of imports) {
        const dataUrl = await page.evaluate(async ({ source, maxSide }) => {
          const image = new Image();
          image.src = source;
          await image.decode();
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height), 360 / image.height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/webp", 0.82);
        }, { source: item.source, maxSide: item.maxSide });
        images[item.key] = { sha256: item.sha256, maxSide: item.maxSide, dataUrl };
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(output, JSON.stringify({ version: 1, images }, null, 2) + "\n");
  console.log(JSON.stringify({ imported: imports.length, available: Object.keys(images).length, output }));
}

if (require.main === module) syncPreviews(process.argv[2]).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { syncPreviews };
