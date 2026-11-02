'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const up=require('../host-sources/app/desktop/updater');
const policy={format:1,mode:'github-release-assets',repository:'Qlh430/SuperQAI',keys:{}};
const manifest={version:'3.0.2'};
function release(){return {version:'3.0.2',tag:'v3.0.2',manifestUrl:'https://github.com/Qlh430/SuperQAI/releases/download/v3.0.2/ai-os-update.json',assets:new Map([['ai-os-update.json',{name:'ai-os-update.json',browser_download_url:'https://github.com/Qlh430/SuperQAI/releases/download/v3.0.2/ai-os-update.json'}]])};}
test('explicit repository policy accepts unsigned metadata only from the fixed official release',()=>{assert.equal(typeof up.verifyReleaseAuthentication,'function');assert.equal(up.verifyReleaseAuthentication(manifest,release(),policy), 'github-release-assets');});
test('missing policy and a different repository are never accepted',()=>{for(const p of [{keys:{}},{...policy,repository:'attacker/repo'}])assert.throws(()=>up.verifyReleaseAuthentication(manifest,release(),p));});
test('wrong release tag or asset provenance is rejected',()=>{for(const patch of [{tag:'v3.0.1'},{manifestUrl:'https://evil.test/ai-os-update.json'}])assert.throws(()=>up.verifyReleaseAuthentication(manifest,{...release(),...patch},policy));});
test('an invalid signature never falls back to repository trust',()=>{assert.throws(()=>up.verifyReleaseAuthentication({...manifest,signature:{algorithm:'Ed25519',keyId:'unknown',value:'bad'}},release(),policy));});
