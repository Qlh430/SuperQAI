"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 画布右键“AI 抠图”必须真的能打开工作台：模式切换、滑块默认值与缺模型时的降级提示都要在真实页面里成立。
module.exports = async function checkCanvasCutout(page) {
  const image = page.locator("#canvasPlane img[data-canvas-original-src]").first();
  await image.waitFor({ state: "visible" });
  await image.click({ button: "right" });

  const menu = page.locator("#canvasImageMenu");
  await menu.waitFor({ state: "visible", timeout: 5000 });
  const cutoutEntry = menu.locator('[data-image-menu-action="cutout"]');
  assert.equal(await cutoutEntry.isVisible(), true, "image context menu offers AI 抠图");
  assert.equal((await cutoutEntry.innerText()).trim(), "AI 抠图");

  await cutoutEntry.click();
  const modal = page.locator(".canvas-cutout-modal");
  await modal.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await page.locator('.canvas-cutout-dialog[role="dialog"][aria-label="AI 抠图"]').count(), 1);

  const fieldValues = () => page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll(".cutout-fields [data-cutout-field]")].map((input) => [input.dataset.cutoutField, input.value]),
  ));
  assert.deepEqual(await fieldValues(), { background: "18", foreground: "78", edge: "2", feather: "8" }, "subject defaults match DX OS");

  await page.locator('[data-cutout-mode="effect"]').click();
  assert.deepEqual(await fieldValues(), { low: "6", high: "190", feather: "18", spill: "86" }, "effect defaults match DX OS");
  assert.equal(await page.locator(".cutout-invert").isVisible(), true, "effect mode exposes the invert switch");

  // 改一个参数再恢复默认，确认“恢复默认”真的回到初始值。
  await page.evaluate(() => {
    const input = document.querySelector('.cutout-fields [data-cutout-field="low"]');
    input.value = "120";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal((await fieldValues()).low, "120");
  await page.locator(".cutout-reset").click();
  assert.equal((await fieldValues()).low, "6", "reset restores the documented default");

  await page.locator('[data-cutout-mode="subject"]').click();
  assert.equal((await fieldValues()).background, "18", "switching back keeps subject defaults");

  await page.waitForFunction(() => {
    const state = document.querySelector(".cutout-model-state");
    return Boolean(state && state.textContent.trim());
  });
  assert.equal((await page.locator(".cutout-model-name").innerText()).trim(), "BEN2 Base");
  const exportButton = await page.locator(".cutout-export").boundingBox();
  const viewport = page.viewportSize();
  assert.ok(exportButton && exportButton.y + exportButton.height <= viewport.height, "底部操作按钮必须始终落在可视区域内");
  const modelState = (await page.locator(".cutout-model-state").innerText()).trim();
  assert.ok(["已就绪", "不可用"].includes(modelState), `unexpected model state: ${modelState}`);
  // 权重随应用内置分发，界面上不该再出现任何下载入口。
  assert.equal(await page.locator(".cutout-download").count(), 0, "下载模型按钮必须已经从界面移除");
  if (modelState === "不可用") {
    const modelMeta = (await page.locator(".cutout-model-meta").innerText()).trim();
    assert.match(modelMeta, /内置/, "模型不可用时必须说明权重是随应用内置的");
    assert.match(modelMeta, /21\d MB/, "界面必须写明权重体积");
    await page.waitForFunction(() => document.querySelector(".canvas-cutout-status").textContent.includes("内置抠图模型不可用"));
    assert.equal(await page.locator(".cutout-import-toggle").isVisible(), true, "内置权重缺失时仍要能导入本地模型");
    assert.equal(await page.locator(".cutout-export").isDisabled(), true, "保存到画布 stays disabled until a mask exists");
    await page.locator(".cutout-import-toggle").click();
    assert.equal(await page.locator(".cutout-import-path").isVisible(), true, "import path input appears on demand");
    await page.locator(".cutout-import-run").click();
    await page.waitForFunction(() => document.querySelector(".canvas-cutout-status").textContent.includes("请先填写模型文件路径"));
  } else {
    const modelMeta = (await page.locator(".cutout-model-meta").innerText()).trim();
    assert.match(modelMeta, /随应用内置，不需要下载/, "已就绪状态要写明权重是内置的");
    assert.match(modelMeta, /21\d MB/, "已就绪状态也要写清模型体积");
    assert.equal(await page.locator(".cutout-import-toggle").isVisible(), false, "权重就绪时不再显示兜底导入");
    // 模型在的时候必须真的跑出掩膜：预览 canvas 有内容，状态给出前景占比。
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".canvas-cutout-canvas");
      const status = document.querySelector(".canvas-cutout-status");
      return Boolean(canvas && canvas.width > 0 && /抠图完成|前景占比/.test(status?.textContent || ""));
    }, null, { timeout: 120000 }).catch(async (error) => {
      const status = await page.locator(".canvas-cutout-status").innerText().catch(() => "");
      const canvas = await page.evaluate(() => {
        const node = document.querySelector(".canvas-cutout-canvas");
        return node ? `${node.width}x${node.height}` : "missing";
      });
      throw new Error(`${error.message}（状态栏：${status || "(空)"}｜预览画布：${canvas}）`);
    });
    const preview = await page.evaluate(() => {
      const canvas = document.querySelector(".canvas-cutout-canvas");
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] > 128) opaque += 1;
      return { ratio: opaque / (canvas.width * canvas.height), width: canvas.width };
    });
    assert.ok(preview.ratio > 0.01 && preview.ratio < 0.98, `预览里必须真的抠出主体（前景占比 ${preview.ratio.toFixed(3)}）`);
    assert.equal(await page.locator(".cutout-export").isEnabled(), true, "有掩膜后「保存到画布」必须可用");
  }

  const artifactDir = path.join(__dirname, "..", "artifacts", "canvas-cutout");
  fs.mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, "workbench.png") });

  // 特效模式多一行「反选」，同样要一屏放得下，别被弹窗底部截掉。
  await page.locator('[data-cutout-mode="effect"]').click();
  await page.waitForTimeout(200);
  const invertBox = await page.locator(".cutout-invert").boundingBox();
  const dialogBox = await page.locator(".canvas-cutout-dialog").boundingBox();
  assert.ok(
    invertBox && dialogBox && invertBox.y + invertBox.height <= dialogBox.y + dialogBox.height,
    "特效模式的「反选」必须落在弹窗可视区域内",
  );
  await page.screenshot({ path: path.join(artifactDir, "workbench-effect.png") });
  await page.locator('[data-cutout-mode="subject"]').click();
  await page.waitForTimeout(200);

  // 工作台的文字必须真的看得清：按实际叠起来的背景色算一遍 WCAG 对比度。
  // （历史上这里踩过坑：--text 只在部分调色板存在，声明失效后参数名会掉回 --muted 灰。）
  const measureReadability = () => page.evaluate(() => {
    const parseColor = (value) => {
      const text = String(value || "").trim();
      const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
      if (hex) {
        let body = hex[1];
        if (body.length <= 4) body = body.split("").map((char) => char + char).join("");
        const channel = (index) => parseInt(body.slice(index, index + 2), 16);
        return [channel(0), channel(2), channel(4), body.length === 8 ? channel(6) / 255 : 1];
      }
      // Chrome 会把 color-mix 的结果序列化成 color(srgb r g b / a)，分量是 0–1。
      const srgb = text.match(/^color\(srgb\s+([^)]+)\)$/i);
      if (srgb) {
        const parts = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
        if (parts.length < 3 || parts.some((value) => !Number.isFinite(value))) return null;
        return [parts[0] * 255, parts[1] * 255, parts[2] * 255, parts.length > 3 ? parts[3] : 1];
      }
      const numbers = text.match(/-?\d*\.?\d+/g);
      if (!numbers) return null;
      const [r, g, b] = numbers.slice(0, 3).map(Number);
      return [r, g, b, numbers.length > 3 ? Number(numbers[3]) : 1];
    };
    const over = (top, bottom) => top.slice(0, 3).map((channel, index) => channel * top[3] + bottom[index] * (1 - top[3]));
    const luminance = (rgb) => {
      const [r, g, b] = rgb.slice(0, 3).map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (front, back) => {
      const [high, low] = [luminance(front), luminance(back)].sort((a, b) => b - a);
      return (high + 0.05) / (low + 0.05);
    };
    const modal = document.querySelector(".canvas-cutout-modal");
    const dialog = document.querySelector(".canvas-cutout-dialog");
    const variables = getComputedStyle(modal);
    // 弹窗背景 = 不透明底 + 面板色；再往下把每一层背景色依次叠上去，得到元素真正的底色。
    let backdrop = over(
      parseColor(variables.getPropertyValue("--cutout-surface-tint")) || [255, 255, 255, 0.92],
      parseColor(variables.getPropertyValue("--cutout-surface-base")) || [238, 243, 248, 1],
    );
    const chain = [];
    const measure = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return { selector, contrast: 0 };
      chain.length = 0;
      for (let element = node.parentElement; element && element !== dialog; element = element.parentElement) chain.unshift(element);
      let surface = backdrop;
      for (const element of chain) {
        const layer = parseColor(getComputedStyle(element).backgroundColor);
        if (layer && layer[3] > 0) surface = over(layer, surface);
      }
      const ownBackground = parseColor(getComputedStyle(node).backgroundColor);
      if (ownBackground && ownBackground[3] > 0) surface = over(ownBackground, surface);
      const color = parseColor(getComputedStyle(node).color);
      const show = (rgb) => `rgb(${rgb.slice(0, 3).map((value) => Math.round(value)).join(", ")})`;
      return {
        selector,
        contrast: color ? contrast(over(color, surface), surface) : 0,
        detail: `${getComputedStyle(node).color} on ${show(surface)}`,
      };
    };
    return [
      ".cutout-field-head b",
      ".cutout-field-head em",
      ".cutout-field small",
      ".cutout-model-name",
      ".cutout-model-meta",
      ".cutout-section-title",
      ".canvas-cutout-status",
      ".cutout-mode-switch button:not(.is-active)",
      ".cutout-reset",
    ].map(measure);
  });

  const readability = await measureReadability();
  for (const item of readability) {
    assert.ok(item.contrast >= 4.5, `${item.selector} 在弹窗里必须清晰可读（对比度 ${item.contrast.toFixed(2)}，${item.detail}）`);
  }

  // 深色主题下同样要看得清：切过去再量一遍，并留一张截图。
  const previousTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  const previousThemeMode = await page.evaluate(() => document.documentElement.dataset.themeMode);
  await page.evaluate(() => {
    document.documentElement.dataset.themeMode = "dark";
    document.documentElement.dataset.theme = "dark";
  });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark", "深色主题要能在页面里生效");
  for (const item of await measureReadability()) {
    assert.ok(item.contrast >= 4.5, `深色主题下 ${item.selector} 必须清晰可读（对比度 ${item.contrast.toFixed(2)}，${item.detail}）`);
  }
  await page.screenshot({ path: path.join(artifactDir, "workbench-dark.png") });
  await page.evaluate(([theme, mode]) => {
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.dataset.theme = theme;
  }, [previousTheme, previousThemeMode]);

  await page.locator(".canvas-cutout-close").click();
  await modal.waitFor({ state: "hidden", timeout: 3000 });
  assert.equal(await page.locator("#canvasImageMenu").isVisible(), false, "closing the workbench leaves no stray menu");
  assert.equal(await page.evaluate(() => document.querySelectorAll("#canvasPlane .canvas-node").length), 1, "opening the workbench must not create canvas nodes");
};
