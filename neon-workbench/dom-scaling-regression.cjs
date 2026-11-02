const assert=require('node:assert/strict');
const path=require('node:path');
const {OUTPUT,FLAGS,openFixture,loadModels,settle,snapshot,persistenceCheck,functionalChecks,writeJSON}=require('./dom-scaling-test-support.cjs');

(async()=>{
  const file=process.env.OUTPUT || path.join(OUTPUT,`${process.env.LABEL||'regression'}.json`);
  const result={generatedAt:new Date().toISOString(),boundary:'独立浏览器、所有/api请求拦截模拟；未操作3199、用户数据或真实登录模型。',checks:[],failures:[],cases:[]};
  let fixture;
  try {
    fixture=await openFixture();
    if(process.env.STACKING_ONLY==='1') {
      await loadModels(fixture,20,'B');
      await fixture.page.evaluate(()=>{
        clearCanvasSelection();
        const template=toCanvasOperationNode(canvasVirtualStore.get('1'));
        for(const model of canvasVirtualStore.values()){const before=toCanvasOperationNode(model);stageCanvasOperation({type:'node.upsert',entityId:model.id,before,after:{...template,id:model.id,x:0,y:0,zOrder:Number(model.id)}},{applyLocal:true});}
        Object.assign(canvasState,{x:70,y:80,scale:.8});applyCanvasTransformNow();CanvasNodeRepresentation.reconcile();
      });
      await settle(fixture.page,800);const before=await snapshot(fixture.page);
      const point=await fixture.page.evaluate(()=>{const v=document.querySelector('#infiniteCanvas').getBoundingClientRect(),point={x:v.left+canvasState.x+350*canvasState.scale,y:v.top+canvasState.y+160*canvasState.scale};return {...point,lightIds:Array.from(canvasVirtualStore.mountedIds()).filter(id=>canvasVirtualStore.getMountedLevel(id)==='light'),elementAtPoint:document.elementFromPoint(point.x,point.y)?.closest('[data-id]')?.dataset.id};});
      await fixture.page.screenshot({path:path.join(path.dirname(file),`${process.env.LABEL||'stacking'}-before.png`)});
      await fixture.page.mouse.click(point.x,point.y);await settle(fixture.page,180);
      const picked=await fixture.page.evaluate(()=>({selectedIds:[...canvasState.selectedIds],primary:canvasState.activeNode?.dataset.id,snapshot:__domScalingSnapshot()}));
      result.cases.push({name:'真实20重叠模型的跨Canvas/Light层级命中',before,point,picked});
      if(picked.selectedIds.length===1&&picked.selectedIds[0]==='20')result.checks.push({name:'真实20重叠模型的跨Canvas/Light层级命中',details:picked});
      else result.failures.push({name:'真实20重叠模型的跨Canvas/Light层级命中',error:`应命中z最高20，实际${JSON.stringify(picked.selectedIds)}`});
      if(result.failures.length)process.exitCode=1;
      result.errors=fixture.errors;console.log(JSON.stringify({output:file,before,picked,failures:result.failures}));
      return;
    }
    const counts=(process.env.NODES||'36,100,200,500').split(',').map(Number);
    for(const count of counts) {
      const model=await loadModels(fixture,count,'B'); await settle(fixture.page);
      const info=await snapshot(fixture.page);
      if(info.total!==count)result.failures.push({name:`${count}模型数量`,error:`实际${info.total}`});
      if(info.visible!==count)result.failures.push({name:`${count}真实全景可见`,error:`实际${info.visible}`});
      const persistence=await persistenceCheck(fixture);
      if(persistence.pass)result.checks.push({name:`${count}首次保存覆盖未挂载模型并ACK`,details:persistence});
      else result.failures.push({name:`${count}首次保存覆盖未挂载模型并ACK`,error:JSON.stringify(persistence)});
      if(process.env.PERSISTENCE_ONLY==='1'){result.cases.push({model,info,persistence});console.log(JSON.stringify({count,persistence}));continue;}
      const functional=await functionalChecks(fixture);
      result.cases.push({model,info,functional});
      result.checks.push(...functional.checks.map(check=>({...check,count})));
      result.failures.push(...functional.failures.map(failure=>({...failure,count})));
      console.log(JSON.stringify({count,full:info.full,light:info.light,visible:info.visible,checks:functional.checks.length,failures:functional.failures}));
    }
    if(process.env.PERSISTENCE_ONLY!=='1'&&await fixture.page.evaluate(()=>!!window.CanvasNodeRepresentation)) {
      try {
        await loadModels(fixture,36,'A');
        await fixture.page.evaluate(()=>{clearCanvasSelection();Object.assign(canvasState,{x:70,y:80,scale:.8});applyCanvasTransformNow();CanvasNodeRepresentation.reconcile();});
        await settle(fixture.page,800);
        const setupSave=await persistenceCheck(fixture);assert.ok(setupSave.pass,'Light场景首次保存不完整');
        const light=await snapshot(fixture.page);
        assert.ok(light.light>0,'高缩放视口没有实际Light表示');assert.ok(light.light<=8,'Light超过8个');assert.ok(light.lightDOMMax<=50,'Light单节点超过50元素');
        const lightUpdate=await fixture.page.evaluate(()=>{
          const id=Array.from(canvasVirtualStore.mountedIds()).find(id=>canvasVirtualStore.getMountedLevel(id)==='light'&&canvasVirtualStore.get(id)?.kind==='text');
          if(!id)throw new Error('当前高缩放没有真实Light文字节点');
          const before=toCanvasOperationNode(canvasVirtualStore.get(id));
          stageCanvasOperation({type:'node.upsert',entityId:id,before,after:{...before,text:'L2模型更新必须刷新轻量投影',llmPrompt:'原参数仍保留'}},{applyLocal:true});
          return {id,before};
        });
        await settle(fixture.page,650);
        const lightUpdated=await fixture.page.evaluate(id=>{const node=canvasVirtualStore.getMounted(id);return {id,level:canvasVirtualStore.getMountedLevel(id),elements:node?.querySelectorAll('*').length+1,text:node?.textContent,fullControls:node?.querySelectorAll('textarea,select,.flora-generator-composer,[contenteditable="true"]').length,model:canvasVirtualStore.get(id)};},lightUpdate.id);
        assert.equal(lightUpdated.level,'light','模型更新意外升级Light');assert.ok(lightUpdated.elements<=50,'Light更新产生过多元素');assert.equal(lightUpdated.fullControls,0,'Light更新注入Full编辑控件');assert.ok(lightUpdated.text.includes('L2模型更新必须刷新轻量投影'),'Light文字投影未更新');
        result.checks.push({name:'Light模型upsert刷新投影且不运行Full渲染器',details:{lightUpdate,lightUpdated}});
        const viewport=await fixture.page.locator('#infiniteCanvas').boundingBox();
        await fixture.page.mouse.move(viewport.x+5,viewport.y+5);await fixture.page.mouse.down();
        await fixture.page.mouse.move(viewport.x+viewport.width-5,viewport.y+viewport.height-5,{steps:8});await fixture.page.mouse.up();await settle(fixture.page,700);
        const selected=await fixture.page.evaluate(()=>({ids:[...canvasState.selectedIds],snapshot:__domScalingSnapshot()}));
        assert.ok(selected.ids.length>=2,'原生框选未选择多个Light');
        assert.ok(selected.snapshot.full<selected.ids.length,'多选把所有Light升级为Full');
        const dragTarget=await fixture.page.evaluate(()=>{const node=[...document.querySelectorAll('[data-canvas-light-id]')].find(el=>canvasState.selectedIds.has(el.dataset.id));if(!node)return null;const r=node.getBoundingClientRect(),id=node.dataset.id;return{id,x:r.left+r.width*.5,y:r.top+r.height*.5,model:{...canvasVirtualStore.get(id)},selected:canvasState.selectedIds.size,scale:canvasState.scale};});
        assert.ok(dragTarget,'无实际选中的Light可供拖动');
        await fixture.page.mouse.move(dragTarget.x,dragTarget.y);await fixture.page.mouse.down();
        let duringDrag;
        for(let step=1;step<=10;step++){await fixture.page.mouse.move(dragTarget.x+step*4,dragTarget.y+step*2);await fixture.page.waitForTimeout(70);if(step===7)duringDrag=await snapshot(fixture.page);}
        await fixture.page.mouse.up();await settle(fixture.page,700);
        const dragAfter=await fixture.page.evaluate(id=>({model:canvasVirtualStore.get(id),selected:canvasState.selectedIds.size,snapshot:__domScalingSnapshot()}),dragTarget.id);
        assert.ok(Math.abs((dragAfter.model.x-dragTarget.model.x)-40/dragTarget.scale)<3,'Light拖动后x模型几何未保留');
        assert.ok(Math.abs((dragAfter.model.y-dragTarget.model.y)-20/dragTarget.scale)<3,'Light拖动后y模型几何未保留');
        assert.ok(duringDrag.full<=8&&dragAfter.snapshot.full<=8,'Light拖动突破交互Full预算');
        assert.equal(dragAfter.selected,dragTarget.selected,'拖动丢失多选');
        result.checks.push({name:'Light原生多选与超过500ms拖动保留模型几何',details:{selected,dragTarget,duringDrag,dragAfter}});
        const target=await fixture.page.evaluate(()=>{for(const node of document.querySelectorAll('#canvasPlane [data-canvas-light-id]')){const r=node.getBoundingClientRect(),v=document.querySelector('#infiniteCanvas').getBoundingClientRect();if(r.left>=v.left&&r.right<=v.right&&r.top>=v.top&&r.bottom<=v.bottom)return {id:node.dataset.canvasLightId,x:r.left+r.width*.5,y:r.top+r.height*.5};}return null;});
        assert.ok(target,'没有完整可见的真实Light节点');
        await fixture.page.mouse.move(target.x,target.y);await settle(fixture.page,180);
        const hover=await snapshot(fixture.page);
        await fixture.page.evaluate(()=>clearCanvasSelection());
        await fixture.page.mouse.click(target.x,target.y);await settle(fixture.page,180);
        const clicked=await fixture.page.evaluate(id=>({full:!!getCanvasNode(id),selected:canvasState.selectedIds.has(id),level:CanvasNodeRepresentation.getLevel(id)}),target.id);
        assert.ok(clicked.full&&clicked.selected,'原生Light点击未升级/选中真实编辑节点');
        await fixture.page.screenshot({path:path.join(path.dirname(file),`${process.env.LABEL||'regression'}-light-highzoom.png`)});
        result.checks.push({name:'高缩放Light预算、实际悬停与原生点击升级',details:{light,hover,target,clicked}});
      } catch(error) {result.failures.push({name:'高缩放Light预算与点击',error:error.message});}
    }
    if(process.env.PERSISTENCE_ONLY!=='1'&&await fixture.page.evaluate(()=>!!window.CanvasNodeRepresentation)) {
      for(const flag of FLAGS) {
        await loadModels(fixture,36,'B'); await settle(fixture.page);
        try {
          const observed=await fixture.page.evaluate(async({flag,flags})=>{
            const ids=Array.from(canvasVirtualStore.models.keys());
            const before=serializeCanvasBoard();
            window.NeonCanvasPerformanceFlags[flag]=false;
            await CanvasNodeRepresentation.reconcile(); canvasVirtualizer.flushNow();
            const disabled={...__domScalingSnapshot(),flags:{...NeonCanvasPerformanceFlags}};
            const after=serializeCanvasBoard();
            for(const key of flags)NeonCanvasPerformanceFlags[key]=true;
            await CanvasNodeRepresentation.reconcile();canvasVirtualizer.flushNow();
            return {ids,before,after,disabled};
          },{flag,flags:FLAGS});
          assert.equal(observed.before.nodes.length,observed.after.nodes.length,'回退丢模型');
          assert.deepEqual(observed.before.connections,observed.after.connections,'回退丢连接');
          assert.ok(observed.disabled.full>=30,'独立开关关闭未恢复原Full路径');
          const fields=['prompt','model','size','resolution','generationHistory','currentGenerationId','minimaxH3Prompt','minimaxH3Steps','minimaxH3Duration','text','llmPrompt','llmModel'];
          for(const before of observed.before.nodes){const after=observed.after.nodes.find(node=>node.id===before.id);for(const field of fields)assert.deepEqual(after?.[field],before[field],`回退丢失${before.id}.${field}`);}
          result.checks.push({name:`独立开关回退:${flag}`,details:observed});
        } catch(error) { result.failures.push({name:`独立开关回退:${flag}`,error:error.message}); }
      }
    }
    for(const width of process.env.PERSISTENCE_ONLY==='1'?[]:[390,768,1440,1728]) {
      try {
        await fixture.page.setViewportSize({width,height:1050});await settle(fixture.page,250);
        const details=await fixture.page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,snapshot:__domScalingSnapshot()}));
        assert.ok(details.scrollWidth<=width+1,`页面横向溢出${details.scrollWidth-width}px`);
        await fixture.page.screenshot({path:path.join(path.dirname(file),`${process.env.LABEL||'regression'}-${width}.png`)});
        result.checks.push({name:`${width}宽度无页面溢出`,details});
      } catch(error) {result.failures.push({name:`${width}宽度`,error:error.message});}
    }
    if(process.env.PERSISTENCE_ONLY!=='1') {
      try {
        const fullscreen=await fixture.page.evaluate(async()=>{const surface=document.querySelector('#neonEngineSurface'),before=canvasVirtualStore.size;await surface.requestFullscreen();const entered=document.fullscreenElement===surface;await document.exitFullscreen();return {entered,exited:!document.fullscreenElement,before,after:canvasVirtualStore.size};});
        assert.ok(fullscreen.entered&&fullscreen.exited&&fullscreen.before===fullscreen.after,'浏览器原生全屏未完整往返');
        result.checks.push({name:'浏览器原生全屏往返（独立画布宿主）',details:fullscreen});
      } catch(error) {result.failures.push({name:'浏览器原生全屏往返',error:error.message});}
    }
    result.errors=fixture.errors;result.requests=fixture.requests;result.sourceFiles=[...new Set(fixture.sourceFiles)];
    if(fixture.errors.length)result.failures.push({name:'pageerror',error:JSON.stringify(fixture.errors)});
  } catch(error) { result.failures.push({name:'harness',error:error.stack}); }
  finally { if(fixture)await fixture.close();writeJSON(file,result); }
  console.log(JSON.stringify({output:file,checks:result.checks.length,failures:result.failures}));
  if(result.failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
