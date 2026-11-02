const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openFixture, loadModels, settle, ROOT } = require('./dom-scaling-test-support.cjs');

const SOURCE = path.join(__dirname, 'design-sources/neon-canvas-surface.css');
const OUTPUT_DIR = path.join(ROOT, '.planning/representation-fidelity-20261016/item-01-status-bar');
const widths = [390, 768, 1440, 1728];

(async () => {
  const fixture = await openFixture({ width: 1440, height: 1050 });
  const results = { generatedAt: new Date().toISOString(), widths: [], nativeZoom: null, touch: null, errors: fixture.errors };
  try {
    // Before deployment, load the worktree CSS over the runtime CSS. After
    // deployment, STATUSBAR_SOURCE_OVERLAY=0 verifies the shipped asset itself.
    if (process.env.STATUSBAR_SOURCE_OVERLAY !== '0') await fixture.page.addStyleTag({ path: SOURCE });
    await loadModels(fixture, 36, 'A');
    await settle(fixture.page, 250);

    for (const width of widths) {
      await fixture.page.setViewportSize({ width, height: 900 });
      await fixture.page.evaluate(() => {
        document.activeElement?.blur?.();
        clearCanvasSelection();
      });
      const viewport = await fixture.page.locator('#infiniteCanvas').boundingBox();
      if (!viewport) throw new Error('Canvas viewport is missing');
      await fixture.page.mouse.move(viewport.x + viewport.width - 36, viewport.y + viewport.height * 0.72);
      await settle(fixture.page, 240);

      const state = await fixture.page.evaluate(() => {
        const screen = document.querySelector('#canvasEditorScreen');
        const canvas = document.querySelector('#infiniteCanvas');
        const status = screen?.querySelector('.canvas-status');
        const rect = status?.getBoundingClientRect();
        const canvasRect = canvas?.getBoundingClientRect();
        const style = status ? getComputedStyle(status) : null;
        const representation = window.CanvasRepresentationDiagnostics?.snapshot?.() || null;
        return {
          editorHovered: screen?.matches(':hover') || false,
          editorFocused: screen?.matches(':focus-within') || false,
          opacity: style?.opacity || null,
          visibility: style?.visibility || null,
          pointerEvents: style?.pointerEvents || null,
          transform: style?.transform || null,
          zoom: status?.querySelector('#canvasZoom')?.textContent || null,
          statusRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom } : null,
          canvasRect: canvasRect ? { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height, bottom: canvasRect.bottom } : null,
          fullDOMNodes: document.querySelectorAll('#canvasPlane .canvas-node').length,
          representation,
          actions: (() => {
            const element = screen?.querySelector('.canvas-actions');
            const rect = element?.getBoundingClientRect();
            const style = element ? getComputedStyle(element) : null;
            return { opacity: style?.opacity || null, visibility: style?.visibility || null, rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null };
          })(),
        };
      });
      const status = state.statusRect;
      const canvas = state.canvasRect;
      const checks = {
        canvasOnlyFixture: state.fullDOMNodes === 0 && Number(state.representation?.canvasRich || 0) > 0,
        visibleDuringCanvasUse: state.editorHovered && state.visibility === 'visible' && Number(state.opacity) > 0.95,
        percentPresent: /^\d+%$/.test(state.zoom || ''),
        bottomAligned: Boolean(status && canvas && status.bottom <= canvas.bottom + 2 && status.bottom >= canvas.bottom - 64),
        horizontallyCentered: Boolean(status && canvas && Math.abs(status.x + status.width / 2 - (canvas.x + canvas.width / 2)) < 4),
      };
      results.widths.push({ width, state, checks });
      await fixture.page.screenshot({ path: path.join(OUTPUT_DIR, `status-${width}.png`) });
    }

    const beforeZoom = await fixture.page.locator('#canvasZoom').textContent();
    const canvasRect = await fixture.page.locator('#infiniteCanvas').boundingBox();
    await fixture.page.mouse.move(canvasRect.x + canvasRect.width * 0.5, canvasRect.y + canvasRect.height * 0.55);
    await fixture.page.mouse.wheel(0, -150);
    await fixture.page.waitForFunction(previous => document.querySelector('#canvasZoom')?.textContent !== previous, beforeZoom, { timeout: 5000 });
    await settle(fixture.page, 240);
    results.nativeZoom = await fixture.page.evaluate(() => {
      const screen = document.querySelector('#canvasEditorScreen');
      const status = screen?.querySelector('.canvas-status');
      const style = status ? getComputedStyle(status) : null;
      return { zoom: status?.querySelector('#canvasZoom')?.textContent || null, visible: style?.visibility === 'visible' && Number(style.opacity) > 0.95, editorHovered: screen?.matches(':hover') || false };
    });

    const cdp = await fixture.context.newCDPSession(fixture.page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await fixture.page.mouse.move(-20, -20);
    await settle(fixture.page, 240);
    results.touch = await fixture.page.evaluate(() => {
      const screen = document.querySelector('#canvasEditorScreen');
      const status = screen?.querySelector('.canvas-status');
      const style = status ? getComputedStyle(status) : null;
      return {
        hoverNone: matchMedia('(hover: none)').matches,
        pointerCoarse: matchMedia('(pointer: coarse)').matches,
        editorHovered: screen?.matches(':hover') || false,
        editorFocused: screen?.matches(':focus-within') || false,
        opacity: style?.opacity || null,
        visibility: style?.visibility || null,
        transform: style?.transform || null,
      };
    });
    results.checks = results.widths.flatMap(item => Object.entries(item.checks).map(([name, pass]) => ({ width: item.width, name, pass })));
    results.checks.push({ name: 'nativeZoomVisibleAndUpdated', pass: results.nativeZoom.visible && results.nativeZoom.editorHovered && results.nativeZoom.zoom !== beforeZoom });
    results.checks.push({ name: 'touchWithoutHoverVisible', pass: (results.touch.hoverNone || results.touch.pointerCoarse) && !results.touch.editorHovered && !results.touch.editorFocused && results.touch.visibility === 'visible' && Number(results.touch.opacity) > 0.95 });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, process.env.STATUSBAR_RESULT || 'results.json'), JSON.stringify(results, null, 2));
    assert.ok(results.checks.every(check => check.pass), JSON.stringify(results.checks.filter(check => !check.pass), null, 2));
    assert.deepEqual(fixture.errors, []);
  } finally {
    await fixture.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
