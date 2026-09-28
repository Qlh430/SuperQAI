"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FIXED_PORTABLE_FILES = Object.freeze([
  ".env.example",
  "README.md",
  "index.html",
  "logo.png",
  "package-lock.json",
  "package.json",
  "start.bat",
  "styles.css",
  "canvas-agent.css",
  "desktop-shell.css",
  "install-host-shortcut.bat",
  "install-host-shortcut.ps1",
]);

const PORTABLE_DIRECTORIES = Object.freeze([
  "assets",
  "bundled-skills",
  "workflows",
  "skills",
  "desktop",
  "runtime",
  "node_modules/electron/dist",
]);

const DEV_RELOAD_COMPAT_FILE = "desktop/dev-reload.js";
const DEV_RELOAD_COMPAT_CONTENT = '"use strict";\nmodule.exports = Object.freeze({});\n';

const EXCLUDED_PORTABLE_FILES = Object.freeze(new Set([
  DEV_RELOAD_COMPAT_FILE,
]));

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function normalizePortableRelativePath(value, label = "Portable path") {
  const original = String(value || "").trim().replace(/\\/g, "/");
  if (!original || original.startsWith("//") || /^[A-Za-z]:\//.test(original)) {
    throw new Error(`${label} escapes the project root: ${value}`);
  }
  const withoutLeadingSlash = original.replace(/^\/+/, "").replace(/^(?:\.\/)+/, "");
  if (!withoutLeadingSlash || withoutLeadingSlash.split("/").some((segment) => segment === "..")) {
    throw new Error(`${label} escapes the project root: ${value}`);
  }
  const normalized = path.posix.normalize(withoutLeadingSlash);
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.startsWith("/")) {
    throw new Error(`${label} escapes the project root: ${value}`);
  }
  return normalized;
}

function isWithinRoot(sourceRoot, candidatePath) {
  const relativePath = path.relative(sourceRoot, candidatePath);
  return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function resolveLocalModule(sourceRoot, fromRelativePath, request) {
  const fromDirectory = path.dirname(path.join(sourceRoot, fromRelativePath));
  const basePath = path.resolve(fromDirectory, request);
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.json`,
    path.join(basePath, "index.js"),
  ];
  const resolvedPath = candidates.find((candidate) => (
    fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  ));

  if (!resolvedPath) {
    throw new Error(`Source dependency cannot be resolved: ${fromRelativePath} -> ${request}`);
  }
  const sourceRootRealPath = fs.realpathSync(sourceRoot);
  const resolvedRealPath = fs.realpathSync(resolvedPath);
  if (!isWithinRoot(sourceRootRealPath, resolvedRealPath)) {
    throw new Error(`Source dependency escapes the project root: ${request}`);
  }
  if (fs.lstatSync(resolvedPath).isSymbolicLink()) {
    throw new Error(`Source dependency must not be a symbolic link: ${request}`);
  }

  return toPortablePath(path.relative(sourceRoot, resolvedPath));
}

function addBrowserAssets(sourceRoot, requiredPaths) {
  const indexSource = fs.readFileSync(path.join(sourceRoot, "index.html"), "utf8");
  const sources = [indexSource];
  const moduleManifest = path.join(sourceRoot, "module-manifest.js");
  if (fs.existsSync(moduleManifest)) sources.push(fs.readFileSync(moduleManifest, "utf8"));

  for (const source of sources) {
    const scriptPattern = source === indexSource
      ? /<(?:script\b[^>]*\bsrc|link\b[^>]*\bhref)=["']([^"']+)["'][^>]*>/gi
      : /["'](\.\/[^"']+)["']/g;
    let match;
    while ((match = scriptPattern.exec(source))) {
      const reference = match[1].split(/[?#]/, 1)[0];
      if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) {
        continue;
      }
      requiredPaths.add(normalizePortableRelativePath(reference, "Browser asset path"));
    }
  }
}

function addServerDependencies(sourceRoot, relativePath, requiredPaths, visitedSourceFiles) {
  if (visitedSourceFiles.has(relativePath)) return;
  visitedSourceFiles.add(relativePath);
  requiredPaths.add(relativePath);

  if (path.extname(relativePath).toLowerCase() !== ".js") return;

  const source = fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
  const requirePattern = /require\(\s*["'](\.[^"']+)["']\s*\)/g;
  let match;

  while ((match = requirePattern.exec(source))) {
    const dependency = resolveLocalModule(sourceRoot, relativePath, match[1]);
    addServerDependencies(sourceRoot, dependency, requiredPaths, visitedSourceFiles);
  }
}

function addProductionDependencies(sourceRoot, requiredPaths) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  const visited = new Set();
  function visit(dependencyName, fromDirectory, optional = false) {
    let directory = fromDirectory;
    let dependencyPath;
    while (directory === sourceRoot || isWithinRoot(sourceRoot, directory)) {
      const candidate = path.join(directory, "node_modules", dependencyName);
      if (fs.existsSync(candidate)) { dependencyPath = candidate; break; }
      directory = path.dirname(directory);
    }
    if (!dependencyPath) {
      if (optional) return;
      throw new Error(`Required production dependency is missing: ${dependencyName}`);
    }
    if (visited.has(dependencyPath)) return;
    visited.add(dependencyPath);
    requiredPaths.add(toPortablePath(path.relative(sourceRoot, dependencyPath)));
    const metadataPath = path.join(dependencyPath, "package.json");
    if (!fs.existsSync(metadataPath)) return;
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    for (const name of new Set([...Object.keys(metadata.dependencies || {}), ...Object.keys(metadata.optionalDependencies || {})])) {
      visit(name, dependencyPath, Object.hasOwn(metadata.optionalDependencies || {}, name));
    }
  }
  for (const name of Object.keys(packageJson.dependencies || {})) visit(name, sourceRoot);
}

function collectPortablePackageManifest(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const requiredPaths = new Set(FIXED_PORTABLE_FILES);

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && [".js", ".css"].includes(path.extname(entry.name).toLowerCase())) {
      requiredPaths.add(entry.name);
    }
  }

  addBrowserAssets(root, requiredPaths);
  addServerDependencies(root, "server.js", requiredPaths, new Set());
  addProductionDependencies(root, requiredPaths);
  // The bundled Dreamina client ships as "<root>/runtime/dreamina.exe" so users
  // never have to install it or point at its location themselves.
  for (const name of ["dreamina.exe", "dreamina"]) {
    const bundled = path.join(root, "runtime", name);
    if (fs.existsSync(bundled)) { requiredPaths.add(toPortablePath(path.join("runtime", name))); break; }
  }

  return {
    files: [...requiredPaths].map(toPortablePath).sort(),
    directories: [...PORTABLE_DIRECTORIES],
  };
}

function copyPortableEntry(sourcePath, targetPath, options = {}) {
  const root = path.resolve(options.root || sourcePath);
  const relative = toPortablePath(path.relative(root, sourcePath));
  if (EXCLUDED_PORTABLE_FILES.has(relative)) return;
  if (fs.lstatSync(sourcePath).isSymbolicLink()) {
    throw new Error(`Portable source must not contain symbolic links: ${sourcePath}`);
  }
  const sourceStats = fs.statSync(sourcePath);
  if (sourceStats.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      copyPortableEntry(
        path.join(sourcePath, entry.name),
        path.join(targetPath, entry.name),
        { root },
      );
    }
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyPortableRuntimeFiles(sourceRoot, targetRoot) {
  const root = path.resolve(sourceRoot);
  const target = path.resolve(targetRoot);
  const manifest = collectPortablePackageManifest(root);
  fs.mkdirSync(target, { recursive: true });

  for (const relativePath of manifest.files) {
    const safeRelativePath = normalizePortableRelativePath(relativePath, "Portable manifest path");
    const sourcePath = path.join(root, safeRelativePath);
    const targetPath = path.join(target, safeRelativePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Required portable source file is missing: ${relativePath}`);
    }
    copyPortableEntry(sourcePath, targetPath, { root });
  }

  for (const relativeDirectory of manifest.directories) {
    const safeRelativePath = normalizePortableRelativePath(relativeDirectory, "Portable manifest directory");
    const sourcePath = path.join(root, safeRelativePath);
    if (!fs.existsSync(sourcePath)) continue;
    copyPortableEntry(sourcePath, path.join(target, safeRelativePath), { root });
  }

  writeDevReloadCompatibilityFile(target);
  return manifest;
}

function writeDevReloadCompatibilityFile(targetRoot) {
  const destination = path.join(path.resolve(targetRoot), ...DEV_RELOAD_COMPAT_FILE.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, DEV_RELOAD_COMPAT_CONTENT);
}

module.exports = {
  FIXED_PORTABLE_FILES,
  EXCLUDED_PORTABLE_FILES,
  PORTABLE_DIRECTORIES,
  DEV_RELOAD_COMPAT_FILE,
  DEV_RELOAD_COMPAT_CONTENT,
  collectPortablePackageManifest,
  copyPortableRuntimeFiles,
  writeDevReloadCompatibilityFile,
  resolveLocalModule,
  normalizePortableRelativePath,
  toPortablePath,
};
