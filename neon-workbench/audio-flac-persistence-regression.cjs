const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const file=path.join(__dirname,'design-sources/audio-output-persistence.js');
const sourceModule=new Module(file,module);sourceModule.filename=file;sourceModule.paths=Module._nodeModulePaths(path.dirname(file));sourceModule._compile(fs.readFileSync(file,'utf8'),file);
const {createAudioOutputPersistence}=sourceModule.exports;
for(const contentType of ['audio/x-flac','audio/x-flac; charset=binary',' AUDIO/FLAC ; charset=binary','audio/flac']){
 test(`有效FLAC以规范类型保存并登记：${contentType}`,async()=>{
  const data=Buffer.from('fLaC\x00\x00\x00\x22synthetic'),writes=[],registrations=[];
  const persist=createAudioOutputPersistence({outputDir:'Q:/isolated-test-output',fs:{promises:{mkdir:async()=>{},writeFile:async(file,bytes)=>writes.push({file,bytes})}},crypto:{randomUUID:()=> 'qa-flac'},registerMedia:async(...args)=>{registrations.push(args);return {id:'qa-asset',name:'测试声音'};}});
  const saved=await persist({data,contentType,auth:{user:{id:'qa'}}});
  assert.equal(saved.url,'/output/audio-qa-flac.flac');assert.equal(saved.contentType,'audio/flac');assert.equal(saved.assetId,'qa-asset');assert.equal(writes.length,1);assert.deepEqual(writes[0].bytes,data);assert.equal(registrations[0][2],'audio/flac');
 });
}
test('拒绝非音频MIME或无效内容类型，不写文件',async()=>{
 let writes=0;const persist=createAudioOutputPersistence({outputDir:'Q:/isolated-test-output',fs:{promises:{mkdir:async()=>{},writeFile:async()=>writes++}}});
 for(const contentType of ['text/html','application/json','application/octet-stream',''])await assert.rejects(persist({data:Buffer.from('fLaC1234'),contentType,auth:{user:{id:'qa'}}}),/格式或大小/);
 assert.equal(writes,0);
});
