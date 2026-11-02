import test from 'node:test';
import assert from 'node:assert/strict';
import {injectStartupLogo} from './component-deploy.mjs';
import path from 'node:path';
test('legacy login and startup marks both receive the user supplied SVG',()=>{
 const html='<span class="ai-os-startup-brand-mark" aria-hidden="true">old</span><span class="ai-os-brand-mark" aria-hidden="true">∞</span>';
 const out=injectStartupLogo(html,path.resolve('neon-workbench'));
 assert.equal((out.match(/viewBox="0 0 500 500"/g)||[]).length,2);
 assert.ok(!out.includes('∞'));
});
