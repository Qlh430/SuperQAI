"use strict";

const assert = require("node:assert/strict");
const { createSystemHttpApi } = require("../system-http-api");

function responseRecorder() {
  return {
    status: 0,
    body: null,
    sendJson(_res, status, body) {
      this.status = status;
      this.body = body;
    },
  };
}

function request(url, method = "GET") {
  return { url, method, headers: { host: "localhost" } };
}

function createService(overrides = {}) {
  const calls = { audits: [] };
  const service = createSystemHttpApi({
    fs: { statfsSync: () => ({ bavail: 4, bsize: 1024 }) },
    dataDir: "Q:/data",
    port: 3199,
    getLanUrls: () => ["http://192.168.1.2:3199"],
    getAuthContext: async () => null,
    publicUser: (user) => user,
    authDisabled: false,
    getAuthDisabledUser: () => null,
    systemDb: { quickCheck: () => ({ ok: true, result: "ok" }) },
    requireSuperAdmin: async () => ({ user: { id: "admin-1" } }),
    backupService: {
      listSnapshots: () => [{ name: "snapshot-1" }],
      createSnapshot: ({ includeMedia }) => ({
        path: "Q:/backups/snapshot-1",
        includeMedia,
      }),
    },
    readJson: async () => ({ includeMedia: false }),
    sendJson: (res, status, body) => res.sendJson(res, status, body),
    appendAudit: (entry) => calls.audits.push(entry),
    ...overrides,
  });
  return { service, calls };
}

(async () => {
  {
    const { service } = createService();
    const response = responseRecorder();
    assert.equal(await service.publicHandle(request("/api/system/ready"), response), true);
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.port, 3199);
  }

  {
    const { service } = createService();
    const response = responseRecorder();
    assert.equal(await service.publicHandle(request("/api/system/ready", "POST"), response), true);
    assert.equal(response.status, 405);
    assert.equal(response.body.code, "method_not_allowed");
  }

  {
    const { service } = createService();
    const response = responseRecorder();
    await service.publicHandle(request("/api/system/health"), response);
    assert.equal(response.status, 200);
    assert.equal(response.body.dataDir, null);
    assert.equal(response.body.freeBytes, 4096);
  }

  {
    const { service } = createService({
      getAuthContext: async () => ({ user: { id: "user-1" } }),
      systemDb: { quickCheck: () => ({ ok: false, result: "broken" }) },
    });
    const response = responseRecorder();
    await service.publicHandle(request("/api/system/health"), response);
    assert.equal(response.status, 503);
    assert.equal(response.body.dataDir, "Q:/data");
    assert.equal(response.body.database, "broken");
  }

  {
    const { service } = createService();
    const response = responseRecorder();
    assert.equal(await service.handle(request("/api/system/backup/status"), response), true);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.snapshots, [{ name: "snapshot-1" }]);
  }

  {
    const { service, calls } = createService();
    const response = responseRecorder();
    assert.equal(await service.handle(request("/api/admin/backup", "POST"), response), true);
    assert.equal(response.status, 201);
    assert.equal(response.body.snapshot.includeMedia, false);
    assert.equal(calls.audits.length, 1);
    assert.equal(calls.audits[0].actorUserId, "admin-1");
    assert.equal(calls.audits[0].targetId, "snapshot-1");
  }

  {
    const { service } = createService({
      requireSuperAdmin: async (_req, res) => {
        res.sendJson(res, 403, { error: "forbidden" });
        return null;
      },
    });
    const response = responseRecorder();
    assert.equal(await service.handle(request("/api/admin/backup", "POST"), response), true);
    assert.equal(response.status, 403);
  }

  {
    const { service } = createService({
      backupService: {
        listSnapshots: () => [],
        createSnapshot: () => { throw Object.assign(new Error("disk full"), { code: "backup_failed" }); },
      },
    });
    const response = responseRecorder();
    await service.handle(request("/api/admin/backup", "POST"), response);
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "disk full", code: "backup_failed" });
  }

  console.log("System HTTP API checks passed.");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
