const assert=require('node:assert/strict');
const {openFixture,writeJSON,OUTPUT}=require('./dom-scaling-test-support.cjs');
const path=require('node:path');
(async()=>{
  const fixture=await openFixture();
  let mediaServer;
  try{
    const result=await fixture.page.evaluate(async()=>{
      await AiOsModuleLoader.ensure(['canvas-node-media']);
      const subscriptions=new Set(),originalAdd=document.addEventListener.bind(document),originalRemove=document.removeEventListener.bind(document);
      document.addEventListener=(type,callback,options)=>{if(type==='fullscreenchange')subscriptions.add(callback);return originalAdd(type,callback,options);};
      document.removeEventListener=(type,callback,options)=>{if(type==='fullscreenchange')subscriptions.delete(callback);return originalRemove(type,callback,options);};
      try{
        const node=addCanvasMinimaxH3Node({x:100,y:100},{focus:false});
        FloraGenerationHistory.add(node,{id:'lifecycle-video',kind:'video',src:'/output/isolated-lifecycle-video.mp4',name:'测试视频'});
        selectCanvasNode(node);
        CanvasFloraNodeShell.mount(node);
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const before=subscriptions.size;
        clearCanvasSelection();document.activeElement?.blur();
        canvasVirtualizer.unmountId(node.dataset.id);
        const remaining=subscriptions.size;
        return {before,remaining,removed:!node.isConnected};
      }finally{document.addEventListener=originalAdd;document.removeEventListener=originalRemove;}
    });
    writeJSON(path.join(OUTPUT,`${process.env.LABEL||'lifecycle'}.json`),{result,errors:fixture.errors});
    assert.ok(result.before>0,'夹具必须实际创建视频全屏监听');
    assert.equal(result.remaining,0,'卸载视频Full DOM后，document不得持有视频/节点的全屏监听闭包');
    assert.equal(result.removed,true);assert.deepEqual(fixture.errors,[]);
    const deletion=await fixture.page.evaluate(()=>{
      const node=addCanvasImageGeneratorNode({x:100,y:100},{focus:false});selectCanvasNode(node);
      const select=node.querySelector('.canvas-node-model');enhanceCanvasImageModelSelect(select);
      const before=canvasImageModelPickers.has(select),id=node.dataset.id,model=serializeCanvasNode(node);
      stageCanvasOperation({type:'node.delete',entityId:id,before:model,after:null},{applyLocal:true});
      return {before,retained:canvasImageModelPickers.has(select),modelRetained:canvasVirtualStore.has(id),removed:!node.isConnected};
    });
    writeJSON(path.join(OUTPUT,`${process.env.LABEL||'lifecycle'}-delete.json`),{deletion,errors:fixture.errors});
    assert.equal(deletion.before,true,'删除夹具必须挂载真实模型选择器');
    assert.equal(deletion.retained,false,'本地delete必须销毁选择器引用和全局监听');
    assert.equal(deletion.modelRetained,false,'清理不能重新插入已删除模型');
    const mediaFixture=await require('./media-range-regression.cjs').startFixtureServer();mediaServer=mediaFixture.server;
    await fixture.page.route('**/output/lifecycle-real.mp4',async route=>{
      const response=await fetch(`${mediaFixture.origin}/output/video-seek-fixture.mp4`,{headers:route.request().headers()});
      return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    });
    const paused=await fixture.page.evaluate(async()=>{
      const wait=media=>new Promise((resolve,reject)=>{if(media.readyState>=2)return resolve();media.addEventListener('loadeddata',resolve,{once:true});media.addEventListener('error',()=>reject(new Error('临时MP4无法解码')),{once:true});});
      const node=addCanvasMinimaxH3Node({x:100,y:100},{focus:false});selectCanvasNode(node);
      FloraGenerationHistory.add(node,{id:'lifecycle-real',kind:'video',src:'/output/lifecycle-real.mp4'});CanvasFloraNodeShell.mount(node);
      let media=node.querySelector('video');await wait(media);media.volume=.35;media.muted=true;media.playbackRate=1.25;
      media.currentTime=2;
      if(media.seeking)await new Promise(resolve=>media.addEventListener('seeked',resolve,{once:true}));
      const before={time:media.currentTime,volume:media.volume,muted:media.muted,rate:media.playbackRate,paused:media.paused};
      const id=node.dataset.id;clearCanvasSelection();document.activeElement?.blur();
      CanvasNodeRepresentation.dehydrateNode(id);const fresh=CanvasNodeRepresentation.hydrateNode(id);media=fresh.querySelector('video');await wait(media);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {id,before,after:{time:media.currentTime,volume:media.volume,muted:media.muted,rate:media.playbackRate,paused:media.paused}};
    });
    writeJSON(path.join(OUTPUT,`${process.env.LABEL||'lifecycle'}-paused.json`),{paused,errors:fixture.errors});
    assert.ok(paused.before.time>.05,'夹具必须在非零暂停进度测量');
    assert.ok(Math.abs(paused.after.time-paused.before.time)<.04,'暂停视频进度不能因降级重置');
    assert.equal(paused.after.volume,paused.before.volume);assert.equal(paused.after.muted,paused.before.muted);assert.equal(paused.after.rate,paused.before.rate);assert.equal(paused.after.paused,true);
    const playing=await fixture.page.evaluate(async id=>{const node=getCanvasNode(id),media=node.querySelector('video');media.muted=true;await media.play();clearCanvasSelection();document.activeElement?.blur?.();const downgraded=CanvasNodeRepresentation.dehydrateNode(id),connected=node.isConnected,isPlaying=!media.paused;media.pause();return {downgraded,connected,isPlaying};},paused.id);
    writeJSON(path.join(OUTPUT,`${process.env.LABEL||'lifecycle'}-playing.json`),{playing,errors:fixture.errors});
    assert.equal(playing.downgraded,false);assert.ok(playing.connected&&playing.isPlaying,'真正播放中的MP4不得被降级');
    const flags=await fixture.page.evaluate(async id=>{
      const results=[],camera={x:canvasState.x,y:canvasState.y,scale:canvasState.scale};
      for(const flag of ['representationManager','detailHydration','detailCulling']){
        const node=CanvasNodeRepresentation.hydrateNode(id),media=node.querySelector('video');await media.play();clearCanvasSelection();document.activeElement?.blur();
        NeonCanvasPerformanceFlags[flag]=false;Object.assign(canvasState,{x:-100000,y:-100000});applyCanvasTransformNow();canvasVirtualizer.flushNow();
        results.push({flag,connected:node.isConnected,same:getCanvasNode(id)===node,playing:!media.paused});
        Object.assign(canvasState,camera);NeonCanvasPerformanceFlags[flag]=true;applyCanvasTransformNow();media.pause();CanvasNodeRepresentation.reconcile();
      }return results;
    },paused.id);
    writeJSON(path.join(OUTPUT,`${process.env.LABEL||'lifecycle'}-playing-flags.json`),{flags,errors:fixture.errors});
    for(const item of flags)assert.ok(item.connected&&item.same&&item.playing,`${item.flag}关闭后原播放DOM必须安全保留`);
    console.log(JSON.stringify({ok:true,result}));
  }finally{await fixture.close();if(mediaServer)await new Promise(resolve=>mediaServer.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
