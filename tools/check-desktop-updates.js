"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { compareVersions, parseRelease, validateManifest, downloadFile, renameWithRetry, createUpdater } = require("../desktop/updater");
const { writeComponentState } = require("../desktop/component-state");

(async () => {
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.0", "2.0.0"), -1);
  assert.throws(() => compareVersions("../bad", "1.0.0"));
  const repo = "https://github.com/Qlh430/SuperQAI/releases/download/v1.1.0/";
  const assetApi = id => `https://api.github.com/repos/Qlh430/SuperQAI/releases/assets/${id}`;
  const payload = Buffer.from("verified runtime");
  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  const manifest = { format: 1, product: "AI OS", version: "1.1.0", platform: "win32", arch: "x64", minUpdaterVersion: 1, fileName: "AI-OS-Runtime-1.1.0-win-x64.zip", size: payload.length, sha256: hash };
  const release = { tag_name: "v1.1.0", body: "Release notes", assets: [{ name: "ai-os-update.json", browser_download_url: repo + "ai-os-update.json" }, { name: manifest.fileName, browser_download_url: repo + manifest.fileName, size: payload.length }] };
  const info = parseRelease(release, "1.0.0");
  assert.equal(info.version, "1.1.0");
  assert.equal(parseRelease({ ...release, prerelease: true }, "1.0.0"), null);
  assert.equal(parseRelease(release, "1.1.0"), null);
  assert.equal(validateManifest(manifest, info).url, repo + manifest.fileName);
  const apiRelease = {
    ...release,
    assets: release.assets.map((asset, index) => ({ ...asset, url: assetApi(100 + index) })),
  };
  const apiInfo = parseRelease(apiRelease, "1.0.0");
  assert.equal(apiInfo.manifestUrl, assetApi(100));
  assert.equal(validateManifest(manifest, apiInfo).url, assetApi(101));
  for (const bad of [{ ...manifest, sha256: "bad" }, { ...manifest, version: "2.0.0" }, { ...manifest, fileName: "../bad.zip" }, { ...manifest, minUpdaterVersion: 2 }]) assert.throws(() => validateManifest(bad, info));
  assert.throws(() => parseRelease({ ...release, assets: [{ name: "ai-os-update.json", browser_download_url: "https://evil.example/ai-os-update.json" }] }, "1.0.0"));
  assert.throws(() => parseRelease({ ...release, assets: [{ name: "ai-os-update.json", url: "https://evil.example/assets/1" }] }, "1.0.0"));
  let renameAttempts = 0;
  const renamed = await renameWithRetry("source", "destination", {
    rename: async () => {
      renameAttempts += 1;
      if (renameAttempts < 3) throw Object.assign(Error("busy"), { code: "EPERM" });
    },
    wait: async () => {},
  });
  assert.deepEqual(renamed, { attempts: 3 });
  await assert.rejects(
    renameWithRetry("source", "destination", {
      rename: async () => { throw Object.assign(Error("missing"), { code: "ENOENT" }); },
      wait: async () => {},
    }),
    /missing/,
  );
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-os-updater-check-"));
  const original = await fs.realpath(dir);
  try {
    const file = path.join(dir, "download.zip");
    const progress = [];
    await downloadFile(repo + manifest.fileName, file, manifest, { fetchImpl: async () => new Response(payload), onProgress: value => progress.push(value) });
    assert.equal(progress.at(-1), 1, "download must report completed progress");
    assert.deepEqual(await fs.readFile(file), payload);
    const apiFile = path.join(dir, "download-api.zip");
    await downloadFile(assetApi(101), apiFile, manifest, { fetchImpl: async url => {
      assert.equal(url, assetApi(101));
      return new Response(payload);
    } });
    assert.deepEqual(await fs.readFile(apiFile), payload, "API asset downloads must be accepted");
    const resumePayload = Buffer.from("0123456789-resume-payload");
    const resumeHash = crypto.createHash("sha256").update(resumePayload).digest("hex");
    const resumeManifest = { ...manifest, size: resumePayload.length, sha256: resumeHash };
    const splitAt = 7;
    let resumeRequests = 0;
    const resumedFile = path.join(dir, "resumed.zip");
    await downloadFile(repo + manifest.fileName, resumedFile, resumeManifest, {
      fetchImpl: async (_url, options) => {
        resumeRequests += 1;
        if (resumeRequests === 1) {
          let sent = false;
          return new Response(new ReadableStream({
            pull(controller) {
              if (!sent) {
                sent = true;
                controller.enqueue(resumePayload.subarray(0, splitAt));
                return;
              }
              controller.error(Object.assign(new Error("socket reset"), { code: "ECONNRESET" }));
            },
          }));
        }
        assert.equal(options.headers.Range, `bytes=${splitAt}-`);
        return new Response(resumePayload.subarray(splitAt), {
          status: 206,
          headers: { "Content-Range": `bytes ${splitAt}-${resumePayload.length - 1}/${resumePayload.length}` },
        });
      },
      retryDelayMs: 0,
    });
    assert.equal(resumeRequests, 2, "an interrupted download must retry once");
    assert.deepEqual(await fs.readFile(resumedFile), resumePayload, "Range downloads must append to the verified prefix");

    let ignoredRangeRequests = 0;
    const ignoredRangeFile = path.join(dir, "ignored-range.zip");
    await downloadFile(repo + manifest.fileName, ignoredRangeFile, resumeManifest, {
      fetchImpl: async (_url, options) => {
        ignoredRangeRequests += 1;
        if (ignoredRangeRequests === 1) {
          let sent = false;
          return new Response(new ReadableStream({
            pull(controller) {
              if (!sent) {
                sent = true;
                controller.enqueue(resumePayload.subarray(0, splitAt));
                return;
              }
              controller.error(Object.assign(new Error("socket reset"), { code: "ECONNRESET" }));
            },
          }));
        }
        assert.equal(options.headers.Range, `bytes=${splitAt}-`);
        return new Response(resumePayload, { status: 200 });
      },
      retryDelayMs: 0,
    });
    assert.equal(ignoredRangeRequests, 2, "a server that ignores Range must trigger one restart");
    assert.deepEqual(await fs.readFile(ignoredRangeFile), resumePayload, "ignored Range responses must restart without corrupting the file");

    let failedAttempts = 0;
    await assert.rejects(
      downloadFile(repo + manifest.fileName, path.join(dir, "retry-limit.zip"), resumeManifest, {
        fetchImpl: async () => {
          failedAttempts += 1;
          throw Object.assign(new Error("socket reset"), { code: "ECONNRESET" });
        },
        attempts: 3,
        retryDelayMs: 0,
      }),
      /socket reset/,
    );
    assert.equal(failedAttempts, 3, "download retries must stop at the configured attempt limit");

    let completedPartFetches = 0;
    const completedPartFile = path.join(dir, "completed-part.zip");
    const completedPartTemp = `${completedPartFile}.${resumeHash.slice(0, 12)}.part`;
    await fs.writeFile(completedPartTemp, resumePayload);
    await downloadFile(repo + manifest.fileName, completedPartFile, resumeManifest, {
      fetchImpl: async () => {
        completedPartFetches += 1;
        throw new Error("completed part must not be downloaded again");
      },
    });
    assert.equal(completedPartFetches, 0, "a complete verified part file must finish without another request");
    assert.deepEqual(await fs.readFile(completedPartFile), resumePayload);
    await assert.rejects(downloadFile(repo + manifest.fileName, path.join(dir, "bad.zip"), { ...manifest, sha256: "0".repeat(64) }, { fetchImpl: async () => new Response(payload) }), /SHA-256/);
    await assert.rejects(downloadFile(repo + manifest.fileName, path.join(dir, "large.zip"), { ...manifest, size: 1 }, { fetchImpl: async () => new Response(payload) }), /size|大小/);
    const updater = createUpdater({ portableRoot: "", currentVersion: "1.0.0" });
    assert.equal(updater.getStatus().status, "development");
    await assert.rejects(updater.download(), /便携版/);
    const portable = path.join(dir, "portable");
    await fs.mkdir(portable);
    writeComponentState(portable, {
      format: 1,
      product: "AI OS",
      updatedAt: "2026-09-24T00:00:00.000Z",
      sourceRuntime: "1.0.0-win-x64",
      manifestVersion: "1.0.0",
      components: [{
        id: "platform-core",
        label: "系统内核",
        version: "1.0.0-fixture",
        hash: "a".repeat(64),
        previousVersion: "0.9.0-fixture",
        previousHash: "b".repeat(64),
        installedAt: "2026-09-24T00:00:00.000Z",
        sourceRuntime: "1.0.0-win-x64",
        fileCount: 1,
      }],
    });
    await fs.mkdir(path.join(portable, ".ai-runtime", "updates"), { recursive: true });
    await fs.writeFile(path.join(portable, ".ai-runtime", "updates", "result.json"), JSON.stringify({
      status: "rolled-back",
      error: "fixture rollback",
      finishedAt: "2026-09-24T00:01:00.000Z",
    }));
    const stateStatus = createUpdater({ portableRoot: portable, currentVersion: "1.0.0" }).getStatus();
    assert.equal(stateStatus.componentState.total, 1);
    assert.equal(stateStatus.componentState.components[0].id, "platform-core");
    assert.equal(stateStatus.componentState.sourceRuntime, "1.0.0-win-x64");
    assert.equal(stateStatus.componentState.lastResult.status, "rolled-back");
    const offline = createUpdater({ portableRoot: portable, currentVersion: "1.0.0", fetchImpl: async () => { throw Error("offline"); } });
    await offline.check();
    assert.equal(offline.getStatus().status, "error");
    assert.match(offline.getStatus().error, /offline/);
    const network = createUpdater({
      portableRoot: portable,
      currentVersion: "1.0.0",
      fetchImpl: async () => {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
        });
      },
    });
    await network.check();
    assert.match(network.getStatus().error, /网络连接失败/);
    assert.match(network.getStatus().error, /UND_ERR_CONNECT_TIMEOUT/);
    const unicode = path.join(dir, '中文下载');await fs.mkdir(unicode);
    await assert.rejects(downloadFile(repo + manifest.fileName, path.join(unicode, 'bad.zip'), { ...manifest, sha256:'0'.repeat(64) }, {fetchImpl:async()=>new Response(payload)}), /SHA-256/);
    assert.deepEqual(await fs.readdir(unicode),[], 'failed download must clean partial files in Chinese paths');
    const empty = createUpdater({ portableRoot: portable, currentVersion: "1.0.0", fetchImpl: async () => new Response("", { status: 404 }) });
    await empty.check();
    assert.equal(empty.getStatus().status, "unpublished");
    let broken = true;
    const retry = createUpdater({ portableRoot: portable, currentVersion: "1.0.0", fetchImpl: async url => {
      if (url.endsWith('/latest')) return Response.json(release);
      if (url.endsWith('.json')) return Response.json(manifest);
      return new Response(broken ? 'bad' : payload);
    } });
    await retry.check();
    await retry.download();
    assert.equal(retry.getStatus().status, 'error', 'download failures must not leave a stuck spinner');
    assert.equal(await fs.stat(path.join(portable, 'data')).catch(() => null), null, 'download failure never touches business data');
    assert.throws(() => parseRelease({ ...release, assets: [{name:'ai-os-update.json'}] }, '1.0.0'));
    console.log("PASS updater version rules, GitHub asset boundaries, manifest compatibility, streamed hash/size checks, Windows rename retries, development guard and network failures");
  } finally {
    if (await fs.realpath(dir) !== original || path.dirname(dir) !== os.tmpdir()) throw Error("Unsafe cleanup");
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
