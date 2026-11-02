const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const rules = require(path.join(runtime, 'canvas-virtualization-rules.js'));
const context = { CanvasVirtualizationRules: rules };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'design-sources/canvas-virtualizer.js'), 'utf8'), context);
const models = new Map(Array.from({length:200}, (_,i)=>[String(i), {id:String(i), x:i%20*20, y:Math.floor(i/20)*20,width:10,height:10}]));
const mounted = new Map(), levels = new Map();
const store = {
  has:id=>models.has(id), get:id=>models.get(id), query:()=>[...models.keys()],
  getRect:id=>rules.getNodeRect(models.get(id)), getMounted:id=>mounted.get(id), getMountedLevel:id=>levels.get(id),
  mountedIds:()=>[...mounted.keys()], get mountedSize(){return mounted.size},
  setMounted(id,el,level){ if(el){mounted.set(id,el);levels.set(id,level)}else{mounted.delete(id);levels.delete(id)} },
};
let desired = new Map([['0','full'],['1','light']]);
const virtualizer = new context.CanvasVirtualizer({store,rules,getViewport:()=>({width:1440,height:900,x:0,y:0,scale:1}),
  getRepresentationPlan:()=>desired, mount:(id,level)=>({id,level}), unmount:()=>{},
  replace:(id,el,from,to)=>({id,level:to}), now:()=>0, requestFrame:()=>1,cancelFrame:()=>{}});
virtualizer.flushNow();
assert.equal(mounted.size,2,'200可见节点只能挂载表示预算中的2个DOM，不能默认全部Full');
assert.equal(levels.get('1'),'light','必须把真实light等级传给挂载适配器');
desired = new Map([['0','light']]); virtualizer.flushNow();
assert.equal(mounted.size,1,'表示预算必须优先于空间retain窗口');
assert.equal(levels.get('0'),'light','Full可真实替换为Light');
desired = null; virtualizer.flushNow();
assert.equal(mounted.size,200,'关闭表示决策必须恢复原有Full路径');
store.query=()=>[];store.getRect=()=>({left:50000,right:50100,top:50000,bottom:50100});
virtualizer.getProtectedIds=()=>['0'];virtualizer.flushNow();
assert.deepEqual([...mounted.keys()],['0'],'回退路径必须保留视口外的活动任务节点');
virtualizer.getProtectedIds=()=>[];virtualizer.flushNow();
assert.equal(mounted.size,0,'任务结束后恢复普通空间卸载');
console.log(JSON.stringify({ok:true,checks:['bounded-dom','real-level-adapter','no-retain-budget-leak','legacy-fallback']}));
