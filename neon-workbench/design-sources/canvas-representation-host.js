(function installCanvasRepresentationHost(root) {
  'use strict';
  const quantile = (values, p) => values.length ? [...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)] : null;
  const VISUAL_META_FALLBACK = Object.freeze({
    text: { label: '文字', icon: 'type', tone: 'accent' },
    note: { label: '便签', icon: 'sticky-note', tone: 'neutral' },
    image: { label: '图片', icon: 'image', tone: 'neutral' },
    upload: { label: '图片', icon: 'image-plus', tone: 'neutral' },
    video: { label: '视频', icon: 'video', tone: 'neutral' },
    audio: { label: '音频', icon: 'audio-lines', tone: 'neutral' },
    generator: { label: '图片生成', icon: 'image', tone: 'accent' },
    midjourney: { label: 'Midjourney', icon: 'wand-sparkles', tone: 'accent' },
    comfy: { label: 'ComfyUI', icon: 'workflow', tone: 'accent' },
    llm: { label: '文本生成', icon: 'bot', tone: 'accent' },
    'audio-generator': { label: '音频生成', icon: 'audio-lines', tone: 'accent' },
    'minimax-h3': { label: '视频生成', icon: 'play-square', tone: 'accent' },
    'video-api': { label: '视频生成', icon: 'play-square', tone: 'accent' },
    group: { label: '图片组', icon: 'layers-3', tone: 'neutral' },
    gallery: { label: '图集', icon: 'images', tone: 'neutral' },
    'gallery-container': { label: '图集', icon: 'images', tone: 'neutral' },
    'asset-video': { label: '视频素材', icon: 'video', tone: 'neutral' },
    'asset-audio': { label: '音频素材', icon: 'audio-lines', tone: 'neutral' },
    'asset-collection': { label: '素材', icon: 'layers-3', tone: 'neutral' },
    'video-output': { label: '视频输出', icon: 'play-square', tone: 'neutral' },
    'grid-editor': { label: '宫格编辑', icon: 'layout-grid', tone: 'accent' },
  });
  const VISUAL_DEFAULT_STATUS = Object.freeze({
    text: '', upload: '', image: '', video: '', audio: '',
    generator: '', midjourney: '', comfy: '', llm: '',
    'audio-generator': '', 'minimax-h3': '', 'video-api': '',
    group: '已就绪', gallery: '', 'gallery-container': '',
    'asset-video': '', 'asset-audio': '',
    'asset-collection': '', 'video-output': '', 'grid-editor': '',
  });
  const ACTIVE_JOB_STATES = new Set(['queued', 'running', 'submitting', 'generating', 'processing', 'task_pending', 'syncing']);
  const FAILED_JOB_STATES = new Set(['failed', 'error', 'sync_failed', 'cancelled', 'canceled']);
  const DONE_JOB_STATES = new Set(['completed', 'complete', 'success', 'succeeded', 'done']);
  function cleanVisualText(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
  function colorValue(value) {
    const color = cleanVisualText(value);
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '';
  }
  function statusState(text, state = '') {
    const explicit = cleanVisualText(state).toLowerCase();
    if (['failed', 'error', 'danger'].includes(explicit) || /失败|错误|不可用/.test(text)) return 'failed';
    if (['running', 'queued', 'processing', 'pending'].includes(explicit) || /正在|生成中|处理中|排队|提交|同步/.test(text)) return 'running';
    if (!explicit && /^(待|等待|未)/.test(text)) return 'idle';
    if (['done', 'completed', 'success', 'succeeded'].includes(explicit) || /完成|已就绪|已生成|成功/.test(text)) return 'done';
    return 'idle';
  }
  const visualStatusKey=model=>[model?.resultSrc,model?.imageSrc,model?.mediaSrc,model?.videoSrc,model?.generationVideoSrc,model?.currentGenerationId,model?.imageJobState,model?.apiVideoTaskId,model?.productionError,model?.audioGeneration?.result?.url].map(v=>String(v||'')).join('\u001f');
  function resolveVisualStatus(model, kind, transient) {
    // Notes are editable paper, not jobs; neither registry defaults nor saved
    // generic statuses should add a generation-state label to their preview.
    if (kind === 'note') return { text: '', state: 'idle' };
    const explicit = model?.status && typeof model.status === 'object' ? model.status : null;
    let text = cleanVisualText(explicit?.text || model?.statusText || model?.nodeStatus || (typeof model?.status === 'string' ? model.status : ''));
    let state = explicit?.state || model?.statusState || '';
    const job = cleanVisualText(model?.imageJobState || model?.jobState || '').toLowerCase();
    if (!text && model?.productionError) { text = `失败：${cleanVisualText(model.productionError)}`; state = 'failed'; }
    if (!text && model?.apiVideoTaskId) { text = '生成中'; state = 'running'; }
    if (!text && ACTIVE_JOB_STATES.has(job)) { text = '生成中'; state = 'running'; }
    if (!text && FAILED_JOB_STATES.has(job)) { text = '生成失败'; state = 'failed'; }
    if (!text && DONE_JOB_STATES.has(job)) { text = '已完成'; state = 'done'; }
    if (!text && transient?.statusRevision===visualStatusKey(model)) {
      const saved=transient.statuses?.find(s=>!s.hidden&&['failed','running'].includes(statusState(s.text,s.state)));
      if(saved){text=saved.text;state=saved.state;}
    }
    if (!text && (model?.resultSrc || model?.generationVideoSrc || model?.imageSrc || model?.videoSrc || model?.audioSrc || model?.assetCollection?.members?.length || model?.result?.src)) { text = '已完成'; state = 'done'; }
    const defaults = root.AiOsCanvasNodeRegistry?.getDefaultStatusMap?.();
    text ||= defaults?.[kind] || VISUAL_DEFAULT_STATUS[kind] || '';
    return { text, state: statusState(text, state) };
  }
  function resolveVisualIdentity(model = {}, transient) {
    const kind = cleanVisualText(model.kind || 'image') || 'image';
    const single=model.kind==='asset-collection'&&model.assetCollection?.mode==='single'&&model.assetCollection.members?.length===1?model.assetCollection.members[0]:null;
    const comfyImageResult = kind === 'comfy' && Boolean(model.resultSrc || model.result?.src);
    const visualKind = single ? ({image:'upload',video:'asset-video',audio:'asset-audio'}[single.kind]||'asset-collection') : model.productionWorkflow ? 'script-generator' : comfyImageResult ? 'generator' : kind === 'image' ? (model.uploadOnly ? 'upload' : 'generator')
      : kind === 'gallery-container' ? 'gallery' : kind;
    const fallbackMeta = root.CanvasFloraNodeShell?.META?.[visualKind] || VISUAL_META_FALLBACK[visualKind] || { label: '节点', icon: 'box', tone: 'neutral' };
    const registeredMeta = root.AiOsCanvasNodeRegistry?.getNode?.(visualKind)?.meta;
    const meta = { ...fallbackMeta, ...(registeredMeta || {}) };
    const kindLabel = model.productionWorkflow ? '脚本生成' : cleanVisualText(model.kindLabel || fallbackMeta.label || meta.label || '节点') || '节点';
    const title = cleanVisualText(model.nodeTitle || single?.name || model.title || model.textName || model.imageName || model.mediaName || model.groupTitle || kindLabel) || '节点';
    const rawTag = model.tag && typeof model.tag === 'object'
      ? model.tag
      : root.FloraNodeTags?.resolve?.(String(model.nodeLabelId || ''));
    const tag = rawTag?.name ? {
      id: cleanVisualText(rawTag.id || model.nodeLabelId), name: cleanVisualText(rawTag.name),
      color: colorValue(rawTag.color) || '', foreground: colorValue(rawTag.foreground) || '',
    } : null;
    const groupColor = colorValue(model.groupColor || model.group?.color);
    const nodeColor = colorValue(model.nodeColor || model.noteColor || model.color);
    return {
      kind, kindLabel, icon: model.productionWorkflow
        ? (root.CanvasFloraNodeShell?.META?.llm?.icon || 'text')
        : visualKind === 'generator'
          ? (meta.icon || 'image')
          : cleanVisualText(model.icon || model.nodeIcon || meta.icon || 'box') || 'box',
      tone: meta.tone === 'accent' ? 'accent' : 'neutral', title, tag,
      status: resolveVisualStatus(model, visualKind, transient), groupColor, nodeColor,
    };
  }
  function renderVisualIcon(placeholder, name) {
    const lucide = root.lucide;
    if (!placeholder?.parentNode || !lucide?.createElement || !lucide.icons) return;
    const value = cleanVisualText(name) || 'box';
    const key = value.replace(/(^|[-_\s]+)(\w)/g, (_, separator, letter) => letter.toUpperCase());
    const definition = lucide.icons[key] || lucide.icons.Box;
    if (!definition) return;
    const [tag, defaults, children] = definition;
    const svg = lucide.createElement([tag, {
      ...defaults, 'aria-hidden': 'true', 'stroke-width': 1.8, 'data-lucide': value,
      class: `lucide lucide-${value}`,
    }, children]);
    placeholder.replaceWith(svg);
  }
  root.CanvasRepresentationVisualIdentity = resolveVisualIdentity;
  class CanvasRepresentationHost {
    constructor({store,rules,getState,getViewport,schedule,isInteracting,getExtraProtection=()=>new Map(),activate,getBounds,getGeometry}) {
      Object.assign(this,{store,rules,getState,getViewport,schedule,isInteracting,getExtraProtection,activate,getBounds,getGeometry});
      this.ui = new Map(); this.textScrolls = new Map(); this.tasks = new Map(); this.hoveredId = null; this.localScene = null;
      this.intents = new Map();
      this.pointerOwners = new Map();
      this.activeMedia = new Set(); this.activityHints = new Set();
      this.frames = {pan:[],zoom:[]}; this.browserMetrics = {styleRecalculation:null,layout:null,paint:null,longTasks:null};
      this.longTaskCount=0;this.longTaskSamples=[];this.sceneQueryCount=0;this.sceneCandidatesRead=0;
      if(root.PerformanceObserver)try{this.longTaskObserver=new PerformanceObserver(list=>{for(const entry of list.getEntries()){this.longTaskCount++;this.longTaskSamples.push({start:entry.startTime,ms:entry.duration});if(this.longTaskSamples.length>512)this.longTaskSamples.shift();}});this.longTaskObserver.observe({type:'longtask',buffered:false});}catch{}
      this.manager = new root.CanvasRepresentationManager({getFlags:()=>root.NeonCanvasPerformanceFlags||{},onSchedule:()=>this.schedule()});
      this.controller = new AbortController();
      const listen = (target,type,handler,options={}) => target?.addEventListener(type,handler,{...options,signal:this.controller.signal});
      const request = () => queueMicrotask(()=>this.schedule());
      listen(root,'canvas:selectionchange',request);
      for (const type of ['focusin','focusout','play','pause','ended','click','compositionend']) listen(root.document,type,request,{capture:true});
      for (const type of ['play','pause','ended','seeking','seeked']) listen(root.document,type,event=>{
        const media=event.target,node=media.closest?.('.canvas-node'),id=node?.dataset.id;if(!id)return;
        if([...node.querySelectorAll('video,audio')].some(item=>(!item.paused&&!item.ended)||item.seeking))this.activeMedia.add(id);else this.activeMedia.delete(id);
        this.schedule();
      },{capture:true});
      const plane=root.document.querySelector('#canvasPlane');
      if(plane&&root.MutationObserver){
        this.activityObserver=new MutationObserver(records=>{
          let changed=false;
          for(const record of records){const target=record.target,node=target.closest?.('.canvas-node'),id=node?.dataset.id;if(!id)continue;
            const value=target.getAttribute(record.attributeName);
            const active=record.attributeName==='data-image-job-state'?['queued','running','submitting','generating','task_pending','syncing'].includes(value):record.attributeName==='data-api-video-task-id'||record.attributeName==='data-flora-tool-panel'?Boolean(value):value==='true';
            if(active){this.activityHints.add(id);changed=true;}else if(this.activityHints.has(id)){this.activityHints.delete(id);changed=true;}
          }if(changed)this.schedule();
        });
        this.activityObserver.observe(plane,{subtree:true,attributes:true,attributeFilter:['aria-busy','aria-expanded','data-generating','data-image-job-state','data-api-video-task-id','data-flora-tool-panel']});
      }
      listen(root.document,'compositionstart',event=>{const node=event.target.closest?.('.canvas-node');if(node)node.dataset.representationComposing='true';},{capture:true});
      listen(root.document,'compositionend',event=>{const node=event.target.closest?.('.canvas-node');if(node)delete node.dataset.representationComposing;},{capture:true});
      listen(root.document,'pointermove',event=>{
        const state=this.getState(),connecting=Boolean(state.tempConnection||state.pendingConnection);
        if(event.buttons&&!connecting)return;
        // A port owns pointer capture during a wire drag; use the real point
        // owner for the target rather than the captured source event target.
        const target=connecting?root.document.elementFromPoint(event.clientX,event.clientY):event.target;
        const light=target?.closest?.('[data-canvas-light-id]');
        const full=target?.closest?.('.canvas-node');
        const viewport=event.target.closest?.('#infiniteCanvas');
        const rect=viewport?.getBoundingClientRect();
        const delta=value=>root.toSystemDelta?.(value)??value;
        const hit=rect&&event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom ? (root.hitTestCanvasScene?.(delta(event.clientX-rect.left),delta(event.clientY-rect.top))||root.canvasSceneLayer?.hitTest(delta(event.clientX-rect.left),delta(event.clientY-rect.top))):null;
        const activeIds=root.getCanvasInteractionIds?.()||new Set();
        const promoted=hit&&activeIds.has(String(hit.id))&&!activeIds.has(String(full?.dataset.id))?hit.id:null;
        const id=promoted||full?.dataset.id||light?.dataset.canvasLightId||hit?.id||root.FloraConnectionInteraction?.hoveredId?.()||null;
        if(id!==this.hoveredId){this.hoveredId=id;this.schedule();}
      },{passive:true});
      listen(root.document,'scroll',event=>{
        const text=event.target?.matches?.('.canvas-node-text .canvas-text')?event.target:null;
        const id=String(text?.closest?.('.canvas-node')?.dataset.id||'');
        if(!id)return;
        const top=Math.max(0,Number(text.scrollTop)||0);
        this.rememberTextScroll(id,top);
        this.store.getMounted(id)?.paintLightVisual?.();
        this.schedule();
      },{capture:true,passive:true});
      listen(root.document,'wheel',event=>{if(event.target.closest?.('#infiniteCanvas'))this.observeFrames('zoom');},{capture:true,passive:true});
      listen(root.document,'pointerdown',event=>{if(event.button===1&&event.target.closest?.('#infiniteCanvas')){this.panDown=true;this.observeFrames('pan');}},{capture:true,passive:true});
      listen(root,'pointerup',()=>{this.panDown=false;},{capture:true,passive:true});
      listen(root,'pointercancel',()=>{this.panDown=false;},{capture:true,passive:true});
      listen(root.document,'pointerdown',event=>{const node=event.target.closest?.('.canvas-node');if(event.button===0&&node){this.pointerOwners.set(event.pointerId,String(node.dataset.id));this.schedule();}},{capture:true,passive:true});
      for(const type of ['pointerup','pointercancel'])listen(root,type,event=>{if(this.pointerOwners.delete(event.pointerId))this.schedule();},{capture:true,passive:true});
    }
    enabled(){const f=root.NeonCanvasPerformanceFlags||{};return f.representationManager!==false&&f.detailHydration!==false&&f.detailCulling!==false;}
    rememberTextScroll(id,top){
      const key=String(id||''),value=Math.max(0,Number(top)||0);
      if(!key)return;
      if(!value){this.textScrolls.delete(key);return;}
      this.textScrolls.delete(key);this.textScrolls.set(key,value);
      while(this.textScrolls.size>5)this.textScrolls.delete(this.textScrolls.keys().next().value);
    }
    restoreTextScroll(node){
      const text=node?.querySelector?.('.canvas-text');
      if(!text)return;
      const top=Math.max(0,Number(this.textScrolls.get(String(node.dataset.id||''))||0));
      if(!top)return;
      const apply=()=>{
        if(!text.isConnected)return;
        const max=Math.max(0,text.scrollHeight-text.clientHeight);
        text.scrollTop=Math.min(top,max);
      };
      apply();
      root.requestAnimationFrame?.(apply);
    }
    legacyProtectedIds(){
      if(this.enabled())return [];
      const state=this.getState(),focused=root.document.activeElement?.closest?.('.canvas-node');
      if(!this.tasks.size&&!this.activeMedia.size&&!this.activityHints.size&&!this.pointerOwners.size&&!focused&&!state.pendingConnection&&!state.tempConnection&&!this.getExtraProtection().size)return [];
      return this.protection().keys();
    }
    releaseActivity(id){this.activeMedia.delete(String(id));this.activityHints.delete(String(id));}
    observeFrames(kind){
      this.frameDeadline=performance.now()+180;
      if(this.frameKind){if(kind==='zoom')this.frameKind=kind;return;}
      this.frameKind=kind;let previous=performance.now();
      const tick=now=>{
        const values=this.frames[this.frameKind];values.push(now-previous);if(values.length>512)values.shift();previous=now;
        if(this.panDown||now<this.frameDeadline)this.frameRequest=root.requestAnimationFrame(tick);
        else{this.frameKind=null;this.frameRequest=0;}
      };this.frameRequest=root.requestAnimationFrame(tick);
    }
    protection(){
      const state=this.getState(), reasons=new Map();
      const add=(id,reason)=>{if(id&&this.store.has(String(id))){const list=reasons.get(String(id))||[];if(!list.includes(reason))list.push(reason);reasons.set(String(id),list);}};
      this.textScrolls.forEach((top,id)=>{if(top>0&&this.store.get(id)?.kind==='text')add(id,'scrolled-text-viewport');});
      // Reuse the actual renderer's ports for one pointer owner only. This
      // doesn't select the node or promote the visible scene to Full.
      const hovered=this.store.get(String(this.hoveredId||''));
      if(hovered && hovered.kind!=='note' && !root.supportsCanvasMediaPortPreview?.(hovered) && !this.isInteracting()) add(this.hoveredId,'hover-ports');
      this.tasks.forEach((count,id)=>{if(count)add(id,'active-task-closure');});
      this.pointerOwners.forEach(id=>add(id,'active-pointer'));
      this.getExtraProtection().forEach((list,id)=>list.forEach(reason=>add(id,reason)));
      this.intents.forEach((intent,id)=>{
        const node=this.store.getMounted(id);
        const editEnded=intent==='editing'&&node?.classList.contains('canvas-node-text')&&node.dataset.textEditing!=='true'&&!node.contains(root.document.activeElement);
        if(state.selectedIds.has(id)){
          if(editEnded)this.intents.set(id,'explicit-open');
          add(id,editEnded?'explicit-open':intent);
        }else this.intents.delete(id);
      });
      // Keep the primary selected node's interactive shell mounted while the
      // pointer moves between its body, toolbar and parameter tray. Selection
      // is bounded to one active node here; bulk selection remains virtualized.
      const active=state.activeNode, activeId=String(active?.dataset?.id||'');
      if(activeId&&state.selectedIds.has(activeId))add(activeId,'active-selection-shell');
      this.store.mountedElements().forEach(node=>{
        if(node.dataset.virtualLevel==='light')return;
        const id=node.dataset.id;
        if(state.selectionDragging&&state.selectedIds.has(String(id)))add(id,'selection-drag');
        if(node.contains(root.document.activeElement))add(id,'focused');
        if(node.dataset.representationComposing==='true')add(id,'editing-composition');
        if(node.matches('.is-connecting,.is-resizing,.is-dragging'))add(id,'active-pointer');
        if(node.dataset.floraToolPanel||node.querySelector('dialog[open], [popover]:popover-open, [aria-haspopup][aria-expanded="true"], [role="combobox"][aria-expanded="true"], .flora-generation-history-panel:not([hidden])'))add(id,'menu-open');
        if(node.querySelector('[aria-busy="true"], .is-generating, .canvas-image-generating-overlay'))add(id,'active-task');
        if(node.dataset.generating==='true'||node.dataset.apiVideoTaskId)add(id,'active-task');
        if(['queued','running','submitting','generating','task_pending','syncing'].includes(node.dataset.imageJobState))add(id,'image-job');
        if(node.querySelector('.canvas-h3-run:disabled[aria-busy="true"],.canvas-llm-run:disabled[aria-busy="true"],.canvas-comfy-run:disabled[aria-busy="true"],.canvas-api-video-run:disabled[aria-busy="true"]'))add(id,'unsafe-run-button');
        if([...node.querySelectorAll('video,audio')].some(media=>(!media.paused&&!media.ended)||media.seeking))add(id,'playing');
        if(root.document.fullscreenElement&&node.contains(root.document.fullscreenElement))add(id,'fullscreen');
        if(root.CanvasScriptProduction?.isReserved?.(String(id)))add(id,'reserved-workflow');
      });
      const connecting=typeof state.pendingConnection==='string'?state.pendingConnection:state.pendingConnection?.fromId||state.pendingConnection?.nodeId;
      if(connecting)add(connecting,'connecting');
      if(state.pendingConnection||state.tempConnection)add(this.hoveredId,'connecting-target');
      return reasons;
    }
    plan({viewport}){
      if(!this.enabled())return this.manager.plan();
      const state=this.getState();
      this.store.mountedElements().forEach(node=>{
        if(node.dataset.virtualLevel==='light'){
          const selected=state.selectedIds.has(String(node.dataset.id));node.classList.toggle('is-selected',selected);
          node.dataset.visualState=selected?'selected':this.hoveredId===String(node.dataset.id)?'hover':'normal';
        }
      });
      const visibleRect=this.rules.getViewportCanvasRect(viewport,viewport,0);
      const visibleIds=this.store.query(visibleRect);
      const protectedReasons=this.protection(),visible=new Set(visibleIds.map(String));
      const interactionIds=root.getCanvasInteractionIds?.()||new Set();
      const parameters={visibleIds,viewport,store:this.store,protectedReasons,selectedIds:state.selectedIds,
        primaryId:state.activeNode?.dataset.id,hoveredId:this.hoveredId,interacting:this.isInteracting()};
      let desired=this.manager.plan(parameters);
      const overlapCache=new Map();
      const above=id=>{
        if(overlapCache.has(id))return overlapCache.get(id);
        const model=this.store.get(id);if(!model||!visible.has(id))return[];
        const rect=this.getBounds(model,this.store.getRect(id));
        const matches=this.store.query({...rect,top:rect.top-48,bottom:rect.bottom+48}).map(String).filter(other=>{
          if(other===id||!visible.has(other))return false;
          const next=this.store.get(other);if(!next)return false;
          // Interaction pixels have their own bounded raster above idle DOM.
          // They must not promote overlapping idle neighbors into Full.
          if(interactionIds.has(id)||interactionIds.has(other))return false;
          const higher=Number(next.kind!=='group')-Number(model.kind!=='group')||Number(next.zOrder||0)-Number(model.zOrder||0)||other.localeCompare(id);
          return higher>0&&this.rules.rectsIntersect(rect,this.getBounds(next,this.store.getRect(other)));
        });
        overlapCache.set(id,matches);return matches;
      };
      // A single raster lives below the DOM plane. Never let an idle Light
      // cover a higher scene row. Unsafe active overlap stacks retain detail
      // explicitly and report their budget exceptions instead of reordering.
      const queue=[...protectedReasons.keys()];let added=false;
      for(let index=0;index<queue.length;index++)for(const id of above(queue[index])){
        if(protectedReasons.has(id))continue;
        protectedReasons.set(id,['stacking-safety']);queue.push(id);added=true;
      }
      if(added)desired=this.manager.plan(parameters);
      let pruned;
      do{
        pruned=false;
        for(const [id,level]of desired){
          if(level==='full'&&protectedReasons.has(id))continue;
          if(!above(id).some(other=>!desired.has(other)))continue;
          desired.delete(id);this.manager.levels.set(id,'canvas-rich');this.manager.demoteAt.delete(id);pruned=true;
        }
      }while(pruned);
      root.syncCanvasHoverPortPreview?.(this.hoveredId);
      return desired;
    }
    capture(node){
      const fields=[...node.querySelectorAll('input,select,textarea,[contenteditable="true"]')];
      if(node.classList.contains('canvas-node-text')){
        const id=String(node.dataset.id||''),top=Math.max(0,Number(node.querySelector('.canvas-text')?.scrollTop)||0);
        this.rememberTextScroll(id,top);
      }
      const selection=root.getSelection?.();
      const path=target=>{const indexes=[];let current=target;while(current&&current!==node){const parent=current.parentNode;if(!parent)return null;indexes.unshift([...parent.childNodes].indexOf(current));current=parent;}return current===node?indexes:null;};
      const range=selection?.rangeCount&&node.contains(selection.anchorNode)&&node.contains(selection.focusNode)?selection.getRangeAt(0):null;
      this.ui.set(String(node.dataset.id),{
        fields:fields.map(el=>({value:el.value,checked:el.checked,start:el.selectionStart,end:el.selectionEnd,scrollTop:el.scrollTop,scrollLeft:el.scrollLeft})),
        scrolls:[...node.querySelectorAll('*')].map((el,index)=>el.scrollTop||el.scrollLeft?{index,top:el.scrollTop,left:el.scrollLeft}:null).filter(Boolean),
        focusedField:fields.indexOf(root.document.activeElement),
        range:range?{start:path(range.startContainer),startOffset:range.startOffset,end:path(range.endContainer),endOffset:range.endOffset}:null,
        expanded:Boolean(node.querySelector('dialog[open]')),menuOpen:Boolean(node.querySelector('[aria-expanded="true"], [popover]:popover-open')),
        media:[...node.querySelectorAll('video,audio')].map(media=>({tag:media.tagName,src:media.getAttribute('src'),time:media.currentTime,volume:media.volume,muted:media.muted,rate:media.playbackRate,paused:media.paused})),
        statusRevision:visualStatusKey(this.store.get(String(node.dataset.id))),
        statuses:[...node.querySelectorAll('.canvas-node-status,.canvas-h3-status,.canvas-api-video-status,.canvas-llm-status,.canvas-audio-generator-status,.canvas-comfy-status')].map(el=>({text:el.textContent,hidden:el.hidden,state:el.dataset.state||(el.classList.contains('is-error')?'failed':'')})),
      });
    }
    restore(node){
      const saved=this.ui.get(String(node.dataset.id));if(!saved)return;
      const fields=[...node.querySelectorAll('input,select,textarea,[contenteditable="true"]')];
      saved.fields.forEach((value,index)=>{const el=fields[index];if(!el)return;
        // Persisted model values are authoritative; transient UI restores only selection/scroll.
        if(typeof value.start==='number'&&typeof el.setSelectionRange==='function')try{el.setSelectionRange(value.start,value.end);}catch{}
        el.scrollTop=value.scrollTop;el.scrollLeft=value.scrollLeft;
      });
      const descendants=node.querySelectorAll('*');saved.scrolls.forEach(value=>{const el=descendants[value.index];if(el){el.scrollTop=value.top;el.scrollLeft=value.left;}});
      [...node.querySelectorAll('video,audio')].forEach((media,index)=>{
        const value=saved.media?.[index];if(!value||value.tag!==media.tagName||value.src!==media.getAttribute('src'))return;
        const apply=()=>{media.volume=value.volume;media.muted=value.muted;media.playbackRate=value.rate;try{if(Number.isFinite(value.time))media.currentTime=value.time;}catch{}if(value.paused===false)media.play?.().catch?.(()=>{});};
        apply();if(media.readyState<1)media.addEventListener('loadedmetadata',apply,{once:true});
      });
      if(saved.statusRevision===visualStatusKey(this.store.get(String(node.dataset.id))))[...node.querySelectorAll('.canvas-node-status,.canvas-h3-status,.canvas-api-video-status,.canvas-llm-status,.canvas-audio-generator-status,.canvas-comfy-status')].forEach((el,index)=>{const value=saved.statuses?.[index];if(value){el.textContent=value.text;el.hidden=value.hidden;if(value.state)el.dataset.state=value.state;el.classList.toggle('is-error',value.state==='failed');}});
      if(saved.range&&(!root.document.activeElement||root.document.activeElement===root.document.body||node.contains(root.document.activeElement))){
        const find=path=>path?.reduce((current,index)=>current?.childNodes[index],node);
        try{const start=find(saved.range.start),end=find(saved.range.end);if(start&&end){const range=root.document.createRange();range.setStart(start,saved.range.startOffset);range.setEnd(end,saved.range.endOffset);const selection=root.getSelection();selection.removeAllRanges();selection.addRange(range);}}catch{}
      }
      this.ui.delete(String(node.dataset.id));
    }
    createLight(model){
      const visual=resolveVisualIdentity(model,this.ui.get(String(model.id)));
      const geometry=this.getGeometry?.(model);
      const bounds=geometry?.outerBounds||this.getBounds(model,this.store.getRect(String(model.id)));
      const header=geometry?.headerBounds||{left:bounds.left,top:bounds.top-48,right:bounds.right,bottom:bounds.top};
      const state=this.getState();
      const visualState=state.selectedIds.has(String(model.id))?'selected':this.hoveredId===String(model.id)?'hover':'normal';
      const node=root.document.createElement('article');node.className='canvas-light-node';
      node.dataset.id=String(model.id);node.dataset.canvasLightId=String(model.id);node.dataset.virtualLevel='light';
      node.dataset.x=String(model.x||0);node.dataset.y=String(model.y||0);node.dataset.zOrder=String(model.zOrder||0);
      node.dataset.visualState=visualState;
      node.dataset.hasBodySurface=String(Boolean(geometry?.bodySurface));
      node.dataset.hasTag=String(Boolean(visual.tag));
      node.classList.toggle('is-selected',visualState==='selected');
      node.dataset.canvasVisualKind=visual.kind;node.dataset.canvasVisualIcon=visual.icon;node.dataset.canvasVisualStatus=visual.status.state;
      node.setAttribute('aria-label',visual.title);
      const rootTop=bounds.top;
      node.style.cssText=`position:absolute;transform:translate(${bounds.left}px,${rootTop}px);width:${bounds.right-bounds.left}px;height:${bounds.bottom-rootTop}px`;
      node.style.setProperty('--canvas-light-color',visual.nodeColor||visual.groupColor||'var(--canvas-neon-muted)');
      if(model.kind==='note') node.style.setProperty('--canvas-note-paper',root.CanvasNodeVisuals?.project(model).paperColor||'#e6d990');
      if(model.kind==='group') node.style.setProperty('--canvas-group-tint',visual.groupColor||'transparent');
      node.style.setProperty('--canvas-light-tag-color',visual.tag?.color||'var(--canvas-neon-muted)');
      node.style.setProperty('--canvas-light-tag-foreground',visual.tag?.foreground||'var(--canvas-neon-text)');
      node.style.setProperty('--canvas-light-header-height',`${Math.max(0,header.bottom-header.top)}px`);
      node.style.setProperty('--canvas-light-body-top','0px');
      node.style.setProperty('--canvas-light-radius',`${geometry?.borderRadius||16}px`);
      const identity=root.document.createElement('span');identity.className='canvas-light-identity flora-node-label';
      const icon=root.document.createElement('span');icon.className='canvas-light-icon';icon.setAttribute('aria-hidden','true');
      const glyph=root.document.createElement('i');glyph.setAttribute('data-lucide',visual.icon);icon.append(glyph);identity.append(icon);
      renderVisualIcon(glyph,visual.icon);
      const title=root.document.createElement('span');title.className='canvas-light-title';title.textContent=visual.title;
      const kind=root.document.createElement('span');kind.className='canvas-light-kind';kind.hidden=true;kind.textContent=visual.kindLabel;
      identity.append(title,kind);
      node.append(identity);
      if(model.kind==='group'){
        title.textContent=model.groupTitle||visual.title;
        const count=root.document.createElement('span');count.className='canvas-light-group-count';count.textContent=`${model.groupMembers?.length||0} 个节点`;node.append(count);
      }
      if(visual.tag){const tag=root.document.createElement('span');tag.className='canvas-light-tag flora-node-tag';const dot=root.document.createElement('span');dot.className='canvas-light-tag-dot';dot.setAttribute('aria-hidden','true');tag.append(dot,root.document.createTextNode(visual.tag.name));node.append(tag);}
      const content=root.CanvasNodeVisuals?.project(model);
      if(content&&geometry){
        const canvas=root.document.createElement('canvas');canvas.className='canvas-light-visual';canvas.dataset.visualRenderer=content.renderer;
        const width=bounds.right-bounds.left,height=bounds.bottom-bounds.top;
        canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${visual.kindLabel}：${content.body||content.summary||visual.status.text}`);
        const ctx=canvas.getContext('2d');let rasterReady=false;
        const style=root.getComputedStyle(root.document.querySelector('#canvasEditorScreen'));
        const theme=Object.fromEntries(['card','text','muted','border','primary'].map(key=>[key,style.getPropertyValue(`--canvas-neon-${key}`).trim()]));
        node.paintLightVisual=()=>{
          const current=this.store.get(String(model.id));if(!current||!node.isConnected)return;
          // CSS/model geometry stays fixed. Rasterize for screen pixels only after
          // gestures settle; half-step buckets avoid reallocating on every zoom.
          if(!rasterReady||!this.isInteracting?.()){
            const viewport=root.document.querySelector('#infiniteCanvas');
            const displayUnit=viewport?viewport.getBoundingClientRect().width/Math.max(1,viewport.clientWidth):1;
            const demand=(this.getViewport().scale||1)*(root.devicePixelRatio||1)*displayUnit;
            const requested=this.isInteracting?.()?Math.min(2,root.devicePixelRatio||1):Math.max(1,Math.ceil(demand*2)/2);
            // At most 4M pixels / 4096px per Light, independently of total nodes.
            const ratio=Math.min(requested,4096/Math.max(1,width),4096/Math.max(1,height),Math.sqrt(4*1024*1024/Math.max(1,width*height)));
            const pixelsWide=Math.max(1,Math.ceil(width*ratio)),pixelsHigh=Math.max(1,Math.ceil(height*ratio));
            if(canvas.width!==pixelsWide||canvas.height!==pixelsHigh){canvas.width=pixelsWide;canvas.height=pixelsHigh;}
            ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);rasterReady=true;
          }
          const next=resolveVisualIdentity(current,this.ui.get(String(model.id)));
          const nextTitle=current.kind==='group'?current.groupTitle||next.title:next.title;
          if(title.textContent!==nextTitle){title.textContent=nextTitle;node.setAttribute('aria-label',nextTitle);}
          if(current.kind==='group'){const count=node.querySelector('.canvas-light-group-count');if(count)count.textContent=`${current.groupMembers?.length||0} 个节点`;}
          if(status.textContent!==next.status.text)status.textContent=next.status.text;
          if(status.dataset.state!==next.status.state)status.dataset.state=next.status.state;
          const quiet=['group','note'].includes(current.kind)||!['running','failed'].includes(next.status.state)&&['image','text','llm','minimax-h3','video-api','audio-generator','midjourney','comfy','asset-collection','video','audio','asset-video','asset-audio','video-output'].includes(current.kind);
          if(status.hidden!==quiet)status.hidden=quiet;
          const nextGeometry=this.getGeometry(current);ctx.clearRect(0,0,width,height);
          // The raster is local to the Light node; its world origin changes
          // during a drag even though the backing dimensions stay the same.
          const nextBounds=nextGeometry?.outerBounds||bounds;
          root.CanvasNodeVisuals.paint(ctx,root.CanvasNodeVisuals.project(current),nextGeometry,{x:-nextBounds.left,y:-nextBounds.top,scale:1},{theme,node:current,textScrollTop:current.kind==='text'?(this.textScrolls.get(String(model.id))||0):0,resolveTexture:root.resolveCanvasSceneTexture,cachedOnly:false});
        };
        node.append(canvas);
      }
      const status=root.document.createElement('span');status.className='canvas-light-status';status.dataset.state=visual.status.state;status.setAttribute('aria-label',visual.status.text);status.title=visual.status.text;status.textContent=visual.status.text;
      status.hidden=['group','note'].includes(model.kind)||!['running','failed'].includes(visual.status.state)&&['image','text','llm','minimax-h3','video-api','audio-generator','midjourney','comfy','asset-collection','video','audio','asset-video','asset-audio','video-output'].includes(model.kind);
      node.append(status);
      root.document.querySelector('#canvasPlane')?.append(node);
      node.paintLightVisual?.();
      return node;
    }
    resolveNodeVisualGeometry(nodeId){return this.getGeometry?.(String(nodeId))||null;}
    transition(kind,started){this.manager.recordTransition(kind,performance.now()-started);}
    level(id){return this.store.getMountedLevel(String(id))||this.manager.levels.get(String(id))||'canvas';}
    scenePage(refresh=false){
      if(!this.enabled())return this.store.scenePage;
      if(!refresh&&this.localScene)return this.localScene;
      const viewport=this.getViewport(), rect=this.rules.getViewportCanvasRect(viewport,viewport,640);
      this.sceneQueryCount++;
      const server=this.store.scenePage?.mode==='scene'?this.store.scenePage:null;
      const rows=new Map((server?.visualNodes||[]).map(row=>[String(Array.isArray(row)?row[0]:row.id),row]));
      const candidates=this.store.query(rect);this.sceneCandidatesRead+=candidates.length;
      candidates.forEach(id=>{
        const model=this.store.get(id);if(!model)return;
        const visual=resolveVisualIdentity(model,this.ui.get(String(id)));
        const bounds=this.store.getRect(id);
        const selected= this.getState().selectedIds.has(String(id));
        const connecting=Boolean(this.getState().pendingConnection||this.getState().tempConnection);
        const focused=root.document.activeElement?.closest?.('.canvas-node')?.dataset.id===String(id);
        const visualState=selected?'selected':focused?'focused':connecting&&this.hoveredId===String(id)?'connecting':this.hoveredId===String(id)?'hover':'normal';
        const geometry=this.getGeometry?.(id);
        rows.set(String(id),{...model,x:bounds?.left??model.x,y:bounds?.top??model.y,
          width:bounds?bounds.right-bounds.left:model.width,height:bounds?bounds.bottom-bounds.top:model.height,
          visualGeometry:geometry,visualState,visualContent:root.CanvasNodeVisuals?.project(model),
          previewSource:model.resultSrc||model.imageSrc||model.previewSource||'',
          title:visual.title,kindLabel:visual.kindLabel,icon:visual.icon,tone:visual.tone,tag:visual.tag,status:visual.status,
          groupColor:visual.groupColor,nodeColor:visual.nodeColor,nodeLabelId:model.nodeLabelId||'',
          representation:this.manager.levels.get(String(id))||'canvas-rich'});
      });
      this.localScene={...server,mode:'scene',visualNodes:[...rows.values()],texturedNodeIds:[...rows.keys()].slice(0,256),localRepresentation:true};
      return this.localScene;
    }
    async runTask(node,operation){
      const id=String(node?.dataset?.id||'');if(!id)return operation();
      this.tasks.set(id,(this.tasks.get(id)||0)+1);this.schedule();
      try{return await operation();}finally{const count=(this.tasks.get(id)||1)-1;if(count)this.tasks.set(id,count);else this.tasks.delete(id);this.schedule();}
    }
    snapshot(){
      const viewport=this.getViewport(),rect=this.rules.getViewportCanvasRect(viewport,viewport,0),visible=this.store.query(rect);
      const elements=this.store.mountedElements(),full=elements.filter(el=>el.dataset.virtualLevel!=='light'),light=elements.filter(el=>el.dataset.virtualLevel==='light');
      const mounted=new Set(elements.map(el=>String(el.dataset.id))), metrics=this.manager.snapshot();
      return {...metrics,totalNodes:this.store.size,visibleNodes:visible.length,residentNodes:this.store.size,
        fullDetailNodes:full.length,lightNodes:light.length,canvasNodes:visible.filter(id=>!mounted.has(String(id))).length,
        documentDOMCount:root.document.querySelectorAll('*').length,canvasDOMCount:root.document.querySelectorAll('#infiniteCanvas *').length,
        nodePlaneDOMCount:root.document.querySelectorAll('#canvasPlane *').length,
        DOMElementsPerFullNode:full.length?full.reduce((n,el)=>n+el.querySelectorAll('*').length+1,0)/full.length:0,
        lightDOMCounts:light.map(el=>el.querySelectorAll('*').length+1),protection:Object.fromEntries(this.protection()),
        panP50:quantile(this.frames.pan,.5),panP95:quantile(this.frames.pan,.95),zoomP50:quantile(this.frames.zoom,.5),zoomP95:quantile(this.frames.zoom,.95),
        ...this.browserMetrics,longTasks:this.browserMetrics.longTasks??this.longTaskCount,pageLongTaskCount:this.longTaskCount,
        metricSource:'frame intervals in page; Style/Layout/Paint supplied by external browser trace',
        sceneCandidateQueries:this.sceneQueryCount,sceneCandidatesRead:this.sceneCandidatesRead,
        sceneSprites:root.canvasSceneLayer?.spriteCount||0,uiCacheSize:this.ui.size,taskClosures:this.tasks.size,enabled:this.enabled()};
    }
    reset(){this.manager.reset();this.ui.clear();this.textScrolls.clear();this.intents.clear();this.pointerOwners.clear();this.activeMedia.clear();this.activityHints.clear();this.hoveredId=null;this.localScene=null;root.CanvasNodeVisuals?.clear();}
    destroy(){this.controller.abort();this.activityObserver?.disconnect();this.longTaskObserver?.disconnect();if(this.frameRequest)root.cancelAnimationFrame(this.frameRequest);this.reset();}
  }
  root.CanvasRepresentationHost=CanvasRepresentationHost;
})(window);
