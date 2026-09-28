"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { chromium } = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));

(async () => {
  assert.ok(fs.existsSync(path.join(root, "canvas-image-info.js")), "hover module exists");
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent(`<div id="infiniteCanvas" style="position:absolute;inset:30px;overflow:hidden">
      <div id="canvasPlane" style="position:absolute;inset:0;transform-origin:0 0">
        <article class="canvas-node" style="position:absolute;left:100px;top:180px;width:420px">
          <div class="canvas-image-upload"><img id="picture" alt="秋日树林 原图.png" data-canvas-original-src="/original.png" data-original-src="/original.png" data-image-quality="thumbnail" data-original-width="3840" data-original-height="2160" style="display:block;width:420px;height:300px"></div>
        </article>
        <article class="canvas-node canvas-node-gallery-container" style="position:absolute;left:600px;top:200px;width:240px">
          <div class="canvas-node-bar" style="height:38px"><span>图集</span></div>
          <div class="canvas-gallery-member"><button class="canvas-gallery-member-preview" style="padding:0;border:0"><img id="member" alt="生成图 2" data-canvas-original-src="/other.png" data-original-src="/other.png" data-image-quality="thumbnail" style="display:block;width:240px;height:180px"></button></div>
        </article>
      </div></div>`);
    await page.addStyleTag({ path: path.join(root, "styles.css") });
    await page.addStyleTag({ content: ".canvas-node { min-width:0!important; min-height:0!important; padding:0!important; border:0!important; background:none!important; } body {background:#eef1f4} #canvasPlane {background-image:radial-gradient(#c4ccd3 1px,transparent 1px);background-size:16px 16px}" });
    await page.addScriptTag({ path: path.join(root, "canvas-image-name.js") });
    await page.addScriptTag({ path: path.join(root, "canvas-image-info.js") });
    await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#d9e5df"; ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#e0a349"; ctx.beginPath(); ctx.ellipse(340, 275, 180, 70, -.25, 0, Math.PI * 2); ctx.fill();
      document.querySelectorAll("img").forEach(image => { image.src = canvas.toDataURL(); });
      window.info = CanvasImageInfo.create({
        viewport: document.querySelector("#infiniteCanvas"),
        onRename: (image, requested) => {
          const names = [...document.querySelectorAll("img[data-canvas-original-src]")]
            .filter(candidate => candidate !== image)
            .map(candidate => candidate.alt);
          const next = CanvasImageName.ensureUnique(requested, names);
          image.alt = next;
          return next;
        },
      });
      window.clicks = 0;
      document.querySelector("#picture").addEventListener("click", () => window.clicks++);
    });
    const picture = page.locator("#picture");
    const overlay = page.locator(".canvas-image-info");
    assert.equal(await overlay.isVisible(), false);
    await picture.hover();
    await overlay.waitFor({ state: "visible" });
    assert.equal(await overlay.locator("[data-image-info-name]").evaluate((el) => el.tagName), "SPAN", "name is text until clicked");
    assert.equal(await overlay.locator("[data-image-info-name]").innerText(), "秋日树林 原图.png");
    assert.equal(await overlay.locator("[data-image-info-dimensions]").innerText(), "3840 × 2160");
    await overlay.locator("[data-image-info-name]").click();
    await overlay.locator("[data-image-info-name-editor]").fill("生成图 2");
    await overlay.locator("[data-image-info-name-editor]").press("Enter");
    assert.equal(await overlay.locator("[data-image-info-name]").innerText(), "生成图 3");
    assert.equal(await picture.getAttribute("alt"), "生成图 3");
    await picture.hover();
    await overlay.waitFor({ state: "visible" });
    let bar = await overlay.boundingBox();
    const imageBox = await picture.boundingBox();
    assert.ok(bar.y + bar.height <= imageBox.y && Math.abs(bar.x - imageBox.x) < 3, "info is aligned above the image");
    assert.equal(await overlay.evaluate(element => getComputedStyle(element).pointerEvents), "auto");
    await picture.hover();
    const pictureBeforeInfoClick = await picture.boundingBox();
    const infoBeforeClick = await overlay.boundingBox();
    await page.mouse.move(infoBeforeClick.x + 18, infoBeforeClick.y + infoBeforeClick.height / 2);
    await overlay.waitFor({ state: "visible" });
    assert.ok(await overlay.isVisible(), "moving from image onto info keeps it visible");
    const nameBox = await overlay.locator("[data-image-info-name]").boundingBox();
    await page.mouse.click(nameBox.x + Math.min(40, nameBox.width / 2), nameBox.y + nameBox.height / 2);
    assert.equal(await overlay.locator("[data-image-info-name-editor]").isVisible(), true, "clicking name enters edit mode");
    await page.mouse.click(50, 50);
    assert.equal(await overlay.locator("[data-image-info-name-editor]").isVisible(), false, "clicking outside exits edit mode");
    await picture.hover();
    assert.equal(await overlay.locator("[data-image-info-name-editor]").isVisible(), false, "hover returns to text mode");
    await overlay.locator("[data-image-info-name]").click();
    await overlay.locator("[data-image-info-name-editor]").press("Escape");
    assert.equal(await overlay.locator("[data-image-info-name-editor]").isVisible(), false, "escape returns to text mode");
    await picture.click();
    assert.equal(await page.evaluate(() => clicks), 1, "overlay does not intercept selection");
    await page.mouse.move(imageBox.x + 80, imageBox.y + 80);
    await overlay.waitFor({ state: "visible" });
    await page.mouse.down();
    await overlay.waitFor({ state: "hidden" });
    await page.mouse.move(imageBox.x + 130, imageBox.y + 130);
    assert.equal(await overlay.isVisible(), false, "drag hides metadata");
    await page.mouse.up();
    await page.mouse.move(50, 50);
    assert.equal(await overlay.isVisible(), false);
    await picture.hover();
    const gapImage = await picture.boundingBox();
    const gapInfo = await overlay.boundingBox();
    await page.mouse.move(gapInfo.x + 24, (gapInfo.y + gapInfo.height + gapImage.y) / 2);
    assert.equal(await overlay.isVisible(), true, "small gap between image and info remains hoverable");
    await page.locator("#member").hover();
    await overlay.waitFor({ state: "visible" });
    assert.equal(await overlay.locator("[data-image-info-dimensions]").innerText(), "尺寸未知");
    const memberBox = await page.locator("#member").boundingBox();
    const memberInfoBox = await overlay.boundingBox();
    const galleryBarBox = await page.locator(".canvas-node-gallery-container > .canvas-node-bar").boundingBox();
    assert.ok(Math.abs(memberInfoBox.x - memberBox.x) < 3, "gallery info follows the member image horizontally");
    assert.ok(memberInfoBox.y + memberInfoBox.height <= memberBox.y + 1 || memberInfoBox.y >= galleryBarBox.y + galleryBarBox.height - 1, "gallery info does not overlap the gallery title");
    await page.locator("#member").evaluate(image => { image.dataset.originalWidth = "2048"; image.dataset.originalHeight = "1536"; });
    await page.waitForFunction(() => document.querySelector("[data-image-info-dimensions]").textContent === "2048 × 1536");
    await page.mouse.move(50, 50);
    await page.locator(".canvas-gallery-member-preview").focus();
    await overlay.waitFor({ state: "visible" });
    await page.locator(".canvas-gallery-member-preview").evaluate(element => element.blur());
    await picture.hover();
    const hoverPositionBeforeToolbar = await overlay.boundingBox();
    await page.evaluate(() => {
      const toolbar = document.createElement("div"); toolbar.className = "canvas-image-toolbar"; toolbar.style.cssText = "left:220px;top:128px;width:130px;height:42px";
      document.querySelector("#infiniteCanvas").append(toolbar); info.refresh();
    });
    await page.waitForFunction(() => {
      const bar = document.querySelector(".canvas-image-info").getBoundingClientRect();
      const picture = document.querySelector("#picture").getBoundingClientRect();
      return bar.bottom <= picture.top + 1;
    });
    const hoverPositionWithToolbar = await overlay.boundingBox();
    assert.ok(Math.abs(hoverPositionWithToolbar.x - hoverPositionBeforeToolbar.x) < 1.5, "toolbar does not move info horizontally");
    assert.ok(Math.abs(hoverPositionWithToolbar.y - hoverPositionBeforeToolbar.y) < 1.5, "toolbar does not move info vertically");
    const layerOrder = await page.evaluate(() => ({
      info: Number.parseInt(getComputedStyle(document.querySelector(".canvas-image-info")).zIndex, 10),
      toolbar: Number.parseInt(getComputedStyle(document.querySelector(".canvas-image-toolbar")).zIndex, 10),
    }));
    assert.ok(layerOrder.toolbar > layerOrder.info, "toolbar renders above image info");
    await page.evaluate(() => document.querySelector(".canvas-image-toolbar").remove());
    const fontSize = await overlay.evaluate(element => getComputedStyle(element).fontSize);
    await page.evaluate(() => { document.querySelector("#canvasPlane").style.transform = "scale(1.25)"; info.refresh(); });
    await picture.hover();
    assert.equal(await overlay.evaluate(element => getComputedStyle(element).fontSize), fontSize, "screen font does not scale with canvas");
    // Check painted bounds, not just the unscaled CSS width. Include the
    // 220px threshold, a narrow gallery member and desktop display scaling.
    const assertCaptionBounds = async (selector, label) => {
      const bounds = await page.evaluate(selector => {
        const caption = document.querySelector(".canvas-image-info");
        const picture = document.querySelector(selector).getBoundingClientRect();
        const rect = caption.getBoundingClientRect();
        return {
          visible: !caption.hidden,
          picture: { left: picture.left, right: picture.right, width: picture.width },
          caption: { left: rect.left, right: rect.right, width: rect.width },
          children: [...caption.children].filter(el => el.getClientRects().length)
            .map(el => ({ tag: el.tagName, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })),
        };
      }, selector);
      assert.ok(bounds.visible, `${label}: caption remains visible`);
      assert.ok(bounds.caption.width <= bounds.picture.width + 1,
        `${label}: caption ${bounds.caption.width}px must fit picture ${bounds.picture.width}px`);
      assert.ok(Math.abs(bounds.caption.left - bounds.picture.left) < 1.5, `${label}: left edges align`);
      for (const child of bounds.children) {
        assert.ok(child.left >= bounds.picture.left - 1 && child.right <= bounds.picture.right + 1,
          `${label}: ${child.tag} must stay inside the picture's horizontal bounds`);
      }
    };
    for (const displayScale of [1, 1.25]) {
      for (const selector of ["#picture", "#member"]) {
        for (const scale of [.3, .55, .525, .52, .15, .05, 1.25]) {
          await page.mouse.move(5, 5);
          await page.evaluate(({ selector, scale, displayScale }) => {
            const viewport = document.querySelector("#infiniteCanvas");
            viewport.style.width = "800px"; viewport.style.height = "560px";
            viewport.style.transformOrigin = "0 0"; viewport.style.transform = `scale(${displayScale})`;
            const plane = document.querySelector("#canvasPlane");
            plane.style.transform = `scale(${scale})`;
            const stage = viewport.getBoundingClientRect();
            const rect = document.querySelector(selector).getBoundingClientRect();
            const x = 400 - ((rect.left + rect.right) / 2 - stage.left) / displayScale;
            const y = 280 - ((rect.top + rect.bottom) / 2 - stage.top) / displayScale;
            plane.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
          }, { selector, scale, displayScale });
          await page.locator(selector).hover();
          await page.waitForFunction(selector => !document.querySelector(selector).parentElement
            .getAnimations().some(animation => animation.playState === "running"), selector);
          await page.evaluate(() => info.refresh({ immediate: true }));
          await assertCaptionBounds(selector, `${selector} zoom=${scale} display=${displayScale}`);
          if (scale === .3) {
            await overlay.locator("[data-image-info-name]").click();
            await overlay.locator("[data-image-info-name-editor]").fill("可编辑的长名称".repeat(12));
            await assertCaptionBounds(selector, `${selector} editing zoom=${scale} display=${displayScale}`);
            await overlay.locator("[data-image-info-name-editor]").press("Escape");
            await page.locator(selector).hover();
            await assertCaptionBounds(selector, `${selector} cancelled zoom=${scale} display=${displayScale}`);
          }
        }
      }
    }
    await page.evaluate(() => {
      const viewport = document.querySelector("#infiniteCanvas");
      viewport.style.width = ""; viewport.style.height = ""; viewport.style.transform = "";
      document.querySelector("#canvasPlane").style.transform = "scale(1.25)";
    });
    await picture.hover();
    await overlay.waitFor({ state: "visible" });
    await picture.evaluate(image => { image.alt = '<img src=x onerror=alert(1)>' + "非常长的图片名称".repeat(14) + ".png"; });
    await page.waitForFunction(() => document.querySelector("[data-image-info-name]").textContent.includes("非常长"));
    assert.equal(await overlay.locator("img").count(), 0, "filename is never interpreted as markup");
    assert.ok(await overlay.locator("[data-image-info-name]").evaluate(element => element.scrollWidth > element.clientWidth && getComputedStyle(element).textOverflow === "ellipsis"));
    await picture.evaluate(image => { image.alt = "秋日树林 原图.png"; });
    const artifacts = path.join(root, "artifacts/canvas-image-info");
    fs.mkdirSync(artifacts, { recursive: true });
    await page.waitForFunction(() => document.querySelector("[data-image-info-name]").textContent === "秋日树林 原图.png");
    await page.screenshot({ path: path.join(artifacts, "hover-light.png") });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; document.body.style.background = "#181d23"; });
    await page.screenshot({ path: path.join(artifacts, "hover-dark.png") });
    await picture.evaluate(image => image.closest(".canvas-node").remove());
    await overlay.waitFor({ state: "hidden" });
    await page.evaluate(() => info.destroy());
    assert.equal(await overlay.count(), 0);
    assert.deepEqual(errors, []);
    console.log("Canvas image hover browser checks passed (hover/focus, original metadata, late updates, drag, toolbar, zoom, themes, escaping and removal).");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
