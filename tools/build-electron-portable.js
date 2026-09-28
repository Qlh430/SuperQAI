"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const {
  collectPortablePackageManifest,
  writeDevReloadCompatibilityFile,
  DEV_RELOAD_COMPAT_FILE,
  DEV_RELOAD_COMPAT_CONTENT,
} = require("./portable-package-manifest");

const ROOT_ENTRIES = [".ai-runtime", "AI OS.exe", "ai-os-portable.json", "data"];
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/;
const WITH_DATA_ERROR = 'Public packages always start with empty data. Build first, then run "AI OS.exe" --import-from "<old project or portable folder>" to import privately.';

function validVersion(value) {
  return typeof value === "string" && VERSION_PATTERN.test(value) && !value.endsWith(".");
}

function relativeInside(root, relative, label = "Runtime path") {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || /[:\\]/.test(relative)) throw new Error(`${label} must be relative: ${relative}`);
  const segments = relative.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[. ]$/.test(segment))) throw new Error(`${label} escapes the portable root: ${relative}`);
  let result = path.resolve(root);
  for (const segment of segments) {
    result = path.join(result, segment);
    if (fs.existsSync(result) && fs.lstatSync(result).isSymbolicLink()) throw new Error(`${label} must not contain symbolic links or junctions: ${relative}`);
  }
  return result;
}

function assertNodeRuntime(executable) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  let runtime;
  try {
    runtime = JSON.parse(execFileSync(executable, ["-p", "JSON.stringify({version:process.versions.node,arch:process.arch,platform:process.platform,electron:process.versions.electron||null})"], { encoding: "utf8", windowsHide: true, env: environment }).trim());
  } catch (error) {
    throw new Error(`Cannot run the bundled Node executable: ${executable}\n${error.message}`);
  }
  const [major, minor] = String(runtime.version).split(".").map(Number);
  if (major !== 24 || minor < 13 || runtime.arch !== "x64" || runtime.platform !== "win32" || runtime.electron) throw new Error("Portable packaging requires actual Windows x64 Node.js >=24.13.0 <25. Pass --node <node.exe>.");
  return runtime.version;
}

function compileLauncher({ sourcePath, outputPath, iconPath, compilerPath }) {
  const compiler = compilerPath || path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  if (!fs.existsSync(compiler)) throw new Error(`The Windows .NET Framework C# compiler was not found: ${compiler}`);
  const args = ["/nologo", "/target:winexe", "/platform:x64", "/optimize+", "/r:System.Windows.Forms.dll", "/r:System.Web.Extensions.dll", `/out:${outputPath}`];
  if (iconPath) args.push(`/win32icon:${iconPath}`);
  args.push(sourcePath);
  try { execFileSync(compiler, args, { windowsHide: true, encoding: "utf8" }); }
  catch (error) { throw new Error(`Cannot compile the AI OS GUI launcher: ${error.stdout || error.message}`); }
}

function copyTree(source, target, { root = source, exclude = () => false } = {}) {
  const relative = path.relative(root, source).split(path.sep).join("/");
  if (exclude(relative)) return;
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`Portable input must not contain links: ${source}`);
  const realRelative = path.relative(fs.realpathSync(root), fs.realpathSync(source));
  if (realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error(`Portable input escapes its source directory: ${source}`);
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) copyTree(path.join(source, name), path.join(target, name), { root, exclude });
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  } else throw new Error(`Unsupported portable source file: ${source}`);
}

function excludeAppPath(relative) {
  if (/(?:^|\/)node_modules\/electron(?:\/|$)/i.test(relative)) return true;
  if (/(?:^|\/)(?:\.git|\.github|\.codex|\.agents|\.cache|coverage|test|tests|__tests__)(?:\/|$)/i.test(relative)) return true;
  if (/(?:^|\/)\.env(?:$|\.(?!example$))/i.test(relative) || /\.(?:log|pdb|cs|map)$/i.test(relative)) return true;
  if (relative === "desktop/dev-reload.js") return true;
  return ["README.md", "package-lock.json", "package.json", "start.bat", "install-host-shortcut.bat", "install-host-shortcut.ps1"].includes(relative);
}

function copyApplication(sourceRoot, appRoot) {
  const manifest = collectPortablePackageManifest(sourceRoot);
  fs.mkdirSync(appRoot, { recursive: true });
  // Parent directories own their descendants; never copy a dependency twice.
  const entries = [...new Set([...manifest.files, ...manifest.directories])].sort((a, b) => a.length - b.length);
  const copiedDirectories = [];
  for (const relative of entries) {
    if (excludeAppPath(relative) || copiedDirectories.some((directory) => relative.startsWith(`${directory}/`))) continue;
    const source = relativeInside(sourceRoot, relative, "Application source path");
    if (!fs.existsSync(source)) throw new Error(`Required application source is missing: ${relative}`);
    copyTree(source, path.join(appRoot, relative), { root: sourceRoot, exclude: excludeAppPath });
    if (fs.statSync(source).isDirectory()) copiedDirectories.push(relative);
  }
  writeDevReloadCompatibilityFile(appRoot);
  const original = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  const packaged = { name: "ai-os", productName: "AI OS", version: original.version, private: true, description: original.description || "AI OS portable desktop", main: "desktop/main.js", engines: original.engines, dependencies: original.dependencies || {} };
  fs.writeFileSync(path.join(appRoot, "package.json"), `${JSON.stringify(packaged, null, 2)}\n`);
  return manifest;
}

function assertPortableExecutable(filename) {
  const handle = fs.openSync(filename, "r");
  try {
    const header = Buffer.alloc(64);
    fs.readSync(handle, header, 0, header.length, 0);
    if (header.toString("ascii", 0, 2) !== "MZ") throw new Error(`Not a Windows executable: ${filename}`);
    const pe = Buffer.alloc(96);
    fs.readSync(handle, pe, 0, pe.length, header.readUInt32LE(0x3c));
    if (pe.toString("ascii", 0, 4) !== "PE\0\0" || pe.readUInt16LE(4) !== 0x8664) throw new Error(`Not a Windows x64 executable: ${filename}`);
    return { subsystem: pe.readUInt16LE(24 + 68) };
  } finally { fs.closeSync(handle); }
}

function inspectPortablePackage(packageRoot, { allowData = false, probeRuntime = true } = {}) {
  const root = path.resolve(packageRoot);
  const entries = fs.readdirSync(root).sort();
  if (JSON.stringify(entries) !== JSON.stringify([...ROOT_ENTRIES].sort())) throw new Error(`Portable root must contain exactly ${ROOT_ENTRIES.join(", ")}; found ${entries.join(", ")}.`);
  const manifest = JSON.parse(fs.readFileSync(relativeInside(root, "ai-os-portable.json"), "utf8"));
  if (manifest.product !== "AI OS" || manifest.format !== 1 || manifest.portable !== true || manifest.dataDirectory !== "data" || manifest.versionsDirectory !== ".ai-runtime/versions" || manifest.activePointer !== ".ai-runtime/.active-runtime") throw new Error("Invalid AI OS portable manifest.");
  const prefix = ".ai-runtime/versions/";
  if (typeof manifest.runtimeDirectory !== "string" || !manifest.runtimeDirectory.startsWith(prefix) || !validVersion(manifest.runtimeDirectory.slice(prefix.length))) throw new Error("Invalid runtime directory in the portable manifest.");
  relativeInside(root, manifest.runtimeDirectory);
  const active = fs.readFileSync(relativeInside(root, manifest.activePointer), "utf8").trim();
  if (!validVersion(active)) throw new Error("Invalid active runtime version.");
  const runtimeRoot = relativeInside(root, `${prefix}${active}`);
  const appRoot = relativeInside(root, `${prefix}${active}/resources/app`);
  for (const relative of ["AI OS Runtime.exe", "version", "resources.pak", "icudtl.dat", "chrome_100_percent.pak", "chrome_200_percent.pak", "v8_context_snapshot.bin", "ffmpeg.dll", "locales/en-US.pak", "resources/runtime/node.exe", "resources/app/package.json", "resources/app/desktop/main.js", "resources/app/desktop/service-readiness.js", "resources/app/index.html", "resources/app/server.js"]) {
    if (!fs.existsSync(relativeInside(runtimeRoot, relative))) throw new Error(`Portable runtime is incomplete: missing ${relative}`);
  }
  if (assertPortableExecutable(path.join(root, "AI OS.exe")).subsystem !== 2) throw new Error("AI OS.exe must be a Windows GUI launcher without a console.");
  assertPortableExecutable(path.join(runtimeRoot, "AI OS Runtime.exe"));
  assertPortableExecutable(path.join(runtimeRoot, "resources", "runtime", "node.exe"));
  if (fs.existsSync(path.join(runtimeRoot, "resources", "default_app.asar"))) throw new Error("Electron default_app.asar must be excluded so app.isPackaged is true.");
  for (const relative of ["node_modules/electron", ".env", "data", "output", "tmp", "docs", "tests", ".git", "desktop/portable-launcher.cs"]) {
    if (fs.existsSync(path.join(appRoot, relative))) throw new Error(`Portable application contains development/private content: ${relative}`);
  }
  const compatibilityFile = path.join(appRoot, ...DEV_RELOAD_COMPAT_FILE.split("/"));
  if (!fs.existsSync(compatibilityFile) || fs.readFileSync(compatibilityFile, "utf8") !== DEV_RELOAD_COMPAT_CONTENT) {
    throw new Error("Packaged application must contain only the inert dev-reload compatibility file.");
  }
  const appPackage = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
  if (appPackage.main !== "desktop/main.js" || appPackage.devDependencies || appPackage.scripts || appPackage.engines?.node !== ">=24.13.0 <25") throw new Error("Packaged app metadata must use the Electron desktop entry and supported Node engine without development scripts/dependencies.");
  const dataRoot = relativeInside(root, "data");
  if (!allowData && fs.readdirSync(dataRoot).length) throw new Error("Public portable package data must be empty. Use --allow-data only to inspect a privately used package.");
  const inspectText = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspectText(file);
      else if (/\.(?:js|json|html|css|md|txt|example)$/i.test(entry.name)) {
        const content = fs.readFileSync(file, "utf8");
        if (/\bsk-[a-z0-9_-]{16,}\b/i.test(content) || /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/i.test(content)) {
          throw new Error(`Public runtime contains a possible credential in ${path.relative(appRoot, file)}. Packaging stopped.`);
        }
      }
    }
  };
  inspectText(appRoot);
  const nodeExecutable = path.join(runtimeRoot, "resources", "runtime", "node.exe");
  let nodeVersion = "not probed";
  if (probeRuntime) {
    nodeVersion = assertNodeRuntime(nodeExecutable);
    const probe = `const {DatabaseSync}=require('node:sqlite');const database=new DatabaseSync(':memory:');database.exec('CREATE TABLE probe(value TEXT)');database.close();require('undici');require('sharp')({create:{width:1,height:1,channels:4,background:'#ffffff'}}).png().toBuffer().then(buffer=>{if(!buffer.length)throw Error('Empty PNG');console.log('native-runtime-ok')}).catch(error=>{console.error(error);process.exitCode=1});`;
    const result = execFileSync(nodeExecutable, ["--disable-warning=ExperimentalWarning", "-e", probe], { cwd: appRoot, encoding: "utf8", windowsHide: true });
    if (!result.includes("native-runtime-ok")) throw new Error("The bundled Node runtime failed its SQLite, undici and sharp native dependency check.");
  }
  return { packageRoot: root, runtimeRoot, appRoot, manifest, nodeVersion };
}

function createZip(packageRoot, zipPath) {
  if (fs.existsSync(zipPath)) throw new Error(`Zip destination already exists; choose a new output path: ${zipPath}`);
  const temporaryZip = `${zipPath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const script = "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:AI_OS_ZIP_SOURCE, $env:AI_OS_ZIP_TARGET, [System.IO.Compression.CompressionLevel]::Optimal, $true)";
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, env: { ...process.env, AI_OS_ZIP_SOURCE: packageRoot, AI_OS_ZIP_TARGET: temporaryZip }, stdio: "pipe" });
    if (fs.existsSync(zipPath)) throw new Error(`Zip destination appeared during packaging: ${zipPath}`);
    fs.renameSync(temporaryZip, zipPath);
  } finally {
    if (fs.existsSync(temporaryZip)) fs.unlinkSync(temporaryZip);
  }
}

function buildPortablePackage(options = {}) {
  if (options.withData) throw new Error(WITH_DATA_ERROR);
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Build this Windows x64 package on Windows x64.");
  const sourceRoot = path.resolve(options.sourceRoot || path.join(__dirname, ".."));
  const distRoot = path.join(sourceRoot, "dist");
  const output = path.resolve(options.output || path.join(distRoot, "AI-OS-Portable-win-x64"));
  if (fs.existsSync(output)) throw new Error(`Output already exists and will not be changed: ${output}\nChoose --output <new folder>; existing portable data is never deleted.`);
  if (options.zip && fs.existsSync(`${output}.zip`)) throw new Error(`Zip destination already exists: ${output}.zip`);
  const nodeExecutable = path.resolve(options.nodeExecutable || process.execPath);
  const nodeVersion = assertNodeRuntime(nodeExecutable);
  const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  if (packageJson.engines?.node !== ">=24.13.0 <25") throw new Error("The application must declare Node >=24.13.0 <25.");
  const version = `${packageJson.version}-win-x64`;
  if (!validVersion(version)) throw new Error(`Application version cannot be used as a runtime directory: ${packageJson.version}`);
  const electronDirectory = path.resolve(options.electronDirectory || path.join(sourceRoot, "node_modules", "electron", "dist"));
  if (!fs.existsSync(path.join(electronDirectory, "electron.exe"))) throw new Error(`Installed Electron runtime is missing: ${electronDirectory}`);
  assertPortableExecutable(path.join(electronDirectory, "electron.exe"));
  fs.mkdirSync(distRoot, { recursive: true });
  if (fs.lstatSync(distRoot).isSymbolicLink()) throw new Error("The build dist directory must not be a junction or symbolic link.");
  const realDistRoot = fs.realpathSync(distRoot);
  const staging = fs.mkdtempSync(path.join(distRoot, ".ai-os-build-"));
  const stagingRealPath = fs.realpathSync(staging);
  try {
    const runtimeRelative = `.ai-runtime/versions/${version}`;
    const runtimeRoot = path.join(staging, runtimeRelative);
    copyTree(electronDirectory, runtimeRoot, { exclude: (relative) => relative === "resources/default_app.asar" });
    fs.renameSync(path.join(runtimeRoot, "electron.exe"), path.join(runtimeRoot, "AI OS Runtime.exe"));
    const appRoot = path.join(runtimeRoot, "resources", "app");
    copyApplication(sourceRoot, appRoot);
    const nodeTarget = path.join(runtimeRoot, "resources", "runtime", "node.exe");
    fs.mkdirSync(path.dirname(nodeTarget), { recursive: true });
    fs.copyFileSync(nodeExecutable, nodeTarget, fs.constants.COPYFILE_EXCL);
    compileLauncher({ sourcePath: options.launcherSource || path.join(sourceRoot, "desktop", "portable-launcher.cs"), outputPath: path.join(staging, "AI OS.exe"), iconPath: path.join(sourceRoot, "desktop", "icon.ico"), compilerPath: options.compilerPath });
    fs.mkdirSync(path.join(staging, "data"));
    const portableManifest = { product: "AI OS", version: packageJson.version, format: 1, portable: true, dataDirectory: "data", runtimeDirectory: runtimeRelative, versionsDirectory: ".ai-runtime/versions", activePointer: ".ai-runtime/.active-runtime" };
    fs.writeFileSync(path.join(staging, "ai-os-portable.json"), `${JSON.stringify(portableManifest, null, 2)}\n`);
    fs.writeFileSync(path.join(staging, ".ai-runtime", ".active-runtime"), `${version}\n`);
    const guide = path.join(sourceRoot, "打包和迁移说明.md");
    if (fs.existsSync(guide)) fs.copyFileSync(guide, path.join(staging, ".ai-runtime", "使用说明.md"));
    inspectPortablePackage(staging);
    if (fs.existsSync(output)) throw new Error(`Output already exists and will not be changed: ${output}`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    // Windows scanners can briefly hold a freshly compiled EXE or native DLL
    // after the runtime probe exits. Retry this rename only; never replace data.
    const renameDeadline = Date.now() + 5000;
    for (;;) {
      if (fs.existsSync(output)) throw new Error(`Output already exists and will not be changed: ${output}`);
      try { fs.renameSync(staging, output); break; }
      catch (error) {
        if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || Date.now() >= renameDeadline) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
    if (options.zip) createZip(output, `${output}.zip`);
    return { packageRoot: output, zipPath: options.zip ? `${output}.zip` : null, version: packageJson.version, nodeVersion };
  } finally {
    if (fs.existsSync(staging)) {
      const actual = fs.realpathSync(staging);
      if (actual !== stagingRealPath || path.dirname(actual) !== realDistRoot || !path.basename(actual).startsWith(".ai-os-build-")) throw new Error("Build staging path changed; cleanup refused.");
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
}

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === "--with-data") throw new Error(WITH_DATA_ERROR);
    if (argument === "--zip") { options.zip = true; continue; }
    if (argument === "--no-pause") continue;
    if (argument === "--help" || argument === "-h") { options.help = true; continue; }
    const key = { "--output": "output", "--node": "nodeExecutable", "--electron-dist": "electronDirectory" }[argument];
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
    if (options.help) console.log('Usage: node tools/build-electron-portable.js [--output <new folder>] [--node <Node 24.13+ node.exe>] [--electron-dist <Electron dist>] [--zip]\nThe default output is dist/AI-OS-Portable-win-x64. Existing packages are never overwritten. Public data starts empty.');
    else {
      console.log("Building AI OS Windows x64 portable package with empty data...");
      const result = buildPortablePackage(options);
      console.log(`Portable package: ${result.packageRoot}\nBundled Node: ${result.nodeVersion}\nLaunch: ${path.join(result.packageRoot, "AI OS.exe")}${result.zipPath ? `\nZip: ${result.zipPath}` : ""}`);
    }
  } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { buildPortablePackage, inspectPortablePackage, compileLauncher, parseArguments, createZip };
