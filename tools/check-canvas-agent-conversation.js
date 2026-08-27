const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Conversation = require("../canvas-agent-conversation");
const { createCanvasAgentConversationStore } = require("../canvas-agent-conversation-store");

const empty = Conversation.create("board-a");
assert.equal(empty.boardId, "board-a");
assert.ok(empty.conversationId);
assert.deepEqual(empty.items, []);

const appended = Conversation.appendItems(empty, [
  { id: "u1", role: "user", text: "生成苹果", status: "completed", createdAt: "2026-08-20T00:00:00.000Z" },
  {
    id: "t1",
    role: "tool",
    text: "已创建图片节点",
    toolName: "create_image_node",
    nodeId: "63",
    status: "completed",
    createdAt: "2026-08-20T00:00:01.000Z",
  },
  { id: "a1", role: "assistant", text: "节点已经创建。", status: "completed", createdAt: "2026-08-20T00:00:02.000Z" },
]);
assert.equal(appended.boardId, "board-a");
assert.deepEqual(appended.items.map((item) => item.id), ["u1", "t1", "a1"]);
assert.match(JSON.stringify(Conversation.buildTranscript(appended)), /生成苹果/);
assert.match(JSON.stringify(Conversation.buildTranscript(appended)), /63/);
assert.equal(Conversation.normalize(appended, "board-b").boardId, "board-b");
const declined = Conversation.appendItems(empty, [
  { id: "declined", role: "tool", text: "已按用户选择跳过", status: "declined" },
]);
assert.equal(declined.items[0].status, "declined");

const deduplicated = Conversation.appendItems(appended, [
  { id: "a1", role: "assistant", text: "重复项不得追加", status: "completed" },
]);
assert.equal(deduplicated.items.length, 3);
assert.equal(deduplicated.items.at(-1).text, "节点已经创建。");

const interrupted = Conversation.markInterrupted(Conversation.appendItems(empty, [
  { id: "running", role: "tool", text: "正在生成", status: "running" },
]));
assert.equal(interrupted.items.at(-1).status, "recoverable");
assert.match(interrupted.items.at(-1).text, /可以继续/);

const oversized = Conversation.appendItems(empty, Array.from({ length: 230 }, (_, index) => ({
  id: `item-${index}`,
  role: index % 2 ? "assistant" : "user",
  text: `消息 ${index}`,
  status: "completed",
})));
assert.equal(oversized.items.length, Conversation.MAX_ITEMS);
assert.equal(Conversation.buildTranscript(oversized).length, Conversation.MAX_TRANSCRIPT_ITEMS);

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-conversation-"));
const filePath = path.join(tempDirectory, "conversations.json");
try {
  const store = createCanvasAgentConversationStore({ filePath });
  const first = store.upsert(appended, 0);
  assert.equal(first.revision, 1);
  assert.equal(store.get("board-a").items[0].text, "生成苹果");
  assert.deepEqual(store.get("board-b").items, []);

  const boardB = store.upsert(Conversation.appendItems(Conversation.create("board-b"), [
    { id: "b-u1", role: "user", text: "另一个画布", status: "completed" },
  ]), 0);
  assert.equal(boardB.boardId, "board-b");
  assert.equal(store.get("board-a").items.length, 3);

  assert.throws(
    () => store.upsert(Conversation.appendItems(first, [{ id: "late", role: "user", text: "旧页面覆盖" }]), 0),
    (error) => error?.code === "CONVERSATION_REVISION_CONFLICT",
  );

  assert.equal(store.remove("board-a"), true);
  assert.deepEqual(store.get("board-a").items, []);
  assert.equal(store.get("board-b").items[0].text, "另一个画布");
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

console.log("Canvas agent conversation checks passed.");
