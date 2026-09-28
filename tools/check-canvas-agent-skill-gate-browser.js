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
const SKILLS_DIR = path.join(ROOT, "data", "skills");
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "canvas-agent-skill-gate-browser.png");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function ndjsonTurn(turn) {
  return `${JSON.stringify({ type: "turn", turn })}\n`;
}

function completeScript() {
  return [
    "# 脚本阶段交付物",
    "",
    "## 已确认输入、暂定假设和待确认项",
    "已确认输入：30 秒充电宝广告。暂定假设：短视频信息流。待确认项：品牌与接口。",
    "",
    "## 九项脚本骨架",
    "| 项目 | 回答 |",
    "|---|---|",
    "| 传播目标 | 记住一次补电让故事继续 |",
    "| 核心表达 | 及时补电会同时唤回机会和后果 |",
    "| 目标观众 | 短视频用户 |",
    "| 主角 | 倒吊小偷 |",
    "| 初始状态 | 即将得手 |",
    "| 核心问题 | 手机低电让绳索停住 |",
    "| 关键行动 | 玩家接入充电宝 |",
    "| 最大变化 | 警报也被恢复 |",
    "| 最终落点 | 回到品牌口号 |",
    "",
    "## 一句话核心表达",
    "一次补电会让停住的故事继续，也会让被忽略的后果一起复活。",
    "",
    "## 故事发动机与因果链",
    "故事发动机：低电让行动停摆。因果链：接近钻石 → 低电停绳 → 求助 → 接电 → 得手 → 警报复活 → 品牌落版。",
    "",
    "## 带段落时间的脚本表",
    "| 段落时间 | 行动 | 可见变化 | 声音 | 功能动机 | 段落任务 |",
    "|---|---|---|---|---|---|",
    "| 0—5 秒 | 绳索下降 | 停在钻石前一厘米 | 电机突然停止 | 建立低电问题 | 建立目标与危机 |",
    "| 5—15 秒 | 小偷求助 | 玩家世界揭示 | 同步嘘声 | 连接现实玩家 | 完成世界揭示 |",
    "| 15—26 秒 | 接入充电宝 | 绳索与警报恢复 | 提示音和警报 | 证明接电有效 | 完成反转 |",
    "| 26—30 秒 | 小偷逃跑 | 品牌落版 | 明快收束音 | 形成品牌记忆 | 完成闭环 |",
    "",
    "## 视听分工",
    "画面证明动作与状态变化，声音负责断电、恢复和警报预告。",
    "",
    "## 情绪曲线与视觉母题变化",
    "情绪曲线：潜行、受阻、希望、虚假胜利、警报反转、喜剧收束。视觉母题变化：绳索从停滞到恢复，红光从无到铺满。",
    "",
    "## 开头、高潮和结尾闭环说明",
    "开头建立一厘米距离与低电问题。高潮是钻石得手后警报复活。结尾以品牌口号回收“继续”的主题形成闭环。",
    "",
    "## 删除测试与可执行性检查",
    "删除测试：删除跨屏呼应会削弱核心笑点。可执行性检查：目标时长足以容纳因果节点，品牌事实确认后可进入主镜头表。",
    "",
    "## 脚本确认结论",
    "有条件批准。",
    "",
    "## 阶段交接",
    "这个脚本阶段的效果是否满意？如果满意，我继续进入主镜头表；如果需要调整，请指出最想修改的部分。",
  ].join("\n");
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-agent-skill-gate-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_SKILLS_DIR: SKILLS_DIR,
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
  const scriptedTurns = [
    {
      response_id: "resp-skill-gate-1",
      message: "先读取脚本阶段参考文档。",
      tool_calls: [{
        call_id: "gate_reference_1",
        name: "read_skill_reference",
        arguments: {
          skill_id: "ai-video-director",
          path: "references/script-and-story.md",
        },
      }],
    },
    {
      response_id: "resp-skill-gate-2",
      message: "状态：有条件批准\n因果链：低电停绳，接电后警报恢复。\n风险：品牌信息待确认。",
      tool_calls: [],
    },
    {
      response_id: "resp-skill-gate-3",
      message: "先写入一个摘要版本。",
      tool_calls: [{
        call_id: "gate_script_node_blocked",
        name: "create_text_node",
        arguments: {
          title: "不完整脚本",
          content: "状态：有条件批准\n因果链：低电停绳，接电后警报恢复。",
        },
      }],
    },
    {
      response_id: "resp-skill-gate-4",
      message: "正在把完整脚本交付物写入画布。",
      tool_calls: [{
        call_id: "gate_script_node_1",
        name: "create_text_node",
        arguments: {
          title: "充电宝 30 秒脚本",
          content: completeScript(),
        },
      }],
    },
    {
      response_id: "resp-skill-gate-5",
      message: "完整脚本已写入画布文字节点。这个阶段的效果是否满意？如果满意，我继续进入主镜头表；如果需要调整，请指出最想修改的部分。",
      tool_calls: [],
    },
  ];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/canvas-agent/turn", async (route) => {
    const script = scriptedTurns.shift();
    if (!script) throw new Error("Agent 请求了未脚本化的回合。");
    turnRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: ndjsonTurn(script),
    });
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    const resourceId = await page.evaluate(async () => {
      const headers = { "content-type": "application/json" };
      await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers,
        body: JSON.stringify({
          username: "skill-gate-admin",
          displayName: "Skill Gate Admin",
          password: "skill-gate-password",
        }),
      });
      await fetch("/api/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: "skill-gate-admin", password: "skill-gate-password" }),
      });
      const project = await fetch("/api/canvas/projects", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: "skill-gate-project", name: "Skill Gate Project" }),
      }).then((item) => item.json());
      await fetch("/api/canvas/boards", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: "skill-gate-board",
          projectId: project.project?.id || "skill-gate-project",
          title: "Skill Gate Board",
        }),
      });
      const boards = await fetch("/api/canvas/boards?scope=all").then((item) => item.json());
      return boards.boards?.find((board) => board.id === "skill-gate-board")?.resourceId || "";
    });
    assert.ok(resourceId, "验收画布应该带有 resourceId");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("#aiOsDesktop") && !document.querySelector("#aiOsDesktop").hidden,
      null,
      { timeout: 30_000 },
    );
    await page.waitForFunction(() => window.AiOsDesktop?.isReady?.(), null, { timeout: 30_000 });
    await page.evaluate((id) => window.AiOsDesktop.openApp("canvas", { resourceId: id }), resourceId);
    await page.locator("#canvasEditorScreen").waitFor();
    await page.evaluate(() => window.AiOsDesktop.setAppImmersive("canvas", true));
    const agentGlobals = await page.evaluate(() => ({
      workspace: Boolean(document.querySelector(".canvas-workspace")),
      skillContract: typeof window.CanvasAgentSkillContract,
      agentCore: typeof window.CanvasAgentCore,
      agentUi: typeof window.CanvasAgentCanvasApi,
      agentPanel: Boolean(document.querySelector("#canvasAgentPanel")),
      scripts: Array.from(document.scripts)
        .map((script) => script.src)
        .filter((src) => /canvas-agent|script\.js/.test(src)),
    }));
    try {
      await page.locator("#canvasAgentToggle").waitFor({ state: "visible", timeout: 15_000 });
    } catch (error) {
      throw new Error(`${error.message}\nGlobals: ${JSON.stringify(agentGlobals)}\nPage errors: ${pageErrors.join(" | ")}\nConsole errors: ${consoleErrors.join(" | ")}`);
    }
    await page.locator("#canvasAgentToggle").click();
    await page.waitForFunction(() => document.querySelector(".canvas-workspace")?.classList.contains("canvas-agent-open"));
    await page.locator("#canvasAgentSkillBook").click();
    await page.waitForFunction(
      () => document.querySelector('[data-agent-skill="ai-video-director"]'),
      null,
      { timeout: 30_000 },
    );
    await page.locator('[data-agent-skill="ai-video-director"]').click();
    await page.locator("#canvasAgentPrompt").fill("跑一下这个故事脚本，完整写出脚本阶段交付物");
    await page.locator("#canvasAgentSend").click();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("canvas-agent-runs-v1") || "[]")[0]?.status === "completed",
      null,
      { timeout: 30_000 },
    );

    assert.equal(turnRequests.length, 5, "应该经历读取参考、无效摘要、执行前拦截、补齐节点和最终交接五轮");
    assert.equal(turnRequests[0].skill_mode, "manual");
    assert.equal(turnRequests[0].skill_id, "ai-video-director");
    assert.equal(turnRequests[1].tool_outputs[0].output.path, "references/script-and-story.md");
    assert.match(turnRequests[2].prompt, /Skill 执行闸门未通过/);
    assert.match(turnRequests[2].prompt, /九项脚本骨架/);
    assert.equal(turnRequests[2].skill_contract_retry, true);
    assert.equal(
      turnRequests[3].tool_outputs[0].output.ok,
      false,
      "不完整节点必须在执行前被拦截",
    );
    assert.equal(turnRequests[3].tool_outputs[0].output.node_id, undefined);
    assert.equal(
      turnRequests[3].tool_outputs[0].output.skill_contract.code,
      "skill_deliverable_incomplete",
    );
    assert.equal(
      turnRequests[4].tool_outputs[0].output.ok,
      true,
      JSON.stringify(turnRequests[4].tool_outputs[0].output),
    );
    assert.ok(turnRequests[4].tool_outputs[0].output.node_id);

    const saved = await page.evaluate(async () => {
      const runs = JSON.parse(localStorage.getItem("canvas-agent-runs-v1") || "[]");
      return { run: runs[0] };
    });
    assert.equal(saved.run?.status, "completed");
    assert.equal(saved.run?.skillContract?.correctionAttempts, 1);
    assert.equal(saved.run?.skillContract?.deliverableCompleted, true);
    const textNodeId = String(turnRequests[4].tool_outputs[0].output.node_id || "");
    assert.ok(textNodeId);
    const textNode = await page.locator(`#canvasPlane .canvas-node[data-id="${textNodeId}"]`).evaluate((node) => ({
      kind: getCanvasNodeKind(node),
      textName: node.dataset.textName || "",
      text: getCanvasTextValue(node),
    }));
    assert.ok(
      textNode,
      "完整脚本应该写入画布文字节点",
    );
    assert.equal(textNode.textName, "充电宝 30 秒脚本");
    assert.match(String(textNode.text || ""), /九项脚本骨架/);
    assert.match(String(textNode.text || ""), /脚本确认结论/);
    assert.equal(pageErrors.length, 0, `页面不应报错：${pageErrors.join(" | ")}`);
    const unexpectedConsoleErrors = consoleErrors.filter(
      (message) => !/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(message),
    );
    assert.equal(unexpectedConsoleErrors.length, 0, `控制台不应报错：${unexpectedConsoleErrors.join(" | ")}`);

    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    console.log(JSON.stringify({
      manualSkill: true,
      automaticCorrection: true,
      completeNodeWritten: true,
      completedAfterGate: true,
      screenshot: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    await browser.close().catch(() => {});
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.killed) {
        setTimeout(resolve, 300);
        return;
      }
      child.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {}
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
