"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { inside, atomicWrite, readJson, removeInside } = require('../desktop/update-files');
const install = require('../desktop/update-install');
const { readComponentState } = require('../desktop/component-state');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-update-install-'));
  try {
    for (const outcome of ['success', 'failure', 'snapshot-failure']) {
      const root = path.join(temp, `${outcome} 中文`); fs.mkdirSync(root);
      const put = (rel, value) => atomicWrite(inside(root, rel), value);
      for (const version of ['1.0.0', '1.1.0']) {
        const base = `.ai-runtime/versions/${version}-win-x64`;
        for (const file of install.REQUIRED_RUNTIME_FILES) put(`${base}/${file}`, file.endsWith('package.json') ? {version,main:'desktop/main.js'} : 'fixture');
        put(`${base}/resources/app/ai-os-components.json`, {
          format: 1,
          product: 'AI OS',
          version,
          platform: 'win32',
          arch: 'x64',
          components: [{
            id: 'platform-core',
            label: '系统内核',
            version: `${version}-core`,
            hash: (version === '1.0.0' ? 'a' : 'b').repeat(64),
            files: [{ path: 'server.js', size: 1, sha256: 'c'.repeat(64) }],
          }],
        });
      }
      put('.ai-runtime/.active-runtime', '1.0.0-win-x64');
      put('data/record.txt', 'old'); put('data/.env', 'private-test-value');
      const tx = install.prepareInstall(root, '1.1.0-win-x64', { parentPid: 99999999 });
      assert.equal(fs.readFileSync(inside(root, '.ai-runtime/.active-runtime'), 'utf8'), '1.0.0-win-x64');
      assert.equal(fs.existsSync(inside(root, `.ai-runtime/rollback/${tx.id}/data`)), false, 'prepare never snapshots a live service');
      const events = [];
      const result = await install.performInstall(root, {
        waitForExit: async () => { events.push('exit'); put('data/record.txt', 'last-write'); },
        snapshot: (from, to) => {
          events.push('snapshot');
          if (outcome === 'snapshot-failure') throw Error('disk full');
          require('../desktop/update-files').copyTree(from, to);
        },
        launch: async candidate => { events.push(candidate); put('data/record.txt', candidate === '1.1.0-win-x64' ? 'migrated' : fs.readFileSync(inside(root, 'data/record.txt'), 'utf8')); return {}; },
        waitForReady: async () => { if (outcome === 'failure') throw Error('unhealthy'); },
        stopCandidate: async () => events.push('stop'),
      });
      assert.deepEqual(events.slice(0, 2), ['exit', 'snapshot']);
      assert.equal(result.status, outcome === 'success' ? 'updated' : outcome === 'failure' ? 'rolled-back' : 'error');
      const active = fs.readFileSync(inside(root, '.ai-runtime/.active-runtime'), 'utf8').trim();
      assert.equal(active, outcome === 'success' ? '1.1.0-win-x64' : '1.0.0-win-x64');
      const componentState = readComponentState(root);
      if (outcome === 'snapshot-failure') assert.equal(componentState, null);
      else {
        assert.equal(componentState.sourceRuntime, active, 'component state must follow the active runtime');
        const core = componentState.components.find(component => component.id === 'platform-core');
        assert.equal(core.version, outcome === 'success' ? '1.1.0-core' : '1.0.0-core');
        assert.equal(core.previousVersion, outcome === 'success' ? '1.0.0-core' : null);
      }
      assert.equal(fs.readFileSync(inside(root, 'data/record.txt'), 'utf8'), outcome === 'success' ? 'migrated' : 'last-write');
      assert.equal(fs.readFileSync(inside(root, 'data/.env'), 'utf8'), 'private-test-value');
      if (outcome === 'failure') {
        assert.ok(events.indexOf('stop') < events.lastIndexOf('1.0.0-win-x64'));
        assert.equal(fs.readFileSync(inside(root, `.ai-runtime/rollback/${tx.id}/failed-data/record.txt`), 'utf8'), 'migrated');
      }
      assert.equal(fs.existsSync(inside(root, '.ai-runtime/updates/install.json')), false);
      assert.equal(readJson(inside(root, '.ai-runtime/updates/result.json')).status, result.status);
    }
    for (const phase of ['snapshotted','starting','restoring','confirmed','confirmed-cleanup-failure']) {
      const root=path.join(temp,`recovery-${phase}`);fs.mkdirSync(root);
      const put=(rel,value)=>atomicWrite(inside(root,rel),value);
      const id='ab'.repeat(12),tx={format:1,id,previous:'1.0.0-win-x64',candidate:'1.1.0-win-x64',phase:phase.startsWith('confirmed')?'confirmed':phase};
      put('.ai-runtime/updates/install.json',tx);
      put('.ai-runtime/.active-runtime',phase==='snapshotted'?tx.previous:tx.candidate);
      put(`.ai-runtime/rollback/${id}/data/record.txt`,'snapshot');
      put('data/record.txt','candidate data');
      const launches=[];let stopped=false;
      const hooks={waitForExit:async()=>{},launch:async version=>launches.push(version),stopCandidate:async()=>{stopped=true}};
      if(phase==='confirmed-cleanup-failure') {
        fs.mkdirSync(inside(root,'.ai-runtime/updates/result.json'));
        await assert.rejects(install.performInstall(root,hooks));
        assert.deepEqual(launches,[],'cleanup failure after commit must never launch old code on migrated data');
        assert.equal(readJson(inside(root,'.ai-runtime/updates/install.json')).phase,'confirmed');
        continue;
      }
      const result=await install.performInstall(root,hooks);
      assert.deepEqual(launches,[phase==='confirmed'?tx.candidate:tx.previous],`${phase} must launch the recovered app`);
      assert.equal(result.status,phase==='confirmed'?'updated':phase==='snapshotted'?'error':'rolled-back');
      if(['starting','restoring'].includes(phase)) {
        assert.equal(stopped,true);
        assert.equal(fs.readFileSync(inside(root,'data/record.txt'),'utf8'),'snapshot');
      }
    }
    const oldId=process.env.AI_OS_UPDATE_ID;
    try {
      process.env.AI_OS_UPDATE_ID='ef'.repeat(12);
      assert.equal(install.writeCandidateStatus(temp,'1.1.0-win-x64','process'),false,'completed transaction does not break later service recovery');
    } finally {if(oldId===undefined)delete process.env.AI_OS_UPDATE_ID;else process.env.AI_OS_UPDATE_ID=oldId}
    console.log('PASS update transaction: quiescence, snapshot, activation, successful startup, rollback, failed data preservation, disk failure and interrupted phase replay');
  } finally {
    assert.equal(path.dirname(temp), os.tmpdir());
    removeInside(os.tmpdir(),path.basename(temp));
  }
})().catch(error => { console.error(error); process.exitCode=1; });
