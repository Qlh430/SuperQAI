"use strict";

const assert = require("node:assert/strict");

module.exports = async function checkCanvasGalleryHover(page, fixture) {
  const memberSelector = '[data-gallery-member-id="action-a"]';
  const preview = page.locator(`${memberSelector} .canvas-gallery-member-preview`);
  const leaveGallery = async () => {
    await page.mouse.move(1350, 850);
    await page.waitForFunction(() =>
      !document.querySelector(".canvas-image-info:not([hidden])")
      && !document.querySelector(".canvas-gallery-member.is-image-info-hover"));
    await page.waitForFunction(selector =>
      !document.querySelector(`${selector} .canvas-gallery-member-preview`)
        .getAnimations().some(animation => animation.playState === "running"), memberSelector);
    assert.equal(await preview.evaluate(el => getComputedStyle(el).transform), "none",
      "leaving the gallery releases the hover lift");
    await page.waitForFunction(() => !canvasGalleryMemberHoverConnectionSyncFrame);
    const connectionGap = await page.evaluate(({ connectionId }) => {
      const connection = getVisibleCanvasConnections().find(({ item }) => item.id === connectionId);
      const path = connection && canvasConnectionElements.get(connection.key)?.path;
      if (!path) return null;
      const start = path.getPointAtLength(0);
      return Math.hypot(start.x - connection.from.x, start.y - connection.from.y) * canvasState.scale;
    }, fixture);
    assert.notEqual(connectionGap, null, "the fixture member keeps its output connection");
    assert.ok(connectionGap < .75,
      `the connection must follow the port when leaving the external caption (gap=${connectionGap}px)`);
  };
  const setScale = scale => page.evaluate(({ scale, galleryId }) => {
    const gallery = getCanvasNode(galleryId);
    canvasState.scale = scale;
    canvasState.x = 260 - Number(gallery.dataset.x) * scale;
    canvasState.y = 100 - Number(gallery.dataset.y) * scale;
    applyCanvasTransformNow(); canvasVirtualizer.flushNow();
  }, { scale, galleryId: fixture.galleryId });
  for (const scale of [1, .25, 2]) {
    await leaveGallery();
    await setScale(scale);
    for (const edge of ["top", "bottom", "left", "right"]) {
      await leaveGallery();
      const box = await preview.boundingBox();
      const inset = Math.min(1, box.width / 10, box.height / 10);
      const point = {
        x: edge === "left" ? box.x + inset : edge === "right" ? box.x + box.width - inset : box.x + box.width / 2,
        y: edge === "top" ? box.y + inset : edge === "bottom" ? box.y + box.height - inset : box.y + box.height / 2,
      };
      // Raw mouse movement avoids Playwright scrolling transformed ancestors.
      await page.mouse.move(point.x, point.y);
      const samples = await page.evaluate(async ({ selector, point }) => {
        const member = document.querySelector(selector);
        const image = member.querySelector("img");
        const port = member.querySelector(".canvas-gallery-member-output-port.is-connected");
        const caption = document.querySelector(".canvas-image-info");
        const samples = [];
        const start = performance.now();
        while (performance.now() - start < 1100) {
          const hit = document.elementFromPoint(point.x, point.y);
          samples.push({
            time: performance.now() - start,
            hover: member.matches(":hover"),
            target: hit?.tagName,
            top: image.getBoundingClientRect().top,
            portTop: port?.getBoundingClientRect().top,
            captionTop: caption.hidden ? null : caption.getBoundingClientRect().top,
          });
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        return samples;
      }, { selector: memberSelector, point });
      const settled = samples.filter(sample => sample.time > 500);
      assert.ok(settled.length >= 3, "sample multiple frames after the hover transition");
      const range = values => Math.max(...values) - Math.min(...values);
      assert.ok(range(settled.map(sample => sample.top)) / scale < .5,
        `${edge} edge at ${scale * 100}% must settle, not oscillate: ${JSON.stringify(samples.filter((_, index) => index % 5 === 0))}`);
      assert.ok(new Set(settled.map(sample => sample.target)).size <= 1,
        `${edge} edge must not alternate hit targets while the mouse is stationary`);
      const portTops = settled.map(sample => sample.portTop).filter(Number.isFinite);
      if (portTops.length) assert.ok(range(portTops) / scale < .5, "connected port stays stable with the image");
      if (edge === "top") {
        assert.ok(settled.every(sample => sample.captionTop !== null), "caption stays available at the top edge");
        assert.ok(range(settled.map(sample => sample.captionTop)) / scale < .5, "caption stops moving too");
        assert.ok(settled[0].top < box.y - 3 * scale, "the original hover lift is preserved");
      }
    }
  }
  await leaveGallery();
  await setScale(1);
  for (const id of ["action-a", "action-b"]) {
    const image = await page.locator(`[data-gallery-member-id="${id}"] img`).boundingBox();
    await page.mouse.move(image.x + image.width / 2, image.y + image.height / 2);
    await page.waitForFunction(id =>
      document.querySelector(`.canvas-gallery-member[data-gallery-member-id="${id}"]`)
        .classList.contains("is-image-info-hover"), id);
    assert.equal(await page.locator(".canvas-gallery-member.is-image-info-hover").count(), 1,
      "switching images must release the previous member");
  }
  await leaveGallery();
  console.log("PASS gallery edges stay stable at 25%, 100% and 200%; hover lift, connected port and pointer exit preserved");
};
