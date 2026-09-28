"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectPortablePackageManifest,
  copyPortableRuntimeFiles,
  DEV_RELOAD_COMPAT_CONTENT,
} = require("./portable-package-manifest");

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-studio-portable-manifest-"));
const targetRoot = path.join(fixtureRoot, "target");
const outsideFile = path.join(path.dirname(fixtureRoot), `${path.basename(fixtureRoot)}-outside.js`);

try {
  const fixedFiles = [
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
    "canvas-agent.css",
    "desktop-shell.css",
    "install-host-shortcut.bat",
    "install-host-shortcut.ps1",
  ];
  fixedFiles.forEach((relativePath) => {
    const filePath = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, relativePath === "logo.png" ? Buffer.from([0]) : "fixture");
  });
  fs.writeFileSync(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify({ name: "fixture", dependencies: {} }),
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "index.html"),
    '<script src="./new-browser.js"></script>',
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "server.js"),
    'require("./new-server-dependency");',
  );
  fs.writeFileSync(path.join(fixtureRoot, "script.js"), "console.log('fixture');");
  fs.writeFileSync(path.join(fixtureRoot, "new-browser.js"), "window.fixture = true;");
  fs.writeFileSync(path.join(fixtureRoot, "new-root.js"), "module.exports = true;");
  fs.writeFileSync(path.join(fixtureRoot, "new-root.css"), "body { color: black; }");
  fs.mkdirSync(path.join(fixtureRoot, "theme"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "theme", "linked.css"), "body { background: white; }");
  fs.writeFileSync(
    path.join(fixtureRoot, "new-server-dependency.js"),
    'require("./nested-server-dependency");',
  );
  fs.writeFileSync(path.join(fixtureRoot, "nested-server-dependency.js"), "module.exports = true;");
  fs.writeFileSync(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify({ name: "fixture", dependencies: { "fake-package": "1.0.0" } }),
  );
  fs.mkdirSync(path.join(fixtureRoot, "node_modules", "fake-package"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "node_modules", "fake-package", "index.js"), "module.exports = true;");
  fs.writeFileSync(path.join(fixtureRoot, "node_modules", "fake-package", "package.json"), JSON.stringify({ dependencies: { "transitive-package": "1.0.0" }, optionalDependencies: { "native-addon": "1.0.0", "other-platform-addon": "1.0.0" } }));
  for (const dependency of ["transitive-package", "native-addon"]) {
    fs.mkdirSync(path.join(fixtureRoot, "node_modules", dependency), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "node_modules", dependency, "index.js"), "module.exports = true;");
  }
  ["assets", "bundled-skills", "workflows", "skills", "desktop", path.join("node_modules", "electron", "dist")].forEach((directory) => {
    fs.mkdirSync(path.join(fixtureRoot, directory), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, directory, "fixture.txt"), directory);
  });
  fs.writeFileSync(path.join(fixtureRoot, "desktop", "dev-reload.js"), "module.exports = 'development only';");
  fs.mkdirSync(path.join(fixtureRoot, "tools"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "tools", "ignored.js"), "module.exports = false;");
  fs.writeFileSync(outsideFile, "module.exports = 'outside';");

  fs.writeFileSync(
    path.join(fixtureRoot, "index.html"),
    `<script src="../${path.basename(outsideFile)}"></script>`,
  );
  assert.throws(
    () => collectPortablePackageManifest(fixtureRoot),
    /escapes the project root/i,
    "browser script paths must stay inside the project root",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "index.html"),
    '<script src="./new-browser.js"></script><link rel="stylesheet" href="./theme/linked.css?v=1"><link rel="stylesheet" href="https://example.invalid/external.css">',
  );

  const manifest = collectPortablePackageManifest(fixtureRoot);
  assert.ok(manifest.files.includes("new-root.js"), "new root runtime files must be discovered");
  assert.ok(manifest.files.includes("new-root.css"), "root CSS themes must be discovered");
  assert.ok(manifest.files.includes("theme/linked.css"), "linked browser stylesheets must be discovered");
  assert.ok(manifest.files.includes("new-browser.js"), "browser scripts must be discovered");
  assert.ok(
    manifest.files.includes("new-server-dependency.js"),
    "server local dependencies must be discovered",
  );
  assert.ok(
    manifest.files.includes("nested-server-dependency.js"),
    "transitive server local dependencies must be discovered",
  );
  assert.ok(
    manifest.files.includes("node_modules/fake-package"),
    "production dependency directories must be discovered",
  );
  assert.ok(!manifest.files.includes("tools/ignored.js"), "development tools must stay excluded");
  assert.ok(manifest.files.includes("node_modules/transitive-package"), "transitive dependencies must ship with the runtime");
  assert.ok(manifest.files.includes("node_modules/native-addon"), "installed optional native binaries must ship with the runtime");
  assert.ok(!manifest.files.includes("node_modules/other-platform-addon"), "uninstalled platform binaries are optional");
  assert.deepEqual(manifest.directories, ["assets", "bundled-skills", "workflows", "skills", "desktop", "runtime", "node_modules/electron/dist"]);

  copyPortableRuntimeFiles(fixtureRoot, targetRoot);
  [
    "new-root.js",
    "new-root.css",
    "theme/linked.css",
    "new-browser.js",
    "new-server-dependency.js",
    "nested-server-dependency.js",
    "node_modules/fake-package/index.js",
    "assets/fixture.txt",
    "bundled-skills/fixture.txt",
    "workflows/fixture.txt",
    "skills/fixture.txt",
    "desktop/fixture.txt",
    "node_modules/electron/dist/fixture.txt",
  ].forEach((relativePath) => {
    assert.ok(fs.existsSync(path.join(targetRoot, relativePath)), `${relativePath} was not copied`);
  });
  const compatibilityReloadPath = path.join(targetRoot, "desktop", "dev-reload.js");
  assert.ok(fs.existsSync(compatibilityReloadPath), "the update compatibility file must be copied into runtime packages");
  assert.equal(fs.readFileSync(compatibilityReloadPath, "utf8"), DEV_RELOAD_COMPAT_CONTENT, "runtime packages must contain only the inert dev-reload compatibility file");

  const builder = fs.readFileSync(path.join(__dirname, "..", "build-portable.bat"), "utf8");
  assert.match(builder, /(?:copy-portable-runtime|build-electron-portable)\.js/i, "builder must use the shared runtime manifest");
  console.log("Portable runtime manifest check passed.");
} finally {
  fs.rmSync(outsideFile, { force: true });
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
