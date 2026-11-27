'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const desktop = '../host-sources/app/desktop/';
const { pruneRuntimeSnapshots } = require(desktop + 'runtime-retention');
const { pruneRollbackSnapshots } = require(desktop + 'rollback-retention');
const { pruneOrphanedUpdateArtifacts } = require(desktop + 'updater');
const install = require(desktop + 'update-install');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-maintenance-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value = 'fixture') => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  return { root, write, exists: name => fs.existsSync(path.join(root, name)) };
}
function runtime(f, version) {
  const base = `.ai-runtime/versions/${version}-win-x64`;
  for (const file of install.REQUIRED_RUNTIME_FILES) {
    f.write(`${base}/${file}`, file.endsWith('package.json') ? { version, main: 'desktop/main.js' } : 'x');
  }
  const files = install.REQUIRED_RUNTIME_FILES.map(file => {
    const bytes = fs.readFileSync(path.join(f.root, base, file));
    return { path: file, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  });
  f.write(`${base}/resources/app/ai-os-components.json`, {
    format: 1, product: 'AI OS', version, runtime: version + '-win-x64', platform: 'win32', arch: 'x64', minUpdaterVersion: 1,
    compatibility: { nodeMajor: 24, electron: '44.1.1', nativeRuntimeChange: 'full-runtime-update-required' },
    components: [{
      id: 'core', hash: 'a'.repeat(64), version, dependencies: [],
      files: files.filter(file => file.path.startsWith('resources/app/')).map(file => ({ ...file, path: file.path.slice(14) })),
      compatibility: { platform: 'win32', arch: 'x64', manifestFormat: 1, minUpdaterVersion: 1, nodeMajor: 24 },
    }], runtimeFiles: files,
  });
}
test('runtime retention keeps current and previous without three extra full releases', t => {
  const f = fixture(t);
  for (const v of ['3.0.1', '3.0.2', '3.0.3', '3.0.5', '3.0.6']) runtime(f, v);
  f.write('.ai-runtime/.active-runtime', '3.0.6-win-x64');
  f.write('.ai-runtime/.previous-runtime', '3.0.5-win-x64');
  const result = pruneRuntimeSnapshots(f.root, { minimumAgeMs: 0 });
  assert.deepEqual(result.kept, ['3.0.5-win-x64', '3.0.6-win-x64']);
  assert.equal(result.removed.length, 3, JSON.stringify(result));
  assert.equal(result.errors.length, 0);
});
test('missing recovery pointer stops automatic pruning of historical runtimes', t => {
  const f = fixture(t);
  for (const v of ['3.0.5', '3.0.6']) runtime(f, v);
  f.write('.ai-runtime/.active-runtime', '3.0.6-win-x64');
  const result = pruneRuntimeSnapshots(f.root, { minimumAgeMs: 0 });
  assert.equal(result.skipped, 'previous-runtime-unverified');
  assert.deepEqual(result.removed, []);
});
test('runtime with embedded user data and a helper-owned runtime are never removed', t => {
  const f = fixture(t);
  for (const v of ['3.0.3', '3.0.5', '3.0.6']) runtime(f, v);
  f.write('.ai-runtime/.active-runtime', '3.0.6-win-x64');
  f.write('.ai-runtime/.previous-runtime', '3.0.5-win-x64');
  f.write('.ai-runtime/versions/3.0.3-win-x64/resources/app/data/output/real.png');
  pruneRuntimeSnapshots(f.root, { keepReleases: 0, minimumAgeMs: 0 });
  assert.ok(f.exists('.ai-runtime/versions/3.0.3-win-x64/resources/app/data/output/real.png'));
  f.write('.ai-runtime/updates/helper.json', { pid: 1 });
  assert.equal(pruneRuntimeSnapshots(f.root).skipped, 'update-in-progress');
});
test('component rollback protects the usable older snapshot when a newer matching snapshot is corrupt', t => {
  const f = fixture(t);
  for (const version of ['3.0.2', '3.0.3', '3.0.5', '3.0.6']) runtime(f, version);
  f.write('.ai-runtime/.active-runtime', '3.0.6-win-x64');
  f.write('.ai-runtime/.previous-runtime', '3.0.5-win-x64');
  f.write('.ai-runtime/components/state.json', { format: 1, product: 'AI OS', components: [{ id: 'core', version: '3.0.6', hash: 'b'.repeat(64), previousHash: 'a'.repeat(64) }] });
  // Make 3.0.2 the only valid a-hash source, with 3.0.3 the newest but corrupt one.
  for (const version of ['3.0.3', '3.0.5']) f.write(`.ai-runtime/versions/${version}-win-x64/resources/app/server.js`, 'corrupt');
  fs.utimesSync(path.join(f.root, '.ai-runtime/versions/3.0.3-win-x64'), new Date(), new Date(Date.now() + 1000));
  const result = pruneRuntimeSnapshots(f.root, { minimumAgeMs: 0 });
  assert.ok(result.protected.includes('3.0.2-win-x64'));
  assert.ok(f.exists('.ai-runtime/versions/3.0.2-win-x64'));
});
test('completed download caches are reclaimed; newer resumable downloads and unknown files survive', t => {
  const f = fixture(t);
  f.write('.ai-runtime/.active-runtime', '3.0.6-win-x64');
  f.write('.ai-runtime/updates/result.json', { status: 'updated', candidate: '3.0.6-win-x64' });
  for (const name of [
    'AI-OS-Runtime-3.0.6-win-x64.zip', 'AI-OS-Runtime-3.0.5-win-x64.zip.abcdef123456.part',
    'components/3.0.5/AI-OS-Component-3.0.5-workbench-core.zip', 'rollback-stage-old/partial',
    'AI-OS-Runtime-3.0.7-win-x64.zip.abcdef123456.part', 'unknown.zip',
  ]) f.write('.ai-runtime/updates/' + name);
  const removed = pruneOrphanedUpdateArtifacts(f.root, { completedOnly: true, minimumAgeMs: 0 });
  assert.ok(removed.includes('AI-OS-Runtime-3.0.6-win-x64.zip'));
  assert.ok(removed.includes('components/3.0.5'));
  assert.ok(removed.includes('rollback-stage-old'));
  assert.ok(!f.exists('.ai-runtime/updates/AI-OS-Runtime-3.0.5-win-x64.zip.abcdef123456.part'));
  assert.ok(f.exists('.ai-runtime/updates/AI-OS-Runtime-3.0.7-win-x64.zip.abcdef123456.part'));
  assert.ok(f.exists('.ai-runtime/updates/unknown.zip'));
});
test('startup cache maintenance leaves fresh staging and database-like recovery files intact', t => {
  const f = fixture(t);
  f.write('.ai-runtime/.active-runtime', '3.0.6-win-x64');
  f.write('.ai-runtime/updates/result.json', { status: 'updated', candidate: '3.0.6-win-x64' });
  f.write('.ai-runtime/updates/stage-current/file.js');
  f.write('.ai-runtime/updates/stage-old/data/output/image.png');
  f.write('.ai-runtime/updates/components/3.0.5/AI-OS-Component-3.0.5-core.zip/user.png');
  fs.utimesSync(path.join(f.root, '.ai-runtime/updates/stage-old'), new Date(0), new Date(0));
  assert.deepEqual(pruneOrphanedUpdateArtifacts(f.root, { completedOnly: true }), []);
  assert.ok(f.exists('.ai-runtime/updates/components/3.0.5/AI-OS-Component-3.0.5-core.zip/user.png'));
});
test('completed component downloads are hash verified and reused without another network request', async t => {
  const f = fixture(t), bytes = Buffer.from('component bytes'), file = path.join(f.root, 'component.zip');
  fs.writeFileSync(file, bytes);
  let requests = 0;
  const expected = { size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  await require(desktop + 'updater').downloadFile('https://github.com/Qlh430/SuperQAI/releases/download/v3.0.7/component.zip', file, expected, { fetchImpl: async () => { requests++; throw Error('unexpected request'); } });
  assert.equal(requests, 0);
});
test('deployment inventory reads only metadata and never mutates an installation', t => {
  const f = fixture(t);
  f.write('.ai-runtime/.active-runtime', '3.0.6-win-x64');
  f.write('.ai-runtime/.previous-runtime', '3.0.5-win-x64');
  f.write('.ai-runtime/versions/3.0.6-win-x64/server.js', 'fixture');
  f.write('.ai-runtime/updates/old.zip', 'keep');
  f.write('data/output/user.png', 'real media stand-in');
  const { execFileSync } = require('node:child_process');
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'update-storage-inventory.ps1'), '-Root', f.root], { encoding: 'utf8', windowsHide: true });
  const report = JSON.parse(output);
  assert.equal(report.mode, 'read-only-no-cleanup');
  assert.equal(report.active, '3.0.6-win-x64');
  assert.ok(report.items.some(item => item.name === 'old.zip' && item.bytes === 4));
  assert.equal(fs.readFileSync(path.join(f.root, 'data/output/user.png'), 'utf8'), 'real media stand-in');
  assert.ok(f.exists('.ai-runtime/updates/old.zip'));
});
test('pending ready/install/helper or unsuccessful result blocks completed-cache cleanup', t => {
  const f = fixture(t);
  const zip = '.ai-runtime/updates/AI-OS-Runtime-3.0.6-win-x64.zip';
  f.write('.ai-runtime/.active-runtime', '3.0.6-win-x64');
  f.write('.ai-runtime/updates/result.json', { status: 'updated', candidate: '3.0.6-win-x64' });
  f.write(zip);
  for (const name of ['ready.json', 'install.json', 'helper.json']) {
    f.write('.ai-runtime/updates/' + name, {});
    assert.deepEqual(pruneOrphanedUpdateArtifacts(f.root, { completedOnly: true }), []);
    fs.unlinkSync(path.join(f.root, '.ai-runtime/updates', name));
  }
  f.write('.ai-runtime/updates/result.json', { status: 'rolled-back', candidate: '3.0.6-win-x64' });
  assert.deepEqual(pruneOrphanedUpdateArtifacts(f.root, { completedOnly: true }), []);
  assert.ok(f.exists(zip));
});
test('rollback count includes protected latest snapshot, and never deletes legacy media or failed WAL', t => {
  const f = fixture(t), latest = 'c'.repeat(24), legacy = 'a'.repeat(24), wal = 'b'.repeat(24), old = 'd'.repeat(24);
  f.write(`.ai-runtime/rollback/${legacy}/data/output/user.png`);
  f.write(`.ai-runtime/rollback/${wal}/database/failed-system.sqlite-wal`);
  f.write(`.ai-runtime/rollback/${latest}/database/system.sqlite`);
  f.write(`.ai-runtime/rollback/${old}/database/system.sqlite`);
  f.write('.ai-runtime/updates/result.json', { id: latest, status: 'updated' });
  const result = pruneRollbackSnapshots(f.root, { minimumAgeMs: 0 });
  assert.deepEqual(result.removed, [old]);
  assert.ok(f.exists(`.ai-runtime/rollback/${legacy}/data/output/user.png`));
  assert.ok(f.exists(`.ai-runtime/rollback/${wal}/database/failed-system.sqlite-wal`));
});
test('failed update preserves the previous good runtime and leaves media in place', async t => {
  const f = fixture(t);
  runtime(f, '3.0.5'); runtime(f, '3.0.6');
  f.write('.ai-runtime/.active-runtime', '3.0.5-win-x64');
  f.write('.ai-runtime/.previous-runtime', '3.0.4-win-x64');
  f.write('data/output/user.png', 'media');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(f.root, 'data/system.sqlite'));
  db.exec('CREATE TABLE marker(value TEXT)'); db.close();
  f.write('.ai-runtime/updates/install.json', { format: 1, id: 'e'.repeat(24), previous: '3.0.5-win-x64', candidate: '3.0.6-win-x64', phase: 'waiting' });
  const result = await install.performInstall(f.root, {
    waitForExit: async () => {}, stopCandidate: async () => {},
    launch: async () => ({}),
    waitForReady: async (_child, state) => { if (!state.rollback) throw Error('fixture startup failure'); },
  });
  assert.equal(result.status, 'rolled-back');
  assert.equal(fs.readFileSync(path.join(f.root, '.ai-runtime/.previous-runtime'), 'utf8'), '3.0.4-win-x64');
  assert.equal(fs.readFileSync(path.join(f.root, 'data/output/user.png'), 'utf8'), 'media');
});
