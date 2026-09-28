"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createZip } = require("./build-electron-portable");
const { buildComponentPackages } = require("./component-package-manifest");
const { createUpdater } = require("../desktop/updater");
const { REQUIRED_RUNTIME_FILES } = require("../desktop/update-install");
const { readComponentState } = require("../desktop/component-state");

const ASSET_PREFIX = "https://github.com/Qlh430/SuperQAI/releases/download/v1.3.0/";

function writeFile(root, relative, content) {
  const target = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function appFixture(root, version, indexText) {
  writeFile(root, "package.json", `${JSON.stringify({ name: "ai-os", productName: "AI OS", version, private: true, main: "desktop/main.js" }, null, 2)}\n`);
  writeFile(root, "index.html", indexText);
  writeFile(root, "server.js", "console.log('server fixture');\n");
  writeFile(root, "module-manifest.js", "window.fixture = true;\n");
  writeFile(root, "desktop/main.js", "console.log('desktop fixture');\n");
  writeFile(root, "desktop/component-state.js", "module.exports = {};\n");
  writeFile(root, "desktop/component-rollback.js", "module.exports = {};\n");
  writeFile(root, "desktop/runtime-retention.js", "module.exports = {};\n");
  writeFile(root, "desktop/rollback-retention.js", "module.exports = {};\n");
  writeFile(root, "canvas-theme.js", "window.canvasThemeFixture = true;\n");
  writeFile(root, "image-generation-service.js", "module.exports = {};\n");
  writeFile(root, "image-model-catalog.js", "module.exports = {};\n");
  writeFile(root, "image-model-rules.js", "module.exports = {};\n");
  writeFile(root, "api-video-task-service.js", "module.exports = {};\n");
  writeFile(root, "minimax-h3-task-service.js", "module.exports = {};\n");
  writeFile(root, "media-file-service.js", "module.exports = {};\n");
  writeFile(root, "comfyui-client.js", "module.exports = {};\n");
  writeFile(root, "comfy-workflow-task-service.js", "module.exports = {};\n");
  writeFile(root, "runninghub-outpaint-service.js", "module.exports = {};\n");
  writeFile(root, "chat-http-api.js", "module.exports = {};\n");
  writeFile(root, "chat-message-service.js", "module.exports = {};\n");
  writeFile(root, "chat-search-service.js", "module.exports = {};\n");
}

function writeRuntime(root, runtimeName, appRoot, componentManifest) {
  const runtimeRoot = path.join(root, ".ai-runtime", "versions", runtimeName);
  fs.mkdirSync(runtimeRoot, { recursive: true });
  for (const relative of REQUIRED_RUNTIME_FILES) {
    if (relative.startsWith("resources/app/")) continue;
    writeFile(runtimeRoot, relative, relative.endsWith(".json") ? "{}\n" : "fixture\n");
  }
  writeFile(runtimeRoot, "package.json", `${JSON.stringify({ version: runtimeName.replace(/-win-x64$/, ""), main: "desktop/main.js" }, null, 2)}\n`);
  const targetApp = path.join(runtimeRoot, "resources", "app");
  fs.mkdirSync(targetApp, { recursive: true });
  for (const entry of fs.readdirSync(appRoot, { withFileTypes: true })) {
    const source = path.join(appRoot, entry.name);
    const target = path.join(targetApp, entry.name);
    if (entry.isDirectory()) fs.cpSync(source, target, { recursive: true });
    else fs.copyFileSync(source, target);
  }
  for (const relative of REQUIRED_RUNTIME_FILES) {
    if (!relative.startsWith("resources/app/")) continue;
    const appRelative = relative.slice("resources/app/".length);
    const target = path.join(targetApp, ...appRelative.split("/"));
    if (!fs.existsSync(target)) writeFile(targetApp, appRelative, "fixture\n");
  }
  writeFile(targetApp, "ai-os-components.json", `${JSON.stringify(componentManifest, null, 2)}\n`);
  return runtimeRoot;
}

function assetBufferMap(componentPackages, runtimeZipPath) {
  const files = new Map();
  files.set("ai-os-update.json", Buffer.from("manifest placeholder"));
  files.set(path.basename(runtimeZipPath), fs.readFileSync(runtimeZipPath));
  for (const name of ["ai-os-components.json", ...componentPackages.componentAssets]) {
    files.set(name, fs.readFileSync(path.join(path.dirname(componentPackages.manifestPath), name)));
  }
  return files;
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-component-update-"));
  const realRoot = fs.realpathSync(root);
  try {
    const sourceRoot = path.resolve(__dirname, "..");
    const oldAppRoot = path.join(root, "old-app");
    const newAppRoot = path.join(root, "new-app");
    appFixture(oldAppRoot, "1.2.3", "<title>old</title>\n");
    appFixture(newAppRoot, "1.3.0", "<title>new</title>\n");

    const oldRelease = path.join(root, "old-release");
    const newRelease = path.join(root, "new-release");
    fs.mkdirSync(oldRelease);
    fs.mkdirSync(newRelease);
    const oldPackages = buildComponentPackages({ sourceRoot, appRoot: oldAppRoot, releaseRoot: oldRelease, version: "1.2.3" });
    const newPackages = buildComponentPackages({ sourceRoot, appRoot: newAppRoot, releaseRoot: newRelease, version: "1.3.0" });
    writeFile(newAppRoot, "ai-os-components.json", fs.readFileSync(newPackages.manifestPath));
    const repeatedRelease = path.join(root, "repeated-release");
    fs.mkdirSync(repeatedRelease);
    const repeatedPackages = buildComponentPackages({ sourceRoot, appRoot: newAppRoot, releaseRoot: repeatedRelease, version: "1.3.0" });
    assert.ok(
      !repeatedPackages.manifest.components.some((component) => component.files.some((file) => file.path === "ai-os-components.json")),
      "the embedded component manifest must not include itself in component hashes",
    );
    const providerCore = newPackages.manifest.components.find((component) => component.id === "provider-core");
    assert.ok(providerCore, "provider-core component should exist");
    assert.ok(
      providerCore.files.some((file) => file.path === "api-video-task-service.js"),
      "API video task service must update with provider-core",
    );
    assert.ok(
      providerCore.files.some((file) => file.path === "minimax-h3-task-service.js"),
      "MiniMax H3 task service must update with provider-core",
    );
    assert.ok(
      providerCore.files.some((file) => file.path === "runninghub-outpaint-service.js"),
      "RunningHub outpaint service must update with provider-core",
    );
    assert.ok(
      providerCore.files.some((file) => file.path === "media-file-service.js"),
      "media file service must update with provider-core",
    );
    const comfyuiComponent = newPackages.manifest.components.find((component) => component.id === "comfyui");
    assert.ok(comfyuiComponent, "comfyui component should exist");
    assert.ok(
      comfyuiComponent.files.some((file) => file.path === "comfyui-client.js"),
      "shared ComfyUI client must update with the comfyui component",
    );
    assert.ok(
      comfyuiComponent.files.some((file) => file.path === "comfy-workflow-task-service.js"),
      "ComfyUI workflow task service must update with the comfyui component",
    );
    const imageGenerationComponent = newPackages.manifest.components.find((component) => component.id === "image-generation");
    assert.ok(imageGenerationComponent, "image-generation component should exist");
    assert.ok(
      imageGenerationComponent.files.some((file) => file.path === "image-generation-service.js"),
      "image generation service must update with the image-generation component",
    );
    assert.ok(
      imageGenerationComponent.files.some((file) => file.path === "image-model-catalog.js"),
      "image model rules must update with the image-generation component instead of platform-core",
    );
    assert.ok(
      imageGenerationComponent.files.some((file) => file.path === "image-model-rules.js"),
      "shared image model rules must update with the image-generation component",
    );
    const osShell = newPackages.manifest.components.find((component) => component.id === "os-shell");
    assert.ok(osShell, "os-shell component should exist");
    assert.ok(
      osShell.files.some((file) => file.path === "desktop/component-state.js"),
      "desktop component state must update with the OS shell component",
    );
    assert.ok(
      osShell.files.some((file) => file.path === "desktop/component-rollback.js"),
      "desktop component rollback must update with the OS shell component",
    );
    assert.ok(
      osShell.files.some((file) => file.path === "desktop/runtime-retention.js"),
      "desktop runtime retention must update with the OS shell component",
    );
    assert.ok(
      osShell.files.some((file) => file.path === "desktop/rollback-retention.js"),
      "desktop rollback retention must update with the OS shell component",
    );
    const chatServices = newPackages.manifest.components.find((component) => component.id === "chat-services");
    assert.ok(chatServices, "chat-services component should exist");
    for (const filePath of ["chat-http-api.js", "chat-message-service.js", "chat-search-service.js"]) {
      assert.ok(
        chatServices.files.some((file) => file.path === filePath),
        `${filePath} must update independently from platform-core`,
      );
    }

    const portableRoot = path.join(root, "portable");
    writeRuntime(portableRoot, "1.2.3-win-x64", oldAppRoot, oldPackages.manifest);
    writeFile(portableRoot, ".ai-runtime/.active-runtime", "1.2.3-win-x64\n");
    writeFile(portableRoot, "data/business.txt", "business data must survive\n");

    const runtimeZipPath = path.join(newRelease, "AI-OS-Runtime-1.3.0-win-x64.zip");
    createZip(newAppRoot, runtimeZipPath);
    const runtimeBytes = fs.readFileSync(runtimeZipPath);
    const files = assetBufferMap(newPackages, runtimeZipPath);
    files.set("ai-os-update.json", Buffer.from(JSON.stringify({
      format: 1,
      product: "AI OS",
      version: "1.3.0",
      platform: "win32",
      arch: "x64",
      minUpdaterVersion: 1,
      fileName: path.basename(runtimeZipPath),
      size: runtimeBytes.length,
      sha256: sha256(runtimeBytes),
      components: newPackages.asset,
    }, null, 2)));

    const assets = [...files.keys()].map((name) => ({
      name,
      size: files.get(name).length,
      browser_download_url: `${ASSET_PREFIX}${name}`,
    }));
    const release = {
      tag_name: "v1.3.0",
      body: "component update fixture",
      assets,
    };
    const requested = [];
    const fetchImpl = async (url) => {
      if (String(url).includes("/releases/latest")) return Response.json(release);
      const name = decodeURIComponent(new URL(url).pathname.split("/").pop());
      requested.push(name);
      const buffer = files.get(name);
      if (!buffer) return new Response("", { status: 404 });
      return new Response(buffer);
    };

    const updater = createUpdater({ portableRoot, currentVersion: "1.2.3", fetchImpl });
    const available = await updater.check();
    assert.equal(available.status, "available");
    assert.equal(available.componentUpdate.changedCount, 1, "only the changed platform component should be selected");
    assert.ok(available.componentUpdate.downloadSize < available.fullSize, "component update must be smaller than the full runtime");

    const ready = await updater.download();
    assert.equal(ready.status, "ready", ready.error);
    assert.equal(ready.componentUpdate.changedCount, 1);
    assert.ok(!requested.includes(path.basename(runtimeZipPath)), "delta update must not download the full runtime zip");

    const candidateApp = path.join(portableRoot, ".ai-runtime", "versions", "1.3.0-win-x64", "resources", "app");
    assert.equal(fs.readFileSync(path.join(candidateApp, "index.html"), "utf8"), "<title>new</title>\n");
    assert.equal(fs.readFileSync(path.join(candidateApp, "desktop", "main.js"), "utf8"), "console.log('desktop fixture');\n");
    assert.equal(readComponentState(portableRoot), null, "component state activates only after the candidate starts successfully");
    assert.equal(fs.readFileSync(path.join(portableRoot, "data", "business.txt"), "utf8"), "business data must survive\n");
    console.log("Component update checks passed: changed-component selection, component-only download, runtime assembly and data preservation.");
  } finally {
    if (fs.realpathSync(root) !== realRoot || !path.basename(realRoot).startsWith("ai-os-component-update-")) throw new Error("Temporary fixture path changed; cleanup refused.");
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
