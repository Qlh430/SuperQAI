'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sync = require('./release-source-sync.cjs');
const { programFiles } = require('../host-sources/app/desktop/update-files');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value = 'fixture') => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), value);
  };
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '-q']);
  git(['config', 'user.name', 'Fixture']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  return { root, write, git };
}
test('release checkpoint rejects dirty or untracked required source and stale commit identities', t => {
  const f = fixture(t);
  f.write('host-sources/app/server.js');
  f.git(['add', '.']); f.git(['commit', '-qm', 'fixture']);
  const commit = f.git(['rev-parse', 'HEAD']);
  assert.equal(sync.assertCheckpoint(f.root, ['host-sources/app/server.js']).commit, commit);
  assert.throws(() => sync.assertCheckpoint(f.root, ['host-sources/app/server.js'], '0'.repeat(40)), /checkpoint/i);
  f.write('host-sources/app/server.js', 'new source');
  assert.throws(() => sync.assertCheckpoint(f.root, ['host-sources/app/server.js']), /uncommitted/i);
  f.write('host-sources/app/new.js');
  assert.throws(() => sync.assertCheckpoint(f.root, ['host-sources/app/new.js']), /uncommitted/i);
});
test('checkpoint byte verification also catches assume-unchanged files and late untracked source', t => {
  const f = fixture(t), name = 'host-sources/app/source with spaces.js';
  f.write(name, 'first');
  f.git(['add', '.']); f.git(['commit', '-qm', 'fixture']);
  f.git(['update-index', '--assume-unchanged', name]);
  f.write(name, 'second');
  assert.throws(() => sync.assertCheckpoint(f.root, [name]), /Uncommitted/i);
  f.write(name, 'first');
  f.write('host-sources/app/late.js', 'new code');
  assert.throws(() => sync.assertCheckpoint(f.root, [name]), /Uncommitted/i);
});
test('locked source records reject edits and deletions', t => {
  const f = fixture(t);
  f.write('app/a.js', 'a');
  const records = sync.fileRecords(f.root, ['app/a.js']);
  sync.verifyRecords(f.root, records);
  f.write('app/a.js', 'b');
  assert.throws(() => sync.verifyRecords(f.root, records), /changed/i);
  fs.unlinkSync(path.join(f.root, 'app/a.js'));
  assert.throws(() => sync.verifyRecords(f.root, records), /ENOENT|changed/i);
});
test('assembly refreshes owned backend files beyond daily groups and rejects live/data targets', t => {
  const f = fixture(t);
  f.write('host-sources/app/server.js', 'latest backend');
  f.write('host-sources/app/desktop/main.js', 'latest desktop');
  f.write('.planning/app/server.js', 'old backend');
  f.write('release-tools/ownership.json', JSON.stringify({ files: ['server.js', 'desktop/main.js'].map(file => ({ path: file, recipe: 'copy', inputs: [{ path: 'host-sources/app/' + file }] })) }));
  sync.syncOwned(f.root, path.join(f.root, '.planning/app'));
  assert.equal(fs.readFileSync(path.join(f.root, '.planning/app/server.js'), 'utf8'), 'latest backend');
  assert.equal(fs.readFileSync(path.join(f.root, '.planning/app/desktop/main.js'), 'utf8'), 'latest desktop');
  assert.throws(() => sync.syncOwned(f.root, path.join(f.root, 'live-runtime')), /isolated/i);
  f.write('release-tools/ownership.json', JSON.stringify({ files: [{ path: 'data/output/image.png', recipe: 'copy', inputs: [{ path: 'host-sources/app/server.js' }] }] }));
  assert.throws(() => sync.syncOwned(f.root, path.join(f.root, '.planning/app')), /data forbidden/i);
});
test('effective release comparison permits only package version changes, rejects missing and extra code', t => {
  const f = fixture(t);
  f.write('dev/a.js', 'a'); f.write('app/a.js', 'a');
  f.write('dev/package.json', '{"main":"desktop/main.js","version":"3.0.6"}');
  f.write('app/package.json', '{"main":"desktop/main.js","version":"3.0.7"}');
  const lock = { app: path.join(f.root, 'dev'), effective: sync.fileRecords(path.join(f.root, 'dev'), ['a.js', 'package.json']) };
  sync.verifyEffective(path.join(f.root, 'app'), lock);
  f.write('app/package.json', '{"main":"wrong.js","version":"3.0.7"}');
  assert.throws(() => sync.verifyEffective(path.join(f.root, 'app'), lock), /package.json/);
  f.write('app/package.json', '{"main":"desktop/main.js","version":"3.0.7"}');
  f.write('app/old.js');
  assert.throws(() => sync.verifyEffective(path.join(f.root, 'app'), lock), /old.js/);
  fs.unlinkSync(path.join(f.root, 'app/old.js'));
  fs.unlinkSync(path.join(f.root, 'app/a.js'));
  assert.throws(() => sync.verifyEffective(path.join(f.root, 'app'), lock), /a.js/);
});
test('release verifier binds the actual version tag to its checkpoint and validates asset bytes', t => {
  const f = fixture(t);
  f.write('source.js', 'v1'); f.git(['add', '.']); f.git(['commit', '-qm', 'first']);
  f.git(['tag', 'v3.0.7']);
  f.write('source.js', 'v2'); f.git(['add', '.']); f.git(['commit', '-qm', 'second']);
  const commit = f.git(['rev-parse', 'HEAD']);
  f.write('release/release-source-lock.json', JSON.stringify({ version: '3.0.7', checkpoint: { commit } }));
  f.write('release/runtime.zip', 'small fixture');
  const files = sync.fileRecords(path.join(f.root, 'release'), ['release-source-lock.json', 'runtime.zip']);
  f.write('release/release-files.json', JSON.stringify({ version: '3.0.7', sourceCommit: commit, files }));
  assert.throws(() => sync.verifyRelease(f.root, path.join(f.root, 'release')), /tag points/);
  f.git(['tag', '-d', 'v3.0.7']); f.git(['tag', 'v3.0.7']);
  assert.equal(sync.verifyRelease(f.root, path.join(f.root, 'release')).status, '一致且已验证');
  f.write('release/runtime.zip', 'corrupt');
  assert.throws(() => sync.verifyRelease(f.root, path.join(f.root, 'release')), /changed/);
});
test('startup program fingerprints track backend and desktop code without user data or node_modules', t => {
  const f = fixture(t);
  for (const name of ['server.js', 'desktop/main.js', 'server-components/sub/api.js', 'workflows/a.json', 'core/a.js',
    'data/output/private.js', 'node_modules/large/index.js', '.env', 'assets/a.png']) f.write(name);
  const before = programFiles(f.root);
  assert.deepEqual(before.map(file => file.path), ['core/a.js', 'desktop/main.js', 'server-components/sub/api.js', 'server.js', 'workflows/a.json']);
  f.write('desktop/main.js', 'changed');
  assert.notDeepEqual(programFiles(f.root), before);
});
