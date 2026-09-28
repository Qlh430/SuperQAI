"use strict";

const assert = require("node:assert/strict");
const { createImageSyncHttpApi } = require("../image-sync-http-api");

function createResponse() {
  const result = { status: 0, body: null };
  return {
    result,
    response: {
      writeHead(status) {
        result.status = status;
      },
      end(payload) {
        const text = String(payload || "");
        result.body = text ? JSON.parse(text) : null;
      },
    },
  };
}

async function main() {
  const calls = [];
  const api = createImageSyncHttpApi({
    imageSyncService: {
      async recover(items) {
        calls.push(items);
        if (items[0].url.includes("fail")) throw new Error("remote failed");
        return { data: [{ local_url: "/output/local.png", width: "1200", height: 800 }] };
      },
    },
    readJson: async (req) => req.json || {},
    sendJson: (res, status, body) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
    },
  });

  const success = createResponse();
  assert.equal(await api.handle({
    method: "POST",
    url: "/api/image-sync/localize",
    auth: { user: { id: "user-1" } },
    json: { source: "https://example.com/image.png" },
  }, success.response), true);
  assert.equal(success.result.status, 200);
  assert.deepEqual(success.result.body, {
    item: { local_url: "/output/local.png", width: 1200, height: 800 },
  });
  assert.equal(calls.length, 1);

  const invalid = createResponse();
  assert.equal(await api.handle({
    method: "POST",
    url: "/api/image-sync/localize",
    auth: { user: { id: "user-1" } },
    json: { source: "file:///secret.png" },
  }, invalid.response), true);
  assert.equal(invalid.result.status, 400);

  const failed = createResponse();
  assert.equal(await api.handle({
    method: "POST",
    url: "/api/image-sync/localize",
    auth: { user: { id: "user-1" } },
    json: { source: "https://example.com/fail.png" },
  }, failed.response), true);
  assert.equal(failed.result.status, 502);

  const unauthorized = createResponse();
  assert.equal(await api.handle({
    method: "POST",
    url: "/api/image-sync/localize",
    json: { source: "https://example.com/image.png" },
  }, unauthorized.response), true);
  assert.equal(unauthorized.result.status, 401);

  const unrelated = createResponse();
  assert.equal(await api.handle({
    method: "POST",
    url: "/api/images",
    auth: { user: { id: "user-1" } },
  }, unrelated.response), false);
  assert.equal(unrelated.result.status, 0);

  console.log("Image sync HTTP API checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
