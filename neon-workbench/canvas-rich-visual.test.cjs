const {test}=require('node:test'),assert=require('node:assert/strict');
const context={module:{exports:{}},performance,setTimeout,clearTimeout};
require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'design-sources/canvas-node-visuals.js'),'utf8'),context);
const visuals=context.module.exports;
test('rich visual keeps semantic HTML intact until the shared Full preview sanitizer',()=>{
 const rich='<p><strong>提示词：</strong></p><p>中文 English 123</p><p><br></p><p>负面提示词：</p>';
 assert.equal(visuals.project({kind:'text',textRichHtml:rich}).richHtml,rich);
});
test('rich text does not fabricate computed typography when no document exists',()=>{
 const result=visuals.layoutRichText({},visuals.project({kind:'text',text:'正文'}),384,384);
 assert.equal(result.glyphs.length,0);assert.equal(visuals.diagnostics().layoutMisses,0);
});

test('cold resident text loads preview code once without requesting any Full node',async()=>{
 let loads=0,redraws=0;const cold={module:{exports:{}},document:{},AiOsModuleLoader:{ensure(){loads++;return Promise.resolve();}},scheduleCanvasSceneRender(){redraws++;},performance,setTimeout,clearTimeout};
 require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'design-sources/canvas-node-visuals.js'),'utf8'),cold);
 for(let i=0;i<4;i++)cold.module.exports.layoutRichText({}, {body:'本地文字'},384,384);
 await Promise.resolve();assert.equal(loads,1);assert.equal(redraws,1);
});
