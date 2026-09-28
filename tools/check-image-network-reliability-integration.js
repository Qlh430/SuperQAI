"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createProxyAwareFetch } = require("../outbound-fetch");
const { createOutboundRoutePolicy } = require("../outbound-route-policy");
const { createImageSyncService } = require("../image-sync-service");
const { createImageJobManager } = require("../image-job-manager");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const API_URL = "https://image-api.example/v1/images/generations";
const CDN_URL = "https://image-cdn.example/generated/result.png";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function imageResponse() {
  return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
}

function connectionFailure(route) {
  return Object.assign(new Error(`${route} connect timeout before submission`), { code: "UND_ERR_CONNECT_TIMEOUT" });
}

function createHarness({ apiRoute = "direct", cdnRoute = "direct", cdnAvailable = true } = {}) {
  const now = Date.now();
  const initialState = apiRoute === "proxy" ? {
    version: 1,
    hosts: {
      "https://image-api.example:443": {
        preferred: "proxy",
        proxy: { successes: 2, failures: 0, consecutiveFailures: 0, latencyMs: 10, updatedAt: now },
      },
    },
  } : undefined;
  const policy = createOutboundRoutePolicy({ initialState });
  const calls = [];
  let apiGenerationPostCount = 0;
  let allowCdn = cdnAvailable;
  const dispatcher = { route: "proxy" };
  const adaptiveFetch = createProxyAwareFetch({
    proxyUrl: "http://127.0.0.1:17890",
    routePolicy: policy,
    createProxyDispatcher: () => dispatcher,
    fetchImpl: async (url, options = {}) => {
      const route = options.dispatcher === dispatcher ? "proxy" : "direct";
      const address = String(url);
      calls.push({ address, route, method: String(options.method || "GET").toUpperCase() });
      if (address === API_URL) {
        if (route !== apiRoute) throw connectionFailure(route);
        apiGenerationPostCount += 1;
        return jsonResponse({ model: "gpt-image-2", data: [{ url: CDN_URL }] });
      }
      if (address === CDN_URL) {
        if (!allowCdn || route !== cdnRoute) throw connectionFailure(route);
        return imageResponse();
      }
      throw new Error(`Unexpected URL: ${address}`);
    },
  });
  return {
    adaptiveFetch,
    calls,
    policy,
    get apiGenerationPostCount() { return apiGenerationPostCount; },
    setCdnAvailable(value) { allowCdn = Boolean(value); },
  };
}

function waitForTerminal(manager, id) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 3000;
    const check = () => {
      const job = manager.get(id);
      if (["completed", "sync_failed", "failed", "unknown"].includes(job?.state)) return resolve(job);
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for image job ${id}: ${job?.state}`));
      setTimeout(check, 10);
    };
    check();
  });
}

async function runCase({ apiRoute, cdnRoute }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "image-network-route-"));
  try {
    const harness = createHarness({ apiRoute, cdnRoute });
    const sync = createImageSyncService({
      outputDir: path.join(directory, "output"),
      fetchImpl: harness.adaptiveFetch,
      delaysMs: [0],
    });
    const manager = createImageJobManager({
      filePath: path.join(directory, "jobs.json"),
      timeoutMs: 2000,
      execute: async (_payload, context) => {
        const response = await harness.adaptiveFetch(API_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          outbound: { mode: "auto", requestClass: "billable", purpose: "image-generation" },
        });
        const remote = await response.json();
        context.report("syncing", { remoteResult: remote });
        const localized = await sync.syncResponse(remote);
        return { status: 200, body: { ...remote, data: localized.data, saved_images: localized.savedImages } };
      },
      recover: async () => { throw new Error("Completed jobs should not recover"); },
    });
    const created = manager.create({ model: "gpt-image-2" }, { boardId: "board", nodeId: "node" });
    const finalJob = await waitForTerminal(manager, created.id);
    assert.equal(harness.apiGenerationPostCount, 1, "adaptive routing must not duplicate the paid POST");
    assert.equal(finalJob.state, "completed");
    assert.match(finalJob.result.data[0].local_url, /^\/output\//);
    assert.equal(finalJob.result.data[0].url.startsWith("http"), false);
    const apiHostDecision = harness.policy.choose({ url: API_URL, mode: "auto", proxyAvailable: true });
    const cdnHostDecision = harness.policy.choose({ url: CDN_URL, mode: "auto", proxyAvailable: true });
    assert.equal(apiHostDecision.route, apiRoute);
    assert.equal(cdnHostDecision.route, cdnRoute);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function runRecoveryCase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "image-network-recovery-"));
  try {
    const harness = createHarness({ apiRoute: "direct", cdnRoute: "direct", cdnAvailable: false });
    const sync = createImageSyncService({
      outputDir: path.join(directory, "output"),
      fetchImpl: harness.adaptiveFetch,
      delaysMs: [0],
    });
    let galleryCommitCount = 0;
    const manager = createImageJobManager({
      filePath: path.join(directory, "jobs.json"),
      timeoutMs: 2000,
      execute: async (_payload, context) => {
        const response = await harness.adaptiveFetch(API_URL, {
          method: "POST",
          body: "{}",
          outbound: { mode: "auto", requestClass: "billable", purpose: "image-generation" },
        });
        const remote = await response.json();
        context.report("syncing", { remoteResult: remote });
        try {
          const localized = await sync.syncResponse(remote);
          return { status: 200, body: { data: localized.data, saved_images: localized.savedImages } };
        } catch (error) {
          return { status: 200, body: { ...remote, sync_error: error.message } };
        }
      },
      recover: async (result) => {
        const localized = await sync.recover(result.data);
        return { status: 200, body: { data: localized.data, saved_images: localized.savedImages } };
      },
    });
    const created = manager.create({ model: "gpt-image-2" }, { boardId: "board", nodeId: "node" });
    const failed = await waitForTerminal(manager, created.id);
    if (failed.state === "completed") galleryCommitCount += 1;
    assert.equal(failed.state, "sync_failed");
    assert.equal(failed.result.data[0].local_url, undefined);
    assert.equal(galleryCommitCount, 0, "an unverified remote image must not commit to the gallery");
    assert.equal(harness.apiGenerationPostCount, 1);

    harness.setCdnAvailable(true);
    const recovered = await manager.recover(created.id);
    if (recovered.state === "completed") galleryCommitCount += 1;
    assert.equal(recovered.state, "completed");
    assert.match(recovered.result.data[0].local_url, /^\/output\//);
    assert.equal(harness.apiGenerationPostCount, 1, "recovery may download again but must not resubmit generation");
    assert.equal(galleryCommitCount, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

(async () => {
  await runCase({ apiRoute: "direct", cdnRoute: "proxy" });
  await runCase({ apiRoute: "proxy", cdnRoute: "direct" });
  await runRecoveryCase();
  console.log("Image network reliability integration checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
