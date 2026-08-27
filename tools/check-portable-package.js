"use strict";

const fs = require("fs");
const path = require("path");

const sourceRoot = path.resolve(__dirname, "..");
const packageRoot = path.resolve(process.argv[2] || path.join(sourceRoot, "dist", "AI-Studio-Portable"));
const requiredPaths = new Set([
  ".env.example",
  "README.md",
  "index.html",
  "logo.png",
  "package-lock.json",
  "package.json",
  "script.js",
  "server.js",
  "start.bat",
  "styles.css",
  "canvas-agent-model-adapters.js",
  "canvas-agent-llm-connectors.js",
  "canvas-agent-mcp-protocol.js",
  "canvas-agent-mcp-server.js",
  "canvas-agent-verification.js",
  "canvas-spatial-rules.js",
  "canvas-schema.js",
  "canvas-db-worker.js",
  "canvas-repository.js",
  "canvas-legacy-migrator.js",
  "canvas-query-service.js",
  "canvas-command-service.js",
  "canvas-export-service.js",
  "canvas-paged-store.js",
  "canvas-viewport-data-source.js",
  "canvas-media-scheduler.js",
  "canvas-primitive-layer.js",
  "canvas-virtualizer.js",
]);
const visitedSourceFiles = new Set();

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function addBrowserScripts() {
  const indexSource = fs.readFileSync(path.join(sourceRoot, "index.html"), "utf8");
  const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = scriptPattern.exec(indexSource))) {
    const reference = match[1].split(/[?#]/, 1)[0];
    if (!reference || /^(?:[a-z]+:)?\/\//i.test(reference) || reference.startsWith("data:")) {
      continue;
    }
    requiredPaths.add(reference.replace(/^\.\//, "").replace(/^\//, ""));
  }
}

function resolveLocalModule(fromRelativePath, request) {
  const fromDirectory = path.dirname(path.join(sourceRoot, fromRelativePath));
  const basePath = path.resolve(fromDirectory, request);
  const candidates = [basePath, `${basePath}.js`, `${basePath}.json`, path.join(basePath, "index.js")];
  const resolvedPath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

  if (!resolvedPath) {
    throw new Error(`Source dependency cannot be resolved: ${fromRelativePath} -> ${request}`);
  }

  const relativePath = path.relative(sourceRoot, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Source dependency escapes the project root: ${request}`);
  }

  return toPortablePath(relativePath);
}

function addServerDependencies(relativePath) {
  if (visitedSourceFiles.has(relativePath)) {
    return;
  }
  visitedSourceFiles.add(relativePath);
  requiredPaths.add(relativePath);

  if (path.extname(relativePath).toLowerCase() !== ".js") {
    return;
  }

  const source = fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
  const requirePattern = /require\(\s*["'](\.[^"']+)["']\s*\)/g;
  let match;

  while ((match = requirePattern.exec(source))) {
    const dependency = resolveLocalModule(relativePath, match[1]);
    addServerDependencies(dependency);
  }
}

function addProductionDependencies() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  for (const dependencyName of Object.keys(packageJson.dependencies || {})) {
    requiredPaths.add(toPortablePath(path.join("node_modules", dependencyName)));
  }
}

addBrowserScripts();
addServerDependencies("server.js");
addProductionDependencies();

const sourcePackage = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
const launcher = fs.readFileSync(path.join(sourceRoot, "start.bat"), "utf8");
const portableBuilder = fs.readFileSync(path.join(sourceRoot, "build-portable.bat"), "utf8");
if (sourcePackage.engines?.node !== ">=24.13.0 <25") {
  throw new Error("Portable runtime must require the exact Node.js >=24.13.0 <25 engine range.");
}
if (!/major===24&&minor>=13/.test(launcher)) {
  throw new Error("start.bat must reject unsupported Node.js runtimes.");
}
const unlistedRootRuntimeFiles = [...requiredPaths].filter((runtimeFile) => (
  runtimeFile.endsWith(".js")
  && !runtimeFile.startsWith("node_modules/")
  && !runtimeFile.includes("/")
  && !portableBuilder.includes(runtimeFile)
));
if (unlistedRootRuntimeFiles.length) {
  throw new Error(`build-portable.bat does not copy runtime files: ${unlistedRootRuntimeFiles.sort().join(", ")}`);
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

console.log(`Portable package check passed (${requiredPaths.size} required paths).`);
