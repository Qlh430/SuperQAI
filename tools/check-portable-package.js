"use strict";

const fs = require("fs");
const path = require("path");
const { collectPortablePackageManifest, toPortablePath } = require("./portable-package-manifest");

const sourceRoot = path.resolve(__dirname, "..");
const packageRoot = path.resolve(process.argv[2] || path.join(sourceRoot, "dist", "AI-Studio-Portable"));
if (fs.existsSync(path.join(packageRoot, "ai-os-portable.json"))) {
  require("./build-electron-portable").inspectPortablePackage(packageRoot);
  console.log("Electron portable package check passed.");
  process.exit(0);
}
const requiredPaths = new Set(collectPortablePackageManifest(sourceRoot).files);

const sourcePackage = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
const launcher = fs.readFileSync(path.join(sourceRoot, "start.bat"), "utf8");
const portableBuilder = fs.readFileSync(path.join(sourceRoot, "build-portable.bat"), "utf8");
if (sourcePackage.engines?.node !== ">=24.13.0 <25") {
  throw new Error("Portable runtime must require the exact Node.js >=24.13.0 <25 engine range.");
}
if (!/major===24&&minor>=13/.test(launcher)) {
  throw new Error("start.bat must reject unsupported Node.js runtimes.");
}
if (!/(?:copy-portable-runtime|build-electron-portable)\.js/i.test(portableBuilder)) {
  throw new Error("build-portable.bat must invoke a verified portable builder.");
}

const missingPaths = [...requiredPaths]
  .filter((relativePath) => !fs.existsSync(path.join(packageRoot, relativePath)))
  .sort();

if (missingPaths.length > 0) {
  console.error(`Portable package is incomplete: ${packageRoot}`);
  for (const relativePath of missingPaths) {
    console.error(`  missing: ${relativePath}`);
  }
  process.exit(1);
}

if (fs.existsSync(path.join(packageRoot, ".env"))) {
  throw new Error("Portable package must not contain .env or real API credentials.");
}
if (fs.existsSync(path.join(packageRoot, "data", "outbound-route-state.json"))) {
  throw new Error("Portable package must not copy machine-specific outbound route learning.");
}

const packagedServer = fs.readFileSync(path.join(packageRoot, "server.js"), "utf8");
if (!/networkMode:\s*normalizeRouteMode/.test(packagedServer)) {
  throw new Error("Portable settings must preserve each provider networkMode.");
}
if (!/outbound-route-state\.json/.test(packagedServer)) {
  throw new Error("Portable runtime must recreate outbound route learning on the target computer.");
}

const packagedToolsDirectory = path.join(packageRoot, "tools");
const packagedToolFiles = fs.existsSync(packagedToolsDirectory)
  ? fs.readdirSync(packagedToolsDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => toPortablePath(path.relative(packagedToolsDirectory, path.join(entry.parentPath, entry.name))))
  : [];
const unexpectedToolFiles = packagedToolFiles.filter((name) => name !== "compact-canvas-data.js");
if (unexpectedToolFiles.length) {
  throw new Error(`Portable package contains development-only tools: ${unexpectedToolFiles.slice(0, 10).join(", ")}`);
}

function collectTextFiles(directory, collected = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectTextFiles(fullPath, collected);
    else if (/\.(?:js|json|html|css|md|txt|bat|example)$/i.test(entry.name)) collected.push(fullPath);
  }
  return collected;
}

const embeddedSecretFiles = collectTextFiles(packageRoot).filter((file) => (
  /\bsk-[a-z0-9_-]{16,}\b/i.test(fs.readFileSync(file, "utf8"))
));
if (embeddedSecretFiles.length) {
  throw new Error(`Portable package contains embedded API credentials: ${embeddedSecretFiles.map((file) => toPortablePath(path.relative(packageRoot, file))).join(", ")}`);
}

const credentialedProxyFiles = collectTextFiles(packageRoot).filter((file) => (
  /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/i.test(fs.readFileSync(file, "utf8"))
));
if (credentialedProxyFiles.length) {
  throw new Error(`Portable package contains a proxy URL with embedded credentials: ${credentialedProxyFiles.map((file) => toPortablePath(path.relative(packageRoot, file))).join(", ")}`);
}

console.log(`Portable package check passed (${requiredPaths.size} required paths).`);
