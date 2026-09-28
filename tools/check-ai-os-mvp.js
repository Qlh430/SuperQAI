"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const checks = [
  ["tools/check-auth-crypto.js"],
  ["--disable-warning=ExperimentalWarning", "tools/check-system-db.js"],
  ["--disable-warning=ExperimentalWarning", "tools/check-auth-service.js"],
  ["tools/check-auth-endpoint.js"],
  ["--disable-warning=ExperimentalWarning", "tools/check-resource-access.js"],
  ["tools/check-resource-endpoint.js"],
  ["tools/check-files-app.js"],
  ["--disable-warning=ExperimentalWarning", "tools/check-backup-service.js"],
  ["tools/check-desktop-window-manager.js"],
  ["tools/check-desktop-app-runtime.js"],
  ["tools/check-ai-os-shell.js"],
  ["tools/check-host-launcher.js"],
  ["tools/check-portable-runtime-manifest.js"],
];

for (const args of checks) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}

if (!process.exitCode) console.log("AI OS MVP acceptance checks passed.");
