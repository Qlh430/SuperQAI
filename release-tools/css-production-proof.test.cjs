'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const gate=require('./css-source-preflight.cjs');
test('a compiler proof is validated rather than accepting a caller boolean',()=>{
  assert.equal(typeof gate.verifyProof,'function');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'css-proof-'));
  try {
    assert.throws(()=>gate.verifyProof(root,{releaseEligible:true,compilerProvenanceAttested:true}),/proof|证明/i);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
