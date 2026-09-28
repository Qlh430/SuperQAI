"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

let playwright;
try {
  playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ));
}
const { chromium } = playwright;
const ROOT = path.resolve(__dirname, "..");
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "canvas-agent-design-brief.png");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function waitForServer(page, url) {
  for (let index = 0; index < 200; index += 1) {
    try {
      if ((await page.request.get(url)).ok()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for AI OS server.");
}

function ndjsonTurn(turn) {
  return `${JSON.stringify({ type: "turn", turn })}\n`;
}

async function removeDirectoryWithRetry(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-agent-design-brief-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: "ignore",
  });
  const executablePath = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((item) => fs.existsSync(item));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  const consoleErrors = [];
  const turnRequests = [];
  const scriptedTurns = [{
    response_id: "brief-response-1",
    message: "我先确认几个会影响春节海报方向的关键条件。",
    tool_calls: [{
      call_id: "brief-call-1",
      name: "request_design_brief",
      arguments: {
        workflow: "poster",
        poster_type: null,
        known_context: "主题：春节；用户还没有说明具体用途。",
        summary: "将根据用途决定是突出产品、品牌祝福还是促销信息。",
        questions: [{
          id: "poster_type",
          label: "这张春节海报主要用来做什么？",
          kind: "single",
          options: ["产品海报", "品牌祝福", "促销活动", "节日通知"],
          required: true,
          recommended: "品牌祝福",
        }, {
          id: "subject",
          label: "核心主体或产品是什么？",
          kind: "text",
          options: [],
          required: true,
          recommended: "以新年礼盒为主体",
        }, {
          id: "channel",
          label: "主要投放到哪里？",
          kind: "single",
          options: ["朋友圈", "公众号首图", "电商详情页", "门店竖屏"],
          required: true,
          recommended: "朋友圈",
        }],
      },
    }],
  }, {
    response_id: "brief-response-2",
    message: "需求已收到，我会按海报专业流程继续。",
    tool_calls: [],
  }];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/canvas-agent/turn", async (route) => {
    turnRequests.push(route.request().postDataJSON());
    const script = scriptedTurns.shift();
    if (!script) throw new Error("画布 Agent 请求了未脚本化的回合。");
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: ndjsonTurn(script),
    });
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await waitForServer(page, `http://127.0.0.1:${port}/`);
    const resourceId = await page.evaluate(async () => {
      const headers = { "content-type": "application/json" };
      await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: "brief-admin", displayName: "验收管理员", password: "brief-admin-password" }),
      });
      await fetch("/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: "brief-admin", password: "brief-admin-password" }),
      });
      const project = await fetch("/api/canvas/projects", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: "brief-project", name: "海报验收项目" }),
      }).then((item) => item.json());
      await fetch("/api/canvas/boards", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: "brief-board", projectId: project.project?.id || "brief-project", title: "春节海报验收" }),
      });
      const boards = await fetch("/api/canvas/boards?scope=all").then((item) => item.json());
      return boards.boards?.find((board) => board.id === "brief-board")?.resourceId || "";
    });
    assert.ok(resourceId, "验收画布应该带有 resourceId");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("#aiOsDesktop") && !document.querySelector("#aiOsDesktop").hidden,
      null,
      { timeout: 30_000 },
    );
    await page.waitForFunction(() => window.AiOsDesktop?.isReady?.(), null, { timeout: 30_000 });
    consoleErrors.length = 0;
    pageErrors.length = 0;
    await page.evaluate((id) => window.AiOsDesktop.openApp("canvas", { resourceId: id }), resourceId);
    await page.locator("#canvasEditorScreen").waitFor();
    await page.evaluate(() => window.AiOsDesktop.setAppImmersive("canvas", true));
    await page.locator("#canvasAgentToggle").click();
    await page.waitForFunction(() => document.querySelector(".canvas-workspace")?.classList.contains("canvas-agent-open"));

    const nodesBefore = await page.evaluate(() => window.serializeCanvasBoard().nodes.length);
    await page.locator("#canvasAgentPrompt").fill("帮我做一张春节海报");
    await page.locator("#canvasAgentSend").click();
    await page.locator(".canvas-agent-brief").waitFor({ state: "visible", timeout: 30_000 });
    assert.equal(
      await page.evaluate(() => window.serializeCanvasBoard().nodes.length),
      nodesBefore,
      "需求确认前不能创建画布节点",
    );
    assert.match(await page.locator(".canvas-agent-brief").innerText(), /这张春节海报主要用来做什么/);
    assert.match(await page.locator(".canvas-agent-brief").innerText(), /核心主体或产品是什么/);
    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });

    await page.locator("[data-agent-brief-submit]").click();
    await page.waitForFunction(() => document.querySelector("#canvasAgentStatus")?.textContent.includes("请先补充"));
    assert.equal(turnRequests.length, 1, "缺少必填信息时不能继续发起 Agent 回合");
    assert.equal(await page.locator("[data-agent-brief-question='poster_type']").getAttribute("aria-invalid"), null);
    assert.match(
      await page.locator("[data-agent-brief-question='poster_type']").evaluate((element) => element.className),
      /is-invalid/,
    );

    await page.locator("[data-agent-brief-recommended]").click();
    await page.waitForFunction(() => document.querySelectorAll(".canvas-agent-brief").length === 0);
    await page.waitForFunction(() => document.querySelector("#canvasAgentStatus")?.textContent.includes("任务完成"));
    assert.equal(turnRequests.length, 2, "推荐值提交后应继续一次 Agent 回合");
    assert.equal(turnRequests[1].skill_mode, "manual");
    assert.equal(turnRequests[1].skill_id, "poster-design");
    assert.match(turnRequests[1].prompt, /已确认海报设计需求/);
    assert.match(turnRequests[1].prompt, /品牌祝福/);
    assert.match(turnRequests[1].prompt, /以新年礼盒为主体/);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser.close().catch(() => {});
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once("exit", resolve);
    });
    await removeDirectoryWithRetry(dataDir);
  }
  console.log("Canvas agent design brief browser checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
