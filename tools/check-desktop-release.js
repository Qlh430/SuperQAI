"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function zipEntries(zipPath) {
  const script = "Add-Type -AssemblyName System.IO.Compression.FileSystem; $archive=[System.IO.Compression.ZipFile]::OpenRead($env:AI_OS_TEST_ZIP); try { $archive.Entries | ForEach-Object { $_.FullName } } finally { $archive.Dispose() }";
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    env: { ...process.env, AI_OS_TEST_ZIP: zipPath },
    windowsHide: true,
  }).split(/\r?\n/).filter(Boolean).map((entry) => entry.replace(/\\/g, "/"));
}

function runDesktopReleaseChecks() {
  const { buildDesktopRelease, parseArguments } = require("./build-desktop-release");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-release-check-"));
  const temporaryRealRoot = fs.realpathSync(temporaryRoot);
  try {
    const packageRoot = path.join(temporaryRoot, "AI-OS-Portable-1.2.3-win-x64");
    const runtimeRoot = path.join(packageRoot, ".ai-runtime", "versions", "1.2.3-win-x64");
    const appRoot = path.join(runtimeRoot, "resources", "app");
    fs.mkdirSync(path.join(packageRoot, "data"), { recursive: true });
    fs.mkdirSync(appRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "AI OS.exe"), "launcher fixture");
    fs.writeFileSync(path.join(packageRoot, "ai-os-portable.json"), JSON.stringify({ version: "1.2.3" }));
    fs.writeFileSync(path.join(runtimeRoot, "runtime.txt"), "release fixture\n");
    fs.writeFileSync(path.join(appRoot, "index.html"), "<title>release fixture</title>\n");
    const inspectFixture = (root) => {
      assert.equal(root, packageRoot);
      if (fs.readdirSync(path.join(root, "data")).length) throw new Error("Public portable package data must be empty");
      return { manifest: { version: "1.2.3" }, runtimeRoot, appRoot };
    };
    const output = path.join(temporaryRoot, "dist", "release", "1.2.3");
    const result = buildDesktopRelease({ packageRoot, output, version: "1.2.3", inspectPackage: inspectFixture });
    const portableName = "AI-OS-Portable-1.2.3-win-x64.zip";
    const runtimeName = "AI-OS-Runtime-1.2.3-win-x64.zip";
    assert.equal(path.basename(result.portableZipPath), portableName);
    assert.equal(path.basename(result.runtimeZipPath), runtimeName);
    assert.equal(path.basename(result.componentManifestPath), "ai-os-components.json");
    assert.ok(result.componentAssets.length > 0);
    assert.ok(fs.existsSync(path.join(appRoot, "ai-os-components.json")));
    assert.deepEqual(zipEntries(result.portableZipPath).sort(), [
      "AI-OS-Portable-1.2.3-win-x64/.ai-runtime/versions/1.2.3-win-x64/resources/app/ai-os-components.json",
      "AI-OS-Portable-1.2.3-win-x64/.ai-runtime/versions/1.2.3-win-x64/resources/app/index.html",
      "AI-OS-Portable-1.2.3-win-x64/.ai-runtime/versions/1.2.3-win-x64/runtime.txt",
      "AI-OS-Portable-1.2.3-win-x64/AI OS.exe",
      "AI-OS-Portable-1.2.3-win-x64/ai-os-portable.json",
      "AI-OS-Portable-1.2.3-win-x64/data/",
    ].sort());
    assert.deepEqual(zipEntries(result.runtimeZipPath).sort(), [
      "1.2.3-win-x64/resources/app/ai-os-components.json",
      "1.2.3-win-x64/resources/app/index.html",
      "1.2.3-win-x64/runtime.txt",
    ].sort());
    const metadata = JSON.parse(fs.readFileSync(result.metadataPath, "utf8"));
    const { components, ...metadataWithoutComponents } = metadata;
    assert.deepEqual(metadataWithoutComponents, {
      format: 1,
      product: "AI OS",
      version: "1.2.3",
      platform: "win32",
      arch: "x64",
      minUpdaterVersion: 1,
      fileName: runtimeName,
      size: fs.statSync(result.runtimeZipPath).size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(result.runtimeZipPath)).digest("hex"),
    });
    assert.deepEqual(components, {
      fileName: "ai-os-components.json",
      size: fs.statSync(result.componentManifestPath).size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(result.componentManifestPath)).digest("hex"),
    });
    assert.throws(() => buildDesktopRelease({ packageRoot, output: path.join(temporaryRoot, "wrong"), version: "1.2.4", inspectPackage: inspectFixture }), /version/i);
    fs.writeFileSync(path.join(packageRoot, "data", "private.json"), "private");
    assert.throws(() => buildDesktopRelease({ packageRoot, output: path.join(temporaryRoot, "private"), version: "1.2.3", inspectPackage: inspectFixture }), /data|empty|private/i);
    fs.rmSync(path.join(packageRoot, "data", "private.json"));
    const privateSnapshot = path.join(packageRoot, '.ai-runtime', 'rollback', 'old', 'data');
    fs.mkdirSync(privateSnapshot, {recursive:true});
    fs.writeFileSync(path.join(privateSnapshot, '.env'), 'PRIVATE_FIXTURE=must-not-ship');
    assert.throws(() => buildDesktopRelease({packageRoot,output:path.join(temporaryRoot,'snapshot-leak'),version:'1.2.3',inspectPackage:inspectFixture}), /fresh|rollback/i);
    assert.equal(fs.existsSync(path.join(temporaryRoot,'snapshot-leak')),false);
    fs.rmSync(path.join(packageRoot,'.ai-runtime','rollback'),{recursive:true});
    assert.throws(() => buildDesktopRelease({ packageRoot, output, version: "1.2.3", inspectPackage: inspectFixture }), /already exists/i);
    assert.deepEqual(parseArguments(["--package", packageRoot, "--output", output]), { packageRoot, output });
    assert.deepEqual(parseArguments(["--help"]), { help: true });
    console.log(`Desktop release checks passed: ${portableName}, ${runtimeName}, embedded ai-os-components.json; ZIP roots, size/hash metadata, version/private-data/existing-output rejection.`);
  } finally {
    if (fs.realpathSync(temporaryRoot) !== temporaryRealRoot || !path.basename(temporaryRealRoot).startsWith("ai-os-release-check-")) throw new Error("Temporary fixture path changed; cleanup refused.");
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try { runDesktopReleaseChecks(); }
  catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { runDesktopReleaseChecks };
