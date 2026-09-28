"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const checks = [
  "check-image-loading-rules.js",
  "check-image-resource-manager.js",
  "check-server-thumbnails.js",
  "check-image-download-reliability.js",
  "check-image-sync-service.js",
  "check-image-network-reliability-integration.js",
  "check-canvas-image-job-recovery-ui.js",
  "check-image-preview-presentation.js",
  "check-lan-canvas-access.js",
  "check-portable-runtime-manifest.js",
];

for (const check of checks) {
  console.log(`\n[Image reliability] ${check}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, check)], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    console.error(`Image reliability checks failed: ${check}`);
    process.exit(result.status || 1);
  }
}

console.log("\nAll image reliability checks passed.");
