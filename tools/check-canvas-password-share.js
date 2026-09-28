"use strict";

/**
 * 口令共享的画布：接收方从「文件与共享」拿到一张锁着的卡片，输对口令之后画布才列得出来、
 * 打得开，而且能做什么仍然由共享权限决定。
 *
 * 这条链路以前没有任何自动化覆盖，而画布共享面板里的「口令访问」正是靠它成立的。
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PASSWORD = "开门口令";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function requestJson(port, pathname, options = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const headers = { ...(options.cookie ? { cookie: options.cookie } : {}) };
    if (body) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(body);
    }
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method: options.method || "GET", headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let data = {};
        try { data = JSON.parse(text || "{}"); } catch {}
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });
    req.once("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-password-share-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: root,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 120; i += 1) {
      try { if ((await requestJson(port, "/api/auth/session")).status === 401) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const bootstrap = await requestJson(port, "/api/auth/bootstrap", { method: "POST", body: { username: "pw-owner", displayName: "画布所有者", password: "owner-password" } });
    assert.equal(bootstrap.status, 201, JSON.stringify(bootstrap.data));
    const ownerLogin = await requestJson(port, "/api/auth/login", { method: "POST", body: { username: "pw-owner", password: "owner-password" } });
    const ownerCookie = String(ownerLogin.headers["set-cookie"]?.[0] || "").split(";", 1)[0];
    const guest = await requestJson(port, "/api/admin/users", { method: "POST", cookie: ownerCookie, body: { username: "pw-guest", displayName: "访客", password: "guest-temporary" } });
    assert.equal(guest.status, 201, JSON.stringify(guest.data));
    const guestLogin = await requestJson(port, "/api/auth/login", { method: "POST", body: { username: "pw-guest", password: "guest-temporary" } });
    const guestCookie = String(guestLogin.headers["set-cookie"]?.[0] || "").split(";", 1)[0];
    const changed = await requestJson(port, "/api/auth/change-password", { method: "POST", cookie: guestCookie, body: { currentPassword: "guest-temporary", newPassword: "guest-password" } });
    assert.equal(changed.status, 200, JSON.stringify(changed.data));

    const board = await requestJson(port, "/api/canvas/boards", { method: "POST", cookie: ownerCookie, body: { id: "pw-board", title: "口令画布" } });
    assert.equal(board.status, 201, JSON.stringify(board.data));
    const resources = await requestJson(port, "/api/resources?type=canvas", { cookie: ownerCookie });
    const resourceId = resources.data.resources.find((item) => item.resource.refId === "pw-board")?.resource?.id;
    assert.ok(resourceId, "画布资源要登记成功");

    const share = await requestJson(port, `/api/resources/${encodeURIComponent(resourceId)}/shares`, {
      method: "POST",
      cookie: ownerCookie,
      body: { visibility: "password", permission: "read", password: PASSWORD },
    });
    assert.equal(share.status, 201, JSON.stringify(share.data));
    assert.equal(share.data.share.visibility, "password");
    assert.equal(share.data.share.passwordProtected, true);
    assert.equal("passwordHash" in share.data.share, false, "口令哈希不能回给前端");

    // 接收方：资源列表里有一张锁着的卡片（画布库此时不列它）。
    const guestResources = await requestJson(port, "/api/resources?type=canvas", { cookie: guestCookie });
    const entry = guestResources.data.resources.find((item) => item.resource.refId === "pw-board");
    assert.ok(entry, "口令共享的画布要出现在对方的资源列表里，否则对方根本不知道有这张画布");
    assert.equal(entry.access.locked, true);
    assert.ok(entry.access.share?.id, "锁着的卡片要带 shareId，解锁对话框靠它");
    assert.equal(
      (await requestJson(port, "/api/canvas/boards?scope=all", { cookie: guestCookie })).data.boards.some((item) => item.id === "pw-board"),
      false,
      "没解锁之前画布库不该列出它",
    );
    const lockedMeta = await requestJson(port, "/api/canvas/boards/pw-board/meta", { cookie: guestCookie });
    assert.equal(lockedMeta.status, 401, JSON.stringify(lockedMeta.data));
    assert.equal(lockedMeta.data.code, "share_password_required");

    const wrong = await requestJson(port, `/api/shares/${entry.access.share.id}/unlock`, { method: "POST", cookie: guestCookie, body: { password: "猜一个" } });
    assert.equal(wrong.status, 403, JSON.stringify(wrong.data));
    assert.equal(wrong.data.code, "invalid_share_password");

    const unlock = await requestJson(port, `/api/shares/${entry.access.share.id}/unlock`, { method: "POST", cookie: guestCookie, body: { password: PASSWORD } });
    assert.equal(unlock.status, 200, JSON.stringify(unlock.data));
    assert.equal(unlock.data.unlocked.resourceId, resourceId);
    assert.equal(unlock.data.unlocked.shareId, entry.access.share.id);
    assert.ok(Date.parse(unlock.data.unlocked.expiresAt) > Date.now(), "解锁要有有效期");

    assert.equal(
      (await requestJson(port, "/api/canvas/boards?scope=all", { cookie: guestCookie })).data.boards.some((item) => item.id === "pw-board"),
      true,
      "解锁后画布库要能列出它——客户端就是靠这一步把画布打开的",
    );
    assert.equal((await requestJson(port, "/api/canvas/boards/pw-board/meta", { cookie: guestCookie })).status, 200);

    // 进门方式变了，能做什么仍然由权限决定：只读就是只读。
    const revisionOf = async () => {
      const boards = await requestJson(port, "/api/canvas/boards?scope=all", { cookie: guestCookie });
      return Number(boards.data.boards.find((item) => item.id === "pw-board")?.revision || 0);
    };
    const readOnlySave = await requestJson(port, "/api/canvas/boards/pw-board/operations", {
      method: "POST",
      cookie: guestCookie,
      body: { clientId: "check", baseRevision: await revisionOf(), operations: [{ operationId: "pw-1", type: "board.patch", after: { title: "访客改名" } }] },
    });
    assert.equal(readOnlySave.status, 403, JSON.stringify(readOnlySave.data));
    assert.equal(readOnlySave.data.code, "forbidden");

    const upgraded = await requestJson(port, `/api/resources/${encodeURIComponent(resourceId)}/shares`, {
      method: "POST",
      cookie: ownerCookie,
      body: { visibility: "password", permission: "edit", password: PASSWORD },
    });
    assert.equal(upgraded.status, 201, JSON.stringify(upgraded.data));
    // POST /shares 是「替换这条共享」，id 会变，所以原来的解锁也跟着作废——接收方要重新输一次。
    // 这是有意记下来的既有行为，不是这次改出来的。
    const upgradedResources = await requestJson(port, "/api/resources?type=canvas", { cookie: guestCookie });
    const upgradedEntry = upgradedResources.data.resources.find((item) => item.resource.refId === "pw-board");
    assert.notEqual(upgradedEntry.access.share.id, entry.access.share.id, "换权限会生成一条新的共享");
    assert.equal(upgradedEntry.access.locked, true, "旧解锁要作废，接收方重新解锁");
    const reUnlock = await requestJson(port, `/api/shares/${upgradedEntry.access.share.id}/unlock`, { method: "POST", cookie: guestCookie, body: { password: PASSWORD } });
    assert.equal(reUnlock.status, 200, JSON.stringify(reUnlock.data));
    const editSave = await requestJson(port, "/api/canvas/boards/pw-board/operations", {
      method: "POST",
      cookie: guestCookie,
      body: { clientId: "check", baseRevision: await revisionOf(), operations: [{ operationId: "pw-2", type: "board.patch", after: { title: "访客改名" } }] },
    });
    assert.equal(editSave.status, 200, JSON.stringify(editSave.data));

    // 撤销共享：锁着的卡片消失，画布也打不开了。
    const revoked = await requestJson(port, `/api/shares/${upgradedEntry.access.share.id}`, { method: "DELETE", cookie: ownerCookie });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.data));
    const afterRevoke = await requestJson(port, "/api/resources?type=canvas", { cookie: guestCookie });
    assert.equal(
      afterRevoke.data.resources.some((item) => item.resource.refId === "pw-board"),
      false,
      "撤销共享后对方的列表里不该还有它",
    );
    assert.equal((await requestJson(port, "/api/canvas/boards/pw-board/meta", { cookie: guestCookie })).status, 403);
  } finally {
    child.kill();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
  console.log("Canvas password share checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
