const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function createHarness(isDragging = false) {
  const listeners = new Map();
  const counters = { elementFromPoint: 0, ownerLookup: 0 };
  const canvas = { contains: () => false };
  const document = {
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    getElementById: () => canvas,
    elementFromPoint() {
      counters.elementFromPoint++;
      return { closest: () => null };
    },
  };
  let rafId = 0;
  const sandbox = {
    document,
    performance: { now: () => 0 },
    requestAnimationFrame: () => ++rafId,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
    getCanvasHoverPortOwner: () => { counters.ownerLookup++; return null; },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'design-sources/flora-connection-interaction.js'), 'utf8'), sandbox);
  sandbox.FloraConnectionInteraction.install({ isDragging: () => isDragging });
  const pointermove = listeners.get('pointermove')[0];
  return { counters, pointermove };
}

test('held canvas/node drags skip repeated global hover hit tests', () => {
  const { counters, pointermove } = createHarness(false);
  pointermove({ clientX: 100, clientY: 100, buttons: 1, pointerType: 'mouse' });
  assert.equal(counters.elementFromPoint, 0);
  assert.equal(counters.ownerLookup, 0);
});

test('wire drags retain hover hit tests for connection target snapping', () => {
  const { counters, pointermove } = createHarness(true);
  pointermove({ clientX: 100, clientY: 100, buttons: 1, pointerType: 'mouse' });
  assert.equal(counters.elementFromPoint, 1);
  assert.equal(counters.ownerLookup, 1);
});

test('idle pointer movement keeps the existing hover path', () => {
  const { counters, pointermove } = createHarness(false);
  pointermove({ clientX: 100, clientY: 100, buttons: 0, pointerType: 'mouse' });
  assert.equal(counters.elementFromPoint, 1);
  assert.equal(counters.ownerLookup, 1);
});
