"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let playwright;
try {
  playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ));
}

const BASE_URL = process.env.AI_OS_TEST_BASE_URL || "http://127.0.0.1:3310";
const TEST_ACCOUNT = Object.freeze({
  username: "image-picker-browser-admin",
  displayName: "模型选择器浏览器管理员",
  password: "image picker browser administrator password",
});

(async () => {
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await playwright.chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const submittedBodies = [];
  await page.route("**/api/images", async (route) => {
    submittedBodies.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "browser contract interception" }),
    });
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    const authGate = page.locator("#aiOsAuthGate");
    if (await authGate.isVisible()) {
      const bootstrap = page.locator("#aiOsBootstrapForm");
      if (await bootstrap.isVisible()) {
        await bootstrap.locator('[name="username"]').fill(TEST_ACCOUNT.username);
        await bootstrap.locator('[name="displayName"]').fill(TEST_ACCOUNT.displayName);
        await bootstrap.locator('[name="password"]').fill(TEST_ACCOUNT.password);
        await bootstrap.getByRole("button", { name: "创建超级管理员" }).click();
      } else {
        const login = page.locator("#aiOsLoginForm");
        await login.locator('[name="username"]').fill(TEST_ACCOUNT.username);
        await login.locator('[name="password"]').fill(TEST_ACCOUNT.password);
        await login.getByRole("button", { name: "登录 AI OS" }).click();
      }
    }
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    const providerResponse = await page.request.get(`${BASE_URL}/api/providers`);
    assert.equal(providerResponse.ok(), true, "authenticated model-picker checks must read providers");
    const providerPayload = await providerResponse.json();
    const hasApimartModel = (providerPayload.providers || []).some((provider) =>
      (provider.models || []).some((model) => model.id === "gpt-image-2-apimart"),
    );
    if (!hasApimartModel) {
      const created = await page.request.post(`${BASE_URL}/api/providers`, {
        data: {
          id: "image-picker-apimart",
          name: "Image Picker APIMart",
          baseUrl: "https://api.apimart.ai/v1",
          protocol: "apimart",
          apiKey: "browser-picker-test-key",
          models: [{
            id: "gpt-image-2-apimart",
            protocol: "openai-images",
            capabilities: ["image.generate"],
            metadata: { upstreamModel: "gpt-image-2", resolutions: ["1", "2", "4"] },
          }],
        },
      });
      assert.equal(created.ok(), true, await created.text());
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#aiOsDesktop").waitFor({ state: "visible" });
    await page.locator('[data-ai-app="image"]').click();
    await page.locator("#imageView").waitFor({ state: "visible" });

    const source = page.locator("#imageModel");
    const trigger = page.locator("#imageModelPickerMount .image-model-picker-trigger");
    assert.equal(await source.getAttribute("aria-hidden"), "true");
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");

    await trigger.click();
    const popover = page.locator("body > .image-model-picker-popover:visible");
    await popover.waitFor({ state: "visible" });
    assert.equal(await popover.getAttribute("role"), "dialog");
    assert.equal(await popover.locator('[role="listbox"]').count(), 1);
    await popover.locator('input[type="search"]').fill("apimart");
    assert.equal(await popover.locator(".image-model-provider-group").count(), 1);

    const apimartRow = popover.locator(".image-model-picker-row").filter({ hasText: "gpt-image-2-apimart" }).first();
    await apimartRow.locator(".image-model-favorite").click();
    await popover.getByRole("button", { name: "收藏", exact: true }).click();
    assert.equal(await popover.locator(".image-model-picker-row").filter({ hasText: "gpt-image-2-apimart" }).count(), 1);
    await popover.getByRole("button", { name: "全部", exact: true }).click();
    await popover.locator('input[type="search"]').fill("apimart");
    await popover.locator(".image-model-picker-row").filter({ hasText: "gpt-image-2-apimart" }).first().locator(".image-model-picker-choice").click();

    assert.match(await trigger.innerText(), /gpt-image-2-apimart/);
    assert.doesNotMatch(await trigger.innerText(), /0%/, "missing usage history must not look like a zero-percent provider");
    const resolutionOptions = await page.locator("#imageResolution option").evaluateAll((options) => options.map((option) => ({
      value: option.value,
      disabled: option.disabled,
      label: option.textContent,
    })));
    assert.deepEqual(resolutionOptions.map(({ value, disabled }) => ({ value, disabled })), [
      { value: "1", disabled: false },
      { value: "2", disabled: false },
      { value: "4", disabled: false },
    ]);
    assert.equal(await page.locator("#imageResolutionHelp").isVisible(), false, "APIMart ratio+resolution transport must not show official OpenAI square-4K warning");

    await trigger.click();
    await popover.getByRole("button", { name: "最近", exact: true }).click();
    assert.equal(await popover.locator(".image-model-picker-row").filter({ hasText: "gpt-image-2-apimart" }).count(), 1);
    await popover.getByRole("button", { name: "推荐", exact: true }).click();
    await popover.locator('input[type="search"]').fill("");
    await popover.locator(".image-model-picker-auto").click();
    await page.locator("#imagePrompt").fill("automatic route contract test");
    await page.locator("#generateButton").click();
    await page.waitForFunction(() => document.querySelector("#imageStatus")?.textContent?.includes("生成失败"));
    assert.equal(Object.hasOwn(submittedBodies.at(-1), "model"), false, "automatic selection must leave provider/model unpinned");

    await trigger.click();
    await popover.locator('input[type="search"]').fill("apimart");
    await popover.locator(".image-model-picker-row").filter({ hasText: "gpt-image-2-apimart" }).first().locator(".image-model-picker-choice").click();
    const exactSubmissionCount = submittedBodies.length;
    await page.locator("#generateButton").click();
    await page.waitForFunction(() => document.querySelector("#imageStatus")?.textContent?.includes("生成失败"));
    assert.equal(submittedBodies.length, exactSubmissionCount + 1, "exact selection must make one intercepted request");
    assert.match(String(submittedBodies.at(-1)?.model || ""), /^custom:/, "an exact row must send the stable client model ID");

    await page.evaluate(() => {
      const original = window.AiOsDesktop.openApp;
      window.__manageOpenCalls = 0;
      window.AiOsDesktop.openApp = (...args) => {
        window.__manageOpenCalls += 1;
        if (window.__manageOpenCalls === 1) return null;
        window.AiOsDesktop.openApp = original;
        return original(...args);
      };
    });
    await trigger.click();
    await popover.waitFor({ state: "visible" });
    await popover.getByRole("button", { name: "API 设置", exact: true }).click();
    await page.waitForFunction(() => {
      const windowElement = document.querySelector("#aiOsSystemWindow");
      const providers = document.querySelector('[data-settings-nav="providers"]');
      const section = document.querySelector('[data-settings-section="providers"]');
      return windowElement && !windowElement.hidden && providers && section && !section.hidden;
    }, undefined, { timeout: 2000 });
    assert.ok(await page.evaluate(() => window.__manageOpenCalls >= 2), "management shortcut must retry when the desktop is still preparing");

    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasView").waitFor({ state: "visible" });
    const portalCountBeforeRerender = await page.locator("body > .image-model-picker-popover").count();
    await page.evaluate(() => {
      const node = document.createElement("article");
      node.className = "canvas-node canvas-node-image";
      node.dataset.id = "model-picker-rerender-contract";
      node.dataset.x = "40";
      node.dataset.y = "40";
      document.body.append(node);
      renderCanvasImageNode(node, { src: "", name: "重绘测试" });
      renderCanvasImageNode(node, { src: "", name: "重绘测试" });
    });
    assert.equal(
      await page.locator("body > .image-model-picker-popover").count(),
      portalCountBeforeRerender + 1,
      "rerendering a canvas image node must dispose the previous portaled picker",
    );
    const galleryRenderError = await page.evaluate(() => {
      try {
        const gallery = addCanvasGallery({ x: 20, y: 20 });
        setCanvasGalleryContainerMembers(gallery, [{ src: "/output/browser-contract.png", savedUrl: "/output/browser-contract.png" }]);
        return "";
      } catch (error) {
        return String(error?.message || error);
      }
    });
    assert.equal(galleryRenderError, "", "a completed image must be appendable to a canvas gallery");
    await page.evaluate(() => {
      const library = document.querySelector("#canvasLibraryScreen");
      const editor = document.querySelector("#canvasEditorScreen");
      if (library) library.hidden = true;
      if (editor) editor.hidden = false;
      const plane = document.querySelector("#canvasPlane");
      const node = document.createElement("article");
      node.className = "canvas-node canvas-node-image";
      node.dataset.id = "model-picker-browser-node";
      node.dataset.x = "80";
      node.dataset.y = "80";
      plane.append(node);
      renderCanvasImageNode(node, { src: "", name: "模型选择器测试" });
    });
    const canvasPickers = page.locator('[data-id="model-picker-browser-node"] .image-model-picker');
    const canvasPicker = canvasPickers.first();
    assert.ok(await canvasPickers.count(), "canvas image nodes must use the shared model picker");
    await canvasPicker.locator(".image-model-picker-trigger").click();
    await popover.waitFor({ state: "visible" });
    assert.ok((await popover.innerText()).includes("自动选择（推荐）"));

    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    const darkColors = await popover.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
    }));
    assert.notEqual(darkColors.background, "rgb(255, 255, 255)");
    assert.notEqual(darkColors.color, "rgb(255, 255, 255, 0)");

    await page.evaluate(() => {
      AiOsDisplay.applyPreferences({ appearance: { theme: "dark", scale: 1.5, animations: "full" } }, document.documentElement);
    });
    await page.waitForTimeout(50);
    const scaledTransform = await popover.evaluate((element) => getComputedStyle(element).transform);
    assert.match(scaledTransform, /matrix\(1\.5, 0, 0, 1\.5/, "the portaled picker must follow the global AI OS scale");

    await page.setViewportSize({ width: 640, height: 700 });
    await page.waitForFunction(() => {
      const element = document.querySelector("body > .image-model-picker-popover:not([hidden])");
      const rect = element?.getBoundingClientRect();
      return rect && rect.right <= window.innerWidth + 0.5 && rect.bottom <= window.innerHeight + 0.5;
    });
    const bounds = await popover.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0);
    assert.ok(bounds.x + bounds.width <= 640.5, `compact picker must stay within the viewport: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.y + bounds.height <= 700.5);
    assert.ok(bounds.height >= 400, "compact model picker should remain tall enough to browse grouped models");

    console.log("Image model picker browser checks passed.");
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
