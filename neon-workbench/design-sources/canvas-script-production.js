/* Script production owns content preparation; media runs remain explicit node runs.
 * Appended to the canonical classic canvas script by deploy.mjs, sharing its
 * storage, virtualisation, references and existing generation engines. */
(function installScriptProduction() {
  'use strict';
  let panel = null, scope = null, catalog = null;
  let mutation = Promise.resolve();
  const running = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const parse = (value, fallback) => { try { return JSON.parse(value || ''); } catch { return fallback; } };
  const empty = () => ({ version: 1, title: '脚本制作', source: '', settings: { textModel: '', imageModel: '', videoModel: '', ratio: '16:9', style: '', targetDuration: 60, characterLayout: 'four-views' }, shots: [], assets: [], storyboards: [], videos: [], warnings: [] });
  const metadata = ['productionOwner', 'productionEntity', 'productionStage', 'productionReferences', 'productionGroupType', 'productionDefaultModel', 'productionError'];
  function serialize(node, base) {
    if (node.dataset.productionWorkflow) base.productionWorkflow = parse(node.dataset.productionWorkflow, empty());
    for (const key of metadata) if (node.dataset[key]) base[key] = node.dataset[key];
  }
  function hydrate(node, item) {
    if (item.productionWorkflow) node.dataset.productionWorkflow = JSON.stringify(item.productionWorkflow);
    for (const key of metadata) if (item[key]) node.dataset[key] = String(item[key]);
  }
  function workflow(node) {
    const data = parse(node.dataset.productionWorkflow, empty());
    data.source = node.querySelector('.canvas-llm-prompt')?.value ?? node.dataset.llmPrompt ?? data.source;
    data.settings.textModel = node.querySelector('.canvas-llm-model')?.value || node.dataset.llmModel || data.settings.textModel;
    return data;
  }
  function decorate(node) {
    node.classList.add('canvas-node-script-production');
    const data = workflow(node);
    node.dataset.nodeTitle = data.title === '脚本制作' ? '脚本生成' : data.title;
    const prompt = node.querySelector('.canvas-llm-prompt');
    if (prompt) { prompt.placeholder = '粘贴剧本或故事想法，发送后整理分镜与资产提示词…'; prompt.setAttribute('aria-label', '剧本内容'); }
    const run = node.querySelector('.canvas-llm-run');
    if (run) { run.title = '分析剧本并准备资产节点'; run.setAttribute('aria-label', '生成脚本分镜'); }
    let preview = node.querySelector('.canvas-script-preview');
    if (!preview) {
      preview = document.createElement('div'); preview.className = 'canvas-node-result canvas-script-preview';
      const heading = document.createElement('strong');
      const summary = document.createElement('p');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'text-action'; button.textContent = '打开制作工作台';
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', event => { event.stopPropagation(); void open(node).catch(error => setCanvasNodeStatus(node, error.message)); });
      preview.append(heading, summary, button);
      const result = node.querySelector('.flora-node-result-area');
      if (result) result.append(preview); else node.append(preview);
    }
    preview.querySelector('strong').textContent = data.title;
    preview.querySelector('p').textContent = data.shots.length ? `${data.shots.length} 镜 · ${data.assets.filter(a => a.type === 'character').length} 人物 · ${data.assets.filter(a => a.type === 'scene').length} 场景 · ${data.assets.filter(a => a.type === 'prop').length} 道具` : '脚本 → 资产 → 合成故事板 → 视频生成';
    window.CanvasFloraNodeShell?.syncLabel(node);
  }
  function add(point) {
    if (!window.CanvasFeatureRegistry?.hasNode('script-production')) throw new Error('本版本暂未开放脚本节点创建。');
    const node = createCanvasNode('llm'); node.dataset.productionWorkflow = JSON.stringify(empty());
    node.dataset.nodeTitle = '脚本生成';
    if (point) setCanvasNodePoint(node, point);
    renderCanvasLlmNode(node); decorate(node); applyCanvasNodeSize(node); placeCanvasNode(node); scheduleCanvasSave(); return node;
  }
  async function json(path, options) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 401 ? '登录已过期，请重新登录。' : response.status === 403 ? '当前账户没有编辑此画布的权限。' : typeof data.error === 'string' && /[\u4e00-\u9fff]/.test(data.error) ? data.error : `制作数据读取失败（${response.status}），请检查服务后重试。`);
    return data;
  }
  function assertScope(current = scope) {
    if (!current || String(canvasState.activeBoardId) !== current.boardId) throw new Error('画布已切换，请重新打开脚本节点。');
    const node = getCanvasNode(current.nodeId);
    if (!node?.dataset.productionWorkflow || node.dataset.boardId !== current.boardId) throw new Error('脚本节点已删除或不属于当前画布。');
    return node;
  }
  async function permission(boardId) {
    const data = await json(CANVAS_BOARDS_API_URL);
    const board = (data.boards || []).find(item => String(item.id) === boardId);
    if (!board) throw new Error('当前账户无法访问此画布，请返回后重新打开。');
    return board.isOwner === true || ['owner', 'edit'].includes(board.permission);
  }
  async function models() {
    const result = await Promise.all([json(CHAT_MODELS_API_URL), json(IMAGE_MODELS_API_URL), json(VIDEO_MODELS_API_URL)]);
    catalog = { text: normalizePublicModelCatalog(result[0].models), image: normalizePublicModelCatalog(result[1].models).map(model => ({ ...model, resolutions: getAllowedImageResolutionLevels(model.id).map(String) })), video: normalizePublicModelCatalog(result[2].models).map(model => {
      const range = result[2].durations?.[model.id];
      const durations = range && Number.isFinite(range.min) && Number.isFinite(range.max) ? Array.from({ length: Math.min(120, Math.floor(range.max - range.min) + 1) }, (_, index) => range.min + index) : [];
      return { ...model, referenceModes: ['first-frame'], ratios: result[2].ratios?.[model.id] || [], resolutions: result[2].resolutions?.[model.id] || [], durations };
    }) };
    // The current API video adapter sends its first image as a first frame.
    // Do not advertise multi-reference or first/last modes it cannot deliver.
    return catalog;
  }
  async function owned(id, owner, required = true) {
    if (!id) return null;
    let node = ensureCanvasNodeMounted(id);
    if (!node && !canvasPagedStore.deletedNodeIds.has(String(id))) {
      try {
        const model = await loadCanvasSceneNode(id);
        canvasVirtualStore.upsert(model);
        node = ensureCanvasNodeMounted(id);
      } catch (error) { if (required) throw error; }
    }
    if (!node) { if (required) throw new Error('关联节点已删除，请重新准备该步骤。'); return null; }
    if (node.dataset.boardId !== String(canvasState.activeBoardId) || node.dataset.productionOwner !== owner) throw new Error('关联节点不属于此制作流程，已阻止操作。');
    return node;
  }
  function nodeState(node) {
    const output = getCanvasNodeOutput(node);
    const text = String(node.dataset.productionError || getCanvasNodeStatusElement(node)?.textContent || '');
    const busy = running.has(node.dataset.id) || CANVAS_IMAGE_JOB_ACTIVE_STATES.has(node.dataset.imageJobState) || Boolean(node.dataset.apiVideoTaskId);
    const src = ['image', 'video'].includes(output?.type) ? output.url || '' : '';
    return { id: node.dataset.id, prompt: node.querySelector('.canvas-api-video-prompt-input, .canvas-node-prompt')?.value || node.dataset.apiVideoPrompt || '', model: node.querySelector('.canvas-api-video-model, .canvas-node-model')?.value || '', src, status: busy ? 'running' : /失败|错误/.test(text) ? 'failed' : src ? 'completed' : 'idle', error: /失败|错误/.test(text) ? text : '' };
  }
  async function snapshot() {
    const node = assertScope(), data = clone(workflow(node)), nodes = {};
    for (const item of [...data.assets, ...data.storyboards, ...data.videos]) {
      if (!item.nodeId || canvasPagedStore.deletedNodeIds.has(item.nodeId)) continue;
      const target = getCanvasNode(item.nodeId);
      let model = target ? null : canvasVirtualStore.get(item.nodeId);
      if (!target && !model) { try { model = await loadCanvasSceneNode(item.nodeId); canvasVirtualStore.upsert(model); } catch { continue; } }
      if ((target?.dataset.productionOwner || model?.productionOwner) !== node.dataset.id) throw new Error('关联节点不属于此制作流程，已阻止读取。');
      const output = model ? getCanvasVirtualNodeOutput(model) : null;
      const busy = model && (running.has(item.nodeId) || CANVAS_IMAGE_JOB_ACTIVE_STATES.has(model.imageJobState) || model.apiVideoTaskId);
      const src = ['image', 'video'].includes(output?.type) ? output.url || '' : '';
      // Reading progress must not mount off-screen nodes, resume their jobs or
      // mutate their result history during a running batch.
      const value = target ? nodeState(target) : { id: item.nodeId, prompt: model.prompt || model.apiVideoPrompt || '', model: model.model || model.apiVideoModel || '', src, status: busy ? 'running' : model.productionError ? 'failed' : src ? 'completed' : 'idle', error: model.productionError || '' };
      nodes[item.nodeId] = value;
      if (value.prompt !== item.prompt && !data.assets.includes(item)) item.manualPrompt = true;
      item.prompt = value.prompt;
      if (Object.hasOwn(item, 'selectedSrc')) item.selectedSrc = value.src;
    }
    return { workflow: data, nodes, models: catalog || await models(), readOnly: scope.readOnly };
  }
  async function persist() {
    await saveCanvasBoardNow();
    if (canvasPagedStore.getPendingOperations().length || canvasState.hasUnsavedChanges) throw new Error('制作数据尚未保存成功，输入已保留，请重试。');
  }
  async function open(node, { analyze = false } = {}) {
    if (panel) { panel.focus(); return; }
    ensureCanvasBoardIdentity(); pinCanvasNode(node.dataset.id);
    await persist();
    const boardId = String(canvasState.activeBoardId);
    const readOnly = !(await permission(boardId));
    scope = { boardId, nodeId: node.dataset.id, readOnly }; catalog = null;
    await models();
    panel = document.createElement('iframe'); panel.id = 'neonScriptProductionFrame'; panel.title = '脚本制作工作台';
    panel.src = `./neon-workbench.html?workspace=script&boardId=${encodeURIComponent(boardId)}&nodeId=${encodeURIComponent(node.dataset.id)}${analyze && !readOnly ? '&analyze=1' : ''}`;
    panel.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483100;background:var(--background)';
    document.body.append(panel); panel.focus();
  }
  function close() { panel?.remove(); panel = null; if (scope) unpinCanvasNode(scope.nodeId); scope = null; document.querySelector('#infiniteCanvas')?.focus(); }
  function validate(data) {
    if (!data || data.version !== 1 || typeof data.source !== 'string' || !data.settings || typeof data.title !== 'string') throw new Error('制作数据格式无效，请重新打开工作台。');
    const seen = new Set();
    for (const field of ['assets', 'shots', 'storyboards', 'videos']) {
      if (!Array.isArray(data[field]) || data[field].length > 300) throw new Error('制作条目数量或格式无效。');
      for (const item of data[field]) {
        if (!item || !/^[\w-]{1,120}$/.test(item.id) || seen.has(item.id)) throw new Error('制作条目身份重复或无效。');
        seen.add(item.id);
        if (field !== 'shots' && typeof item.prompt !== 'string') throw new Error('生成提示词格式无效。');
      }
    }
    const assets = new Set(data.assets.map(a => a.id)), shots = new Set(data.shots.map(a => a.id)), boards = new Set(data.storyboards.map(a => a.id));
    if (data.assets.some(a => !['character', 'scene', 'prop'].includes(a.type)) || data.shots.some(s => !Array.isArray(s.assetIds) || s.assetIds.some(id => !assets.has(id))) || data.storyboards.some(s => !Array.isArray(s.shotIds) || s.shotIds.some(id => !shots.has(id)) || !Array.isArray(s.assetIds) || s.assetIds.some(id => !assets.has(id))) || data.videos.some(v => !boards.has(v.storyboardId) || !Array.isArray(v.shotIds) || v.shotIds.some(id => !shots.has(id)))) throw new Error('分镜或资产引用无法解析，请修正后保存。');
    if (JSON.stringify(data).length > 3000000) throw new Error('剧本数据过大，请分段制作。');
    return clone(data);
  }
  function mark(node, owner, entity, stage) { node.dataset.productionOwner = owner; node.dataset.productionEntity = entity; node.dataset.productionStage = stage; }
  function sourceLink(from, to) {
    if (canvasState.connections.some(c => c.from === from && c.to === to && c.productionSource)) return;
    canvasState.connections.push(normalizeVisibleCanvasConnection({ from, to, fromPort: 'output', toPort: 'input', productionSource: true }));
  }
  function applyPrompt(node, prompt) {
    const input = node.querySelector('.canvas-api-video-prompt-input, .canvas-node-prompt');
    if (input && input.value !== prompt) { input.value = prompt; input.dispatchEvent(new Event('input', { bubbles: true })); }
    if (node.classList.contains('canvas-node-video-api')) node.dataset.apiVideoPrompt = prompt;
    window.FloraGeneratorComposer?.sync(node);
  }
  function characterPrompt(item, settings) {
    const stripped = item.prompt.replace(/^【角色(?:四视图|人设图)】[^\n]*\n/, '');
    if (item.type !== 'character') return stripped;
    return (item.layout || settings.characterLayout) === 'character-sheet' ? `【角色人设图】展示全身、服装、配饰和细节，人物身份保持一致。\n${stripped}` : `【角色四视图】同一人物的正面、侧面、背面、脸部特写，统一外观与服装。\n${stripped}`;
  }
  async function save(data, prepareStage) {
    const owner = assertScope(), ownerId = owner.dataset.id, next = validate(data);
    const previous = workflow(owner);
    // UI never chooses node ownership; preserve host-assigned IDs for known entities.
    for (const field of ['assets', 'storyboards', 'videos']) for (const item of next[field]) {
      const old = previous[field].find(value => value.id === item.id);
      item.nodeId = old?.nodeId;
      const target = await owned(item.nodeId, ownerId, false);
      if (item.nodeId && !target) delete item.nodeId;
      if (target && running.has(target.dataset.id)) throw new Error('该节点正在生成，请完成后再修改提示词或引用。');
      if (field === 'assets' && item.manualSelectedSrc !== true) {
        const currentSource = target ? nodeState(target).src : old?.selectedSrc;
        if (currentSource) item.selectedSrc = currentSource;
        else delete item.selectedSrc;
      }
      if (target) {
        if (field === 'assets') item.prompt = characterPrompt(item, next.settings);
        if (field === 'assets') { target.dataset.nodeTitle = item.name; window.CanvasFloraNodeShell?.syncLabel(target); }
        applyPrompt(target, item.prompt);
        const currentModel = nodeState(target).model;
        const priorModel = field === 'videos' ? previous.settings.videoModel : previous.settings.imageModel;
        const newModel = field === 'videos' ? next.settings.videoModel : next.settings.imageModel;
        const inheritsModel = !currentModel || currentModel === priorModel || currentModel === target.dataset.productionDefaultModel;
        if (field !== 'videos') {
          if (newModel && inheritsModel) { target.dataset.modelSelection = 'exact'; const control = target.querySelector('.canvas-node-model'); if (control) control.dataset.modelSelection = 'exact'; }
          applyAgentCanvasNodeChanges(target, { ...(newModel && inheritsModel ? { model: newModel } : {}), ...(next.settings.ratio !== previous.settings.ratio || (newModel && inheritsModel) ? { size: normalizeImageSizeChoiceForModel(next.settings.ratio, newModel && inheritsModel ? newModel : currentModel) } : {}), ...(next.settings.resolution && next.settings.resolution !== previous.settings.resolution ? { resolution: next.settings.resolution } : {}) });
          if (newModel && inheritsModel) target.dataset.productionDefaultModel = newModel;
        } else {
          const control = target.querySelector('.canvas-api-video-model');
          if (control && newModel && inheritsModel) { fillCanvasApiVideoModelSelect(control, newModel); control.value = newModel; target.dataset.apiVideoModel = newModel; target.dataset.productionDefaultModel = newModel; }
          if (item.duration) target.dataset.apiVideoDuration = String(item.duration);
          if (next.settings.videoResolution) target.dataset.apiVideoResolution = next.settings.videoResolution;
          target.dataset.apiVideoRatio = next.settings.ratio; syncCanvasApiVideoControls(target);
        }
        if (field === 'assets' && item.manualSelectedSrc === true && item.selectedSrc && item.selectedSrc !== nodeState(target).src) {
          const url = new URL(item.selectedSrc, location.origin);
          if (url.origin !== location.origin || !/^\/(?:uploads|output|api\/assets)\//.test(url.pathname)) throw new Error('请选择已上传或已生成的图片。');
          updateCanvasGenerationResult(target, { src: item.selectedSrc, savedUrl: item.selectedSrc });
          window.FloraGenerationHistory?.add(target, { id: createId(), kind: 'image', src: item.selectedSrc, savedUrl: item.selectedSrc, prompt: item.prompt, createdAt: new Date().toISOString() });
          refreshCanvasConnectedNodes(target.dataset.id);
        }
        if (field === 'assets') await assetReferences(owner, item, target);
      }
      if (field === 'assets') delete item.manualSelectedSrc;
    }
    if (prepareStage === 'assets') await prepareAssets(owner, next);
    if (prepareStage === 'storyboards') await prepareStoryboards(owner, next);
    if (prepareStage === 'videos') await prepareVideos(owner, next);
    else if (!prepareStage && next.videos.some(item => item.nodeId)) await prepareVideos(owner, next, true);
    owner.dataset.productionWorkflow = JSON.stringify(next);
    owner.dataset.llmPrompt = next.source; owner.dataset.llmModel = next.settings.textModel || '';
    const prompt = owner.querySelector('.canvas-llm-prompt'); if (prompt) prompt.value = next.source;
    const model = owner.querySelector('.canvas-llm-model'); if (model && next.settings.textModel) { fillCanvasLlmModelSelect(model, next.settings.textModel); model.value = next.settings.textModel; }
    decorate(owner); syncCanvasNodeModel(owner); renderCanvasConnections(); scheduleCanvasSave(); await persist();
  }
  function configureImage(node, settings, fresh) {
    if (settings.imageModel && (fresh || !node.querySelector('.canvas-node-model')?.value)) { node.dataset.modelSelection = 'exact'; const control = node.querySelector('.canvas-node-model'); if (control) control.dataset.modelSelection = 'exact'; }
    if (fresh || !node.querySelector('.canvas-node-model')?.value) applyAgentCanvasNodeChanges(node, { model: settings.imageModel, size: normalizeImageSizeChoiceForModel(settings.ratio, settings.imageModel || nodeState(node).model), resolution: settings.resolution || '1' });
    if (fresh) node.dataset.productionDefaultModel = nodeState(node).model;
  }
  async function imageItem(owner, item, stage, settings, point) {
    let target = await owned(item.nodeId, owner.dataset.id, false);
    const fresh = !target;
    if (!target) { target = addCanvasApiNode(point, { name: item.name || (stage === 'storyboards' ? '分镜故事板' : '资产'), prompt: item.prompt }); mark(target, owner.dataset.id, item.id, stage); item.nodeId = target.dataset.id; }
    target.dataset.nodeTitle = item.name || '分镜故事板'; window.CanvasFloraNodeShell?.syncLabel(target);
    configureImage(target, settings, fresh); applyPrompt(target, item.prompt); return target;
  }
  async function group(owner, data, type, items, x) {
    data.groups ||= {};
    let target = await owned(data.groups[type], owner.dataset.id, false);
    if (!target) {
      target = createCanvasNode('group'); mark(target, owner.dataset.id, `group-${type}`, 'groups');
      target.dataset.productionGroupType = type; setCanvasNodePoint(target, { x, y: Number(owner.dataset.y) - 58 });
      target.dataset.width = type === 'videos' ? '712' : '472'; target.dataset.height = String(Math.max(480, items.length * (type === 'videos' ? 680 : 472) + 82));
      renderCanvasGroupNode(target, { title: { character: '人物组', scene: '场景组', prop: '道具组', storyboards: '分镜故事板组', videos: '视频组' }[type], memberIds: items.map(a => a.nodeId) });
      applyCanvasNodeSize(target); placeCanvasNode(target); data.groups[type] = target.dataset.id;
    } else { setCanvasGroupMemberIds(target, items.map(a => a.nodeId)); updateCanvasGroupCounts(); }
  }
  async function prepareAssets(owner, data) {
    for (const [column, type] of ['character', 'scene', 'prop'].entries()) {
      const items = data.assets.filter(a => a.type === type), x = Number(owner.dataset.x) + 580 + column * 560;
      for (const [index, item] of items.entries()) {
        item.prompt = characterPrompt(item, data.settings);
        const node = await imageItem(owner, item, 'assets', data.settings, { x, y: Number(owner.dataset.y) + index * 472 });
        await assetReferences(owner, item, node);
        sourceLink(owner.dataset.id, node.dataset.id);
      }
      if (items.length) await group(owner, data, type, items, x - 36);
    }
  }
  async function resolveAssetReferences(data, item, ownerId = scope?.nodeId) {
    const refs = [], missing = [];
    for (const id of item.assetIds) {
      const asset = data.assets.find(a => a.id === id);
      const node = await owned(asset?.nodeId, ownerId, false);
      const src = node && nodeState(node).src;
      if (!src) missing.push(asset?.name || '已删除资产');
      else refs.push({ assetId: id, nodeId: asset.nodeId, src });
    }
    return { refs, missing };
  }
  async function replaceReferences(node, refs) {
    const old = parse(node.dataset.productionReferences, []), oldIds = new Set(old.map(ref => ref.nodeId));
    canvasState.connections = canvasState.connections.filter(c => c.to !== node.dataset.id || !oldIds.has(c.from));
    const ids = [node.dataset.id, ...refs.map(ref => ref.nodeId)];
    ids.forEach(id => pinCanvasNode(id));
    try {
      const target = await owned(node.dataset.id, node.dataset.productionOwner);
      for (const ref of refs) {
        const source = await owned(ref.nodeId, node.dataset.productionOwner);
        const output = getCanvasNodeOutput(source);
        const compatibility = getCanvasConnectionCompatibility(source, target, output);
        if (!compatibility.ok) throw new Error(compatibility.message || '参考图无法连接，请检查模型和参考数量。');
        // Preparation can run under a full-screen workbench or before a node has
        // layout coordinates. Validate the engine contract, without requiring
        // an on-screen port rectangle as an interactive pointer gesture does.
        canvasState.connections.push(normalizeVisibleCanvasConnection({ from: ref.nodeId, to: target.dataset.id, fromPort: 'output', toPort: 'input' }));
      }
      target.dataset.productionReferences = JSON.stringify(refs); updateCanvasNodeRefs(target);
    } finally { ids.forEach(id => unpinCanvasNode(id)); }
  }
  async function assetReferences(owner, item, node) {
    const prior = parse(node.dataset.productionReferences, []), refs = [];
    for (const src of [...new Set(item.references || [])]) {
      const url = new URL(src, location.origin);
      if (url.origin !== location.origin || !/^\/(?:uploads|output|api\/assets)\//.test(url.pathname)) throw new Error('资产参考需使用已上传或已生成的图片。');
      const old = prior.find(ref => ref.src === src);
      const existing = old ? await owned(old.nodeId, owner.dataset.id, false) : null;
      const material = existing || addCanvasImage(src, `${item.name}参考`, { x: Number(node.dataset.x) - 130, y: Number(node.dataset.y) + 160 });
      if (!existing) mark(material, owner.dataset.id, `ref-${item.id}-${refs.length}`, 'references');
      refs.push({ src, nodeId: material.dataset.id });
    }
    await replaceReferences(node, refs);
  }
  async function prepareStoryboards(owner, data) {
    const x = Number(owner.dataset.x) + 2360;
    for (const [index, item] of data.storyboards.entries()) {
      const resolved = await resolveAssetReferences(data, item);
      if (resolved.missing.length) { item.references = []; continue; }
      const node = await imageItem(owner, item, 'storyboards', data.settings, { x, y: Number(owner.dataset.y) + index * 472 });
      item.references = resolved.refs; await replaceReferences(node, item.references); sourceLink(owner.dataset.id, node.dataset.id);
    }
    const prepared = data.storyboards.filter(item => item.nodeId);
    if (prepared.length) await group(owner, data, 'storyboards', prepared, x - 36);
  }
  async function prepareVideos(owner, data, existingOnly = false) {
    await AiOsModuleLoader.ensure(['canvas-node-video-api']);
    const x = Number(owner.dataset.x) + 2980;
    for (const [index, item] of data.videos.entries()) {
      if (existingOnly && !item.nodeId) continue;
      const board = data.storyboards.find(s => s.id === item.storyboardId);
      const source = await owned(board?.nodeId, owner.dataset.id, false);
      if (!source || !nodeState(source).src || !item.references.length) continue;
      if (item.referenceMode !== 'first-frame') throw new Error('当前视频接口支持首帧方式，请选择单帧图片后准备视频。');
      if (board.shotIds.length > 1 && item.references.some(ref => ref.src === nodeState(source).src)) throw new Error('多格故事板不能直接作为视频首帧，请为对应镜头上传单帧图片。');
      const refs = [];
      for (const ref of item.references) {
        if (ref.src === nodeState(source).src) refs.push({ ...ref, nodeId: source.dataset.id });
        else {
          const url = new URL(ref.src, location.origin);
          if (url.origin !== location.origin || !/^\/(?:uploads|output|api\/assets)\//.test(url.pathname)) throw new Error('视频参考需使用已上传或已生成的单帧图片。');
          const existing = await owned(ref.nodeId, owner.dataset.id, false);
          const material = existing || addCanvasImage(ref.src, '视频首帧', { x: x - 110, y: Number(owner.dataset.y) + index * 472 + 180 });
          if (!existing) mark(material, owner.dataset.id, `frame-${item.id}`, 'references');
          refs.push({ ...ref, nodeId: material.dataset.id });
        }
      }
      let target = await owned(item.nodeId, owner.dataset.id, false);
      if (!target) {
        target = addCanvasApiVideoNode({ x, y: Number(owner.dataset.y) + index * 680 }, { prompt: item.prompt, model: data.settings.videoModel, ratio: data.settings.ratio, duration: item.duration || 4 });
        mark(target, owner.dataset.id, item.id, 'videos'); item.nodeId = target.dataset.id;
        target.dataset.productionDefaultModel = nodeState(target).model;
      }
      applyPrompt(target, item.prompt); item.references = refs; await replaceReferences(target, refs); sourceLink(owner.dataset.id, target.dataset.id);
      if (item.duration) target.dataset.apiVideoDuration = String(item.duration);
      if (data.settings.videoResolution) target.dataset.apiVideoResolution = data.settings.videoResolution;
      syncCanvasApiVideoControls(target);
    }
    const prepared = data.videos.filter(item => item.nodeId);
    if (prepared.length) await group(owner, data, 'videos', prepared, x - 36);
  }
  async function preflight(node, { acceptedRun } = {}) {
    const reservation = running.get(node.dataset.id);
    if (reservation && reservation.token !== acceptedRun) throw new Error('此节点已在生成队列中，请等待完成，避免重复提交。');
    if (CANVAS_IMAGE_JOB_ACTIVE_STATES.has(node.dataset.imageJobState)) throw new Error('此图片任务仍在执行或等待查询，请等待结果，避免重复提交。');
    const boardId = String(canvasState.activeBoardId), ownerId = node.dataset.productionOwner;
    if (!(await permission(boardId))) throw new Error('当前画布只读，不能提交生成任务。');
    const owner = ensureCanvasNodeMounted(ownerId);
    if (!owner?.dataset.productionWorkflow || owner.dataset.boardId !== boardId) throw new Error('脚本来源不存在，请重新准备节点。');
    const data = workflow(owner), stage = node.dataset.productionStage;
    const item = data[stage]?.find(a => a.nodeId === node.dataset.id);
    if (!item) throw new Error('此节点不在当前步骤清单中，请重新准备。');
    if (stage === 'storyboards') {
      const { refs, missing } = await resolveAssetReferences(data, item, ownerId);
      if (missing.length) throw new Error(`缺少资产图片：${missing.join('、')}。`);
      if (refs.some(ref => !item.references.some(old => old.assetId === ref.assetId && old.src === ref.src))) throw new Error('资产参考已变化，请重新准备故事板引用后发送。');
    }
    if (stage === 'videos') {
      const source = data.storyboards.find(s => s.id === item.storyboardId);
      if (!source?.nodeId || !(await owned(source.nodeId, ownerId, false))) throw new Error('来源故事板已删除，请重新准备视频。');
      if (item.referenceMode !== 'first-frame' || item.references.length !== 1) throw new Error('当前接口需要一张明确的单镜首帧图片。');
    }
    if (stage !== 'assets') for (const ref of item.references) {
      const target = await owned(ref.nodeId, ownerId, false);
      if (!target || nodeState(target).src !== ref.src) throw new Error('参考图已变化或不存在，请更新引用后发送。');
    }
    const expected = parse(node.dataset.productionReferences, []);
    const actual = stage === 'videos' ? getCanvasApiVideoRefs(node) : getCanvasIncomingRefs(node.dataset.id);
    if (actual.length !== expected.length || actual.some((ref, index) => ref.url !== expected[index]?.src)) throw new Error('画布上的参考连线与制作工作台不同，请重新准备引用后发送。');
    return true;
  }
  async function run(payload) {
    const owner = assertScope(), data = workflow(owner), field = payload.stage;
    if (!['assets', 'storyboards', 'videos'].includes(field) || !Array.isArray(payload.ids) || !payload.ids.length) throw new Error('请选择本步骤要生成的节点。');
    const ids = [...new Set(payload.ids.map(String))];
    const items = data[field].filter(item => ids.includes(item.nodeId));
    if (items.length !== ids.length) throw new Error('生成范围包含当前步骤以外的节点，已阻止提交。');
    const targets = [];
    const release = node => {
      const reservation = running.get(node.dataset.id);
      running.delete(node.dataset.id);
      reservation?.controls.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; });
      if (CANVAS_IMAGE_JOB_ACTIVE_STATES.has(node.dataset.imageJobState) || node.dataset.apiVideoTaskId) node.querySelectorAll('.canvas-node-run, .canvas-api-video-run').forEach(button => { button.disabled = true; });
      unpinCanvasNode(node.dataset.id); syncCanvasNodeModel(node); scheduleCanvasSave();
    };
    try {
      for (const item of items) {
        if (running.has(item.nodeId)) continue;
        pinCanvasNode(item.nodeId);
        const target = await owned(item.nodeId, owner.dataset.id);
        if (CANVAS_IMAGE_JOB_ACTIVE_STATES.has(target.dataset.imageJobState) || target.dataset.apiVideoTaskId) { unpinCanvasNode(item.nodeId); continue; }
        const controls = Array.from(target.querySelectorAll('button, input, select, textarea')).map(control => [control, control.disabled]);
        const token = Symbol('production-run');
        running.set(target.dataset.id, { token, signature: null, controls });
        controls.forEach(([control]) => { control.disabled = true; }); targets.push(target);
        await preflight(target, { acceptedRun: token });
      }
      // Persist the exact prompts and references before accepting any paid run.
      await persist();
    } catch (error) { targets.forEach(release); items.filter(item => !targets.some(node => node.dataset.id === item.nodeId) && !running.has(item.nodeId)).forEach(item => unpinCanvasNode(item.nodeId)); throw error; }
    const boardId = scope.boardId;
    const signature = node => JSON.stringify({ state: serializeCanvasNode(node), refs: getCanvasIncomingRefs(node.dataset.id).map(ref => ref.url) });
    for (const node of targets) {
      delete node.dataset.productionError;
      running.get(node.dataset.id).signature = signature(node);
      setCanvasNodeStatus(node, '排队中…');
    }
    // Sequential queue bounds provider pressure; each item failure is isolated.
    void (async () => {
      for (const node of targets) {
        const reservation = running.get(node.dataset.id);
        try {
          if (String(canvasState.activeBoardId) !== boardId) throw new Error('画布已切换，未提交的任务已停止。');
          if (signature(node) !== reservation.signature) throw new Error('排队后节点内容或参考发生变化，本项尚未提交，请重新发送。');
          const guard = { assertActive: () => { if (String(canvasState.activeBoardId) !== boardId || !node.isConnected) throw new Error('画布或节点已改变，任务已停止。'); } };
          if (field === 'videos') await runCanvasApiVideoNode(node, { guard, productionAcceptedRun: reservation.token });
          else await runCanvasImageEdit(node, { guard, productionAcceptedRun: reservation.token });
          const status = String(getCanvasNodeStatusElement(node)?.textContent || '');
          if (/失败|错误|请先|已移除/.test(status)) node.dataset.productionError = status;
        } catch (error) { node.dataset.productionError = `失败：${error.message}`; setCanvasNodeStatus(node, node.dataset.productionError); }
        finally { release(node); }
      }
    })();
  }
  window.addEventListener('message', event => {
    if (!panel || event.source !== panel.contentWindow || event.origin !== location.origin || event.data?.type !== 'neon:production-request') return;
    const message = event.data, current = scope;
    const respond = (data, error) => event.source?.postMessage({ type: 'neon:production-response', requestId: message.requestId, data, error }, location.origin);
    const execute = async () => {
      try {
        if (message.boardId !== current.boardId || message.nodeId !== current.nodeId) throw new Error('工作台来源与画布不匹配。');
        assertScope(current);
        if (message.action === 'snapshot') { respond(await snapshot()); return; }
        if (message.action === 'close') { respond(await snapshot()); close(); return; }
        if (message.action === 'focus') {
          const target = await owned(message.payload.id, current.nodeId);
          focusAgentCanvasNodesInViewport([target]); selectCanvasNode(target); respond(await snapshot()); close(); return;
        }
        if (current.readOnly || !(await permission(current.boardId))) throw new Error('当前画布只读，不能编辑或生成。');
        if (message.action === 'run') await run(message.payload || {});
        else if (['save', 'prepare-assets', 'prepare-storyboards', 'prepare-videos'].includes(message.action)) await save(message.payload?.workflow, message.action.startsWith('prepare-') ? message.action.slice(8) : '');
        else throw new Error('不支持的制作操作。');
        respond(await snapshot());
      } catch (error) { respond(undefined, /[\u4e00-\u9fff]/.test(error.message) ? error.message : `制作操作失败：${error.message}`); }
    };
    // Serialize edits and preparation; status queries must stay responsive.
    if (message.action === 'snapshot') void execute();
    else mutation = mutation.then(execute, execute);
  });
  window.addEventListener('ai-os-provider-catalog-changed', () => { catalog = null; });
  window.CanvasScriptProduction = Object.freeze({ add, open, close, decorate, serialize, hydrate, preflight, snapshot, save, isReserved: id => running.has(String(id)) });
})();
