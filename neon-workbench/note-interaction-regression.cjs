// Browser-only canvas fixture: all API calls are intercepted; no real user data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.AI_OS_TEST_URL ||= 'http://127.0.0.1:33200';
process.env.QA_RUNTIME_ROOT ||= path.resolve(__dirname, '../../AI-OS-Preview-Staging/video-hover-icon-centered-20261023-stage-r1/resources/app');
const S = require('./dom-scaling-test-support.cjs');
const out = path.resolve(__dirname, '../.design/note-interaction-20261024');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const results = [];
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  for (const width of [390, 768, 1440, 1728]) {
    const f = await S.openFixture({ width, height: 1000 });
    try {
      const p = f.page;
      await p.evaluate(() => {
        const seed = __domScalingSeeds[3];
        restoreCanvasBoard({ id:'dom-scaling-mock-board', nodes:[{...seed,id:'note-test',text:'',noteColor:'yellow',x:30,y:150,width:400,height:400}], connections:[], viewport:{x:0,y:0,scale:.7} });
        canvasState.activeBoardPersisted=false; canvasState.isRestoring=false;
        clearCanvasSelection(); CanvasNodeRepresentation.reconcile();
      });
      await S.settle(p);
      const inspect = () => p.evaluate(() => {
        const node=canvasVirtualStore.getMounted('note-test');
        const t=node?.querySelector('.canvas-note-text');
        const body=node?.querySelector('.canvas-note-body');
        const lightVisual=node?.querySelector('.canvas-light-visual');
        const pal=node?.querySelector('.canvas-note-palette');
        const rect=el=>{const r=el?.getBoundingClientRect(); return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
        const computed=el=>el?getComputedStyle(el):null;
        // At low zoom the note is painted by the scene canvas, with no node DOM.
        if (!node) {
          const b=resolveNodeVisualGeometry('note-test').contentBounds;
          const viewport=document.querySelector('#infiniteCanvas').getBoundingClientRect();
          const scale=canvasState.scale;
          const bounds={x:viewport.left+canvasState.x+b.left*scale,y:viewport.top+canvasState.y+b.top*scale,width:(b.right-b.left)*scale,height:(b.bottom-b.top)*scale};
          window.__noteRegressionExtra={bounds};
          return {level:'canvas',rect:bounds,statuses:[]};
        }
        const style=el=>el?{display:computed(el).display,visibility:computed(el).visibility,opacity:computed(el).opacity,position:computed(el).position,pointerEvents:computed(el).pointerEvents,backgroundColor:computed(el).backgroundColor,boxShadow:computed(el).boxShadow,outline:computed(el).outline}:null;
        const swatch=node?.querySelector('[data-note-swatch="purple"]');
        const activeSwatch=node?.querySelector('.canvas-note-swatch.is-active');
        const labelIcon=node?.querySelector(':scope > .flora-node-label .flora-node-label-icon');
        const remove=node?.querySelector('.canvas-note-remove');
        const toolbar=node?.querySelector('.flora-node-toolbar');
        const glyph=labelIcon?.querySelector('svg');
        const iconVisible=!!glyph?.querySelector('path,rect,circle,polyline') && glyph.getBoundingClientRect().width>0 && getComputedStyle(glyph).visibility==='visible' && getComputedStyle(glyph).stroke!=='none';
        const bounds=rect(node?.querySelector('.flora-node-card')||lightVisual);
        const swatches=[...node.querySelectorAll('.canvas-note-swatch')].map(el=>({color:el.dataset.noteColor,rect:rect(el),fill:computed(el).backgroundColor,hit:el.contains(document.elementFromPoint(rect(el).x+rect(el).width/2,rect(el).y+rect(el).height/2))}));
        window.__noteRegressionExtra={bounds,toolbar:rect(toolbar),iconVisible,swatches};
        return { level:canvasVirtualStore.getMountedLevel('note-test'),html:node?.outerHTML.slice(0,200),rect:rect(node),bodyRect:rect(body),lightRect:rect(lightVisual),textRect:rect(t),editable:t?.contentEditable,editing:node?.dataset.noteEditing,focused:document.activeElement===t,cursor:t?getComputedStyle(t).cursor:null,placeholderOpacity:t?getComputedStyle(t,'::before').opacity:null,palette:style(pal),paletteRect:rect(pal),paletteParent:pal?.parentElement.className,swatch:style(swatch),activeColor:activeSwatch?.dataset.noteColor,activeSwatch:style(activeSwatch),labelIcon:{exists:!!labelIcon,display:labelIcon?getComputedStyle(labelIcon).display:null,visibility:labelIcon?getComputedStyle(labelIcon).visibility:null,rect:rect(labelIcon)},deleteCount:node?.querySelectorAll('[data-flora-action="delete"], .canvas-note-remove').length || 0,deleteRect:rect(remove),statuses:[...node.querySelectorAll('.canvas-light-status,.canvas-note-status,.canvas-node-status,.canvas-node-footer-status,.canvas-node-bar-status,.canvas-h3-status,.canvas-api-video-status,.canvas-llm-status,.canvas-audio-generator-status,.canvas-comfy-status,.flora-node-live-status')].map(el=>({text:el.textContent,hidden:el.hidden,...style(el)})) };
      });
      const ink = async (name) => {
        const extra=await p.evaluate(()=>window.__noteRegressionExtra);
        const buffer=await p.screenshot({path:path.join(out,`${width}-${name}.png`)});
        return p.evaluate(async({base64,bounds})=>{
          const bitmap=await createImageBitmap(await (await fetch('data:image/png;base64,'+base64)).blob());
          const c=document.createElement('canvas'); c.width=bitmap.width;c.height=bitmap.height;
          const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);
          const {data}=ctx.getImageData(0,0,c.width,c.height);let xMin=Infinity,yMin=Infinity,xMax=-1,yMax=-1;
          for(let y=Math.ceil(bounds.y+5);y<Math.min(c.height,bounds.y+50);y++)for(let x=Math.ceil(bounds.x+5);x<Math.min(c.width,bounds.x+120);x++){
            const i=(y*c.width+x)*4;if(data[i]<110&&data[i+1]<110&&data[i+2]<110){xMin=Math.min(xMin,x);yMin=Math.min(yMin,y);xMax=Math.max(xMax,x);yMax=Math.max(yMax,y);}
          }
          return {x:xMin,y:yMin,width:xMax-xMin+1,height:yMax-yMin+1};
        },{base64:buffer.toString('base64'),bounds:extra.bounds});
      };
      const before=await inspect();
      const beforeInk=await ink('unselected');
      check(before.statuses.every(s=>!s.text),`${width}: note status must not retain 待完成 in the DOM`);
      assert.ok(before.statuses.every(s=>s.hidden||s.display==='none'||!s.text),'unselected notes must have no status placeholder');
      const r=before.rect;
      await p.mouse.click(r.x+30,r.y+30);
      await S.settle(p,400);
      const selected=await inspect();
      const selectedInk=await ink('selected');
      check(Math.abs(selectedInk.y-beforeInk.y)<=1 && Math.abs(selectedInk.x-beforeInk.x)<=1,`${width}: selecting note moves actual placeholder ink: ${JSON.stringify({beforeInk,selectedInk})}`);
      const extra=await p.evaluate(()=>window.__noteRegressionExtra);
      check(extra.iconVisible,`${width}: label must contain a painted SVG glyph`);
      check(extra.toolbar.x+extra.toolbar.width-selected.deleteRect.x-selected.deleteRect.width<=10,`${width}: excess space after delete button`);
      check(extra.swatches.every(s=>s.hit && s.rect.x-4>=extra.toolbar.x && s.rect.x+s.rect.width+4<=extra.toolbar.x+extra.toolbar.width && s.rect.y-4>=extra.toolbar.y && s.rect.y+s.rect.height+4<=extra.toolbar.y+extra.toolbar.height),`${width}: swatches and their complete selection rings must fit and be clickable`);
      assert.ok(selected.bodyRect && selected.textRect,'selecting a note must mount the full note body');
      const toolbarPalette = p.locator('[data-id="note-test"] .flora-node-toolbar .canvas-note-palette');
      assert.ok(await toolbarPalette.count() === 1, 'palette must be directly in toolbar');
      await S.settle(p,200);
      const opened=await inspect();
      const previewTextRect=opened.textRect;
      await p.locator('[data-id="note-test"] .canvas-note-text').click();
      await S.settle(p,100);
      const afterTextClick=await inspect();
      assert.equal(afterTextClick.editable,'false','single click on note text must not edit');
      assert.equal(afterTextClick.focused,false,'single click on note text must not focus text');
      assert.equal(afterTextClick.cursor,'default','preview note text must not advertise text editing');
      assert.equal(afterTextClick.editing,'false','single click on note text must not enter editing state');
      assert.equal(afterTextClick.textRect.y,previewTextRect.y,'single click must not move note text vertically');
      assert.equal(afterTextClick.textRect.height,previewTextRect.height,'single click must not change note text height');
      assert.equal(afterTextClick.bodyRect.y,selected.bodyRect.y,'clicking note text must not move the note body');
      await p.locator('[data-id="note-test"] .canvas-note-text').dblclick();
      await S.settle(p,100);
      const editing=await inspect();
      assert.equal(editing.textRect.y,previewTextRect.y,'entering editing must not move note text');
      assert.equal(editing.editable,'true','double click must enter editing');
      assert.equal(editing.focused,true,'double click must focus note text');
      assert.equal(editing.editing,'true','double click must set editing state');
      assert.equal(editing.cursor,'text','editing note text must show text cursor');
      assert.ok(Number(editing.placeholderOpacity) < Number(opened.placeholderOpacity),'editing placeholder must be visibly lighter');
      await p.screenshot({path:path.join(out,`${width}-editing.png`)});
      await p.locator('[data-id="note-test"] .canvas-note-text').press('Escape').catch(()=>{});
      await p.locator('[data-id="note-test"] .canvas-note-text').blur();
      await S.settle(p,100);
      const afterBlur=await inspect();
      assert.equal(afterBlur.editable,'false','blur must leave editing mode');
      assert.equal(afterBlur.editing,'false','blur must clear editing state');
      assert.equal(afterBlur.textRect.y,previewTextRect.y,'editing lifecycle must not move note text vertically');
      assert.equal(afterBlur.textRect.height,previewTextRect.height,'editing lifecycle must not change note text height');
      results.push({width,before,selected,opened,beforeInk,selectedInk,extra});
      await p.screenshot({path:path.join(out,`${width}-palette.png`)});
      assert.equal(selected.editable,'false','single click must not edit');
      assert.equal(selected.focused,false,'single click must not focus text');
      assert.equal(selected.cursor,'default','preview note text must not advertise text editing');
      assert.equal(selected.placeholderOpacity,'1','placeholder must retain dark text');
      assert.ok(opened.paletteRect.width>150 && opened.paletteRect.height>20,'palette has usable size');
      assert.equal(opened.deleteCount,1,'note toolbar must expose exactly one delete action');
      assert.equal(opened.activeColor,'yellow','default note color must be yellow');
      assert.match(opened.activeSwatch.backgroundColor,/255, 241, 184|253, 241, 184|236, 224, 166/,'yellow swatch must retain its yellow fill');
      assert.ok(opened.labelIcon.exists && opened.labelIcon.display !== 'none' && opened.labelIcon.rect.width > 0,'note label icon must remain visible');
      assert.ok(opened.deleteRect.width <= 30,'delete button must stay compact');
      await p.locator('[data-id="note-test"] [data-note-swatch="purple"]').click({timeout:2000});
      assert.equal(await p.locator('[data-id="note-test"]').getAttribute('data-note-color'),'purple');
      const afterColor=await inspect();
      assert.equal(afterColor.textRect.y,previewTextRect.y,'changing color must not move note text vertically');
      assert.equal(afterColor.textRect.height,previewTextRect.height,'changing color must not change note text height');
      assert.notEqual(afterColor.swatch.boxShadow,'none','active color swatch must retain a visible selection ring');
      const fills={pink:'rgb(251, 223, 228)',orange:'rgb(252, 220, 196)',green:'rgb(219, 237, 210)',blue:'rgb(214, 230, 251)',purple:'rgb(227, 221, 250)',yellow:'rgb(253, 241, 184)'};
      for (const [color,fill] of Object.entries(fills)) {
        const button=p.locator(`[data-id="note-test"] [data-note-swatch="${color}"]`);
        await button.hover();
        assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),fill,`${color}: hover must preserve the swatch fill`);
        await button.click();
        await button.focus();
        const state=await inspect();
        assert.equal(state.activeColor,color);
        assert.equal(state.activeSwatch.backgroundColor,fill,`${color}: selected/focused swatch must preserve its fill`);
        assert.equal(await p.evaluate(()=>canvasVirtualStore.get('note-test').noteColor),color,'color must sync to the saved model');
        assert.equal(state.textRect.y,previewTextRect.y,'color controls must not shift the placeholder');
      }
      await p.screenshot({path:path.join(out,`${width}-yellow-hover-focus.png`)});
      const persistence=await S.persistenceCheck(f);
      assert.ok(persistence.pass,`note color must persist through the mocked save API: ${JSON.stringify(persistence)}`);
      assert.equal(f.savedModels.get('note-test')?.noteColor,'yellow');
      assert.ok(opened.statuses.every(s=>s.hidden||s.display==='none'||!s.text),'notes have no status');
      if (width===1440) {
        const zoomResults=[];
        for (const scale of [.5,1,1.4]) {
          await p.evaluate(scale=>{
            restoreCanvasBoard({id:'dom-scaling-mock-board',nodes:[{...__domScalingSeeds[3],id:'note-test',text:'',noteColor:'yellow',x:30,y:150,width:400,height:400}],connections:[],viewport:{x:0,y:0,scale}});
            canvasState.activeBoardPersisted=false;canvasState.isRestoring=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();
          },scale);
          await S.settle(p);
          const normal=await inspect(), normalInk=await ink(`zoom-${scale}-unselected`);
          await p.mouse.click(normal.rect.x+30,normal.rect.y+30);
          await S.settle(p,250);
          await inspect();
          const selectedInk=await ink(`zoom-${scale}-selected`);
          check(Math.abs(normalInk.x-selectedInk.x)<=1 && Math.abs(normalInk.y-selectedInk.y)<=1,`zoom ${scale}: placeholder must not move on selection: ${JSON.stringify({normalInk,selectedInk})}`);
          zoomResults.push({scale,normalInk,selectedInk});
        }
        results[results.length-1].zoomResults=zoomResults;
        await p.evaluate(()=>document.querySelector('#neonEngineSurface').requestFullscreen());
        await S.settle(p,150);
        await inspect();
        const fullscreen=await p.evaluate(()=>({entered:!!document.fullscreenElement,...window.__noteRegressionExtra}));
        assert.ok(fullscreen.entered && fullscreen.iconVisible && fullscreen.swatches.every(s=>s.hit),'browser fullscreen must keep note icons and color controls usable');
        await p.screenshot({path:path.join(out,'1440-fullscreen.png')});
        await p.evaluate(()=>document.exitFullscreen());
        results[results.length-1].browserFullscreen=true;
      }
      assert.deepEqual(f.errors,[]);
    } finally { await f.close(); fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)); }
  }
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({widths:results.map(r=>r.width),pass:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
