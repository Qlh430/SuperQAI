"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

module.exports = async function checkAgentPicker(page) {
  const requests = [];
  let pending;
  let receiveTurn;
  const skillsRoute = async route => route.fulfill({ json: {
    configured: true,
    agentSettings: {
      configured: true,
      primary: { providerId: "site-a", modelId: "agent-primary" },
      candidateCount: 1,
      availableCount: 2,
      unavailableCount: 0,
    },
    models: [],
    skills: [],
    autoFallback: true,
  } });
  const turnRoute = async route => {
    requests.push(route.request().postDataJSON());
    pending = route;
    receiveTurn?.();
  };
  const waitForTurn = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Agent turn request timed out")), 10000);
    receiveTurn = () => { clearTimeout(timer); receiveTurn = null; resolve(); };
  });
  await page.route("**/api/canvas-agent/skills", skillsRoute);
  await page.route("**/api/canvas-agent/turn", turnRoute);
  try {
    await page.locator("#canvasAgentToggle").click();
    assert.equal(await page.locator("#canvasAgentModel").count(), 0, "the canvas Agent has no per-chat model picker");
    assert.equal(await page.locator("#canvasAgentModelsRefresh").count(), 0);
    await page.waitForFunction(() => document.querySelector("#canvasAgentStatus")?.textContent.includes("1 个候选"));

    await page.locator("#canvasAgentPrompt").fill("回答测试文字，不要创建节点");
    let received = waitForTurn();
    await page.locator("#canvasAgentSend").click();
    await received;
    assert.equal(requests[0]?.providerId, undefined);
    assert.equal(requests[0]?.modelId, undefined);
    await pending.fulfill({ json: { message: "测试回复", tool_calls: [] } });
    pending = null;
    await page.waitForFunction(() => !document.querySelector("#canvasAgentSend")?.disabled);

    await page.locator("#canvasAgentPrompt").fill("恢复测试，只回复文字");
    received = waitForTurn();
    await page.locator("#canvasAgentSend").click();
    await received;
    const failed = pending;
    pending = null;
    received = waitForTurn();
    await failed.fulfill({ status: 503, json: { error: "服务暂时不可用", recoverable: true } });
    await page.waitForFunction(() => document.querySelector("#canvasAgentStatus")?.textContent.includes("正在自动恢复"));
    await received;
    assert.equal(requests[2]?.providerId, undefined, "recovery continues to use saved Agent settings");
    assert.equal(requests[2]?.modelId, undefined);
    await pending.fulfill({ json: { message: "恢复测试回复", tool_calls: [] } });
    pending = null;
    await page.waitForFunction(() => !document.querySelector("#canvasAgentSend")?.disabled);

    const output = path.join(__dirname, "..", "artifacts", "agent-settings");
    fs.mkdirSync(output, { recursive: true });
    await page.locator("#canvasAgentPanel").screenshot({ path: path.join(output, "canvas-agent-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator("#canvasAgentPanel").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.locator("#canvasAgentPanel").screenshot({ path: path.join(output, "canvas-agent-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#canvasAgentClose").click();
  } finally {
    if (pending) await pending.fulfill({ json: { message: "已结束", tool_calls: [] } });
    await page.unroute("**/api/canvas-agent/skills", skillsRoute);
    await page.unroute("**/api/canvas-agent/turn", turnRoute);
  }
};
