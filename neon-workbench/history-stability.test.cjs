const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(__dirname+'/src/lib/history-media.ts','utf8').replace('import { assetMedia } from "@/lib/asset-media"','const assetMedia = (entry: any) => entry.preview'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const scope={exports:{},location:{origin:'http://isolated.test'}};vm.createContext(scope);vm.runInContext(source,scope);const {collectHistoryMedia,compareHistory}=scope.exports;
const record=(id,prompt='完整提示词')=>({id,type:'image',createdAt:'2026-10-20T00:00:00Z',prompt,images:['/output/'+id+'.png']});
test('equal timestamps and response reversal preserve media order',()=>{
 const a=collectHistoryMedia([],['c','a','b'].map(id=>record(id)),'u').map(r=>r.key);const b=collectHistoryMedia([],['b','a','c'].map(id=>record(id)),'u').map(r=>r.key);assert.deepEqual([...a],[...b]);assert.deepEqual([...a],['/output/a.png','/output/b.png','/output/c.png']);
});
test('creation time is stable when resource metadata is updated',()=>{
 const entry=id=>({resource:{id,ownerUserId:'u',type:'image',createdAt:id==='old'?'2026-10-18':'2026-10-19',updatedAt:id==='old'?'2026-10-20':'2026-10-19'},preview:{kind:'image',url:'/output/'+id+'.png'}});assert.equal(collectHistoryMedia([entry('old'),entry('new')],[],'u')[0].entry.resource.id,'new');assert.ok(Number.isFinite(compareHistory({time:'invalid',key:'a'},{time:'invalid',key:'b'})));
});
test('summary projection retains the complete original prompt for details',()=>{
 const prompt='中英文 https://example.com/'+ 'abcdefghijklmnopqrstuvwxyz'.repeat(120);const r=record('long',prompt);const m=collectHistoryMedia([],[r],'u')[0];assert.equal(m.entry.resource.metadata.prompt,prompt);assert.equal(m.record.prompt,prompt);assert.equal(r.prompt,prompt);
});
