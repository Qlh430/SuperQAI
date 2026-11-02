(function installCanvasAudioGenerator(root) {
  'use strict';
  const mounted = new WeakMap();
  const speechFormats = ['mp3', 'wav', 'opus', 'aac', 'flac'];
  const aceStepKeyscales = ['C major', 'C minor', 'C# major', 'C# minor', 'D major', 'D minor', 'D# major', 'D# minor', 'E major', 'E minor', 'F major', 'F minor', 'F# major', 'F# minor', 'G major', 'G minor', 'G# major', 'G# minor', 'A major', 'A minor', 'A# major', 'A# minor', 'B major', 'B minor'];
  const modes = ['music', 'speech'];
  const qwenModes = [['clone', '克隆声音'], ['preset', '预设声音'], ['design', '设计声音']];
  const qwenVoices = [['Serena', '苏瑶'], ['Uncle_fu', '福伯'], ['Vivian', '十三'], ['Aiden', '艾登'], ['Ryan', '甜茶'], ['Ono_anna', '小野杏'], ['Sohee', '素熙'], ['Dylan', '晓东'], ['Eric', '程川']];
  function element(tag, className, text) {
    const el = document.createElement(tag); el.className = className || ''; if (text) el.textContent = text; return el;
  }
  function id(model) { return String(model.id || `${model.providerId}:${model.modelId}`); }
  function modelMode(model) {
    const protocol = String(model?.modelProtocol || model?.protocol || '').toLowerCase();
    const identity = String(model?.modelId || model?.id || model?.displayName || model?.name || '').toLowerCase();
    return ['audio-speech', 'audio.speech'].includes(protocol) || /speech|tts|voice/.test(identity) ? 'speech' : 'music';
  }
  function normalizeMode(value) { return modes.includes(value) ? value : 'music'; }
  function models(entry) {
    const mode = normalizeMode(entry.state.mode);
    return (entry.context.getModels?.() || []).filter(model => model.capabilities?.includes('audio.generate') && modelMode(model) === mode);
  }
  function selected(entry) { return models(entry).find(model => id(model) === entry.state.modelId); }
  function isQwen(entry) { return entry.state.mode === 'speech' && String(selected(entry)?.modelId || '').toLowerCase() === 'qwen-tts'; }
  function qwenDraft(entry) { return entry.state.qwenDrafts[entry.state.qwenMode]; }
  function normalizeReference(ref) {
    if (!ref || typeof ref !== 'object') return null;
    const url = /^\/output\/[^?#]+$/.test(ref.url || '') ? String(ref.url) : '';
    const sourceNodeId = String(ref.sourceNodeId || '');
    return url || sourceNodeId ? {url,name:String(ref.name || '参考音频'),...(sourceNodeId ? {sourceNodeId,sourcePort:String(ref.sourcePort || 'output')} : {})} : null;
  }
  function setReference(node, ref, { saveState = false, replace = false } = {}) {
    const entry = mounted.get(node); if (!entry) return false;
    const next = normalizeReference(ref);
    if (!replace && JSON.stringify(entry.state.qwenDrafts.clone.referenceAudio) === JSON.stringify(next)) return false;
    if (replace) { entry.uploadToken++; entry.uploading = false; entry.referenceUpload.disabled = false; entry.run.disabled = entry.busy || !selected(entry); }
    entry.state.qwenDrafts.clone.referenceAudio = next;
    syncInputs(entry); if (saveState) save(entry); return true;
  }
  function replaceReference(entry, ref) {
    return typeof entry.context.onReferenceReplace === 'function'
      ? entry.context.onReferenceReplace(ref) : setReference(entry.node, ref, {saveState:true,replace:true});
  }
  function currentPrompt(entry) { return isQwen(entry) ? qwenDraft(entry).text : entry.state.mode === 'speech' ? entry.state.speechPrompt : entry.state.musicPrompt; }
  function getPrompt(node) { const entry = mounted.get(node); return entry ? currentPrompt(entry) : ''; }
  function syncPromptArea(entry) {
    const area = entry.prompt.closest?.('.flora-generator-prompt-area');
    if (area) {
      area.dataset.audioMode = entry.state.mode;
      area.dataset.audioLayout = isQwen(entry) ? entry.state.qwenMode : entry.state.mode;
    }
  }
  function syncInputs(entry) {
    const qwen = isQwen(entry), design = qwen && entry.state.qwenMode === 'design';
    entry.prompt.value = currentPrompt(entry);
    entry.prompt.placeholder = entry.state.mode === 'music' ? '必填，请输入音乐类型、情绪、乐器等' : qwen ? '必填，请输入要说的话' : '必填，text';
    entry.lyrics.hidden = entry.state.mode !== 'music' && !design;
    entry.lyrics.value = design ? qwenDraft(entry).instruct : entry.state.lyrics;
    entry.lyrics.placeholder = design ? '必填，请描述想要的音色、语气和风格' : '必填，在此输入或粘贴歌词…';
    entry.lyrics.setAttribute('aria-label', design ? '设计的音色' : '歌词');
    entry.reference.hidden = !(qwen && entry.state.qwenMode === 'clone');
    if (entry.reference.hidden) entry.referencePlayer.pause();
    const ref = entry.state.qwenDrafts.clone.referenceAudio;
    entry.referenceName.textContent = ref?.name || '';
    entry.referenceName.hidden = !ref;
    const referenceLabel = ref ? '替换参考音频' : '添加参考音频';
    entry.referenceUpload.title = referenceLabel;
    entry.referenceUpload.setAttribute('aria-label',referenceLabel);
    entry.referencePlayer.hidden = !ref?.url;
    entry.referenceRemove.hidden = !ref;
    if (ref?.url && entry.referencePlayer.getAttribute('src') !== ref.url) entry.referencePlayer.src = ref.url;
    if (!ref?.url) { entry.referencePlayer.pause(); entry.referencePlayer.removeAttribute('src'); }
    syncPromptArea(entry);
  }
  function save(entry) { if (mounted.get(entry.node) === entry) entry.context.onSave?.(entry.node); }
  function status(entry, text, state) {
    if (mounted.get(entry.node) !== entry) return;
    entry.status.textContent = text; entry.status.dataset.state = state;
    entry.context.onStatus?.(entry.node, text, state);
  }
  function safeUrl(value) {
    const url = String(value || '');
    if (/^data:audio\/(?:mpeg|mp3|wav|x-wav|ogg|opus|aac|flac);base64,[a-z0-9+/]+=*$/i.test(url)) return url;
    try { const parsed = new URL(url, root.location.href); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : ''; } catch { return ''; }
  }
  function showResult(entry) {
    const url = safeUrl(entry.state.result?.url || entry.state.result?.src);
    entry.player.pause();
    if (url) { entry.player.src = url; entry.player.hidden = false; entry.empty.hidden = true; }
    else { entry.player.removeAttribute('src'); entry.player.hidden = true; entry.empty.hidden = false; }
  }
  function settings(entry) {
    entry.parameters.replaceChildren();
    const model = selected(entry);
    if (!model) return;
    if (isQwen(entry)) return;
    const speech = modelMode(model) === 'speech';
    const defaults = { ...(model.parameterOverrides || model.metadata?.parameterOverrides || {}) };
    // ACE-Step is bundled with the application, so its required controls must
    // remain available even when an older model catalog omits parameter defaults.
    if (modelMode(model) === 'music' && String(model.modelId || model.id || '').toLowerCase() === 'ace-step') {
      defaults.duration ??= 120;
      defaults.bpm ??= 95;
      defaults.keyscale ??= 'E minor';
    }
      const fields = speech ? ['response_format', ...(/^gpt-4o-mini-tts(?:-|$)/.test(model.modelId || '') ? ['instructions'] : [])] : Object.keys(defaults).filter(key => ['format', 'response_format', 'duration', 'bpm', 'keyscale'].includes(key));
    fields.forEach(key => {
      const label = element('label', 'canvas-audio-generator-param');
      label.append(element('span', '', ({ format: '格式', response_format: '格式', duration: '时长（秒）', bpm: 'BPM', keyscale: '调式', instructions: '语音风格' })[key]));
      const control = key === 'keyscale' || key === 'response_format' && speech ? element('select') : element('input');
      if (key === 'keyscale') aceStepKeyscales.forEach(keyscale => { const option = element('option', '', keyscale); option.value = keyscale; control.append(option); });
      else if (control.tagName === 'SELECT') speechFormats.forEach(format => { const option = element('option', '', format.toUpperCase()); option.value = format; control.append(option); });
      else { control.type = ['speed', 'duration', 'bpm'].includes(key) ? 'number' : 'text'; if (key === 'speed' && speech) { control.min = '0.25'; control.max = '4'; control.step = '0.05'; } if (key === 'duration') { control.min = '1'; control.max = '300'; control.step = '1'; } if (key === 'bpm') { control.min = '1'; control.max = '300'; control.step = '1'; } }
      control.setAttribute('aria-label', label.textContent);
      control.value = String(entry.state.parameters[key] ?? defaults[key] ?? (key === 'response_format' && speech ? 'mp3' : ''));
      control.addEventListener('change', () => { const value = control.type === 'number' ? Number(control.value) : control.value; entry.state.parameters[key] = value; save(entry); });
      label.append(control); entry.parameters.append(label);
    });
  }
  function voiceOptions(entry, model) {
    const metadata = model?.metadata || {};
    const options = model?.voiceOptions || metadata.voiceOptions || metadata.voices || [];
    if (Array.isArray(options) && options.length) return options.map(option => typeof option === 'string' ? { value: option, label: option } : { value: option.id || option.value || option.name, label: option.label || option.displayName || option.name || option.id });
    const fallback = model?.parameterOverrides?.voice || metadata.parameterOverrides?.voice || entry.state.parameters.voice || 'configured-speaker';
    return [{ value: fallback, label: fallback === 'configured-speaker' ? '治愈博士' : fallback }];
  }
  function syncSpeechControls(entry) {
    const speech = entry.state.mode === 'speech';
    entry.speed.hidden = !speech;
    entry.voice.hidden = !speech;
    if (!speech) return;
    const model = selected(entry);
    const qwen = isQwen(entry);
    const choices = qwen ? qwenModes : [['0.75', '慢速'], ['1', '极速'], ['1.25', '快速']];
    const signature = qwen ? 'qwen' : 'speed';
    if (entry.speed.dataset.choices !== signature) {
      entry.speed.replaceChildren();
      choices.forEach(([value,label]) => { const option = element('option','',label); option.value = value; entry.speed.append(option); });
      entry.speed.dataset.choices = signature;
    }
    entry.speed.setAttribute('aria-label', qwen ? '声音模式' : '语速');
    entry.speed.value = qwen ? entry.state.qwenMode : String(entry.state.parameters.speed ?? 1);
    entry.voice.replaceChildren();
    (qwen ? qwenVoices.map(([value,label]) => ({value,label:`${label} · ${value.replaceAll('_',' ')}`})) : voiceOptions(entry, model)).forEach(option => {
      const item = element('option', '', option.label); item.value = option.value; entry.voice.append(item);
    });
    entry.voice.value = qwen ? entry.state.qwenSpeaker : String(entry.state.parameters.voice || entry.voice.options[0]?.value || '');
    entry.voice.hidden = qwen && entry.state.qwenMode !== 'preset';
  }
  function setMode(entry, mode) {
    const next = normalizeMode(mode);
    if (next === entry.state.mode) return;
    entry.state.modelByMode ||= {};
    entry.state.modelByMode[entry.state.mode] = entry.state.modelId;
    entry.state.mode = next;
    entry.state.modelId = entry.state.modelByMode[next] || '';
    entry.lyrics.hidden = next !== 'music';
    entry.prompt.placeholder = next === 'speech' ? '必填，text' : '必填，请输入音乐类型、情绪、乐器等';
    entry.prompt.value = currentPrompt(entry);
    entry.lyrics.hidden = next !== 'music';
    entry.mode.value = next;
    refreshModels(entry.node);
    syncPromptArea(entry);
    save(entry);
  }
  function refreshModels(node) {
    const entry = mounted.get(node); if (!entry) return;
    const all = (entry.context.getModels?.() || []).filter(model => model.capabilities?.includes('audio.generate'));
    const storedModel = all.find(model => id(model) === entry.state.modelId);
    if (storedModel && modelMode(storedModel) !== entry.state.mode) {
      entry.state.mode = modelMode(storedModel); entry.mode.value = entry.state.mode;
      entry.prompt.placeholder = entry.state.mode === 'speech' ? '必填，text' : '必填，请输入音乐类型、情绪、乐器等';
      entry.lyrics.hidden = entry.state.mode !== 'music';
    }
    if (!storedModel && !entry.state.modelId && entry.state.mode === 'music' && all.length && !all.some(model => modelMode(model) === 'music') && all.some(model => modelMode(model) === 'speech')) {
      entry.state.mode = 'speech'; entry.mode.value = 'speech'; entry.prompt.placeholder = '必填，text'; entry.lyrics.hidden = true;
    }
    const catalog = models(entry);
    if (entry.state.mode === 'music' && !entry.state.modelId) {
      const preferred = catalog.find(model => String(model.modelId || model.id || '').toLowerCase() === 'ace-step');
      if (preferred) {
        entry.state.modelId = id(preferred);
        entry.state.modelByMode.music = entry.state.modelId;
        save(entry);
      }
    }
    if (entry.state.mode === 'speech' && !entry.state.modelId) {
      const preferred = catalog.find(model => String(model.modelId || model.id || '').toLowerCase() === 'qwen-tts');
      if (preferred) {
        entry.state.modelId = id(preferred);
        entry.state.modelByMode.speech = entry.state.modelId;
        save(entry);
      }
    }
    entry.model.replaceChildren();
    const placeholder = element('option', '', catalog.length ? '选择音频模型' : '暂无可用音频模型'); placeholder.value = ''; entry.model.append(placeholder);
    const groups = new Map();
    catalog.forEach(model => {
      const name = model.providerName || '模型服务';
      if (!groups.has(name)) { const group = element('optgroup'); group.label = name; groups.set(name, group); entry.model.append(group); }
      const option = element('option', '', model.displayName || model.name || model.modelId || model.id); option.value = id(model); groups.get(name).append(option);
    });
    const valid = !entry.state.modelId || catalog.some(model => id(model) === entry.state.modelId);
    if (!valid) { const removed = element('option', '', '原音频模型已移除，请重新选择'); removed.value = entry.state.modelId; removed.disabled = true; entry.model.append(removed); status(entry, '原音频模型已移除，请重新选择。', 'error'); }
    entry.model.value = entry.state.modelId || ''; entry.model.dataset.selected = String(Boolean(entry.state.modelId && valid));
    entry.run.disabled = entry.busy || entry.uploading || !selected(entry);
    syncSpeechControls(entry);
    syncInputs(entry);
    settings(entry);
  }
  function render(node, state = {}, context = {}) {
    if (mounted.has(node)) { const entry = mounted.get(node); entry.context = context; refreshModels(node); return node; }
    node.classList.add('canvas-node-audio-generator');
    const body = element('div', 'canvas-audio-generator-body');
    const result = element('div', 'canvas-audio-generator-result canvas-media-shell canvas-media-shell-audio');
    const player = element('audio', 'canvas-audio-preview'); player.controls = true; player.preload = 'metadata'; player.setAttribute('aria-label', '生成音频播放器');
    const empty = element('p', 'canvas-audio-generator-empty', '生成的音频将在这里播放'); result.append(player, empty);
    const refs = element('div', 'canvas-audio-generator-refs', '当前音频协议不支持参考音频');
    const prompt = element('textarea', 'canvas-audio-generator-prompt'); prompt.placeholder = '必填，请输入音乐类型、情绪、乐器等'; prompt.setAttribute('aria-label', '音频内容'); prompt.rows = 3; prompt.maxLength = 4096;
    const lyrics = element('textarea', 'canvas-audio-generator-lyrics'); lyrics.placeholder = '必填，在此输入或粘贴歌词…'; lyrics.setAttribute('aria-label', '歌词'); lyrics.rows = 3; lyrics.maxLength = 4096;
    const reference = element('div', 'canvas-audio-generator-reference'); reference.hidden = true;
    const referenceInput = element('input'); referenceInput.type = 'file'; referenceInput.accept = '.wav,.mp3,.flac,.ogg,.m4a,.aac,.opus'; referenceInput.hidden = true; referenceInput.setAttribute('aria-label','上传参考音频');
    const referenceUpload = element('button','canvas-audio-reference-upload flora-generator-add-reference'); referenceUpload.type = 'button';
    const referenceIcon = element('i'); referenceIcon.dataset.lucide = 'plus'; referenceIcon.setAttribute('aria-hidden','true'); referenceUpload.append(referenceIcon);
    root.lucide?.createIcons?.({root:referenceUpload,attrs:{'aria-hidden':'true','stroke-width':1.8}});
    const referenceName = element('span','canvas-audio-reference-name','上传或拖入参考音频');
    const referencePlayer = element('audio','canvas-audio-reference-player'); referencePlayer.controls = true; referencePlayer.preload = 'metadata'; referencePlayer.hidden = true; referencePlayer.setAttribute('aria-label','参考音频试听');
    const referenceRemove = element('button','canvas-audio-reference-remove','移除'); referenceRemove.type = 'button'; referenceRemove.hidden = true;
    reference.append(referenceName,referenceUpload,referenceInput,referencePlayer,referenceRemove);
    const controls = element('div', 'canvas-audio-generator-controls');
    const mode = element('select', 'canvas-audio-generator-mode');
    [['music', '音乐'], ['speech', '语音']].forEach(([value, label]) => { const option = element('option', '', label); option.value = value; option.dataset.audioMode = value; mode.append(option); });
    mode.setAttribute('aria-label', '音频类型');
    const model = element('select', 'canvas-audio-generator-model'); model.setAttribute('aria-label', '音频模型');
    const speed = element('select', 'canvas-audio-generator-speed'); speed.setAttribute('aria-label', '语速');
    [['0.75', '慢速'], ['1', '极速'], ['1.25', '快速']].forEach(([value, label]) => { const option = element('option', '', label); option.value = value; speed.append(option); });
    const voice = element('select', 'canvas-audio-generator-voice'); voice.setAttribute('aria-label', '音色');
    const parameters = element('div', 'canvas-audio-generator-parameters');
    const runButton = element('button', 'canvas-audio-generator-run', '生成音频'); runButton.type = 'button';
    const statusEl = element('p', 'canvas-audio-generator-status'); statusEl.setAttribute('role', 'status'); statusEl.setAttribute('aria-live', 'polite');
    const disclosure = element('p', 'canvas-audio-generator-disclosure', '生成声音由 AI 合成');
    controls.append(mode, model, speed, voice, parameters, runButton); body.append(result, refs, prompt, lyrics, reference, controls, statusEl, disclosure); node.append(body);
    const initialMode = normalizeMode(state.mode || (state.modelProtocol === 'audio-speech' ? 'speech' : 'music'));
    const entry = { node, context, state: { mode: initialMode, musicPrompt: String(state.musicPrompt ?? state.prompt ?? ''), speechPrompt: String(state.speechPrompt ?? ''), lyrics: String(state.lyrics ?? state.parameters?.lyrics ?? ''), modelId: String(state.modelId || ''), modelByMode: { ...(state.modelByMode || {}) }, parameters: { ...(state.parameters || {}) }, result: state.result || null }, body, player, empty, mode, model, speed, voice, parameters, run: runButton, prompt, lyrics, status: statusEl, busy: false };
    entry.state.qwenMode = qwenModes.some(([value]) => value === state.qwenMode) ? state.qwenMode : 'preset';
    entry.state.qwenSpeaker = qwenVoices.some(([value]) => value === state.qwenSpeaker) ? state.qwenSpeaker : 'Serena';
    entry.state.qwenDrafts = Object.fromEntries(qwenModes.map(([value]) => {
      const draft = state.qwenDrafts?.[value] || {}, ref = draft.referenceAudio;
      return [value,{text:String(draft.text || ''),instruct:String(draft.instruct || ''),referenceAudio:normalizeReference(ref)}];
    }));
    Object.assign(entry,{reference,referenceInput,referenceName,referencePlayer,referenceRemove,referenceUpload,uploadToken:0});
    mounted.set(node, entry); mode.value = entry.state.mode; prompt.value = currentPrompt(entry); lyrics.value = entry.state.lyrics;
    prompt.placeholder = entry.state.mode === 'speech' ? '必填，text' : prompt.placeholder;
    lyrics.hidden = entry.state.mode !== 'music';
    [prompt, lyrics, reference, controls].forEach(control => ['pointerdown', 'mousedown', 'click', 'dblclick', 'touchstart'].forEach(type => control.addEventListener(type, event => event.stopPropagation())));
    prompt.addEventListener('input', () => { if (isQwen(entry)) qwenDraft(entry).text = prompt.value; else if (entry.state.mode === 'speech') entry.state.speechPrompt = prompt.value; else entry.state.musicPrompt = prompt.value; save(entry); });
    lyrics.addEventListener('input', () => { if (isQwen(entry)) entry.state.qwenDrafts.design.instruct = lyrics.value; else { entry.state.lyrics = lyrics.value; entry.state.parameters.lyrics = lyrics.value; } save(entry); });
    mode.addEventListener('change', () => setMode(entry, mode.value));
    speed.addEventListener('change', () => { if (isQwen(entry)) { entry.state.qwenMode = speed.value; syncSpeechControls(entry); syncInputs(entry); status(entry,'','idle'); } else entry.state.parameters.speed = Number(speed.value); save(entry); });
    voice.addEventListener('change', () => { if (isQwen(entry)) entry.state.qwenSpeaker = voice.value; else entry.state.parameters.voice = voice.value; save(entry); });
    referenceUpload.addEventListener('click',()=>referenceInput.click());
    referenceInput.addEventListener('change',()=>{ const file=referenceInput.files?.[0]; referenceInput.value=''; if(file) void uploadReference(entry,file); });
    reference.addEventListener('dragover',event=>{event.preventDefault();event.stopPropagation();});
    reference.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation(); const file=event.dataTransfer?.files?.[0]; if(file) void uploadReference(entry,file);});
    referenceRemove.addEventListener('click',()=>replaceReference(entry,null));
    model.addEventListener('change', () => { entry.state.modelId = model.value; entry.state.modelByMode[entry.state.mode] = model.value; entry.state.parameters = {}; status(entry, '', 'idle'); refreshModels(node); save(entry); });
    runButton.addEventListener('click', () => run(node));
    player.addEventListener('error', () => { if (player.getAttribute('src')) status(entry, '音频文件无法播放，请检查文件访问权限或在服务平台下载。', 'error'); });
    entry.historySelect = event => {
      const item = event.detail?.item;
      if (item?.kind === 'audio' || item?.mediaType === 'audio') { entry.state.result = { ...item, url: item.url || item.src }; showResult(entry); save(entry); }
    };
    node.addEventListener('flora-generation-history-select', entry.historySelect);
    showResult(entry); refreshModels(node); return node;
  }
  async function run(node) {
    const entry = mounted.get(node); if (!entry || entry.busy) return;
    entry.context.syncReference?.();
    const model = selected(entry);
    if (!model) { status(entry, '请先在设置中保存音频模型，然后选择模型。', 'error'); return; }
    if (entry.uploading) { status(entry,'请等待参考音频上传完成。','error'); return; }
    const prompt = String(currentPrompt(entry)).trim();
    if (!prompt) { status(entry, '请先输入要生成的音频内容。', 'error'); entry.prompt.focus(); return; }
    const qwen = isQwen(entry), draft = qwenDraft(entry);
    if (qwen && entry.state.qwenMode === 'clone' && !draft.referenceAudio?.url) { status(entry,'请先上传参考音频。','error'); return; }
    if (qwen && entry.state.qwenMode === 'design' && !draft.instruct.trim()) { status(entry,'请先填写设计的音色。','error'); entry.lyrics.focus(); return; }
    entry.busy = true; entry.run.disabled = true; entry.run.setAttribute('aria-busy', 'true'); entry.run.classList.add('is-generating'); status(entry, '正在生成音频，请勿重复提交。', 'running');
    const controller = new AbortController(); entry.controller = controller;
    const publicModelId = entry.state.modelId;
    const request = { providerId: model.providerId, modelId: model.modelId || model.upstreamModelId || model.id, prompt, mode: entry.state.mode, parameters: { ...entry.state.parameters, ...(entry.state.mode === 'music' ? { lyrics: entry.state.lyrics } : {}) } };
    if (qwen) request.parameters = {voiceMode:entry.state.qwenMode,...(entry.state.qwenMode === 'preset' ? {speaker:entry.state.qwenSpeaker} : entry.state.qwenMode === 'clone' ? {referenceAudio:draft.referenceAudio.url} : {instruct:draft.instruct.trim()})};
    try {
      const response = await (entry.context.fetch || root.fetch.bind(root))('/api/providers/generate-audio', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
      let data; try { data = await response.json(); } catch { throw new Error('音频接口返回了无法识别的内容。'); }
      if (!response.ok) throw new Error(data.error || (response.status === 401 ? '登录已过期，请重新登录。' : response.status === 403 ? '没有使用此音频服务的权限。' : '音频生成失败，请稍后重试。'));
      const url = safeUrl(data.audio?.url);
      if (!url) throw new Error('音频接口没有返回可播放的文件。');
      if (mounted.get(node) !== entry) return;
      const item = { ...data.audio, url, src: url, kind: 'audio', mediaType: 'audio', prompt, parameters: request.parameters, modelId: publicModelId, createdAt: new Date().toISOString() };
      entry.state.result = item; showResult(entry); entry.context.onResult?.(node, item); save(entry); status(entry, '音频生成完成', 'success');
    } catch (error) { if (mounted.get(node) === entry) status(entry, error.message || '音频生成失败，请稍后重试。', 'error'); }
    finally {
      if (mounted.get(node) === entry) {
        entry.busy = false; entry.controller = null;
        entry.run.classList.remove('is-generating'); entry.run.removeAttribute('aria-busy'); entry.run.disabled = !selected(entry);
      }
    }
  }
  async function uploadReference(entry,file) {
    if (!/\.(wav|mp3|flac|ogg|m4a|aac|opus)$/i.test(file.name || '') || !file.size || file.size > 24*1024*1024) { status(entry,'请选择24 MB以内的WAV、MP3、FLAC、OGG、M4A、AAC或OPUS参考音频。','error'); return; }
    const token=++entry.uploadToken;
    entry.uploading=true; entry.run.disabled=true; entry.referenceUpload.disabled=true; status(entry,'正在上传参考音频…','running');
    try {
      if (typeof entry.context.uploadAudio !== 'function') throw new Error('参考音频上传接口不可用，请刷新工作台。');
      const subtype={wav:'wav',mp3:'mpeg',flac:'flac',ogg:'ogg',m4a:'mp4',aac:'aac',opus:'opus'}[file.name.split('.').pop().toLowerCase()];
      const uploadFile=file.type.startsWith('audio/') ? file : new File([file],file.name,{type:`audio/${subtype}`});
      const uploaded=await entry.context.uploadAudio(uploadFile);
      if(mounted.get(entry.node)!==entry || token!==entry.uploadToken) return;
      if(!/^\/output\/[^?#]+$/.test(uploaded?.url || '')) throw new Error('参考音频未返回有效的保存地址。');
      replaceReference(entry,{url:uploaded.url,name:file.name}); status(entry,'参考音频已上传','success');
    } catch(error) { if(mounted.get(entry.node)===entry && token===entry.uploadToken) status(entry,`参考音频上传失败：${error.message || '请稍后重试。'}`,'error'); }
    finally { if(mounted.get(entry.node)===entry && token===entry.uploadToken) {entry.uploading=false;entry.referenceUpload.disabled=false;entry.run.disabled=entry.busy||!selected(entry);} }
  }
  function serialize(node) { const entry = mounted.get(node); return entry ? { kind: 'audio-generator', ...entry.state, qwenDrafts: structuredClone(entry.state.qwenDrafts), prompt: currentPrompt(entry), parameters: { ...entry.state.parameters } } : null; }
  function selectResult(node, item) { const entry = mounted.get(node); if (!entry) return; entry.state.result = item ? { ...item, url: item.url || item.src } : null; showResult(entry); }
  function unmount(node) {
    const entry = mounted.get(node); if (!entry) return;
    mounted.delete(node); entry.controller?.abort();
    entry.player.pause(); entry.referencePlayer.pause(); entry.referencePlayer.removeAttribute('src'); node.removeEventListener('flora-generation-history-select', entry.historySelect); entry.body.remove();
  }
  root.CanvasAudioGenerator = Object.freeze({ render, run, serialize, refreshModels, getPrompt, setReference, acceptsAudioReference:node=>{const entry=mounted.get(node);return Boolean(entry && isQwen(entry) && entry.state.qwenMode==='clone');}, syncLayout:node=>{const entry=mounted.get(node);if(entry)syncPromptArea(entry);}, showResult: selectResult, unmount });
})(window);
