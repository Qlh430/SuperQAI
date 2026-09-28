"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
assert.ok(fs.existsSync(path.join(root, "model-test-ui.js")), "model tests need a user-driven dialog");
const { chromium } = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<!doctype html><html lang="zh-CN"><body><div id="root" class="ai-os-settings-layout"><button id="opener">测试</button></div></body></html>');
    await page.addStyleTag({ path: path.join(root, "system-settings.css") });
    for (const filename of ["provider-test-result.js", "model-test-ui.js"]) await page.addScriptTag({ path: path.join(root, filename) });
    await page.evaluate(() => {
      window.calls = [];
      window.results = [];
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#dceaff"; ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#5286ba"; ctx.beginPath(); ctx.moveTo(0, 480); ctx.lineTo(250, 130); ctx.lineTo(540, 480); ctx.fill();
      ctx.fillStyle = "#345578"; ctx.beginPath(); ctx.moveTo(300, 480); ctx.lineTo(510, 200); ctx.lineTo(640, 480); ctx.fill();
      ctx.fillStyle = "#fff6d9"; ctx.beginPath(); ctx.arc(470, 105, 40, 0, Math.PI * 2); ctx.fill();
      window.fixtureImage = canvas.toDataURL("image/png");
      window.testFixture = { provider: { id: "demo", name: "示例平台", baseUrl: "https://example.test", apiKey: "" }, model: { id: "demo-model", capabilities: ["llm.chat", "image.generate"] } };
      window.dialog = AiOsModelTestUi.createModelTestDialog({
        root: document.querySelector("#root"),
        request: async (route, options) => {
          calls.push({ route, body: options.body });
          if (window.hold) await new Promise(resolve => { window.release = resolve; });
          if (window.fail) throw new Error("余额不足，请充值");
          if (window.pending) return { test: { status: "pending", images: [], taskId: "task-42", elapsedMs: 30 } };
          return route.endsWith("test-image")
            ? { test: { status: "succeeded", images: [fixtureImage], elapsedMs: 1200 } }
            : { test: { status: "succeeded", text: "<b>实际回复</b>", images: [], elapsedMs: 125 } };
        },
        onResult: value => results.push(value),
      });
      document.querySelector("#opener").onclick = () => dialog.open(testFixture);
    });
    await page.locator("#opener").click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => calls.length), 0, "opening must never send paid requests");
    assert.match(await dialog.innerText(), /示例平台.*demo-model/s);
    assert.match(await dialog.innerText(), /可能产生费用/);
    await dialog.locator("[data-test-prompt]").fill("第一句");
    await dialog.locator("[data-test-send]").click();
    await page.waitForFunction(() => document.querySelector("[data-test-output]")?.textContent.includes("实际回复"));
    assert.equal(await dialog.locator("[data-test-output] b").count(), 0, "upstream text is not HTML");
    assert.match(await dialog.locator("[data-test-status]").innerText(), /成功/);
    await dialog.locator("[data-test-prompt]").fill("第二句");
    await dialog.locator("[data-test-send]").click();
    await page.waitForFunction(() => calls.length === 2 && results.length === 2);
    assert.deepEqual(await page.evaluate(() => calls[1].body.input.messages), [
      { role: "user", content: "第一句" }, { role: "assistant", content: "<b>实际回复</b>" }, { role: "user", content: "第二句" },
    ]);
    await dialog.locator('[data-test-mode="image"]').click();
    await dialog.locator("[data-test-prompt]").fill("画一只橘猫");
    await dialog.locator("[data-test-send]").click();
    await dialog.locator("[data-test-output] img").waitFor();
    assert.equal(await page.evaluate(() => calls.at(-1).body.input.prompt), "画一只橘猫");
    assert.equal(await page.evaluate(() => calls.at(-1).body.params.n), 1);
    assert.equal(await dialog.locator("[data-test-output] img").evaluate(img => img.complete && img.naturalWidth > 0), true);
    await dialog.locator("[data-test-output] img").click();
    assert.equal(await dialog.evaluate(el => el.classList.contains("is-expanded")), true);
    const artifacts = path.join(root, "artifacts", "model-test");
    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "image-light.png") });
    await dialog.locator("[data-test-output] img").click();
    await page.evaluate(() => { window.pending = true; });
    await dialog.locator("[data-test-send]").click();
    await page.waitForFunction(() => document.querySelector("[data-test-status]")?.textContent.includes("已提交"));
    assert.doesNotMatch(await dialog.locator("[data-test-status]").innerText(), /成功/);
    assert.match(await dialog.locator("[data-test-output]").innerText(), /task-42/);
    await page.evaluate(() => { window.pending = false; window.fail = true; });
    await dialog.locator("[data-test-send]").click();
    await page.waitForFunction(() => document.querySelector("[data-test-status]")?.textContent.includes("未通过"));
    assert.match(await dialog.locator("[data-test-output]").innerText(), /余额不足/);
    await page.evaluate(() => { window.fail = false; window.hold = true; });
    await dialog.locator("[data-test-send]").click();
    await page.waitForFunction(() => typeof window.release === "function");
    assert.equal(await dialog.locator("[data-test-send]").isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.locator("#opener").evaluate(el => el === document.activeElement), true);
    await page.locator("#opener").click();
    await page.evaluate(() => { window.release(); window.hold = false; });
    await page.waitForFunction(() => !document.querySelector("[data-test-output]")?.textContent.includes("实际回复"));
    assert.equal(await dialog.locator("[data-test-output] img").count(), 0, "closed response cannot populate a new dialog");
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.locator("[data-test-prompt]").fill("你好");
    await dialog.locator("[data-test-send]").click();
    await page.waitForFunction(() => document.querySelector("[data-test-output]")?.textContent.includes("实际回复"));
    const box = await dialog.boundingBox();
    assert.ok(box.width <= 390 && box.x >= 0, "dialog fits mobile viewport");
    await page.screenshot({ path: path.join(artifacts, "chat-dark-mobile.png") });
    await dialog.locator("[data-test-close]").focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator("#opener").evaluate(el => el === document.activeElement), false, "focus stays inside modal");
    assert.deepEqual(errors, []);
    await page.evaluate(() => dialog.destroy());
    console.log("Model test browser checks passed (explicit requests, chat context, images, pending, errors, stale response, mobile and focus).");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
