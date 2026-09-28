"use strict";

const assert = require("node:assert/strict");
const { createOnlineHttpApi } = require("../online-http-api");

let clock = 0;
const responses = [];
const api = createOnlineHttpApi({
  ttlMs: 45,
  now: () => clock,
  readJson: async (req) => req.body || {},
  sendJson: (_res, status, body) => responses.push({ status, body }),
});

async function request(method, body, clientId) {
  const req = {
    method,
    url: "/api/online",
    body,
    headers: { host: "localhost", "user-agent": clientId || "browser" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const claimed = await api.handle(req, {});
  return { claimed, response: responses.at(-1) };
}

(async () => {
  assert.equal((await request("GET")).response.body.online, 0);
  assert.equal((await request("POST", { clientId: "a", online: true })).response.body.online, 1);
  assert.equal((await request("POST", { clientId: "b", online: true })).response.body.online, 2);

  clock = 46;
  assert.equal((await request("GET")).response.body.online, 0, "stale clients must expire");
  assert.equal((await request("POST", { clientId: "a", online: true })).response.body.online, 1);
  assert.equal((await request("POST", { clientId: "a", online: false })).response.body.online, 0);

  const fallback = await request("POST", { online: true }, "fallback-agent");
  assert.equal(fallback.response.body.online, 1, "missing client ids must use the request fingerprint");
  assert.equal((await request("PUT")).response.status, 405);
  assert.equal((await request("GET", null, "unused")).claimed, true);

  console.log("Online HTTP API checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
