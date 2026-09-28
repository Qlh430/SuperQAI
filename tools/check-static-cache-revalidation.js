"use strict";

/**
 * Static assets have to be revalidated, not trusted for a year.
 *
 * Client scripts are served `no-cache`, so a repaired page is revalidated before reuse;
 * a `.glb` used to be sent with `max-age=31536000` and no validator at all,
 * which meant a browser that had already downloaded a broken model kept using
 * it no matter how many times the app was restarted. These checks pin the
 * replacement contract: media is revalidated with an ETag, a matching ETag
 * answers 304, and a changed file answers 200 with the new bytes.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

async function run() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-static-cache-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_SKIP_ENV_FILE: "1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_STATIC_CACHE_MODE: "production",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_SYSTEM_DB_FILE: path.join(dataDir, "system.sqlite"),
      AI_OS_OUTPUT_DIR: path.join(dataDir, "output"),
    },
  });
  const origin = `http://127.0.0.1:${port}`;

  async function head(url) {
    const response = await fetch(new URL(url, origin));
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      bytes,
      cache: response.headers.get("cache-control") || "",
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
    };
  }

  try {
    let ready = false;
    for (let index = 0; index < 200; index += 1) {
      try {
        const response = await fetch(`${origin}/index.html`);
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, "isolated server starts");

    // A client script has to be revalidated on every load, or a fix never lands.
    const script = await head("/canvas-director3d.js");
    assert.equal(script.status, 200, "the director script is served");
    assert.match(script.cache, /no-cache/, "client scripts must revalidate before reuse");
    assert.ok(script.etag, "client scripts carry an ETag for cheap revalidation");

    // Media is worth keeping, but it has to carry a validator so a repaired
    // model can replace the copy already in the browser.
    const model = await head("/assets/models/director3d/human-male.glb");
    assert.equal(model.status, 200, "the character model is served");
    assert.match(model.cache, /no-cache/, "media must be revalidated rather than trusted");
    assert.doesNotMatch(model.cache, /max-age=31536000/, "media must not be cached for a year");
    assert.ok(model.etag, "media carries an ETag");
    assert.ok(model.lastModified, "media carries a Last-Modified");

    // A browser that already has the model asks again and is told to reuse it.
    const revalidated = await fetch(new URL("/assets/models/director3d/human-male.glb", origin), {
      headers: { "if-none-match": model.etag },
    });
    assert.equal(revalidated.status, 304, "a matching ETag answers 304");
    assert.equal(
      revalidated.headers.get("etag"),
      model.etag,
      "the 304 repeats the validator so the browser keeps its copy",
    );

    // And a stale validator has to fetch the new bytes rather than 304.
    const changed = await fetch(new URL("/assets/models/director3d/human-male.glb", origin), {
      headers: { "if-none-match": 'W/"1-1"' },
    });
    assert.equal(changed.status, 200, "an out-of-date ETag answers 200");
    assert.equal(
      Buffer.from(await changed.arrayBuffer()).length,
      model.bytes.length,
      "the replacement bytes are the ones on disk",
    );

    // `If-Modified-Since` alone is still honoured, for the browsers that send
    // only that header.
    const dated = await fetch(new URL("/assets/models/director3d/human-male.glb", origin), {
      headers: { "if-modified-since": model.lastModified },
    });
    assert.equal(dated.status, 304, "a Last-Modified from the same second answers 304");

    console.log("static cache revalidation checks passed");
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
