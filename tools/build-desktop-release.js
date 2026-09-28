"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildPortablePackage,
  createZip,
  inspectPortablePackage,
} = require("./build-electron-portable");
const {
  COMPONENT_MANIFEST_FILE,
  buildComponentPackages,
} = require("./component-package-manifest");

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readProjectVersion(sourceRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  if (!VERSION_PATTERN.test(packageJson.version || "")) throw new Error(`Invalid package version: ${packageJson.version}`);
  return packageJson.version;
}

function sha256File(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function buildDesktopRelease(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || path.join(__dirname, ".."));
  const version = options.version || readProjectVersion(sourceRoot);
  if (!VERSION_PATTERN.test(version)) throw new Error(`Invalid release version: ${version}`);
  const releaseRoot = path.resolve(options.output || path.join(sourceRoot, "dist", "release", version));
  if (fs.existsSync(releaseRoot)) throw new Error(`Release output already exists and will not be changed: ${releaseRoot}`);

  const packageName = `AI-OS-Portable-${version}-win-x64`;
  const suppliedPackage = Boolean(options.packageRoot);
  const packageRoot = path.resolve(options.packageRoot || path.join(sourceRoot, "dist", packageName));
  const inspectPackage = options.inspectPackage || inspectPortablePackage;
  let inspection;
  if (suppliedPackage) {
    inspection = inspectPackage(packageRoot, { allowData: false });
  } else {
    const built = (options.buildPortable || buildPortablePackage)({
      sourceRoot,
      output: packageRoot,
      nodeExecutable: options.nodeExecutable,
      electronDirectory: options.electronDirectory,
    });
    inspection = inspectPackage(built.packageRoot, { allowData: false });
  }
  if (path.basename(packageRoot) !== packageName) throw new Error(`Portable folder name does not match release version ${version}; expected ${packageName}.`);
  if (inspection.manifest?.version !== version) throw new Error(`Portable package version ${inspection.manifest?.version || "is missing"}; expected ${version}.`);
  const runtimeName = `${version}-win-x64`;
  if (path.basename(inspection.runtimeRoot) !== runtimeName) throw new Error(`Portable runtime version does not match ${version}.`);
  const runtimeContainer = path.join(packageRoot, ".ai-runtime");
  const allowedRuntimeEntries = new Set([".active-runtime", "versions", "使用说明.md"]);
  if (fs.readdirSync(runtimeContainer).some(name => !allowedRuntimeEntries.has(name)) ||
      JSON.stringify(fs.readdirSync(path.join(runtimeContainer, "versions"))) !== JSON.stringify([runtimeName])) {
    throw new Error("Release requires a fresh portable package without update caches, rollback snapshots or extra runtimes.");
  }
  for (const name of fs.readdirSync(runtimeContainer)) {
    if (fs.lstatSync(path.join(runtimeContainer, name)).isSymbolicLink()) throw new Error("Release package must not contain runtime links.");
  }

  fs.mkdirSync(releaseRoot, { recursive: true });
  try {
    const portableZipPath = path.join(releaseRoot, `${packageName}.zip`);
    const runtimeFileName = `AI-OS-Runtime-${runtimeName}.zip`;
    const runtimeZipPath = path.join(releaseRoot, runtimeFileName);
    const metadataPath = path.join(releaseRoot, "ai-os-update.json");
    const componentAppRoot = inspection.appRoot || path.join(inspection.runtimeRoot, "resources", "app");
    const componentPackages = buildComponentPackages({
      sourceRoot,
      appRoot: componentAppRoot,
      releaseRoot,
      version,
    });
    if (componentPackages) {
      fs.copyFileSync(componentPackages.manifestPath, path.join(componentAppRoot, COMPONENT_MANIFEST_FILE));
    }
    createZip(packageRoot, portableZipPath);
    createZip(inspection.runtimeRoot, runtimeZipPath);
    const metadata = {
      format: 1,
      product: "AI OS",
      version,
      platform: "win32",
      arch: "x64",
      minUpdaterVersion: 1,
      fileName: runtimeFileName,
      size: fs.statSync(runtimeZipPath).size,
      sha256: sha256File(runtimeZipPath),
    };
    if (componentPackages) metadata.components = componentPackages.asset;
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
    return {
      releaseRoot,
      packageRoot,
      portableZipPath,
      runtimeZipPath,
      metadataPath,
      metadata,
      componentManifestPath: componentPackages?.manifestPath || "",
      componentAssets: componentPackages?.componentAssets || [],
    };
  } catch (error) {
    // Only remove this invocation's newly-created, version-specific asset directory.
    if (fs.existsSync(releaseRoot)) fs.rmSync(releaseRoot, { recursive: true, force: true });
    throw error;
  }
}

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") { options.help = true; continue; }
    const key = { "--package": "packageRoot", "--output": "output", "--node": "nodeExecutable", "--electron-dist": "electronDirectory" }[argument];
    if (!key) throw new Error(`Unknown option: ${argument}`);
    const value = arguments_[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    options[key] = value;
  }
  return options;
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: node tools/build-desktop-release.js [--package <fresh portable folder>] [--output <new release folder>] [--node <Node 24.13+ node.exe>] [--electron-dist <Electron dist>]\nWithout --package, a clean versioned portable folder is built first. Existing package and release outputs are never overwritten. The package must contain empty data.");
    } else {
      const result = buildDesktopRelease(options);
      console.log(`Release assets:\n${result.portableZipPath}\n${result.runtimeZipPath}\n${result.metadataPath}${result.componentManifestPath ? `\n${result.componentManifestPath}` : ""}`);
    }
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

module.exports = { buildDesktopRelease, parseArguments, readProjectVersion, sha256File };
