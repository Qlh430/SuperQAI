const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createCanvasAgentConversationStore } = require("../host-sources/app/canvas-agent-conversation-store");

test("sent image attachments survive save and reload without persisting model image bytes", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-attachments-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const options = { filePath: path.join(directory, "conversations.json") };
  const store = createCanvasAgentConversationStore(options);
  const conversation = store.createSession("board_images", "owner");
  const attachment = { nodeId: "source-image", url: "/output/1600_01.jpg",
    name: "1600_01.jpg", source: "canvas", mimeType: "image/jpeg" };
  store.upsert({ ...conversation, items: [{
    id: "sent-image", role: "user", requestId: "request-123",
    deliveryStatus: "sent", executionStatus: "running", text: "分析商品原图",
    attachments: [{ ...attachment, dataUrl: "data:image/jpeg;base64,/9j/" }],
  }] }, conversation.revision, "owner");
  const reloaded = createCanvasAgentConversationStore(options).get("board_images", "owner", conversation.conversationId);
  assert.deepEqual(reloaded.items[0].attachments, [attachment]);
  assert.deepEqual([reloaded.items[0].requestId, reloaded.items[0].deliveryStatus, reloaded.items[0].executionStatus],
    ["request-123", "sent", "running"]);
});

test("conversation sessions are isolated by account and canvas and retain legacy records", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-conversations-"));
  const filePath = path.join(directory, "conversations.json");
  const store = createCanvasAgentConversationStore({ filePath });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const legacy = store.get("board_one");
  const legacyWithHistory = {
    ...legacy,
    items: [{
      id: "legacy-user-item",
      role: "user",
      text: "保留的旧会话",
      status: "completed",
      createdAt: "2026-11-16T00:00:00.000Z",
    }],
  };
  store.upsert(legacyWithHistory, legacy.revision);

  const firstAccount = store.get("board_one", "user_one");
  assert.equal(firstAccount.items[0].text, "保留的旧会话");
  assert.equal(store.list("board_one", "user_one").sessions.length, 1);

  const created = store.createSession("board_one", "user_one");
  assert.ok(created.conversationId);
  assert.equal(created.items.length, 0);
  assert.equal(store.get("board_one", "user_one").conversationId, created.conversationId);
  assert.equal(store.list("board_one", "user_one").sessions.length, 2);

  assert.equal(store.activateSession("board_one", "user_one", firstAccount.conversationId), true);
  assert.equal(store.get("board_one", "user_one").conversationId, firstAccount.conversationId);

  const secondAccount = store.get("board_one", "user_two");
  assert.notEqual(secondAccount.conversationId, firstAccount.conversationId);
  assert.equal(secondAccount.items.length, 0);
  assert.equal(store.list("board_one", "user_two").sessions.length, 1);
  assert.equal(store.get("board_one", "user_two", firstAccount.conversationId), null);

  const boardTwo = store.get("board_two", "user_one");
  assert.notEqual(boardTwo.conversationId, firstAccount.conversationId);
  assert.equal(store.list("board_two", "user_one").sessions.length, 1);

  assert.equal(store.remove("board_one", "user_one"), true);
  assert.notEqual(store.get("board_one", "user_one").conversationId, firstAccount.conversationId);
  assert.equal(store.list("board_one", "user_two").sessions.length, 1);

  const sharedLegacy = store.get("board_shared");
  store.upsert({
    ...sharedLegacy,
    items: [{
      id: "shared-legacy-user-item",
      role: "user",
      text: "旧的画布主人会话",
      status: "completed",
      createdAt: "2026-11-16T00:00:00.000Z",
    }],
  }, sharedLegacy.revision);
  const collaborator = store.get("board_shared", "collaborator", "", "owner");
  assert.equal(collaborator.items.length, 0, "a collaborator never receives unowned legacy conversation data");
  const owner = store.get("board_shared", "owner", "", "owner");
  assert.equal(owner.items[0].text, "旧的画布主人会话", "legacy history is attributed to the canvas owner");
});
