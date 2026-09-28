"use strict";

// 验收：画布 Agent 的技能书只列用户自己安装的功能 Skill（系统 Skill 由路由自动匹配），
// 并且 activate_canvas_skill 这类总闸门不显示为工具步骤，只留一句中文提示。

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
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "canvas-agent-skill-picker.png");
const GATE_SCREENSHOT_PATH = path.join(ROOT, "artifacts", "canvas-agent-skill-gate.png");
const SHIPPED_SKILLS_DIR = path.join(ROOT, "data", "skills");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function waitForServer(page, url) {
  for (let index = 0; index < 200; index += 1) {
    try { if ((await page.request.get(url)).ok()) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for AI OS server.");
}

function ndjsonTurn(turn) {
  return `${JSON.stringify({ type: "turn", turn })}\n`;
}

/**
 * 直接用真实安装目录（data/skills）当功能 Skill 目录，验收的就是用户装的那一套。
 * 没有安装过技能的机器退回到一个最小占位 Skill，保证验收逻辑仍然可跑。
 */
function resolveInstalledSkillsDir(workDir) {
  if (fs.existsSync(SHIPPED_SKILLS_DIR)) return SHIPPED_SKILLS_DIR;
  const folder = path.join(workDir, "placeholder-skills", "picker-placeholder");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "SKILL.md"), [
    "---",
    "name: picker-placeholder",
    "description: 技能书验收占位流程",
    "canvas:",
    "  label: 技能书验收流程",
    "  category: video",
    "  icon: type",
    "  required_selection: none",
    "  triggers: [技能书验收]",
    "  capabilities: [node.text.create]",
    "---",
    "",
    "# 技能书验收流程",
    "",
    "## 工作流程",
    "",
    "占位正文，用来验证技能书只列已安装的功能 Skill 而不会列系统 Skill。",
  ].join("\n"), "utf8");
  return path.dirname(folder);
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-agent-skill-picker-"));
  const installedSkillsDir = resolveInstalledSkillsDir(dataDir);

  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_SKILLS_DIR: installedSkillsDir,
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
  const scriptedTurns = [];
  const turnRequests = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/canvas-agent/turn", async (route) => {
    const script = scriptedTurns.shift();
    if (!script) throw new Error("画布 Agent 请求了未脚本化的回合。");
    turnRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body: ndjsonTurn(script) });
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await waitForServer(page, `http://127.0.0.1:${port}/`);
    const resourceId = await page.evaluate(async () => {
      const headers = { "content-type": "application/json" };
      await fetch("/api/auth/bootstrap", { method: "POST", headers, body: JSON.stringify({ username: "picker-admin", displayName: "验收管理员", password: "picker-admin-password" }) });
      await fetch("/api/auth/login", { method: "POST", headers, body: JSON.stringify({ username: "picker-admin", password: "picker-admin-password" }) });
      const project = await fetch("/api/canvas/projects", { method: "POST", headers, body: JSON.stringify({ id: "picker-project", name: "验收项目" }) }).then((item) => item.json());
      await fetch("/api/canvas/boards", { method: "POST", headers, body: JSON.stringify({ id: "picker-board", projectId: project.project?.id || "picker-project", title: "验收画布" }) });
      const boards = await fetch("/api/canvas/boards?scope=all").then((item) => item.json());
      return boards.boards?.find((board) => board.id === "picker-board")?.resourceId || "";
    });
    assert.ok(resourceId, "验收画布应该带有 resourceId");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#aiOsDesktop") && !document.querySelector("#aiOsDesktop").hidden, null, { timeout: 30_000 });
    await page.waitForFunction(() => window.AiOsDesktop?.isReady?.(), null, { timeout: 30_000 });
    await page.evaluate((id) => window.AiOsDesktop.openApp("canvas", { resourceId: id }), resourceId);
    await page.locator("#canvasEditorScreen").waitFor();
    await page.evaluate(() => window.AiOsDesktop.setAppImmersive("canvas", true));
    await page.locator("#canvasAgentToggle").waitFor({ state: "visible" });
    await page.locator("#canvasAgentToggle").click();
    await page.waitForFunction(() => document.querySelector(".canvas-workspace")?.classList.contains("canvas-agent-open"));

    // 1. 技能书：只列已安装的功能 Skill，系统 Skill 一律不出现。
    await page.locator("#canvasAgentSkillBook").click();
    await page.waitForFunction(() => document.querySelectorAll("#canvasAgentSkills .canvas-agent-skill").length > 0, null, { timeout: 30_000 });
    const catalog = await page.evaluate(async () => {
      const data = await fetch("/api/canvas-agent/skills").then((item) => item.json());
      return {
        picker: (data.pickerSkills || []).map((skill) => ({ id: skill.id, label: skill.label, origin: skill.origin })),
        system: (data.skills || []).filter((skill) => skill.origin === "system").map((skill) => skill.label),
        rendered: Array.from(document.querySelectorAll("#canvasAgentSkills .canvas-agent-skill")).map((button) => ({
          id: button.dataset.agentSkill,
          label: String(button.querySelector("strong")?.textContent || ""),
        })),
        groups: Array.from(document.querySelectorAll("#canvasAgentSkills .canvas-agent-skill-group")).map((group) => ({
          id: group.dataset.agentSkillGroup,
          label: String(group.querySelector(".canvas-agent-skill-group-heading strong")?.textContent || ""),
          count: group.querySelectorAll(".canvas-agent-skill").length,
        })),
        hint: String(document.querySelector("#canvasAgentSkillHint")?.textContent || ""),
      };
    });
    assert.ok(catalog.picker.length > 0, "验收环境应该至少有一个已安装的功能 Skill");
    assert.ok(catalog.picker.every((skill) => skill.origin === "custom"), "技能书只列已安装的功能 Skill");
    assert.deepEqual(
      catalog.rendered.map((skill) => skill.id).sort(),
      catalog.picker.map((skill) => skill.id).sort(),
      "技能书渲染的条目必须和已安装列表一致，安装包分组可以改变展示顺序",
    );
    assert.equal(
      catalog.rendered.some((skill) => catalog.system.includes(skill.label)),
      false,
      "系统 Skill 不能出现在技能书里",
    );
    assert.equal(catalog.hint, `${catalog.picker.length} 个已安装 Skill`);

    if (fs.existsSync(SHIPPED_SKILLS_DIR)) {
      assert.ok(
        catalog.rendered.some((skill) => skill.id === "h3-prompt-writing" && skill.label === "H3 视频提示词"),
        "MiniMax H3 技能包应该出现在技能书里",
      );
      assert.deepEqual(
        catalog.groups.filter((group) => group.id === "custom-pack:minimax-h3-skills").map((group) => group.count),
        [9],
        "MiniMax H3 Skills 必须作为 9 项安装包单独分组",
      );
      assert.deepEqual(
        catalog.groups.filter((group) => group.id === "custom:standalone"),
        [{ id: "custom:standalone", label: "独立功能 Skill", count: 1 }],
        "新加的 ai-video-director 必须单独分组",
      );
    }

    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });

    await page.locator("#canvasAgentSkillBook").click();
    await page.waitForFunction(() => document.querySelector("#canvasAgentSkillPopover")?.hidden === true);

    // 2. 总闸门：activate_canvas_skill 不产生工具步骤，只留一句中文提示。
    const gateSkill = catalog.picker.find((skill) => skill.id === "h3-prompt-writing") || catalog.picker[0];
    scriptedTurns.push({
      response_id: "picker-turn-1",
      message: "我先切到对应的专业流程。",
      tool_calls: [
        { call_id: "picker-gate", name: "activate_canvas_skill", arguments: { skill_id: gateSkill.id, reason: "写视频提示词" } },
      ],
    });
    scriptedTurns.push({ response_id: "picker-turn-2", message: "流程已就绪。", tool_calls: [] });
    await page.locator("#canvasAgentPrompt").fill("帮我写一段图生视频提示词");
    await page.locator("#canvasAgentSend").click();
    try {
      await page.getByText(`已启用专业流程：${gateSkill.label}`).waitFor({ state: "visible", timeout: 30_000 });
    } catch (error) {
      console.error("PICKER STATE", JSON.stringify(await page.evaluate(() => ({
        status: String(document.querySelector("#canvasAgentStatus")?.innerText || ""),
        messages: String(document.querySelector("#canvasAgentMessages")?.innerText || ""),
        steps: document.querySelectorAll(".canvas-agent-tool-step").length,
      })), null, 2));
      console.error("pending scripts", scriptedTurns.length, pageErrors, consoleErrors);
      throw error;
    }
    const toolSteps = await page.locator(".canvas-agent-tool-step").count();
    assert.equal(toolSteps, 0, "activate_canvas_skill 不应该在对话里留下工具步骤");

    // 3. 手动选择功能 Skill 后，选择标记必须进入当次用户对话，并随请求交给 Agent。
    const manualSkill = catalog.picker.find((skill) => skill.id === "ai-video-director") || catalog.picker[0];
    await page.locator("#canvasAgentSkillBook").click();
    await page.locator(`#canvasAgentSkills .canvas-agent-skill[data-agent-skill="${manualSkill.id}"]`).click();
    await page.waitForFunction(() => document.querySelector("#canvasAgentSkillPopover")?.hidden === true);
    scriptedTurns.push({
      response_id: "picker-turn-3",
      message: "已按 AI 视频导演流程分析。",
      tool_calls: [],
    });
    await page.locator("#canvasAgentPrompt").fill("帮我写一段图生视频提示词");
    await page.locator("#canvasAgentSend").click();
    const selectedSkillBadge = page.locator(".canvas-agent-message.is-user .canvas-agent-message-skill").last();
    await selectedSkillBadge.waitFor({ state: "visible", timeout: 30_000 });
    const selectedSkillText = String(await selectedSkillBadge.innerText());
    assert.match(selectedSkillText, /已加载专业流程/);
    assert.match(selectedSkillText, new RegExp(manualSkill.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await page.getByText("已按 AI 视频导演流程分析。").waitFor({ state: "visible", timeout: 30_000 });
    const manualTurnRequest = turnRequests.at(-1);
    assert.equal(manualTurnRequest?.skill_mode, "manual", "手动选择 Skill 后必须按手动模式发起任务");
    assert.equal(manualTurnRequest?.skill_id, manualSkill.id, "手动选择的 Skill id 必须随当次任务发送");

    scriptedTurns.push({
      response_id: "picker-turn-4",
      message: "已结合上一轮的专业流程继续。",
      tool_calls: [],
    });
    await page.locator("#canvasAgentPrompt").fill("继续完善这个方案");
    await page.locator("#canvasAgentSend").click();
    await page.getByText("已结合上一轮的专业流程继续。").waitFor({ state: "visible", timeout: 30_000 });
    const followUpContext = turnRequests.at(-1)?.conversation_context || [];
    assert.ok(
      followUpContext.some((item) => item.role === "user"
        && item.content.includes(`[本次专业流程：${manualSkill.label}（${manualSkill.id}）]`)),
      "后续 Agent 回合必须能从会话上下文看到用户手动选择的 Skill",
    );

    await page.screenshot({ path: GATE_SCREENSHOT_PATH, fullPage: false });
    assert.deepEqual(pageErrors, [], "页面不应该有未捕获异常");
    console.log(`Canvas agent skill picker checks passed. Screenshots: ${SCREENSHOT_PATH}, ${GATE_SCREENSHOT_PATH}`);
  } finally {
    await browser.close();
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
