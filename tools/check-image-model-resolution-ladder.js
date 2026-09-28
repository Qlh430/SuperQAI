"use strict";

// A provider row normally never declares its quality ladder. The catalog still
// has to publish the ladder the platform and family accept, otherwise the
// canvas node collapses to a single 1K choice (an empty list normalises to
// ["1"] on the client).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function reservePort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    timer.unref?.();
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

function model(id, protocol, capabilities = ["image.generate", "image.edit"]) {
  return { id, displayName: id, protocol, capabilities };
}

(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "image-resolution-ladder-"));
  let serverOutput = "";
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_AUTH_DISABLED: "true",
      AI_OS_SKIP_ENV_FILE: "1",
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
    },
  });
  server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });
  server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (server.exitCode !== null) break;
      try {
        const response = await fetch(`${baseUrl}/api/system/ready`);
        if (response.ok && (await response.json()).ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `isolated server did not become ready: ${serverOutput}`);

    const saved = await fetch(`${baseUrl}/api/providers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ladder-site",
        name: "Ladder Site",
        baseUrl: "https://ladder.example.com/v1",
        protocol: "openai",
        enabled: true,
        apiKey: "ladder-key",
        models: [
          // No resolutions field: this is what the settings form saves.
          model("gpt-image-2", "openai-images"),
        ],
      }),
    });
    assert.equal(saved.status, 201, await saved.text());

    const savedGemini = await fetch(`${baseUrl}/api/providers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ladder-google",
        name: "Ladder Google",
        baseUrl: "https://ladder.googleapis.example.com/v1",
        protocol: "gemini",
        enabled: true,
        apiKey: "ladder-google-key",
        models: [model("gemini-3-pro-image", "gemini")],
      }),
    });
    assert.equal(savedGemini.status, 201, await savedGemini.text());

    const catalog = await (await fetch(`${baseUrl}/api/image-models`)).json();
    const byModelId = new Map(catalog.models.map((item) => [item.modelId, item]));
    const gpt = byModelId.get("gpt-image-2");
    const gemini = byModelId.get("gemini-3-pro-image");
    assert.ok(gpt && gemini, `the catalog must publish both models: ${JSON.stringify(catalog.models)}`);
    assert.deepEqual(
      gpt.resolutions,
      ["1", "2", "4"],
      "an undeclared OpenAI ladder must publish 1K/2K/4K instead of an empty list",
    );
    assert.deepEqual(
      gemini.resolutions,
      ["1", "2", "4"],
      "a Gemini model keeps the platform ladder as well",
    );
    assert.ok(
      (catalog.candidates || []).every((candidate) => candidate.resolutions.length > 0),
      "canvas routing candidates must carry the derived ladder too",
    );

    const declared = await fetch(`${baseUrl}/api/providers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "limited-site",
        name: "Limited Site",
        baseUrl: "https://limited.example.com/v1",
        protocol: "openai",
        enabled: true,
        apiKey: "limited-key",
        models: [{
          ...model("gpt-image-2", "openai-images"),
          metadata: { resolutions: ["1"] },
        }],
      }),
    });
    assert.equal(declared.status, 201, await declared.text());
    const narrowed = await (await fetch(`${baseUrl}/api/image-models`)).json();
    const limited = narrowed.models.find((item) => item.providerId === "limited-site");
    assert.deepEqual(
      limited.resolutions,
      ["1"],
      "an API 接入 that explicitly declares only 1K must keep that narrower ladder",
    );

    console.log("Image model resolution ladder checks passed.");
  } finally {
    await stopChild(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
