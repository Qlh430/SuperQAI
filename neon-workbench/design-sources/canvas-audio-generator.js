(function installCanvasAudioGenerator(root) {
  'use strict';
  const mounted = new WeakMap();
  const speechFormats = ['mp3', 'wav', 'opus', 'aac', 'flac'];
  function element(tag, className, text) {
    const el = document.createElement(tag); el.className = className || ''; if (text) el.textContent = text; return el;
  }
  function id(model) { return String(model.id || `${model.providerId}:${model.modelId}`); }
  function models(entry) { return (entry.context.getModels?.() || []).filter(model => model.capabilities?.includes('audio.generate')); }
  function selected(entry) { return models(entry).find(model => id(model) === entry.state.modelId); }
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
    const speech = ['audio-speech', 'audio.speech'].includes(model.modelProtocol || model.protocol);
    const defaults = model.parameterOverrides || model.metadata?.parameterOverrides || {};
    const fields = speech ? ['voice', 'response_format', 'speed', ...(/^gpt-4o-mini-tts(?:-|$)/.test(model.modelId || '') ? ['instructions'] : [])] : Object.keys(defaults).filter(key => ['voice', 'format', 'response_format', 'speed', 'duration'].includes(key));
    fields.forEach(key => {
      const label = element('label', 'canvas-audio-generator-param');
      label.append(element('span', '', ({ voice: '声音 ID', format: '格式', response_format: '格式', speed: '语速', duration: '时长', instructions: '语音风格' })[key]));
      const control = key === 'response_format' && speech ? element('select') : element('input');
      if (control.tagName === 'SELECT') speechFormats.forEach(format => { const option = element('option', '', format.toUpperCase()); option.value = format; control.append(option); });
      else { control.type = ['speed', 'duration'].includes(key) ? 'number' : 'text'; if (key === 'speed' && speech) { control.min = '0.25'; control.max = '4'; control.step = '0.05'; } }
      control.setAttribute('aria-label', label.textContent);
      control.value = String(entry.state.parameters[key] ?? defaults[key] ?? (key === 'response_format' && speech ? 'mp3' : key === 'speed' && speech ? 1 : ''));
      if (key === 'voice') { control.placeholder = '服务支持的声音 ID'; control.title = '填写已保存服务支持的声音 ID'; }
      control.addEventListener('change', () => { const value = control.type === 'number' ? Number(control.value) : control.value; entry.state.parameters[key] = value; save(entry); });
      label.append(control); entry.parameters.append(label);
    });
  }
  function refreshModels(node) {
    const entry = mounted.get(node); if (!entry) return;
    const catalog = models(entry); entry.model.replaceChildren();
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
    entry.run.disabled = entry.busy || !selected(entry);
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
    const prompt = element('textarea', 'canvas-audio-generator-prompt'); prompt.placeholder = '输入要合成的文本或音频描述'; prompt.setAttribute('aria-label', '音频内容'); prompt.rows = 3; prompt.maxLength = 4096;
    const controls = element('div', 'canvas-audio-generator-controls');
    const model = element('select', 'canvas-audio-generator-model'); model.setAttribute('aria-label', '音频模型');
    const parameters = element('div', 'canvas-audio-generator-parameters');
    const runButton = element('button', 'canvas-audio-generator-run', '生成音频'); runButton.type = 'button';
    const statusEl = element('p', 'canvas-audio-generator-status'); statusEl.setAttribute('role', 'status'); statusEl.setAttribute('aria-live', 'polite');
    const disclosure = element('p', 'canvas-audio-generator-disclosure', '生成声音由 AI 合成');
    controls.append(model, parameters, runButton); body.append(result, refs, prompt, controls, statusEl, disclosure); node.append(body);
    const entry = { node, context, state: { prompt: String(state.prompt || ''), modelId: String(state.modelId || ''), parameters: { ...(state.parameters || {}) }, result: state.result || null }, body, player, empty, model, parameters, run: runButton, prompt, status: statusEl, busy: false };
    mounted.set(node, entry); prompt.value = entry.state.prompt;
    [prompt, controls].forEach(control => ['pointerdown', 'mousedown', 'click', 'dblclick', 'touchstart'].forEach(type => control.addEventListener(type, event => event.stopPropagation())));
    prompt.addEventListener('input', () => { entry.state.prompt = prompt.value; save(entry); });
    model.addEventListener('change', () => { entry.state.modelId = model.value; entry.state.parameters = {}; status(entry, '', 'idle'); refreshModels(node); save(entry); });
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
    const model = selected(entry);
    if (!model) { status(entry, '请先在设置中保存音频模型，然后选择模型。', 'error'); return; }
    const prompt = String(entry.context.getPrompt?.() ?? entry.state.prompt).trim();
    if (!prompt) { status(entry, '请先输入要生成的音频内容。', 'error'); entry.prompt.focus(); return; }
    entry.busy = true; entry.run.disabled = true; entry.run.setAttribute('aria-busy', 'true'); entry.run.classList.add('is-generating'); status(entry, '正在生成音频，请勿重复提交。', 'running');
    const controller = new AbortController(); entry.controller = controller;
    const publicModelId = entry.state.modelId;
    const request = { providerId: model.providerId, modelId: model.modelId || model.upstreamModelId || model.id, prompt, parameters: { ...entry.state.parameters } };
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
  function serialize(node) { const entry = mounted.get(node); return entry ? { kind: 'audio-generator', ...entry.state, parameters: { ...entry.state.parameters } } : null; }
  function selectResult(node, item) { const entry = mounted.get(node); if (!entry) return; entry.state.result = item ? { ...item, url: item.url || item.src } : null; showResult(entry); }
  function unmount(node) {
    const entry = mounted.get(node); if (!entry) return;
    mounted.delete(node); entry.controller?.abort();
    entry.player.pause(); node.removeEventListener('flora-generation-history-select', entry.historySelect); entry.body.remove();
  }
  root.CanvasAudioGenerator = Object.freeze({ render, run, serialize, refreshModels, showResult: selectResult, unmount });
})(window);
