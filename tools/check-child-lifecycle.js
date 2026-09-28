"use strict";
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {stopChild} = require('../desktop/child-lifecycle');
(async () => {
  const child = spawn(process.execPath, ['-e', `process.on('message', message => {if(message.type==='ai-os.shutdown')setTimeout(()=>process.exit(0),160)});process.send('ready')`], {windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  await new Promise(resolve => child.once('message', resolve));
  const start = Date.now(); await stopChild(child);
  assert.equal(child.exitCode, 0); assert.ok(Date.now()-start >= 150);
  console.log('PASS graceful shutdown waits for actual child exit');
})().catch(error => {console.error(error);process.exitCode=1});
