const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AI_OS_TEST_URL ||= 'http://127.0.0.1:33200';
process.env.QA_RUNTIME_ROOT ||= path.resolve(__dirname,
  '../../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app');
const { openFixture, loadModels, settle } = require('./dom-scaling-test-support.cjs');

async function selection(page) {
  return page.evaluate(async () => {
    const ids = ['1', '3', '2'];
    const result = await organizeAgentCanvasNodes({ node_ids: ids, direction: 'row', center_view: true }, {
      scope: { boardId: canvasState.activeBoardId },
      assertActive() {},
      async forEachBatched(nodes, visit) {
        for (const [index, node] of nodes.entries()) await visit(node, index);
      },
    });
    const snapshot = () => ({
      primary: canvasState.activeNode?.dataset.id,
      primaryConnected: canvasState.activeNode?.isConnected,
      selected: [...canvasState.selectedIds],
      nodes: ids.map(id => {
        const node = canvasVirtualStore.getMounted(id);
        const port = node?.querySelector('.canvas-port-output');
        return {
          id,
          level: canvasVirtualStore.getMountedLevel(id),
          selected: node?.classList.contains('is-selected'),
          port: port ? getComputedStyle(port).visibility : null,
        };
      }),
    });
    const before = snapshot();
    canvasVirtualizer.ensureMounted('3', 'light');
    const afterTextSwap = snapshot();
    canvasVirtualizer.ensureMounted('1', 'light');
    const afterImageSwap = snapshot();
    canvasVirtualizer.ensureMounted('2', 'light');
    const afterPrimarySwap = snapshot();
    canvasVirtualizer.ensureMounted('2', 'full');
    const frames = [];
    for (let index = 0; index < 40; index += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      frames.push(snapshot());
    }
    return { result, before, afterTextSwap, afterImageSwap, afterPrimarySwap, frames };
  });
}

async function promptCursor(page, id) {
  await page.evaluate(nodeId => {
    const node = ensureCanvasNodeMounted(nodeId);
    applyAgentCanvasFocusTransform({
      scale: .75,
      x: innerWidth / 2 - (Number(node.dataset.x) + node.offsetWidth / 2) * .75,
      y: 125 - Number(node.dataset.y) * .75,
    });
    selectCanvasNode(node);
  }, id);
  const panel = page.locator(`#canvasPlane .canvas-node[data-id="${id}"] .flora-generator-composer:visible`);
  const editor = panel.locator('.flora-generator-prompt-area :is(textarea,[contenteditable="true"]):visible').first();
  await editor.waitFor();
  await settle(page, 100);
  const box = await editor.boundingBox();
  const point = { x: box.x + box.width * .38, y: box.y + box.height * .38 };
  await page.mouse.move(point.x, point.y);
  const hit = await editor.evaluate((element, point) => {
    const target = document.elementFromPoint(point.x, point.y);
    return { editable: element.contains(target), cursor: target && getComputedStyle(target).cursor };
  }, point);
  await page.mouse.click(point.x, point.y);
  const focused = await editor.evaluate(element => element === document.activeElement);
  await page.keyboard.insertText('验收');
  const edited = await editor.evaluate(element => (element.value ?? element.textContent).includes('验收'));
  assert.deepEqual({ ...hit, focused, edited }, { editable: true, cursor: 'text', focused: true, edited: true },
    `Node ${id} prompt pointer and editing`);
}

async function main() {
  const fixture = await openFixture();
  const { page } = fixture;
  try {
    await loadModels(fixture, 3, 'A');
    await settle(page);
    await page.mouse.move(11, 11);
    const outcome = await selection(page);
    const { result, before, afterTextSwap, afterImageSwap, afterPrimarySwap, frames } = outcome;
    assert.equal(result.focused, true);
    assert.equal(before.primary, '2');
    const checks = [
      ['selection', () => {
        for (const [phase, snapshot] of Object.entries({ afterTextSwap, afterImageSwap, afterPrimarySwap })) {
          assert.equal(snapshot.primary, before.primary, phase);
          assert.equal(snapshot.primaryConnected, true, phase);
          assert.deepEqual(snapshot.selected, before.selected, phase);
          assert.ok(snapshot.nodes.every(node => node.selected), phase);
        }
        const stableFrames = frames.slice(10);
        for (const snapshot of stableFrames) {
          assert.equal(snapshot.primary, before.primary);
          assert.deepEqual(snapshot, stableFrames[0]);
        }
      }],
      ['image prompt', () => promptCursor(page, '1')],
      ['video prompt', () => promptCursor(page, '2')],
    ];
    const failures = [];
    for (const [name, check] of checks) {
      try { await check(); console.log(`PASS ${name}`); }
      catch (error) { failures.push(error); console.error(`FAIL ${name}\n${error.stack}`); }
    }
    assert.deepEqual(fixture.errors, [], 'browser page errors');
    if (failures.length) process.exitCode = 1;
  } finally {
    await fixture.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
