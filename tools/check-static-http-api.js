"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createStaticHttpApi } = require("../static-http-api");

function responseRecorder() {
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  return {
    status: 0,
    body: null,
    headers: {},
    done,
    sendJson(_res, status, body = null) {
      this.status = status;
      this.body = body;
      resolveDone();
    },
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(body = null) {
      this.body = body;
      resolveDone();
    },
  };
}

function request(url, method = "GET", headers = {}) {
  return {
    url,
    method,
    headers: { host: "localhost", ...headers },
  };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-static-api-"));
  const publicDir = path.join(root, "public");
  const outputDir = path.join(root, "output");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "index.html"), "<h1>AI OS</h1>");
  fs.writeFileSync(path.join(publicDir, "app.js"), "console.log('ok')");
  fs.writeFileSync(path.join(publicDir, "asset.bin"), "asset");
  fs.writeFileSync(path.join(outputDir, "result.png"), "image");

  try {
    const api = createStaticHttpApi({
      publicDir,
      outputDir,
      mimeTypes: {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".png": "image/png",
      },
      getAuthDisabledUser: () => null,
      publicUser: (user) => user,
      requireAuth: async (req) => req.auth || null,
      assertOutputMediaRead: async (_userId, requestPath) => {
        if (!requestPath.startsWith("/output/")) throw new Error("unexpected output path");
      },
      sendJson: (res, status, body) => res.sendJson(res, status, body),
      sendAuthError: (res, error) => res.sendJson(res, 500, { error: error.message }),
    });

    assert.equal(await api.handle(request("/api/models"), responseRecorder()), false);
    assert.equal(api.resolveOutputPath("/output/../outside.png"), "");
    assert.equal(api.resolveOutputPath("/output/result.png"), path.join(outputDir, "result.png"));

    const index = responseRecorder();
    assert.equal(await api.handle(request("/"), index), true);
    await index.done;
    assert.equal(index.status, 200);
    assert.equal(index.headers["Content-Type"], "text/html; charset=utf-8");
    assert.equal(index.headers["Cache-Control"], "no-store, max-age=0");
    assert.equal(String(index.body), "<h1>AI OS</h1>");

    const script = responseRecorder();
    await api.handle(request("/app.js"), script);
    await script.done;
    assert.equal(script.status, 200);
    assert.equal(script.headers["Cache-Control"], "no-cache");
    assert.ok(script.headers.ETag);

    const cached = responseRecorder();
    await api.handle(request("/app.js", "GET", { "if-none-match": script.headers.ETag }), cached);
    await cached.done;
    assert.equal(cached.status, 304);
    assert.equal(cached.headers["Cache-Control"], "no-cache");
    assert.equal(cached.body, null);

    const asset = responseRecorder();
    await api.handle(request("/asset.bin"), asset);
    await asset.done;
    assert.equal(asset.status, 200);
    assert.equal(asset.headers["Cache-Control"], "no-cache");

    const forbidden = responseRecorder();
    await api.handle(request("/server.js"), forbidden);
    await forbidden.done;
    assert.equal(forbidden.status, 403);

    const missing = responseRecorder();
    await api.handle(request("/missing.txt"), missing);
    await missing.done;
    assert.equal(missing.status, 404);

    const output = responseRecorder();
    const outputRequest = request("/output/result.png");
    outputRequest.auth = { user: { id: "user-1" } };
    assert.equal(await api.publicHandle(outputRequest, output), true);
    await output.done;
    assert.equal(output.status, 200);
    assert.equal(output.headers["Content-Type"], "image/png");
    assert.equal(output.headers["Cache-Control"], "private, no-store");
    assert.equal(output.headers.Vary, "Cookie");

    console.log("Static HTTP API checks passed.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
