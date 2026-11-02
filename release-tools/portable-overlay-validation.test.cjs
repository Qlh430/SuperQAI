'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { records } = require('./portable-baseline.cjs');
const { validateOverlayBase } = require('./portable-overlay-validation.cjs');

test('reviewed inventory and every current desktop source are required before overlay', t => {
  const root = fs.mkdtempSync(path.join(__dirname, '../.planning/overlay-中文-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const candidate = path.join(root, 'candidate'), source = path.join(root, 'desktop');
  const appPath = '.ai-runtime/versions/3.0.1-win-x64/resources/app';
  fs.mkdirSync(path.join(candidate, appPath, 'desktop'), { recursive: true });
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'updater.js'), 'current updater');
  fs.writeFileSync(path.join(source, 'update-validation.js'), 'required authentication');
  fs.writeFileSync(path.join(candidate, appPath, 'desktop/updater.js'), 'old updater');
  // A self-consistent stale package must still be rejected against current sources.
  assert.throws(() => validateOverlayBase(candidate, records(candidate), source, appPath), /source|源码/);
  fs.copyFileSync(path.join(source, 'updater.js'), path.join(candidate, appPath, 'desktop/updater.js'));
  assert.throws(() => validateOverlayBase(candidate, records(candidate), source, appPath), /source|源码/);
  fs.copyFileSync(path.join(source, 'update-validation.js'), path.join(candidate, appPath, 'desktop/update-validation.js'));
  const reviewed = records(candidate);
  assert.doesNotThrow(() => validateOverlayBase(candidate, reviewed, source, appPath));
  fs.writeFileSync(path.join(candidate, appPath, 'desktop/unknown.js'), 'unowned');
  assert.throws(() => validateOverlayBase(candidate, records(candidate), source, appPath), /source|源码/);
  fs.unlinkSync(path.join(candidate, appPath, 'desktop/unknown.js'));
  fs.writeFileSync(path.join(candidate, 'undeclared.txt'), 'unexpected');
  assert.throws(() => validateOverlayBase(candidate, reviewed, source, appPath), /inventory|文件集合/);
});
