"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Conversation = require("../host-sources/app/canvas-agent-conversation");
const { createCanvasAgentConversationStore } = require("../host-sources/app/canvas-agent-conversation-store");

const context = {
  taskId: "run_task_1",
  boardId: "board-a",
  conversationId: "conversation-a",
  primary: {
    id: "natural-aesthetic-product-photography",
    name: "自然美学产品摄影",
    source: "manual",
    version: "1.2.10",
    fingerprint: "a".repeat(64),
    validationStatus: "partial",
  },
  status: "planning",
  selectionReason: "selected",
  startedAt: "2026-11-23T08:00:00.000Z",
  invocationId: "invocation-1",
  approvedSkills: [{ id: "poster-design", name: "海报设计", version: "1.1.0", fingerprint: "b".repeat(64), operationId: "grant-1" }],
};

test("task lock and scoped grants survive conversation persistence", () => {
  const normalized = Conversation.normalize({ boardId: "board-a", conversationId: "conversation-a", taskContext: context });
  assert.equal(normalized.taskContext.primary.id, context.primary.id);
  assert.equal(normalized.taskContext.approvedSkills[0].id, "poster-design");
  assert.equal(Conversation.normalize({ ...normalized, boardId: "board-b" }, "board-b").taskContext, null);
});

test("Skill audit events are bounded, sanitized and idempotent", () => {
  const conversation = Conversation.create("board-a");
  const event = {
    eventId: "event-1", taskId: context.taskId, type: "reference_read", skillId: context.primary.id,
    path: "references/photography-methods.md", prompt: "sensitive prompt must not persist", at: "2026-11-23T08:01:00.000Z",
  };
  const once = Conversation.appendSkillEvent(conversation, event);
  const twice = Conversation.appendSkillEvent(once, event);
  assert.equal(twice.skillEvents.length, 1);
  assert.equal(Object.hasOwn(twice.skillEvents[0], "prompt"), false);
  assert.equal(twice.skillEvents[0].path, event.path);
});

test("host task lock survives browser-authored conversation updates and remains account scoped", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-skill-lock-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "conversations.json");
  const store = createCanvasAgentConversationStore({ filePath });
  const conversation = store.createSession("board-a", "account-a");
  const lock = { taskId: context.taskId, primary: context.primary, approved: [] };
  store.skillTask("board-a", "account-a", conversation.conversationId, context.taskId, lock);
  store.upsert({ ...conversation, skillTasks: [{ ...lock, primary: { id: "poster-design" } }] }, conversation.revision, "account-a");
  const restored = createCanvasAgentConversationStore({ filePath });
  assert.deepEqual(restored.skillTask("board-a", "account-a", conversation.conversationId, context.taskId), lock);
  assert.equal(restored.skillTask("board-a", "account-b", conversation.conversationId, context.taskId), null);
  assert.equal(restored.get("board-a", "account-a", conversation.conversationId).skillTasks, undefined);
});
