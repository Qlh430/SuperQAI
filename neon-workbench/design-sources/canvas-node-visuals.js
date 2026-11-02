(function installNodeVisuals(root, factory) {
  if (root.CanvasNodeVisuals?.textLayoutVersion === 2) return;
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CanvasNodeVisuals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Visual Fidelity is Content-Driven. Interaction Complexity is Intent-Driven.
  // This registry paints static content into the existing Scene or bounded Light
  // canvas. It never mounts controls, changes geometry, or owns media playback.
  const renderers = new Map(), layouts = new Map(), waves = new Map(), posters = new Map();
  const posterQueue = [], posterJobs = new Set(); let posterEpoch = 0, posterPixels = 0;
  const LIMIT = 4096, MAX_TEXT = 12000;
  const MAX_POSTER_PIXELS = 12 * 1024 * 1024;
  let layoutHits = 0, layoutMisses = 0, paintCount = 0;
  const register = (kinds, renderer, label, semantics) => kinds.forEach(kind => renderers.set(kind, { renderer, label, semantics }));
  register(['image-generator','generator','midjourney','comfy'], 'image-generator', '图片生成', ['image-placeholder','image-result']);
  register(['image','upload'], 'image', '图片', ['image-content']);
  register(['video-generator','video-api'], 'video-generator', '视频生成', ['video-placeholder','poster']);
  register(['minimax-h3','H3'], 'h3', '视频生成', ['video-placeholder','multimodal-reference','poster']);
  register(['audio-generator'], 'audio-generator', '音频生成', ['waveform','duration','play-state']);
  register(['audio','asset-audio'], 'audio', '音频', ['waveform','duration','play-state']);
  register(['text'], 'text', '文字', ['multiline-body']);
  register(['script-generator','script-production'], 'script-generator', '脚本生成', ['production-guide','workflow-summary']);
  register(['llm'], 'llm', '文本生成', ['text-result','prompt-summary']);
  register(['video','asset-video','video-output'], 'video', '视频', ['poster','duration']);
  register(['gallery-container','gallery'], 'gallery', '图集', ['gallery-members']);
  register(['asset-collection'], 'assets', '素材', ['asset-members']);
  register(['note'], 'note', '便签', ['note-body','note-color']);
  register(['group'], 'group', '图片组', ['group-color','member-count']);
  const text = value => typeof value === 'string' ? value : '';
  const notePaper = Object.freeze({yellow:'#e6d990',pink:'#e8b3c1',orange:'#e8bd8f',green:'#b7d0a6',blue:'#a9c8da',purple:'#c3b2d7'});
  const fontFamily = 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  const richText = html => text(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div|h[1-6]|li)>\s*(?=<)/gi,'\u2029').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi,entity=>{const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};if(named[entity])return named[entity];const n=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):entity;}).replace(/\u2029+$/,'');
  const durationText = value => { const n = Math.max(0, Number(value) || 0); return `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(Math.floor(n % 60)).padStart(2,'0')}`; };
  function project(model = {}) {
    const single=model.kind==='asset-collection'&&model.assetCollection?.mode==='single'&&model.assetCollection.members?.length===1?model.assetCollection.members[0]:null;
    if(single&&['image','video','audio'].includes(single.kind))model={...model,kind:single.kind,uploadOnly:single.kind==='image',imageSrc:single.kind==='image'?single.src:'',mediaSrc:single.src,mediaDuration:single.duration};
    let kind = model.productionWorkflow ? 'script-generator' : model.kind || 'image';
    if (kind === 'image' && !model.uploadOnly && !model.imageSrc) kind = 'image-generator';
    const meta = renderers.get(kind) || { renderer:'unsupported', label:kind, semantics:['legacy-content'] };
    const audio = model.audioGeneration || {}, result = audio.result || model.result || {};
    const workflow = model.productionWorkflow || {};
    const history = model.generationHistory || [];
    const current = history.find(item => String(item.id) === String(model.currentGenerationId)) || {};
    const gallery = model.galleryContainer || model.assetCollection || {};
    const members = gallery.members || model.images || model.assets || [];
    const isVideo = ['video','asset-video','video-output','video-generator','video-api','minimax-h3','H3'].includes(kind);
    const posterSource = text(model.posterSrc || model.videoPoster || result.poster || result.posterUrl
      || model.poster || current.poster || current.posterUrl);
    const src = isVideo
      ? posterSource || text(model.resultSrc || model.imageSrc || model.previewSource || model.thumbnailUrl)
      : text(model.resultSrc || model.imageSrc || model.previewSource || result.poster || result.posterUrl || model.poster || model.posterSrc || model.videoPoster || model.thumbnailUrl || current.poster || current.posterUrl);
    return {
      ...meta, kind, icon:meta.renderer === 'script-generator' ? 'text' : '',
      source:src, posterSource, mediaSource:text(model.mediaSrc || model.videoSrc || model.audioSrc || model.generationVideoSrc || result.url || result.src),
      body:text(model.text || model.llmResult || model.resultText || result.text || current.text),
      textPreview:kind==='text'&&typeof model.textRichHtml==='string'?richText(model.textRichHtml):null,
      richHtml:kind==='text'&&typeof model.textRichHtml==='string'?model.textRichHtml:null,
      prompt:text(model.prompt || model.llmPrompt || model.minimaxH3Prompt || model.apiVideoPrompt || model.comfyPrompt || model.midjourneyPrompt || audio.prompt),
      duration:Number(result.duration || current.duration || model.mediaDuration || model.videoDuration || model.apiVideoDuration || model.minimaxH3Duration || model.duration || audio.parameters?.duration) || 0,
      waveform:Array.isArray(model.waveform || result.waveform || result.peaks) ? (model.waveform || result.waveform || result.peaks).slice(0,64) : null,
      playing:model.playing === true, color:text(model.noteColor || model.groupColor || model.textBackground),
      paperColor:kind==='note' ? notePaper[model.noteColor] || notePaper.yellow : '',
      title:text(workflow.title), summary:model.productionWorkflow ? (workflow.shots?.length ? `${workflow.shots.length} 镜 · ${workflow.assets?.filter(a=>a.type==='character').length || 0} 人物 · ${workflow.assets?.filter(a=>a.type==='scene').length || 0} 场景 · ${workflow.assets?.filter(a=>a.type==='prop').length || 0} 道具` : '脚本 → 资产 → 合成故事板 → 视频生成') : '',
      mediaName:text(model.mediaName || model.imageName || single?.name) || 'audio',
      stage:text(model.productionStage || (workflow.shots?.length ? '分镜与资产已准备' : '等待整理剧本')),
      guide:text(workflow.source || model.llmPrompt),
      members:members.slice(0,9).map(item => ({
        source:text(item.url || item.src || item.imageSrc || item.resultSrc || item.savedUrl),
        name:text(item.name || item.title), width:Number(item.width)||0, height:Number(item.height)||0,
        crop:item.crop||item.cropRect||null,
      })),
      columns:Math.max(1,Math.min(5,Math.floor(Number(gallery.columns||gallery.layout?.columns)||Math.ceil(Math.sqrt(members.length||1))))),
      gap:Math.max(0,Number(gallery.gap)||8),
      count:model.kind === 'group' ? (model.groupMembers || []).length : members.length,
    };
  }
  function layoutText(context, value, width, lineHeight = 22, fontSize = 16, maxLines = 28, paragraphGap = 0) {
    const valueText = String(value || '').slice(0,MAX_TEXT), w = Math.max(1,Math.round(width));
    const key = `${w}|${lineHeight}|${fontSize}|${maxLines}|${paragraphGap}|${valueText}`;
    const cached = layouts.get(key);
    if (cached) { layoutHits++; return cached; }
    layoutMisses++; context.font = `400 ${fontSize}px ${fontFamily}`;
    const lines = [], offsets = [], paragraphs = valueText.split(/(\r?\n|\u2029)/);let y=0;
    for (let p=0;p<paragraphs.length;p+=2) {
      const paragraph=paragraphs[p];
      let line = '';
      for (const ch of paragraph) {
        if (line && context.measureText(line + ch).width > w) { lines.push(line);offsets.push(y);y+=lineHeight; line = ''; if (lines.length >= maxLines) break; }
        line += ch;
      }
      if (lines.length >= maxLines) break;
      lines.push(line);offsets.push(y);y+=lineHeight+(paragraphs[p+1]==='\u2029'?paragraphGap:0);
    }
    if (layouts.size >= LIMIT) layouts.delete(layouts.keys().next().value);
    lines.offsets=offsets;layouts.set(key,lines); return lines;
  }
  // A short-lived, inert preview uses the SAME markup, sanitizer and stylesheet
  // as Full. Browser line boxes are projected into immutable data; no editor,
  // node listeners or DOM references are retained in the bounded cache.
  let textStyleEpoch = 0, textRendererPending = null;
  const textLayoutIndex = new Map();
  function invalidateTextStyles(){textStyleEpoch++;layouts.clear();textLayoutIndex.clear();globalThis.scheduleCanvasSceneRender?.();}
  if (globalThis.document?.fonts) document.fonts.addEventListener('loadingdone',invalidateTextStyles);
  globalThis.addEventListener?.('resize',invalidateTextStyles);
  if(globalThis.MutationObserver && globalThis.document?.documentElement){
    const elements=[document.documentElement,document.body].filter(Boolean);
    // The desktop writes --os-pointer-x on every mousemove. Only typography
    // and theme values may invalidate a layout; pointer/camera variables cannot.
    const themeKey=()=>JSON.stringify(elements.map(el=>[el.getAttribute('data-theme'),el.className,...['font-family','font-size','font-weight','line-height','letter-spacing','--neon-font-sans','--neon-foreground','--canvas-neon-text'].map(key=>el.style.getPropertyValue(key))]));
    let previousTheme=themeKey();
    const themeObserver=new MutationObserver(()=>{const next=themeKey();if(next!==previousTheme){previousTheme=next;invalidateTextStyles();}});
    for(const element of elements)themeObserver.observe(element,{attributes:true,attributeFilter:['class','style','data-theme']});
  }
  function layoutRichText(context, visual, width, height) {
    if (!globalThis.document) return {glyphs:[],decorations:[],blocks:[],wrappedLines:[]};
    if (!globalThis.CanvasTextNodeRenderer) {
      // Resident Scene rows can arrive before optional node plugins. Load only
      // the shared preview code; this never calls render() or hydrates a node.
      if (!textRendererPending && globalThis.AiOsModuleLoader?.ensure) textRendererPending=AiOsModuleLoader.ensure(['canvas-node-text']).then(()=>globalThis.scheduleCanvasSceneRender?.()).catch(error=>{console.error('文字静态预览加载失败',error);globalThis.setCanvasStatus?.('文字预览加载失败，请刷新后重试。');});
      return {glyphs:[],decorations:[],blocks:[],wrappedLines:[]};
    }
    const key = JSON.stringify(['full-layout-v2',width,height,visual.body,visual.richHtml,textStyleEpoch]);
    const existing=layouts.get(textLayoutIndex.get(key));
    if (existing) { layoutHits++; return existing; }
    const plane = document.querySelector('#canvasPlane');
    if (!plane) return {glyphs:[],decorations:[],blocks:[],wrappedLines:[]};
    layoutMisses++;
    const node = document.createElement('article');
    node.className = 'canvas-node canvas-node-text';
    Object.assign(node.dataset,{floraNode:'true',floraKind:'text',floraComposer:'true',textProjectionProbe:'true'});
    node.setAttribute('aria-hidden','true'); node.inert = true;
    node.style.cssText = `position:absolute;left:0;top:0;transform:none;visibility:hidden!important;pointer-events:none!important;--flora-node-width:${width+16}px;--flora-node-height:${height+16}px;`;
    node.innerHTML = '<div class="flora-node-shell"><div class="flora-node-content"><div class="flora-node-editor-surface"><div class="canvas-text is-markdown flora-node-editor"></div></div></div></div>';
    const text = node.querySelector('.canvas-text');
    CanvasTextNodeRenderer.setValue(text,visual.body,{richHtml:visual.richHtml??undefined});
    plane.append(node);
    try {
      const rootRect=node.getBoundingClientRect(),scale=rootRect.width/(width+16);
      if(!(scale>0))return {glyphs:[],decorations:[],blocks:[],wrappedLines:[]}; // Hidden workspace: never cache zero-size DOM measurements.
      const content=node.querySelector('.canvas-text-markdown'),cs=getComputedStyle(content),ts=getComputedStyle(text);
      const origin=node.querySelector('.flora-node-content').getBoundingClientRect();
      const rect=b=>({left:(b.left-origin.left)/scale,top:(b.top-origin.top)/scale,right:(b.right-origin.left)/scale,bottom:(b.bottom-origin.top)/scale});
      const glyphs=[],blocks=[],decorations=[],styleCache=new Map();
      const styleFor=el=>{
        if(styleCache.has(el))return styleCache.get(el);
        const c=getComputedStyle(el),font=`${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
        context.font=font;const metrics=context.measureText('Hg国');
        const style={font,fontFamily:c.fontFamily,fontSize:parseFloat(c.fontSize),weight:Number(c.fontWeight),lineHeight:parseFloat(c.lineHeight),letterSpacing:c.letterSpacing,textAlign:c.textAlign,color:c.color,underline:c.textDecorationLine.includes('underline'),strike:c.textDecorationLine.includes('line-through'),whiteSpace:c.whiteSpace,ascent:metrics.fontBoundingBoxAscent??metrics.actualBoundingBoxAscent};
        styleCache.set(el,style);return style;
      };
      for(const block of content.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,hr')){
        const c=getComputedStyle(block);blocks.push({type:block.localName,bounds:rect(block.getBoundingClientRect()),marginTop:parseFloat(c.marginTop),marginBottom:parseFloat(c.marginBottom),...styleFor(block),runs:[]});
      }
      const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),range=document.createRange();let leaf;
      while(leaf=walker.nextNode()){
        const style=styleFor(leaf.parentElement),value=leaf.data;
        // The browser chooses every wrap (including CJK punctuation and English
        // words). Binary search only locates its line ends; it never guesses one.
        let start=0;
        while(start<value.length){
          range.setStart(leaf,start);range.setEnd(leaf,start+1);
          const first=range.getBoundingClientRect();
          let lo=start+1,hi=value.length;
          while(lo<hi){const mid=Math.ceil((lo+hi)/2);range.setEnd(leaf,mid);const rs=[...range.getClientRects()].filter(r=>r.width>0);if(rs.some(r=>Math.abs(r.top-first.top)>.5*scale))hi=mid-1;else lo=mid;}
          const end=Math.max(start+1,lo),collapse=['normal','nowrap','pre-line'].includes(style.whiteSpace);
          let drawStart=start,drawEnd=end;
          // A space collapsed across a <strong>/<span> boundary has no glyph
          // box. Do not draw a second space just because a new run begins.
          if(collapse){
            const invisibleSpace=i=>{if(!/[ \t\r\n\f]/.test(value[i]))return false;range.setStart(leaf,i);range.setEnd(leaf,i+1);return range.getBoundingClientRect().width<.0001;};
            while(drawStart<drawEnd&&invisibleSpace(drawStart))drawStart++;
            while(drawEnd>drawStart&&invisibleSpace(drawEnd-1))drawEnd--;
          }
          range.setStart(leaf,drawStart);range.setEnd(leaf,drawEnd);
          const b=rect(range.getBoundingClientRect()),str=collapse?value.slice(drawStart,drawEnd).replace(/[ \t\r\n\f]+/g,' '):value.slice(drawStart,drawEnd);
          if(b.right>b.left){const run={text:str,x:b.left,top:b.top,y:b.top+style.ascent,width:b.right-b.left,end:b.right,...style};glyphs.push(run);const block=leaf.parentElement.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th');const i=block?[...content.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,hr')].indexOf(block):-1;if(i>=0)blocks[i].runs.push({...run});}
          start=end;
        }
      }
      // Preserve existing semantic surfaces and list markers without retaining
      // their DOM. All box positions and styles come from the same CSS layout.
      for(const el of content.querySelectorAll('h1,blockquote,pre,code,hr,td,th,li')) {
        const c=getComputedStyle(el),b=rect(el.getBoundingClientRect());
        if(c.backgroundColor!=='rgba(0, 0, 0, 0)' && c.backgroundColor!=='transparent') decorations.push({...b,fill:c.backgroundColor,radius:parseFloat(c.borderRadius)||0});
        for(const side of ['Top','Right','Bottom','Left']) { const thickness=parseFloat(c['border'+side+'Width']);if(thickness>0&&c['border'+side+'Style']!=='none')decorations.push({...b,side,thickness,color:c['border'+side+'Color']}); }
        if(el.localName==='li' && c.display==='list-item') {
          const first=glyphs.find(g=>g.top>=b.top-.1&&g.top<b.bottom);if(!first)continue;
          const marker=getComputedStyle(el,'::marker'),font=`${marker.fontStyle} ${marker.fontWeight} ${marker.fontSize} ${marker.fontFamily}`;
          const parent=el.parentElement,number=[...parent.children].filter(n=>n.localName==='li').indexOf(el)+(Number(parent.getAttribute('start'))||1);
          const label=parent.localName==='ol'?number+'.':c.listStyleType==='circle'?'◦':c.listStyleType==='square'?'▪':'•';
          context.font=font;const w=context.measureText(label+' ').width;
          glyphs.push({...first,text:label,x:b.left-w,width:w,end:b.left,font,color:marker.color,marker:true});
        }
      }
      const wrappedLines=[];
      for(const run of glyphs){let line=wrappedLines.find(line=>Math.abs(line.baseline-run.y)<.3);if(!line){line={top:run.top,baseline:run.y,runs:[]};wrappedLines.push(line);}line.runs.push(run);}
      const contentRect=rect(content.getBoundingClientRect());
      const styleSignature=JSON.stringify([...styleCache.values()].map(({font,lineHeight,letterSpacing,textAlign})=>({font,lineHeight,letterSpacing,textAlign})).concat(blocks.map(({marginTop,marginBottom})=>({marginTop,marginBottom}))));
      const result={cacheKey:key+'|'+styleSignature,authority:'Full computed layout',contentBounds:contentRect,padding:{top:parseFloat(ts.paddingTop),right:parseFloat(ts.paddingRight),bottom:parseFloat(ts.paddingBottom),left:parseFloat(ts.paddingLeft)},fontFamily:cs.fontFamily,baseFontSize:parseFloat(cs.fontSize),lineHeight:parseFloat(cs.lineHeight),paragraphGap:blocks.find(b=>b.type==='p')?.marginBottom||0,letterSpacing:cs.letterSpacing,textAlign:cs.textAlign,blocks,runs:glyphs,glyphs,wrappedLines,baselinePositions:wrappedLines.map(l=>l.baseline),decorations};
      if(layouts.size>=LIMIT)layouts.delete(layouts.keys().next().value);
      if(textLayoutIndex.size>=LIMIT)textLayoutIndex.delete(textLayoutIndex.keys().next().value);
      textLayoutIndex.set(key,result.cacheKey);layouts.set(result.cacheKey,result);return result;
    } finally { node.remove(); }
  }
  function waveform(value, name = 'audio') {
    const key = value ? value.join(',') : name;
    if (waves.has(key)) return waves.get(key);
    let seed=2166136261;
    for(const character of name){seed^=character.codePointAt(0);seed=Math.imul(seed,16777619);}
    const bars = value?.length ? value.map(n => Math.max(.05,Math.min(1,Math.abs(Number(n)||0)))) : Array.from({length:48},(_,i)=>(18+((Math.imul(seed^(i+1),2654435761)>>>0)%78))/100);
    if (waves.size >= 256) waves.delete(waves.keys().next().value);
    waves.set(key,bars); return bars;
  }
  function poster(source) {
    const runtime = globalThis;
    if (!source || !runtime.document) return null;
    if (posters.has(source)) return posters.get(source).image;
    if (posterQueue.length >= 32) return null;
    if (posters.size >= 64) { const old=[...posters].find(([,entry])=>entry.state!=='loading'); if(old)posters.delete(old[0]);else return null; }
    const entry={state:'loading',image:null};posters.set(source,entry);posterQueue.push({source,entry,epoch:posterEpoch});drainPosters();return null;
  }
  function drainPosters() {
    while(posterJobs.size<2&&posterQueue.length){
      const task=posterQueue.shift(),video=document.createElement('video');let timer,ended=false;
      const finish=()=>{if(ended)return;ended=true;clearTimeout(timer);video.removeEventListener('loadeddata',loaded);video.removeEventListener('error',failed);video.pause();video.removeAttribute('src');video.load();posterJobs.delete(finish);drainPosters();};
      const failed=()=>{task.entry.state='unavailable';finish();};
      const loaded=()=>{try{if(task.epoch===posterEpoch&&video.videoWidth){const canvas=document.createElement('canvas'),fit=Math.min(1,1440/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*fit));canvas.height=Math.max(1,Math.round(video.videoHeight*fit));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const pixels=canvas.width*canvas.height;while(posters.size>1&&posterPixels+pixels>MAX_POSTER_PIXELS){const old=[...posters].find(([key,entry])=>key!==task.source&&entry.state!=='loading');if(!old)break;posterPixels-=old[1].pixels||0;posters.delete(old[0]);}if(pixels<=MAX_POSTER_PIXELS&&posterPixels+pixels<=MAX_POSTER_PIXELS){task.entry.image=canvas;task.entry.pixels=pixels;posterPixels+=pixels;task.entry.state='ready';globalThis.scheduleCanvasSceneRender?.();}else task.entry.state='unavailable';}}catch{task.entry.state='unavailable';}if(!task.entry.image)task.entry.state='unavailable';finish();};
      posterJobs.add(finish);video.muted=true;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';video.addEventListener('loadeddata',loaded);video.addEventListener('error',failed);timer=setTimeout(failed,8000);video.src=task.source;video.load();
    }
  }
  function paint(context, visual, geometry, transform, options = {}) {
    if (!visual || !geometry) return;
    paintCount++;
    const bounds = geometry.contentBounds || geometry.outerBounds, outer = geometry.outerBounds;
    const width = Math.max(1,bounds.right-bounds.left), height = Math.max(1,bounds.bottom-bounds.top);
    const scale = Number(transform.scale) || 1;
    const theme = options.theme || {}, ink = visual.renderer==='note' ? '#242522' : theme.text || '#fff', muted = theme.muted || '#888', border = theme.border || '#2a2a2a', primary = theme.primary || '#00ff41';
    context.save(); context.translate(transform.x+bounds.left*scale,transform.y+bounds.top*scale);context.scale(scale,scale);
    context.beginPath();context.roundRect(0,0,width,height,Math.min(geometry.borderRadius||16,width/2,height/2));context.clip();
    const centered = (label,y,size=14,color=muted,weight=400) => {context.fillStyle=color;context.font=`${weight} ${size}px ${fontFamily}`;context.textAlign='center';context.fillText(String(label),width/2,y,Math.max(1,width-32));context.textAlign='start';};
    const paragraph = (value,x,y,w,h,size=16,lineHeight=22,gap=0) => {const lines=layoutText(context,value,w,lineHeight,size,Math.max(1,Math.floor(h/lineHeight)),gap);context.fillStyle=ink;context.font=`400 ${size}px ${fontFamily}`;lines.forEach((line,i)=>{if(lines.offsets[i]<h)context.fillText(line,x,y+lines.offsets[i]);});};
    const texture = source => source && options.resolveTexture?.(source,options.node,{cachedOnly:options.cachedOnly});
    const image = (source,x,y,w,h) => {const img=texture(source);if(!img||typeof img.then==='function'||img.complete===false)return false;const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;if(!(iw>0&&ih>0))return false;const fit=Math.min(w/iw,h/ih);context.drawImage(img,x+(w-iw*fit)/2,y+(h-ih*fit)/2,iw*fit,ih*fit);return true;};
    const gallery = () => {
      const members=visual.members||[],columns=Math.max(1,Math.min(members.length||1,visual.columns||3));
      const worldLayout=globalThis.CanvasGalleryRules?.floraLayout({members,columns,gap:visual.gap});
      const rows=Math.max(1,Math.ceil(members.length/columns)),gap=Math.min(visual.gap||8,width/(columns*2),height/(rows*2));
      const cellWidth=(width-gap*(columns-1))/columns,cellHeight=(height-gap*(rows-1))/rows;
      members.forEach((member,index)=>{
        const img=texture(member.source);if(!img||typeof img.then==='function'||img.complete===false)return;
        const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;if(!(iw>0&&ih>0))return;
        const cell=worldLayout?.cells[index];
        const col=index%columns,row=Math.floor(index/columns),x=cell?cell.x-(bounds.left-outer.left):col*(cellWidth+gap),y=cell?cell.y-(bounds.top-outer.top):row*(cellHeight+gap);
        const w=cell?.width||cellWidth,h=cell?.height||cellHeight;
        const fit=Math.max(w/iw,h/ih),dw=iw*fit,dh=ih*fit;
        context.save();context.beginPath();context.rect(x,y,w,h);context.clip();
        context.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);context.restore();
      });
    };
    const playMark = (x,y,r=22) => {context.fillStyle=theme.card||'#1a1a1a';context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fill();context.strokeStyle=muted;context.lineWidth=1;context.stroke();context.fillStyle=ink;context.beginPath();context.moveTo(x-5,y-8);context.lineTo(x+8,y);context.lineTo(x-5,y+8);context.fill();};
    const placeholder = (video=false) => {
      // Keep image and video Full/Light placeholders on the same centered 80px geometry.
      const iconSize = 80;
      const cx=width/2,top=(height-iconSize)/2;
      context.save();context.translate(cx-iconSize/2,top);context.scale(iconSize/24,iconSize/24);
      context.strokeStyle=muted;context.lineWidth=1.5;context.lineJoin='round';context.lineCap='round';
      context.beginPath();context.roundRect(video?2:3,video?4:3,video?20:18,video?16:18,video?5:2);context.stroke();
      if(video){context.beginPath();context.moveTo(9.4,8.2);context.quadraticCurveTo(8.5,7.7,8.5,8.8);context.lineTo(8.5,15.2);context.quadraticCurveTo(8.5,16.3,9.4,15.8);context.lineTo(15.6,12.4);context.quadraticCurveTo(16.6,12,15.6,11.6);context.closePath();context.stroke();}
      else {context.beginPath();context.arc(9,9,2,0,Math.PI*2);context.stroke();context.beginPath();context.moveTo(21,15);context.lineTo(16,10);context.lineTo(5,21);context.stroke();}
      context.restore();
      if (video || visual.renderer === 'image-generator') return;
      centered('生成结果',top+66,14);
    };
    switch(visual.renderer) {
      case 'image':case 'image-generator': if(!image(visual.source,0,0,width,height))placeholder();break;
      case 'video':case 'video-generator':case 'h3':
        {const frame=!visual.posterSource&&visual.mediaSource&&poster(visual.mediaSource);
        if(frame){const fit=Math.min(width/frame.width,height/frame.height);context.drawImage(frame,(width-frame.width*fit)/2,(height-frame.height*fit)/2,frame.width*fit,frame.height*fit);playMark(width/2,height/2);}
        else if(!image(visual.source,0,0,width,height))placeholder(true);else playMark(width/2,height/2);}
        break;
      case 'gallery': gallery();break;
      case 'assets': if(visual.members.length)gallery();else centered('上传或拖入素材',height/2,16);break;
      case 'audio':case 'audio-generator': {
        if(!visual.mediaSource){
          const iconSize=80,cx=width/2,top=(height-iconSize)/2;
          context.save();context.translate(cx-iconSize/2,top);context.scale(iconSize/24,iconSize/24);
          context.strokeStyle=muted;context.lineWidth=1.8;context.lineCap='round';context.lineJoin='round';context.beginPath();
          context.moveTo(2,10);context.lineTo(2,13);context.moveTo(6,6);context.lineTo(6,17);context.moveTo(10,3);context.lineTo(10,21);context.moveTo(14,8);context.lineTo(14,15);context.moveTo(18,5);context.lineTo(18,18);context.moveTo(22,10);context.lineTo(22,13);context.stroke();context.restore();
          break;
        }
        const bars=waveform(visual.waveform,visual.mediaName),left=16,right=width-16,y=height/2-20,step=(right-left-3)/Math.max(1,bars.length-1);
        // Match Full: centered waveform, then 32px play button and time below.
        const cy=height/2+26;
        context.fillStyle=`color-mix(in srgb, ${theme.card||'#1a1a1a'} 92%, transparent)`;context.strokeStyle=`color-mix(in srgb, ${border} 88%, ${muted})`;context.lineWidth=1;
        context.beginPath();context.arc(32,cy,15.5,0,Math.PI*2);context.fill();context.stroke();
        context.save();context.translate(24,cy-8);context.scale(16/24,16/24);context.strokeStyle=ink;context.lineWidth=2;context.lineJoin='round';context.beginPath();context.moveTo(6,3);context.lineTo(20,12);context.lineTo(6,21);context.closePath();context.stroke();context.restore();
        context.strokeStyle=`color-mix(in srgb, ${muted} 68%, ${ink})`;context.globalAlpha=.74;context.lineWidth=Math.min(3,step);context.lineCap='round';context.beginPath();bars.forEach((v,i)=>{const half=Math.max(2,v*16)-1.5;context.moveTo(left+1.5+i*step,y-half);context.lineTo(left+1.5+i*step,y+half);});context.stroke();context.globalAlpha=1;context.lineCap='butt';
        context.fillStyle=primary;context.beginPath();context.roundRect(left,y-18,2,36,1);context.fill();
        context.fillStyle=muted;context.font=`500 12px ${fontFamily}`;context.fillText(`00:00 / ${durationText(visual.mediaSource?visual.duration:0)}`,58,cy+4);
        break;
      }
      case 'note': {
        context.fillStyle=visual.paperColor||notePaper.yellow;context.fillRect(0,0,width,height);
        paragraph(visual.body||'写点什么…',16,32,width-32,height-48,14,21.7);break;
      }
      case 'text':case 'llm': {
        const body=visual.body||(visual.renderer==='text'?'双击输入文字':visual.renderer==='note'?'记录想法…':visual.prompt||'生成的文本将在这里显示');
        if(visual.renderer==='text'){
          const layout=(options.node?.id && globalThis.resolveTextVisualLayout?.(options.node)) || layoutRichText(context,{...visual,body},width,height);
          context.save();
          context.translate(0,-Math.max(0,Number(options.textScrollTop)||0));
          context.textBaseline='alphabetic';context.textAlign='left';context.fillStyle=ink;
          for(const d of layout.decorations){
            if(d.fill){context.fillStyle=d.fill;context.beginPath();context.roundRect(d.left,d.top,d.right-d.left,d.bottom-d.top,d.radius);context.fill();}
            if(d.side){context.fillStyle=d.color;const t=d.thickness;if(d.side==='Top')context.fillRect(d.left,d.top,d.right-d.left,t);if(d.side==='Bottom')context.fillRect(d.left,d.bottom-t,d.right-d.left,t);if(d.side==='Left')context.fillRect(d.left,d.top,t,d.bottom-d.top);if(d.side==='Right')context.fillRect(d.right-t,d.top,t,d.bottom-d.top);}
          }
          // Canvas accepts a length, not CSS "normal". An invalid assignment
          // retains the previous heading's negative spacing and compresses all
          // following body/code lines until another explicit length appears.
          for(const run of layout.glyphs){context.fillStyle=run.color||ink;context.font=run.font;context.letterSpacing=run.letterSpacing==='normal'?'0px':run.letterSpacing;context.fillText(run.text,run.x,run.y);if(run.underline||run.strike){context.strokeStyle=ink;context.lineWidth=.7;context.beginPath();context.moveTo(run.x,run.y+(run.strike?-4:2));context.lineTo(run.end,run.y+(run.strike?-4:2));context.stroke();}}
          context.restore();
        }
        else paragraph(body,16,30,width-32,height-42,16,22);break;
      }
      case 'script-generator': {
        // Match the existing .canvas-script-preview flex composition. The
        // workbench affordance is painted here; its real button mounts on click.
        const top=(height-137.8)/2;
        centered(visual.title||'脚本制作',top+23,20,muted,700);
        centered(visual.summary,top+67,14);
        context.font='400 14px system-ui, sans-serif';const bw=context.measureText('打开制作工作台').width+42;
        context.fillStyle=theme.card||'#1a1a1a';context.strokeStyle=border;context.lineWidth=1;
        context.beginPath();context.roundRect((width-bw)/2,top+93.8,bw,44,12);context.fill();context.stroke();
        centered('打开制作工作台',top+121.8,14,ink);break;
      }
      case 'group': break; // The group is a frame; its members remain independent visuals.
      default: centered(visual.label,height*.3,20,ink);paragraph(visual.body||visual.prompt||'双击打开节点',20,height*.45,width-40,height*.45,14,20);
    }
    context.restore();
  }
  return Object.freeze({ textLayoutVersion:2, project, paint, layoutText, layoutRichText, list:()=>[...renderers.keys()], clear(){layouts.clear();textLayoutIndex.clear();waves.clear();posterEpoch++;posterQueue.length=0;for(const cancel of [...posterJobs])cancel();posters.clear();posterPixels=0;layoutHits=layoutMisses=paintCount=0;},diagnostics:()=>({layoutEntries:layouts.size,layoutLimit:LIMIT,layoutHits,layoutMisses,waveformEntries:waves.size,waveformLimit:256,posterEntries:posters.size,posterLimit:64,posterPixels,posterPixelLimit:MAX_POSTER_PIXELS,posterJobs:posterJobs.size,posterQueue:posterQueue.length,paintCount}) });
});
