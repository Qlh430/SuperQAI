"use strict";
const assert = require('node:assert/strict');
const {registerUpdateIpc} = require('../desktop/update-ipc');
const handlers = new Map(), calls = [];
const frame = {url:'http://127.0.0.1:3199/'};
const window = {webContents:{mainFrame:frame,send(){}},isDestroyed:()=>false};
const updater = {subscribe:()=>()=>{}};
for (const method of ['getStatus','check','download','restart']) updater[method] = (...args) => {calls.push([method,args]);return true};
updater.rollbackComponent = (...args) => {
  const componentId = String(args[0] || '');
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(componentId)) throw Error('invalid component');
  calls.push(['rollbackComponent', args]);
  return true;
};
registerUpdateIpc({ipcMain:{handle:(channel,fn)=>handlers.set(channel,fn)},updater,getWindow:()=>window,getLocalUrl:()=>frame.url});
for (const handler of handlers.values()) {
  assert.throws(()=>handler({sender:{},senderFrame:frame}));
  assert.throws(()=>handler({sender:window.webContents,senderFrame:{...frame}}));
}
const trustedEvent = {sender:window.webContents,senderFrame:frame};
for (const [channel, handler] of handlers) {
  if (channel === 'host.rollbackComponent') continue;
  handler({sender:window.webContents,senderFrame:frame}, 'https://untrusted.example/runtime.zip');
  assert.deepEqual(calls.at(-1)[1], [], 'renderer cannot supply URL or local path');
}
const rollbackHandler = handlers.get('host.rollbackComponent');
rollbackHandler(trustedEvent, 'platform-core');
assert.deepEqual(calls.at(-1), ['rollbackComponent', ['platform-core']]);
assert.throws(() => rollbackHandler(trustedEvent, '../platform-core'));
assert.throws(() => rollbackHandler(trustedEvent, 'C:\\Windows\\system32'));
console.log('PASS updater IPC identity, top-frame confinement, fixed arguments and component id validation');
