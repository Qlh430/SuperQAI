const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modulePath = process.env.H3_WORKFLOW_MODULE || path.join(__dirname,'design-sources/minimax-h3-workflow.js');
const workflowDir = process.env.H3_WORKFLOW_DIR || path.join(__dirname,'design-sources/workflows');
const moduleObject = {exports:{}};
vm.runInNewContext(fs.readFileSync(modulePath,'utf8'),{module:moduleObject,exports:moduleObject.exports,require,console},{filename:modulePath});
const {normalizeMinimaxH3Request,prepareMinimaxH3Workflow}=moduleObject.exports;
const loras={
  4:'minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors',
  8:'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
};
const clone=value=>JSON.parse(JSON.stringify(value));
const cases=[];
function withoutQuality(workflow) {
  const copy=clone(workflow);
  for(const node of Object.values(copy)) {
    if(node.class_type==='MiniMaxH3DualClockSamplerT8')delete node.inputs.steps;
    if(Object.values(loras).includes(node.inputs?.lora_name))delete node.inputs.lora_name;
  }
  return copy;
}
for(const mode of ['reference','text','first','last']) {
  let template=JSON.parse(fs.readFileSync(path.join(workflowDir,mode==='reference'?'minimax-h3-video.json':'minimax-h3-video-frames.json'),'utf8'));
  let previous;
  for(const steps of [8,4,8]) {
    const original=JSON.stringify(template);
    const request=normalizeMinimaxH3Request({mode,prompt:'测试镜头',steps,seed:123,aspect_ratio:'16:9',megapixels:0.6,duration:12,images:[{url:'/output/a.png',name:'a.png'},{url:'/output/b.png',name:'b.png'}]});
    const output=prepareMinimaxH3Workflow(template,request,'video/qa_quality');
    const sampler=Object.values(output).find(n=>n.class_type==='MiniMaxH3DualClockSamplerT8');
    const lora=output[sampler.inputs.model[0]];
    assert.equal(sampler.inputs.steps,steps,mode+' 步数匹配所选质量');
    assert.equal(lora.inputs.lora_name,loras[steps],mode+' '+steps+' 步必须使用对应 LoRA');
    assert.equal(JSON.stringify(template),original,'不修改共享工作流模板');
    if(previous)assert.deepEqual(withoutQuality(output),withoutQuality(previous),mode+' 换档只改 LoRA 和 steps');
    cases.push({mode,steps,lora:lora.inputs.lora_name});
    previous=output;template=output;
  }
}
for(const separator of ['/',String.fromCharCode(92)]) {
  const template=JSON.parse(fs.readFileSync(path.join(workflowDir,'minimax-h3-video.json'),'utf8'));
  const sampler=Object.values(template).find(n=>n.class_type==='MiniMaxH3DualClockSamplerT8');
  const loraId=sampler.inputs.model[0];
  const prefix=['H3','Turbo',''].join(separator);
  template[loraId].inputs.lora_name=prefix+loras[8];
  template['qa-unused']=clone(template[loraId]);
  template['qa-style']={class_type:'LoraLoaderModelOnly',inputs:{model:sampler.inputs.model,lora_name:'portrait-style.safetensors',strength_model:0.7}};
  sampler.inputs.model=['qa-style',0];
  const request=normalizeMinimaxH3Request({prompt:'测试模型链',steps:4});
  const output=prepareMinimaxH3Workflow(template,request,'video/qa_quality');
  assert.equal(output[loraId].inputs.lora_name,prefix+loras[4],'保留 LoRA 子目录，按模型链定位');
  assert.deepEqual(clone(output['qa-style']),clone(template['qa-style']),'样式 LoRA 不变');
  assert.deepEqual(clone(output['qa-unused']),clone(template['qa-unused']),'未接入当前采样器的分支不变');
}
const report={ok:true,module:modulePath,cases,pathAndBranchChecks:2};
if(process.env.H3_QUALITY_REPORT){fs.mkdirSync(path.dirname(process.env.H3_QUALITY_REPORT),{recursive:true});fs.writeFileSync(process.env.H3_QUALITY_REPORT,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
