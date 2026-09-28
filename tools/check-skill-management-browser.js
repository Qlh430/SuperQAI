"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

let playwright;
try { playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright"); }
catch {
  playwright = require(path.join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
const { chromium } = playwright;
const ROOT = path.resolve(__dirname, "..");
const ARTIFACT_DIR = path.join(ROOT, "artifacts");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function request(port, pathname, options = {}) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
    return response.status;
  } catch { return 0; }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill(); resolve(); }, 5_000);
    timer.unref?.();
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

function startApp(port, dataDir, outputDir, diagnostics) {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_OUTPUT_DIR: outputDir,
      AI_OS_SYSTEM_DB_FILE: path.join(dataDir, "system.db"),
      AI_OS_BACKUP_DIR: path.join(dataDir, "backups"),
      AI_OS_SKIP_ENV_FILE: "1",
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));
  return child;
}

function writeFunctionalSkill(dataDir, id, label, pack = "") {
  const folder = path.join(dataDir, "skills", id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "SKILL.md"), [
    "---",
    `name: ${id}`,
    `description: ${label} 的功能 Skill 验收实现`,
    ...(pack ? ["metadata:", `  pack: ${pack}`] : []),
    "canvas:",
    `  label: ${label}`,
    "  category: video",
    "  icon: clapperboard",
    "  required_selection: none",
    "  triggers: [功能 Skill 验收]",
    "  capabilities: [node.text.create, node.update]",
    "---",
    "",
    `# ${label}`,
    "",
    "该 Skill 只用于验证功能 Skill 安装包分组与独立启用状态。",
  ].join("\n"), "utf8");
}

async function waitForApp(child, port, diagnostics) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && !(await request(port, "/api/auth/session"))) {
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(child.exitCode, null, diagnostics.join(""));
  assert.notEqual(await request(port, "/api/auth/session"), 0, diagnostics.join(""));
}

async function main() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-skill-browser-"));
  const outputDir = path.join(dataDir, "output");
  const diagnostics = [];
  let child = startApp(port, dataDir, outputDir, diagnostics);
  let browser;
  try {
    await waitForApp(child, port, diagnostics);
    const executablePath = [
      process.env.AI_OS_TEST_BROWSER,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.locator("#aiOsBootstrapForm [name=username]").fill("admin");
    await page.locator("#aiOsBootstrapForm [name=displayName]").fill("Admin");
    await page.locator("#aiOsBootstrapForm [name=password]").fill("skill management browser password");
    await page.getByRole("button", { name: "创建超级管理员" }).click();
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    await page.locator('[data-ai-app="settings"]').click();
    const root = page.locator("#aiOsSystemSettingsRoot");
    await root.locator('[data-settings-nav="skills"]').click();
    await root.locator('[data-settings-section="skills"]').waitFor({ state: "visible" });

    // 默认：14 个系统 Skill 加 1 个内置功能 Skill 全部启用，按折叠分组展示。
    assert.equal(await root.locator("[data-skill-card]").count(), 15, "the catalog should list all system and bundled skills");
    assert.equal(await root.locator("[data-skill-toggle]:checked").count(), 15, "skills are enabled by default");
    assert.match(await root.locator(".settings-skill-toolbar").textContent(), /已启用 15 \/ 15/);
    assert.equal(await root.locator("[data-skill-group-panel]").count(), 4);
    assert.equal(await root.locator('[data-skill-card="canvas-agent-core"]').count(), 0, "the hidden core skill stays out of the UI");
    assert.equal(await root.locator('[data-skill-card="writing"] .settings-skill-badge').textContent(), "官方预设");
    assert.equal(await root.locator('[data-skill-card="writing"] code').textContent(), "writing");

    // 原子能力 Skill 必须真实出现在设置界面，并与画布上的真实工具一一对应。
    for (const [id, label] of [["generate-image", "生成图片"], ["edit-image", "编辑图片"], ["upscale-image", "放大图片"], ["describe-image", "识别图片"], ["remove-background", "一键抠图"]]) {
      const card = root.locator(`[data-skill-card="${id}"]`);
      assert.equal(await card.count(), 1, `${id} should be listed in the settings catalog`);
      assert.match(await card.textContent(), new RegExp(label));
    }
    assert.ok(await root.locator('[data-skill-card="generate-image"]').textContent().then((text) => /生图|生成图片/.test(text)));
    assert.equal(await root.locator('[data-skill-card="ai-video-director"]').count(), 1, "the bundled video director should be installed by default");

    // 分类筛选只影响展示，不改变启用状态。
    await root.locator('[data-skill-filter="system"]').click();
    assert.match(await root.locator(".settings-skill-toolbar").textContent(), /已启用 15 \/ 15/);
    await root.locator('[data-skill-filter="custom"]').click();
    assert.equal(await root.locator("[data-skill-card]").count(), 1);
    assert.equal(await root.locator('[data-skill-card="ai-video-director"]').count(), 1);
    await root.locator('[data-skill-filter="all"]').click();
    assert.equal(await root.locator("[data-skill-card]").count(), 15);

    // 分组折叠。
    await root.locator('[data-skill-group="video"]').click();
    await page.waitForFunction(() => (
      document.querySelector('[data-skill-group-panel="video"]')?.classList.contains("is-open") === false
    ));
    await root.locator('[data-skill-group="video"]').click();
    await page.waitForFunction(() => (
      document.querySelector('[data-skill-group-panel="video"]')?.classList.contains("is-open") === true
    ));

    // 停用一个系统 Skill：界面计数、画布 Agent 目录和落盘文件都要同步。
    const toggleResponse = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/api/skills/enabled"),
      root.locator('[data-skill-card="writing"] .settings-skill-toggle span').click(),
    ]).then(([response]) => response);
    assert.equal(toggleResponse.status(), 200, await toggleResponse.text());
    await page.waitForFunction(() => (
      document.querySelector(".settings-skill-toolbar")?.textContent?.includes("已启用 14 / 15")
    ));
    assert.equal(await root.locator('[data-skill-toggle][data-skill-id="writing"]').isChecked(), false);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dataDir, "skills.json"), "utf8")).enabled.writing,
      false,
      "停用必须写入 data/skills.json",
    );
    // 用页面自身的会话请求，验证停用会立刻反映到画布 Agent 的技能目录。
    const agentCatalog = await page.evaluate(() => fetch("/api/canvas-agent/skills", { credentials: "same-origin" }).then((response) => response.json()));
    assert.ok(Array.isArray(agentCatalog.skills));
    assert.equal(agentCatalog.skills.some((skill) => skill.id === "writing"), false, "agent 目录必须立即排除已停用的 Skill");
    assert.ok(agentCatalog.skills.some((skill) => skill.id === "poster-design"));

    // 刷新页面后仍然是停用状态，说明状态来自服务端而不是内存。
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    await page.locator('[data-ai-app="settings"]').click();
    await root.locator('[data-settings-nav="skills"]').click();
    await root.locator('[data-settings-section="skills"]').waitFor({ state: "visible" });
    await page.waitForFunction(() => (
      document.querySelector(".settings-skill-toolbar")?.textContent?.includes("已启用 14 / 15")
    ));
    assert.equal(await root.locator('[data-skill-toggle][data-skill-id="writing"]').isChecked(), false);

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const screenshotPath = path.join(ARTIFACT_DIR, "skill-management.png");
    await root.locator('[data-settings-section="skills"]').screenshot({ path: screenshotPath });
    assert.ok(fs.statSync(screenshotPath).size > 10_000, "the screenshot should capture the rendered page");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "skill-management-window.png") });

    // 重新启用后回到默认状态，不留下覆盖项。
    await root.locator('[data-skill-card="writing"] .settings-skill-toggle span').click();
    await page.waitForFunction(() => (
      document.querySelector(".settings-skill-toolbar")?.textContent?.includes("已启用 15 / 15")
    ));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, "skills.json"), "utf8")).enabled.writing, undefined);

    // 服务端重启后读取的是同一份 data/skills.json。
    await root.locator('[data-skill-card="code"] .settings-skill-toggle span').click();
    await page.waitForFunction(() => (
      document.querySelector(".settings-skill-toolbar")?.textContent?.includes("已启用 14 / 15")
    ));
    await stopChild(child);
    diagnostics.push("\n--- restart ---\n");
    child = startApp(port, dataDir, outputDir, diagnostics);
    await waitForApp(child, port, diagnostics);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    await page.locator('[data-ai-app="settings"]').click();
    await root.locator('[data-settings-nav="skills"]').click();
    await root.locator('[data-settings-section="skills"]').waitFor({ state: "visible" });
    await page.waitForFunction(() => (
      document.querySelector(".settings-skill-toolbar")?.textContent?.includes("已启用 14 / 15")
    ));
    assert.equal(await root.locator('[data-skill-toggle][data-skill-id="code"]').isChecked(), false);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dataDir, "skills.json"), "utf8")).enabled.code,
      false,
      "重启后停用状态必须保留",
    );

    // 功能 Skill：MiniMax H3 Skills 九项归为安装包，新增 Skill 单独分组。
    const miniMaxSkillIds = [
      "3d-animation-short-generator",
      "brand-promo-video-generator",
      "co-op-game-intro-generator",
      "h3-prompt-writing",
      "handdrawn-live-video-generator",
      "minimalist-product-ad-generator",
      "music-video-subtitle-generator",
      "paper-collage-explainer-generator",
      "papercraft-stop-motion-explainer",
    ];
    miniMaxSkillIds.forEach((id, index) => {
      writeFunctionalSkill(dataDir, id, `MiniMax 流程 ${index + 1}`, "MiniMax H3 Skills");
    });
    writeFunctionalSkill(dataDir, "ai-video-director", "AI 视频导演");
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    await page.locator('[data-ai-app="settings"]').click();
    await root.locator('[data-settings-nav="skills"]').click();
    await root.locator('[data-settings-section="skills"]').waitFor({ state: "visible" });
    await root.locator('[data-skill-filter="custom"]').click();
    await page.waitForFunction(() => document.querySelectorAll("[data-skill-card]").length === 10);
    assert.equal(await root.locator('[data-skill-group-panel="custom-pack:minimax-h3-skills"]').count(), 1);
    assert.equal(
      await root.locator('[data-skill-group-panel="custom-pack:minimax-h3-skills"] [data-skill-card]').count(),
      9,
      "MiniMax H3 Skills 安装包必须显示九项且能逐项选择",
    );
    assert.equal(
      await root.locator('[data-skill-group-panel="custom:standalone"] [data-skill-card]').count(),
      1,
      "新增 ai-video-director 必须单独显示并单独选择",
    );
    await root.locator('[data-skill-card="ai-video-director"] .settings-skill-toggle span').click();
    await page.waitForFunction(() => (
      document.querySelector('[data-skill-toggle][data-skill-id="ai-video-director"]')?.checked === false
    ));
    assert.equal(
      await root.locator('[data-skill-group-panel="custom-pack:minimax-h3-skills"] [data-skill-toggle]:checked').count(),
      9,
      "关闭独立 Skill 不能影响 MiniMax 安装包中的九项",
    );
    const packageScreenshotPath = path.join(ARTIFACT_DIR, "skill-package-management.png");
    await root.locator('[data-settings-section="skills"]').screenshot({ path: packageScreenshotPath });
    assert.ok(fs.statSync(packageScreenshotPath).size > 10_000, "the package screenshot should be rendered");

    console.log("Skill management browser checks passed.");
    console.log(`screenshot: ${screenshotPath}`);
    console.log(`package screenshot: ${packageScreenshotPath}`);
  } finally {
    await browser?.close();
    await stopChild(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
