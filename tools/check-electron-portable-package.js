"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

async function runRegressionChecks() {
  const builderPath = path.join(__dirname, "build-electron-portable.js");
  assert.ok(fs.existsSync(builderPath), "The Electron portable builder must exist");
  const { buildPortablePackage, inspectPortablePackage, compileLauncher, parseArguments } = require(builderPath);
  const { collectPortablePackageManifest, DEV_RELOAD_COMPAT_CONTENT } = require("./portable-package-manifest");
  const workspace = path.resolve(__dirname, "..");
  const copy = (source, target) => {
    if (fs.statSync(source).isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(target, name));
    } else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target); }
  };
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-portable-check-"));
  const temporaryRealRoot = fs.realpathSync(temporaryRoot);
  try {
    const source = path.join(temporaryRoot, "source");
    const electron = path.join(temporaryRoot, "electron");
    const output = path.join(source, "dist", "Unicode 空格 package");
    fs.mkdirSync(source);
    // A production-only fixture uses the real installed dependencies but never reads user data.
    const manifest = collectPortablePackageManifest(workspace);
    for (const relative of [...manifest.files, ...manifest.directories]) {
      if (relative === "node_modules/electron/dist") continue;
      const target = path.join(source, relative);
      if (fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      copy(path.join(workspace, relative), target);
    }
    fs.mkdirSync(path.join(electron, "resources"), { recursive: true });
    fs.writeFileSync(path.join(electron, "resources", "default_app.asar"), "must not ship");
    fs.writeFileSync(path.join(electron, "version"), "44.1.1");
    fs.writeFileSync(path.join(electron, "LICENSE"), "fixture license");
    for (const file of ["resources.pak", "icudtl.dat", "chrome_100_percent.pak", "chrome_200_percent.pak", "v8_context_snapshot.bin", "ffmpeg.dll", "libEGL.dll", "libGLESv2.dll"]) {
      fs.writeFileSync(path.join(electron, file), "fixture");
    }
    fs.mkdirSync(path.join(electron, "locales"));
    fs.writeFileSync(path.join(electron, "locales", "en-US.pak"), "fixture");
    const stubSource = path.join(temporaryRoot, "probe.cs");
    fs.writeFileSync(stubSource, `using System; using System.IO; using System.Web.Script.Serialization;
class Probe { static void Main(string[] args) { var root = Environment.GetEnvironmentVariable("AI_OS_PORTABLE_ROOT");
File.WriteAllText(Path.Combine(root, "data", "launcher-probe.json"), new JavaScriptSerializer().Serialize(new { args = args, root = root, cwd = Environment.CurrentDirectory, electronAsNode = Environment.GetEnvironmentVariable("ELECTRON_RUN_AS_NODE") })); } }`);
    compileLauncher({ sourcePath: stubSource, outputPath: path.join(electron, "electron.exe") });
    fs.mkdirSync(path.join(source, "data"));
    fs.writeFileSync(path.join(source, "data", "private.txt"), "private fixture, must not ship");
    fs.writeFileSync(path.join(source, ".env"), "PRIVATE_FIXTURE=must-not-ship");
    assert.throws(() => parseArguments(["--with-data"]), /import-from|import/i);
    assert.throws(() => parseArguments(["--unknown"]), /Unknown option/i);
    assert.throws(() => buildPortablePackage({ sourceRoot: source, output, nodeExecutable: process.execPath, electronDirectory: electron, withData: true }), /import/i);

    const result = buildPortablePackage({ sourceRoot: source, output, nodeExecutable: process.execPath, electronDirectory: electron, launcherSource: path.join(workspace, "desktop", "portable-launcher.cs") });
    assert.equal(result.packageRoot, output);
    assert.deepEqual(fs.readdirSync(output).sort(), [".ai-runtime", "AI OS.exe", "ai-os-portable.json", "data"].sort());
    assert.deepEqual(fs.readdirSync(path.join(output, "data")), []);
    const inspection = inspectPortablePackage(output);
    const appRoot = inspection.appRoot;
    for (const file of ["ai-os-theme.css", "system-settings.css", "canvas-asset-library.css", "canvas-db-worker.js", "image-thumbnail-worker.js", "desktop/main.js", "desktop/portable-setup.js", "desktop/portable-setup.html", "desktop/portable-setup-preload.js", "desktop/service-readiness.js"]) {
      assert.ok(fs.existsSync(path.join(appRoot, file)), `${file} must ship`);
    }
    const compatibilityReloadPath = path.join(appRoot, "desktop", "dev-reload.js");
    assert.ok(fs.existsSync(compatibilityReloadPath), "the update compatibility file must ship");
    assert.equal(fs.readFileSync(compatibilityReloadPath, "utf8"), DEV_RELOAD_COMPAT_CONTENT, "packaged dev-reload must be an inert compatibility placeholder");
    assert.ok(fs.existsSync(path.join(inspection.runtimeRoot, "LICENSE")), "Electron license must ship");
    assert.ok(!fs.existsSync(path.join(inspection.runtimeRoot, "resources", "default_app.asar")));
    for (const entry of ["node_modules/electron", ".env", "data", "output", "tmp", "tests", "docs", "desktop/portable-launcher.cs"]) {
      assert.ok(!fs.existsSync(path.join(appRoot, entry)), `development/private entry must not ship: ${entry}`);
    }
    fs.writeFileSync(path.join(output, "data", "existing.txt"), "must survive a second build");
    assert.throws(() => buildPortablePackage({ sourceRoot: source, output, nodeExecutable: process.execPath, electronDirectory: electron }), /already exists/i);
    assert.equal(fs.readFileSync(path.join(output, "data", "existing.txt"), "utf8"), "must survive a second build");
    assert.equal(fs.readFileSync(path.join(source, "data", "private.txt"), "utf8"), "private fixture, must not ship");

    const pointer = path.join(output, ".ai-runtime", ".active-runtime");
    const originalPointer = fs.readFileSync(pointer, "utf8");
    fs.writeFileSync(pointer, "../../outside");
    assert.throws(() => inspectPortablePackage(output, { allowData: true, probeRuntime: false }), /active|version|runtime/i);
    fs.writeFileSync(pointer, originalPointer);
    const portableManifestPath = path.join(output, "ai-os-portable.json");
    const originalManifest = fs.readFileSync(portableManifestPath, "utf8");
    const badManifest = JSON.parse(originalManifest);
    badManifest.runtimeDirectory = "../../outside";
    fs.writeFileSync(portableManifestPath, JSON.stringify(badManifest));
    assert.throws(() => inspectPortablePackage(output, { allowData: true, probeRuntime: false }), /runtime/i);
    fs.writeFileSync(portableManifestPath, originalManifest);

    const argumentsToPass = ["--hidden", "--diagnostics", "--import-from", 'D:\\old 项目\\with space\\', 'quote"inside', "", "--literal=$(&x)"];
    execFileSync(path.join(output, "AI OS.exe"), argumentsToPass, { windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
    const probePath = path.join(output, "data", "launcher-probe.json");
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(probePath) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(fs.existsSync(probePath), "The compiled GUI launcher must start the selected runtime");
    const probe = JSON.parse(fs.readFileSync(probePath, "utf8"));
    assert.deepEqual(probe.args, argumentsToPass, "Windows quoting must preserve all arguments exactly");
    assert.equal(fs.realpathSync.native(probe.root), fs.realpathSync.native(output));
    assert.equal(fs.realpathSync.native(probe.cwd), fs.realpathSync.native(output));
    assert.equal(probe.electronAsNode, null, "Electron must start in desktop mode");
    console.log("Electron portable regressions passed: clean build, native Node dependencies, GUI launcher, Unicode/argument quoting, path boundaries, existing data preservation.");
  } finally {
    // Delete only the exact temporary directory created and resolved by this test.
    if (fs.realpathSync(temporaryRoot) !== temporaryRealRoot || !path.basename(temporaryRealRoot).startsWith("ai-os-portable-check-")) throw new Error("Temporary fixture path changed; cleanup refused.");
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const packagePath = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  if (packagePath) {
    const { inspectPortablePackage } = require("./build-electron-portable");
    const result = inspectPortablePackage(path.resolve(packagePath), { allowData: process.argv.includes("--allow-data") });
    console.log(`Electron portable package check passed: ${result.packageRoot} (Node ${result.nodeVersion}).`);
  } else {
    runRegressionChecks().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
  }
}

module.exports = { runRegressionChecks };
