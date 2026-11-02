const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({page,panel,cards,output,errors}) => {
  output=path.resolve(output,'../../reference-band-clipping-20261102',process.env.DEPLOYED?'deployed':'source');
  fs.mkdirSync(output,{recursive:true});
  const measurements=[];
  async function measure(label,edge) {
    const result=await panel.evaluate((panel,{label,edge})=>{
      const view=panel.querySelector('.flora-reference-materials');
      const area=panel.querySelector('.flora-generator-reference-area');
      const bounds=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
      const clipped=[];
      for(const element of panel.querySelectorAll('.flora-reference-card,.flora-reference-remove')) {
        const card=element.closest('.flora-reference-card');
        if(edge==='start'&&card!==view.querySelector('.flora-reference-card'))continue;
        if(edge==='end'&&card!==view.querySelector('.flora-reference-card:last-child'))continue;
        const r=bounds(element);
        for(let parent=element.parentElement;parent&&parent!==panel.parentElement;parent=parent.parentElement) {
          const css=getComputedStyle(parent),p=bounds(parent);
          const x=css.overflowX!=='visible';
          const y=css.overflowY!=='visible';
          if((x&&(r.left<p.left-.5||r.right>p.right+.5))||(y&&(r.top<p.top-.5||r.bottom>p.bottom+.5)))
            clipped.push({element:element.className,parent:parent.className,rect:r,clip:p});
        }
      }
      return {label,edge,view:{...bounds(view),scrollLeft:view.scrollLeft,scrollWidth:view.scrollWidth,clientWidth:view.clientWidth},area:{...bounds(area),scrollLeft:area.scrollLeft,scrollWidth:area.scrollWidth,clientWidth:area.clientWidth},clipped};
    },{label,edge});
    measurements.push(result);
    fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(measurements,null,2));
    await page.screenshot({path:path.join(output,label+'.png')});
  }
  if(process.env.CLIPPING_BASELINE) {
    await measure('baseline');
    assert.deepEqual(measurements[0].clipped,[],'参考卡片和移除按钮必须完整显示');
    return;
  }
  async function setWidth(width) {
    await page.setViewportSize({width,height:1050});
    await page.evaluate(width=>{
      const node=getCanvasNode(qaTargetId),viewport=document.querySelector('#infiniteCanvas').getBoundingClientRect();
      canvasState.scale=1.05;canvasState.x=width/2-viewport.left-(Number(node.dataset.x)+node.offsetWidth/2)*canvasState.scale;
      canvasState.y=0;applyCanvasTransformNow();selectCanvasNode(node);
    },width);
    await page.evaluate(async()=>{FloraGeneratorComposer.syncViewport();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  }
  for(const width of [390,768,1440,1728]) {
    await setWidth(width);
    await measure(width+'-ordinary');
    await panel.getByRole('button',{name:'放大操作区',exact:true}).click();
    await measure(width+'-expanded');
    await cards.first().focus();await page.keyboard.press('Alt+ArrowRight');
    await measure(width+'-sorted');
    await page.keyboard.press('Alt+ArrowLeft');await page.keyboard.press('Escape');
  }
  await setWidth(1440);
  await panel.locator('.flora-reference-remove').last().click();
  assert.equal(await cards.count(),2,'移除按钮仍可点击');
  await cards.first().hover();await measure('two-hover');
  await cards.first().focus();await measure('two-focus');
  const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();
  await page.mouse.move(second.x+20,second.y+20);await page.mouse.down();
  await page.mouse.move(first.x+5,first.y+20,{steps:8});
  await measure('two-drag-before');
  const marker=await panel.locator('.is-sort-before').evaluate(card=>{
    const css=getComputedStyle(card,'::after'),r=card.getBoundingClientRect(),v=card.closest('.flora-reference-materials').getBoundingClientRect();
    return {left:r.left+parseFloat(css.left),boundary:v.left};
  });
  assert.ok(marker.left>=marker.boundary,'第一张前方的插入标记必须可见');
  await page.mouse.up();await measure('two-after-drag');
  await panel.locator('.flora-reference-remove').last().click();await measure('single');
  assert.equal(await cards.count(),1);
  await page.evaluate(()=>{
    const prefix=['data:','image/svg+xml,'].join('');
    for(let i=0;i<7;i++) {
      const source=addCanvasImage(prefix+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="hsl('+i*45+' 65% 50%)"/></svg>'),'滚动素材'+(i+1),{x:-1400,y:i*140});
      connectCanvasNodes(source.dataset.id,qaTargetId);
    }
    selectCanvasNode(getCanvasNode(qaTargetId));
  });
  assert.equal(await cards.count(),8);
  for(const width of [390,768,1440,1728]) {
    await setWidth(width);
    const view=panel.locator('.flora-reference-materials');
    await view.evaluate(view=>{view.scrollLeft=0;});await measure(width+'-many-start','start');
    if(width===390)assert.ok(await view.evaluate(view=>view.scrollWidth>view.clientWidth),'窄屏多素材保留横向滚动');
    await view.evaluate(view=>{view.scrollLeft=view.scrollWidth;});await measure(width+'-many-end','end');
    assert.equal(await panel.locator('.flora-generator-reference-area').evaluate(area=>area.scrollLeft),0,'外层不产生第二层横向滚动');
  }
  fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(measurements,null,2));
  const failures=measurements.filter(m=>m.clipped.length);
  assert.deepEqual(failures.map(m=>({label:m.label,clipped:m.clipped})),[],'参考卡片和移除按钮必须完整显示');
  assert.ok(measurements.filter(m=>!m.edge).every(m=>m.view.scrollLeft===0&&m.area.scrollLeft===0),'少量素材排序不能残留横向滚动');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,widths:[390,768,1440,1728],scenarios:measurements.length,errors},null,2));
  console.log('参考素材边界专项通过：四宽普通/放大/排序/单张/多张/移除/焦点/插入标记，无遮挡或偏移');
};
