const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openFixture, settle } = require('./dom-scaling-test-support.cjs');
const out = path.resolve(__dirname, '../.planning/group-hover-flash-20261026');
fs.mkdirSync(out, { recursive: true });
async function capture(page) {
  const metadata = await page.evaluate(() => {
    const v = document.querySelector('#infiniteCanvas').getBoundingClientRect(), unit = v.width / document.querySelector('#infiniteCanvas').clientWidth;
    const ids = ['1', '2'];
    const nodes = ids.map(id => {
      const model = canvasVirtualStore.get(id), geometry = resolveNodeVisualGeometry(model), b = geometry.outerBounds;
      const node = canvasVirtualStore.getMounted(id), s = node && getComputedStyle(node);
      return { id, level: node?.dataset.virtualLevel || (node ? 'full' : 'scene'), point: { x: v.left + (canvasState.x + (b.left + (b.right-b.left)*.25)*canvasState.scale)*unit, y: v.top + (canvasState.y + (b.top + (b.bottom-b.top)*.25)*canvasState.scale)*unit }, z: s?.zIndex, classes: node?.className };
    });
    const proxy = document.querySelector('.canvas-hover-port-proxy'), body = proxy?.querySelector('.flora-node-content');
    return { nodes, hovered: canvasRepresentation.hoveredId, selected: [...canvasState.selectedIds], groupZ: getComputedStyle(getCanvasNode('g')).zIndex, proxy: body ? { bg: getComputedStyle(body).background, before: getComputedStyle(body, '::before').background, after: getComputedStyle(body, '::after').background } : null };
  });
  const png = await page.screenshot();
  const pixels = await page.evaluate(async ({ png, points }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type:'image/png' }));
    const cv = document.createElement('canvas'); cv.width = bitmap.width; cv.height = bitmap.height;
    const ctx = cv.getContext('2d'); ctx.drawImage(bitmap,0,0); bitmap.close();
    return points.map(p => [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data]);
  }, { png: png.toString('base64'), points: metadata.nodes.map(n => n.point) });
  return { ...metadata, pixels };
}
async function run(width) {
  const f = await openFixture({ width, height:1050 }); const frames=[];
  try {
    await f.page.evaluate(async () => {
      const cv=document.createElement('canvas'); cv.width=cv.height=400; const ctx=cv.getContext('2d');ctx.fillStyle='rgb(30,90,240)';ctx.fillRect(0,0,400,400); const src=cv.toDataURL();
      const nodes=['1','2'].map((id,i)=>({...__domScalingSeeds[0],id,kind:i?'comfy':'image',x:140+i*500,y:300,width:400,height:400,resultSrc:src,generationHistory:[{id:'h'+id,kind:'image',src}],currentGenerationId:'h'+id,zOrder:i+1}));
      nodes.push({id:'g',kind:'group',x:124,y:284,width:932,height:480,groupMembers:['1','2'],groupImages:nodes.map(n=>({name:n.id,url:src})),groupTitle:'图片组',zOrder:0});
      restoreCanvasBoard({id:'dom-scaling-mock-board',nodes,connections:[],viewport:{x:30,y:30,scale:Math.min(.65,(innerWidth-100)/1200)}});canvasState.isRestoring=false;canvasState.activeBoardPersisted=false;clearCanvasSelection();
      const group=CanvasNodeRepresentation.hydrateNode('g'); selectCanvasNode(group);CanvasNodeRepresentation.reconcile();
    });
    await f.page.mouse.move(width-60,900);await settle(f.page,700);
    frames.push({name:'before',...await capture(f.page)});
    if(process.env.HOVER_HANDOFF!=='0') {
      await f.page.evaluate(()=>{
        clearCanvasSelection();
        ['1','2'].map(id=>canvasVirtualStore.getMounted(id)).filter(Boolean).forEach(addCanvasNodeToSelection);
        selectCanvasNode(getCanvasNode('g'));
        ['1','2'].forEach(id=>CanvasNodeRepresentation.hydrateNode(id));
      });
      frames.push({name:'selection-handoff',...await capture(f.page)});
    }
    for(let cycle=0;cycle<3;cycle++) for(const id of ['1','2']) {
      if(process.env.HOVER_FULL!=='0')await f.page.evaluate(()=>['1','2'].forEach(id=>CanvasNodeRepresentation.hydrateNode(id)));
      const target=frames[0].nodes.find(n=>n.id===id).point;
      await f.page.mouse.move(target.x,target.y);
      for(const delay of [0,16,80,220]) { if(delay)await f.page.waitForTimeout(delay); frames.push({name:`${cycle}-${id}-${delay}`,...await capture(f.page)}); }
      await f.page.mouse.move(width-60,900);await settle(f.page,250);
    }
    fs.writeFileSync(path.join(out,`frames-${width}.json`),JSON.stringify({frames,errors:f.errors},null,2));
    for(const frame of frames)for(const pixel of frame.pixels) assert.ok(Math.abs(pixel[0]-30)<=5&&Math.abs(pixel[1]-90)<=5&&Math.abs(pixel[2]-240)<=5,`${frame.name} 图片不得闪白：${JSON.stringify(frame)}`);
    assert.ok(frames.some(frame=>['1','2'].includes(frame.hovered)), '指针必须命中组内图片');
    for(const frame of frames)assert.deepEqual(frame.selected,['g'],'悬停不能改变组选择');
    assert.deepEqual(f.errors,[]);return frames.map(frame=>({width,...frame}));
  }finally{await f.close();}
}
async function main(){const frames=[];for(const width of (process.env.HOVER_WIDTHS||'390,768,1440,1728').split(',').map(Number))frames.push(...await run(width));fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify({frames},null,2));console.log(JSON.stringify({frames:frames.length,passed:true}));}
main().catch(error=>{console.error(error);process.exitCode=1;});
