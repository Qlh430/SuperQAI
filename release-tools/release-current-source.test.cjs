'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');

test('release deployment covers desktop updater fixes omitted from the old package', async () => {
  const { componentTargets } = await import(pathToFileURL(path.join(root, 'neon-workbench/component-deploy.mjs')));
  const targets = componentTargets(['release-host-sync']);
  for (const file of ['backup-service.js', 'canvas-image-info.js', 'desktop/main.js', 'desktop/updater.js', 'desktop/update-install.js', 'desktop/rollback-retention.js', 'desktop/portable-setup.js', 'desktop/portable-setup.html']) {
    assert.ok(targets.includes(file), file);
  }
  assert.ok(targets.every(file => !file.startsWith('data/') && !file.startsWith('output/')));
});

test('release assembly never skips source deployment when resuming an existing candidate', () => {
  const source = fs.readFileSync(path.join(root, 'release-tools/package-v304.cjs'), 'utf8');
  assert.ok(!source.includes('if(!resume)execFileSync'));
  for (const group of ['canvas-group-visual', 'canvas-final-adjustments', 'canvas-redraw-frontend', 'release-host-sync']) {
    assert.ok(source.includes(group), group);
  }
  assert.ok(source.includes('release-source-sync'));
});
