const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const filename = path.join(__dirname, 'design-sources/canvas-representation-manager.js');
function loadManager(browser = false) {
  assert.ok(fs.existsSync(filename), 'representation decision module must exist');
  const sandbox = { Map, Set, Date, performance, setTimeout, clearTimeout };
  if (!browser) sandbox.module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return browser ? sandbox.CanvasRepresentationManager : sandbox.module.exports.CanvasRepresentationManager;
}
function fixture(count = 200, width = 320) {
  const rows = new Map(Array.from({ length: count }, (_, index) => {
    const id = `n${String(index).padStart(3, '0')}`;
    return [id, { id, x: index * 40, y: 20, width, height: 180 }];
  }));
  const store = {
    get: id => rows.get(id),
    getRect: id => {
      const row = rows.get(id);
      return row && { left: row.x, top: row.y, right: row.x + row.width, bottom: row.y + row.height };
    },
  };
  return { rows, input: { visibleIds: [...rows.keys()], viewport: { x: 0, y: 0, scale: 1, width: 1440, height: 900 }, store, selectedIds: new Set(), protectedReasons: new Map() } };
}
const countLevel = (plan, level) => [...plan.values()].filter(value => value === level).length;

test('200 visible rows allocate zero Full and at most eight Light without activity', () => {
  const Manager = loadManager();
  const manager = new Manager();
  const { input } = fixture();
  const plan = manager.plan(input);
  assert.equal(countLevel(plan, 'full'), 0);
  assert.equal(countLevel(plan, 'light'), 8);
  assert.equal(manager.levels.size, 200);
  assert.equal(manager.snapshot().visibleCount, 200);
  assert.equal(loadManager(true).name, 'CanvasRepresentationManager');
});

test('groups stay in Canvas at all sizes and on hover, while protected groups retain Full', () => {
  const Manager = loadManager();
  let time = 0;
  const manager = new Manager({ now: () => time });
  const { rows, input } = fixture(3);
  rows.get('n000').kind = 'group';
  rows.get('n000').width = 900;
  rows.get('n001').kind = 'image';
  rows.get('n002').kind = 'group';
  rows.get('n002').width = 180;
  input.hoveredId = 'n002';
  let plan = manager.plan(input);
  assert.equal(plan.has('n000'), false, 'large group must not receive an opaque Light shell');
  assert.equal(manager.levels.get('n000'), 'canvas-rich');
  assert.equal(plan.get('n001'), 'light', 'ordinary nodes retain existing Light eligibility');
  time = 120;
  assert.equal(manager.plan(input).has('n002'), false, 'hover preheat must not make a group Light');
  input.protectedReasons.set('n000', ['focus']);
  assert.equal(manager.plan(input).get('n000'), 'full');
  input.protectedReasons.clear();
  manager.plan(input);
  time = 620;
  plan = manager.plan(input);
  assert.equal(plan.has('n000'), false, 'expired protected Full must return to Canvas');
  assert.equal(manager.levels.get('n000'), 'canvas-rich');
  manager.plan({ ...input, viewport: { ...input.viewport, scale: 0.1 } });
  assert.equal(manager.levels.get('n000'), 'canvas');
  manager.reset();
});

test('screen-size thresholds stay hysteretic and hover does not change media representation', () => {
  const Manager = loadManager();
  let time = 0;
  const manager = new Manager({ now: () => time });
  const { rows, input } = fixture(4, 100);
  rows.get('n001').width = 180;
  rows.get('n002').width = 260;
  rows.get('n003').width = 300;
  let plan = manager.plan(input);
  assert.equal(manager.levels.get('n000'), 'canvas');
  assert.equal(manager.levels.get('n001'), 'canvas-rich');
  assert.equal(plan.get('n002'), 'light');
  assert.equal(countLevel(plan, 'light'), 2);
  input.hoveredId = 'n001';
  manager.plan(input);
  time = 119;
  assert.equal(manager.plan(input).has('n001'), false);
  time = 120;
  plan = manager.plan(input);
  assert.equal(plan.has('n001'), false, 'hover alone must not replace the stable Canvas media surface');
  assert.equal(manager.levels.get('n001'), 'canvas-rich');
  rows.get('n001').width = 260;
  plan = manager.plan(input);
  assert.equal(plan.get('n001'), 'light', 'viewport size may still promote eligible nodes');
  assert.equal(countLevel(plan, 'full'), 0);
  assert.deepEqual([...manager.plan({ ...input, visibleIds: [...input.visibleIds].reverse() })], [...plan]);
  manager.reset();
});


test('offscreen protected focus survives and explicit exceptions are attributed', () => {
  const Manager = loadManager();
  const manager = new Manager({ fullBudget: 2 });
  const { input } = fixture(10);
  input.visibleIds = ['n000'];
  input.protectedReasons = new Map([
    ['n002', ['focus']], ['n003', ['playing']], ['n004', ['focus', 'task']], ['missing', ['focus']],
  ]);
  const plan = manager.plan(input);
  assert.equal(plan.get('n002'), 'full');
  assert.equal(countLevel(plan, 'full'), 3);
  assert.equal(plan.has('missing'), false);
  const snapshot = manager.snapshot();
  assert.equal(snapshot.protectedCount, 3);
  assert.equal(snapshot.protectedExceptions, 1);
  assert.equal(Object.values(snapshot.protectedExceptionsByReason).every(value => value > 0), true);
  assert.equal(snapshot.protectedReasons.focus, 2);
});

test('previous Full receives 500ms demotion grace, then expires without renewal', () => {
  const Manager = loadManager();
  let time = 0;
  const manager = new Manager({ now: () => time });
  const { input } = fixture(1);
  input.protectedReasons.set('n000', ['focus']);
  assert.equal(manager.plan(input).get('n000'), 'full');
  input.protectedReasons.clear();
  time = 50;
  assert.equal(manager.plan(input).get('n000'), 'full');
  time = 549;
  assert.equal(manager.plan(input).get('n000'), 'full');
  time = 550;
  assert.equal(manager.plan(input).get('n000'), 'light');
  manager.reset();
});

test('rapid primary changes respect normal and interaction Full budgets during grace', () => {
  const Manager = loadManager();
  const manager = new Manager({ now: () => 0 });
  const { input } = fixture(30);
  for (let index = 0; index < 25; index++) {
    input.primaryId = input.visibleIds[index];
    input.selectedIds = new Set([input.primaryId]);
    assert.ok(countLevel(manager.plan(input), 'full') <= 5);
  }
  input.interacting = true;
  for (let index = 0; index < 25; index++) {
    input.primaryId = input.visibleIds[index];
    input.selectedIds = new Set([input.primaryId]);
    assert.ok(countLevel(manager.plan(input), 'full') <= 8);
  }
  manager.reset();
});

test('multi-selection and primary selection remain visual; explicit focus stays editable', () => {
  const Manager = loadManager();
  const manager = new Manager();
  const { input } = fixture();
  input.selectedIds = new Set(input.visibleIds);
  input.interacting = true;
  input.hoveredId = 'n004';
  assert.equal(countLevel(manager.plan(input), 'full'), 0);
  input.primaryId = 'n003';
  assert.equal(countLevel(manager.plan(input), 'full'), 0);
  input.protectedReasons.set('n009', ['focus']);
  assert.equal(countLevel(manager.plan(input), 'full'), 1);
  manager.reset();
});

test('each independent flag is dynamic and disabled flags clear pending decisions', () => {
  const Manager = loadManager();
  const flags = {};
  const manager = new Manager({ getFlags: () => flags });
  const { input } = fixture(1);
  for (const key of ['representationManager', 'detailHydration', 'detailCulling']) {
    assert.ok(manager.plan(input) instanceof Map);
    flags[key] = false;
    assert.equal(manager.plan(input), null);
    assert.equal(manager.levels.size, 0);
    flags[key] = true;
  }
  assert.ok(manager.plan(input) instanceof Map);
});

test('transition samples are bounded, totals persist, and quantiles use nearest rank', () => {
  const Manager = loadManager();
  const manager = new Manager();
  [1, 2, 3, 4, 100].forEach(value => manager.recordTransition('hydrate', value));
  let snapshot = manager.snapshot();
  assert.equal(snapshot.hydrateCount, 5);
  assert.equal(snapshot.hydrateP50, 3);
  assert.equal(snapshot.hydrateP95, 100);
  for (let index = 0; index < 1000; index++) manager.recordTransition('dehydrate', index);
  manager.recordTransition('hydrate', NaN);
  manager.recordTransition('hydrate', -1);
  manager.recordTransition('unknown', 1);
  snapshot = manager.snapshot();
  assert.equal(snapshot.hydrateCount, 5);
  assert.equal(snapshot.dehydrateCount, 1000);
  assert.equal(snapshot.dehydrateSamples, 512);
  assert.equal(snapshot.dehydratePeak, 999);
  assert.equal(snapshot.dehydrateP50, 743);
  assert.equal(snapshot.dehydrateP95, 974);
});

test('demotion expiry requests replan and reset cancels pending timers and board state', async () => {
  const Manager = loadManager();
  let schedules = 0;
  const manager = new Manager({ demoteDelay: 5, onSchedule: () => schedules++ });
  const { input } = fixture(1);
  input.protectedReasons.set('n000', ['focus']);
  manager.plan(input);
  input.protectedReasons.clear();
  manager.plan(input);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(schedules, 1);
  manager.plan(input);
  input.protectedReasons.set('n000', ['focus']);
  manager.plan(input);
  input.protectedReasons.clear();
  manager.plan(input);
  manager.recordTransition('hydrate', 2);
  manager.reset();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(schedules, 1);
  assert.equal(manager.levels.size, 0);
  assert.equal(manager.snapshot().hydrateCount, 0);
  assert.equal(manager.snapshot().planCount, 0);
  assert.equal(manager.plan(input).get('n000'), 'light');
});
