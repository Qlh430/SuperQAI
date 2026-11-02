"use strict";

const CHAT_STYLE_PROMPT = [
  "你是一个清晰、自然、友好的中文助手。",
  "回答时可以像 ChatGPT 官网一样自然使用少量贴切的 emoji、Markdown 列表和加粗，但不要过度装饰。",
  "如果问题需要最新信息，而提供了联网搜索结果，请优先依据搜索结果回答，并在关键事实后说明来源名称。",
  "只要联网搜索结果里有可用事实，就不要回答“我无法直接获取实时数据”；请综合资料给出最新结论，并说明不确定处。",
  "对于体育战况、新闻、赛事积分等问题，请优先提取比分、时间、小组/轮次、关键事件、排名或下一场赛程，并用清楚的小标题组织。",
  "如果搜索结果里包含“实时天气数据”，不要说只能找到页面列表；请直接根据其中的温度、体感、天气、风速、降水概率等数据回答。",
  "如果搜索结果来自中国天气网或天气网，请把它们当作本轮天气查询的优先来源；即使只有页面摘要，也要基于摘要给出清晰结论，不要让用户自己点开链接。",
].join("\n");

function extractTextFromMessageContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      if (item?.type === "text") return item.text || "";
      return "";
    }).filter(Boolean).join("\n");
  }
  if (typeof content === "object") return content.text || "";
  return "";
}

function extractLatestUserText(messages) {
  const latest = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.role === "user");
  return extractTextFromMessageContent(latest?.content).slice(0, 300);
}

function hasVisionMessage(messages) {
  return (Array.isArray(messages) ? messages : []).some((message) =>
    Array.isArray(message?.content) && message.content.some((item) => item?.type === "image_url"));
}

function createChatMessageService({ now = Date.now } = {}) {
  if (typeof now !== "function") throw new TypeError("Chat message service requires a clock.");

  function buildChatCompletionMessages(messages, webSearchResults = []) {
    const output = [{ role: "system", content: CHAT_STYLE_PROMPT }];
    if (webSearchResults.length) {
      output.push({
        role: "system",
        content: [
          `以下是本轮联网搜索结果，当前日期：${new Date(now()).toISOString().slice(0, 10)}。`,
          ...webSearchResults.map((item, index) => (
            `${index + 1}. ${item.title}\n${item.url}\n${item.snippet || ""}`
          )),
        ].join("\n\n"),
      });
    }
    output.push(...(Array.isArray(messages) ? messages : []));
    return output;
  }

  function start() {
    return Object.freeze({ ok: true, component: "chat-message-service" });
  }

  return Object.freeze({
    start,
    buildChatCompletionMessages,
    extractLatestUserText,
    extractTextFromMessageContent,
    hasVisionMessage,
  });
}

module.exports = {
  CHAT_STYLE_PROMPT,
  createChatMessageService,
  extractLatestUserText,
  extractTextFromMessageContent,
  hasVisionMessage,
};
