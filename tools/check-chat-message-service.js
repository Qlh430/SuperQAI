"use strict";

const assert = require("node:assert/strict");

const {
  CHAT_STYLE_PROMPT,
  createChatMessageService,
  extractTextFromMessageContent,
  extractLatestUserText,
  hasVisionMessage,
} = require("../chat-message-service");

assert.match(CHAT_STYLE_PROMPT, /清晰、自然、友好的中文助手/);
assert.match(CHAT_STYLE_PROMPT, /联网搜索结果/);

assert.equal(extractTextFromMessageContent("hello"), "hello");
assert.equal(extractTextFromMessageContent([
  { type: "text", text: "第一段" },
  "第二段",
  { type: "image_url", image_url: { url: "https://example.com/image.png" } },
  { type: "text", text: "" },
]), "第一段\n第二段");
assert.equal(extractTextFromMessageContent({ text: "对象文本" }), "对象文本");
assert.equal(extractTextFromMessageContent(null), "");
assert.equal(extractTextFromMessageContent(42), "");

const longText = "x".repeat(320);
assert.equal(extractLatestUserText([
  { role: "user", content: "旧问题" },
  { role: "assistant", content: "旧回答" },
  { role: "user", content: [{ type: "text", text: longText }] },
]), "x".repeat(300));
assert.equal(extractLatestUserText([{ role: "assistant", content: "only assistant" }]), "");
assert.equal(extractLatestUserText(null), "");

assert.equal(hasVisionMessage([
  { role: "user", content: [
    { type: "text", text: "描述图片" },
    { type: "image_url", image_url: { url: "https://example.com/image.png" } },
  ] },
]), true);
assert.equal(hasVisionMessage([{ role: "user", content: "纯文本" }]), false);
assert.equal(hasVisionMessage(null), false);

const fixedNow = Date.parse("2026-09-24T08:30:00.000Z");
const service = createChatMessageService({ now: () => fixedNow });
const baseMessages = [{ role: "user", content: "介绍一下今天的新闻" }];
const withoutSearch = service.buildChatCompletionMessages(baseMessages);
assert.equal(withoutSearch.length, 2);
assert.equal(withoutSearch[0].role, "system");
assert.equal(withoutSearch[0].content, CHAT_STYLE_PROMPT);
assert.equal(withoutSearch[1], baseMessages[0]);

const withSearch = service.buildChatCompletionMessages(baseMessages, [
  {
    title: "测试来源",
    url: "https://example.com/news",
    snippet: "一条可以引用的摘要。",
  },
  {
    title: "第二来源",
    url: "https://example.com/second",
  },
]);
assert.equal(withSearch.length, 3);
assert.match(withSearch[1].content, /当前日期：2026-09-24/);
assert.match(withSearch[1].content, /1\. 测试来源/);
assert.match(withSearch[1].content, /一条可以引用的摘要/);
assert.match(withSearch[1].content, /2\. 第二来源/);
assert.equal(withSearch[2], baseMessages[0]);
assert.deepEqual(service.start(), { ok: true, component: "chat-message-service" });

console.log("Chat message service checks passed.");
