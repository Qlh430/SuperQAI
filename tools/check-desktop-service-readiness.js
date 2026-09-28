"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { requestServiceReady, waitForServiceReady } = require("../desktop/service-readiness");

(async () => {
  const paths = [];
  let readyRequests = 0;
  const server = http.createServer((req, res) => {
    paths.push(req.url);
    if (req.url !== "/api/system/ready") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    readyRequests += 1;
    if (readyRequests < 3) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, lanUrls: ["http://192.0.2.10:3199"] }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const localUrl = `http://127.0.0.1:${port}`;
  try {
    await assert.rejects(
      requestServiceReady(localUrl, { timeoutMs: 200 }),
      /503/,
      "a non-ready service must not be accepted",
    );
    const result = await waitForServiceReady({
      localUrl,
      timeoutMs: 2_000,
      requestTimeoutMs: 200,
      retryDelayMs: 20,
      isServiceRunning: () => true,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.lanUrls, ["http://192.0.2.10:3199"]);
    assert.ok(readyRequests >= 3, "readiness should retry transient startup failures");
    assert.ok(paths.every((value) => value === "/api/system/ready"), "startup must use the lightweight readiness route");

    await assert.rejects(
      waitForServiceReady({
        localUrl,
        timeoutMs: 200,
        requestTimeoutMs: 50,
        retryDelayMs: 10,
        isServiceRunning: () => false,
        getStoppedError: () => new Error("service stopped"),
      }),
      /service stopped/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("Desktop service readiness checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
