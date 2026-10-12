(function installFloraNodeTags(root) {
  'use strict';
  const rules = root.CanvasNodeTagRules;
  const mounted = new Map();
  let library = rules.initialize(null), host, picker, manager, busy = false;
  const tagIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 13 13 20a2 2 0 0 1-3 0L3 13V4a1 1 0 0 1 1-1h9l7 7a2 2 0 0 1 0 3Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>';
  const cross = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
  function el(tag, className, text) {
    const item = document.createElement(tag); item.className = className || '';
    if (text !== undefined) item.textContent = text; return item;
  }
  function button(text, action, icon) {
    const item = el('button', 'flora-tag-action', text); item.type = 'button';
    if (icon) { item.innerHTML = icon; item.setAttribute('aria-label', text); item.title = text; }
    item.addEventListener('click', action); return item;
  }
  function isolate(target) {
    for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'keydown', 'keyup', 'contextmenu']) target.addEventListener(type, event => event.stopPropagation());
  }
  function surface() { return document.querySelector('#canvasEditorScreen') || document.fullscreenElement || document.body; }
  function definitions() { return library.map(item => ({ ...item })); }
  function resolve(id) { const label = library.find(item => item.id === id); return label ? { ...label, foreground: rules.foreground(label.color) } : null; }
  function sync(node) {
    const state = mounted.get(node); if (!state) return;
    const label = resolve(node.dataset.nodeLabelId), selected = node.classList.contains('is-selected') || node.classList.contains('selected');
    state.chrome.hidden = !label && !selected;
    state.remove.hidden = !label || !selected;
    state.trigger.classList.toggle('is-tagged', Boolean(label));
    state.trigger.setAttribute('aria-label', label ? `更换标签：${label.name}` : '添加标签');
    state.trigger.title = label ? `更换标签：${label.name}` : '添加标签';
    state.trigger.style.setProperty('--tag-color', label?.color || 'transparent');
    state.trigger.style.setProperty('--tag-foreground', label?.foreground || 'inherit');
    const key = label ? `${label.id}:${label.name}:${label.color}` : '';
    if (state.key !== key) {
      state.key = key; state.trigger.replaceChildren();
      if (label) { state.trigger.append(el('span', 'flora-tag-dot'), el('span', 'flora-tag-name', label.name)); }
      else state.trigger.innerHTML = tagIcon;
    }
    node.dataset.hasNodeTag = String(Boolean(label));
  }
  function syncAll() {
    for (const node of mounted.keys()) { if (node.isConnected) sync(node); else unmount(node); }
  }
  function setDefinitions(value) { library = rules.initialize(value); syncAll(); }
  function hydrate(board) { close(); setDefinitions(board?.labelDefinitions ?? null); }
  function mount(node) {
    // Legacy controls sometimes remove DOM directly. Never remount chrome in
    // a detached node: its shell observer would repeatedly remove/recreate it.
    if (!node?.isConnected || !node?.dataset) return;
    if (mounted.has(node) && mounted.get(node).chrome.isConnected) { sync(node); return; }
    if (mounted.has(node)) unmount(node);
    const chrome = el('div', 'flora-node-tag'); isolate(chrome);
    const trigger = button('添加标签', () => openPicker(node)); trigger.classList.add('flora-tag-trigger');
    trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
    const remove = button('移除节点标签', async () => {
      if (busy) return;
      try { await commit({ node, labelId: '' }); }
      catch (error) { openPicker(node); showError(picker?.error, error); }
    }, cross); remove.classList.add('flora-tag-remove');
    chrome.append(trigger, remove); node.append(chrome);
    const observer = new MutationObserver(() => sync(node));
    observer.observe(node, { attributes: true, attributeFilter: ['class', 'data-node-label-id'] });
    mounted.set(node, { chrome, trigger, remove, observer, key: null }); sync(node);
  }
  function unmount(node) {
    if (picker?.node === node) closePicker(false);
    if (manager?.node === node) closeManager(false);
    const state = mounted.get(node); state?.observer.disconnect(); state?.chrome.remove(); mounted.delete(node);
  }
  async function commit(value) {
    if (!host?.commit) throw new Error('画布标签服务尚未就绪，请稍后重试。');
    if (busy) throw new Error('标签正在保存，请稍后重试。');
    busy = true;
    try { await host.commit(value); } finally { busy = false; syncAll(); }
  }
  function showError(target, error) {
    if (!target) return; target.hidden = false;
    target.textContent = /[\u4e00-\u9fff]/.test(error?.message || '') ? error.message : '标签保存失败，请检查连接后重试。';
  }
  function closePicker(restoreFocus = true) {
    if (!picker) return;
    const current = picker; picker = null;
    current.trigger.setAttribute('aria-expanded', 'false');
    if (current.panel.matches(':popover-open')) current.panel.hidePopover();
    current.panel.remove();
    if (restoreFocus && current.trigger.isConnected) current.trigger.focus({ preventScroll: true });
  }
  function positionPicker() {
    if (!picker) return;
    if (!picker.node.isConnected) { closePicker(false); return; }
    const rect = picker.trigger.getBoundingClientRect(), panel = picker.panel;
    const width = Math.min(256, innerWidth - 32); panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(16, Math.min(rect.right - width, innerWidth - width - 16))}px`;
    const available = innerHeight - 32, height = Math.min(panel.scrollHeight, available);
    panel.style.top = `${Math.max(16, Math.min(rect.bottom + 8, innerHeight - height - 16))}px`;
  }
  function openPicker(node) {
    if (busy || manager) return;
    const state = mounted.get(node); if (!state) return;
    if (picker?.node === node) { closePicker(); return; }
    closePicker(false);
    const panel = el('div', 'flora-tag-picker'); panel.popover = 'auto'; panel.setAttribute('role', 'menu'); panel.setAttribute('aria-label', '选择节点标签'); isolate(panel);
    const header = el('div', 'flora-tag-picker-header');
    header.append(button('＋ 新建标签', () => { closePicker(false); openManager(node, true); }), button('管理标签', () => { closePicker(false); openManager(node, false); }, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'));
    const list = el('div', 'flora-tag-picker-list');
    for (const label of library) {
      const row = button('', async () => {
        if (busy) return;
        row.disabled = true;
        try { await commit({ node, labelId: label.id }); closePicker(); }
        catch (error) { showError(errorArea, error); row.disabled = false; positionPicker(); }
      }); row.dataset.labelId = label.id; row.setAttribute('role', 'menuitemradio'); row.setAttribute('aria-checked', String(node.dataset.nodeLabelId === label.id));
      const dot = el('span', 'flora-tag-dot'); dot.style.background = label.color;
      row.append(dot, el('span', 'flora-tag-name', label.name)); list.append(row);
    }
    if (!library.length) list.append(el('p', 'flora-tag-muted', '还没有标签，点击“新建标签”添加。'));
    const errorArea = el('p', 'flora-tag-error'); errorArea.setAttribute('role', 'alert'); errorArea.hidden = true;
    panel.append(header, list, errorArea); surface().append(panel);
    picker = { node, panel, trigger: state.trigger, error: errorArea }; state.trigger.setAttribute('aria-expanded', 'true');
    panel.addEventListener('toggle', event => { if (event.newState === 'closed' && picker?.panel === panel) closePicker(); });
    panel.addEventListener('keydown', event => {
      const buttons = [...panel.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length; buttons[next]?.focus();
      }
      if (event.key === 'Escape') { event.preventDefault(); closePicker(); }
    });
    panel.showPopover(); positionPicker(); panel.querySelector('[aria-checked="true"]')?.focus();
    if (!panel.contains(document.activeElement)) panel.querySelector('button')?.focus();
  }
  function closeManager(restoreFocus = true) {
    if (!manager) return;
    const current = manager; manager = null; current.dialog.close(); current.dialog.remove();
    if (restoreFocus && current.node?.isConnected) mounted.get(current.node)?.trigger.focus({ preventScroll: true });
  }
  function openManager(node, creating = false) {
    if (busy) return; closeManager(false);
    const dialog = el('dialog', 'flora-tag-manager'); dialog.setAttribute('aria-labelledby', 'flora-tag-manager-title'); isolate(dialog);
    const heading = el('div', 'flora-tag-manager-heading'), title = el('h2', '', '管理标签'); title.id = 'flora-tag-manager-title';
    heading.append(title, button('关闭标签管理', () => { if (!busy) closeManager(); }, cross));
    const subtitle = el('p', 'flora-tag-muted', '用于当前画布的节点分类；修改名称和颜色会同步更新所有使用此标签的节点。');
    const body = el('div', 'flora-tag-manager-body'), sidebar = el('div', 'flora-tag-sidebar'), list = el('div', 'flora-tag-library'); list.setAttribute('aria-label', '画布标签库');
    const add = button('＋ 添加标签', () => choose(null)); sidebar.append(list, add);
    const editor = el('form', 'flora-tag-editor'); editor.addEventListener('submit', save);
    const nameLabel = el('label', 'flora-tag-field', '标签名称'), nameInput = el('input'); nameInput.id = 'flora-tag-name-input'; nameInput.autocomplete = 'off'; nameInput.maxLength = 48; nameInput.setAttribute('aria-label', '标签名称'); nameLabel.append(nameInput);
    const count = el('span', 'flora-tag-muted', '0/24'); nameLabel.append(count);
    const colorLabel = el('label', 'flora-tag-field', '标签颜色'), colorRow = el('div', 'flora-tag-color-row');
    const colorPicker = el('input', 'flora-tag-color-input'); colorPicker.type = 'color'; colorPicker.setAttribute('aria-label', '自定义标签颜色');
    const hexInput = el('input'); hexInput.setAttribute('aria-label', '十六进制颜色'); hexInput.maxLength = 7; colorRow.append(colorPicker, hexInput); colorLabel.append(colorRow);
    const swatches = el('div', 'flora-tag-swatches'); swatches.setAttribute('aria-label', '预设颜色');
    for (const color of rules.presets) { const swatch = button('', () => setColor(color)); swatch.setAttribute('aria-label', `选择颜色 ${color}`); swatch.title = `选择颜色 ${color}`; swatch.style.setProperty('--swatch-color', color); swatch.dataset.color = color; swatches.append(swatch); }
    const preview = el('div', 'flora-tag-preview'), previewBadge = el('span', 'flora-tag-preview-badge'); preview.append(el('span', 'flora-tag-muted', '标签预览'), previewBadge);
    const errorArea = el('p', 'flora-tag-error'); errorArea.hidden = true; errorArea.setAttribute('role', 'alert');
    const confirm = el('div', 'flora-tag-delete-confirm'); confirm.hidden = true; confirm.setAttribute('role', 'alert');
    const actions = el('div', 'flora-tag-manager-actions'), remove = button('删除标签', () => {
      confirm.replaceChildren(el('p', '', '删除此标签后，所有使用它的节点都会移除该标签。确认删除？'), button('取消', () => { confirm.hidden = true; remove.focus(); }), button('确认删除标签', deleteDefinition)); confirm.hidden = false;
      confirm.querySelector('button')?.focus();
    }); remove.dataset.destructive = 'true';
    const submit = button('保存', save); submit.dataset.primary = 'true'; actions.append(remove, submit);
    editor.append(nameLabel, colorLabel, el('p', 'flora-tag-muted', '预设颜色'), swatches, preview, errorArea, confirm, actions);
    body.append(sidebar, editor); dialog.append(heading, subtitle, body); surface().append(dialog);
    manager = { dialog, node, assignNew: creating };
    let draft, draftId = '', isNew = false;
    function paint() {
      count.textContent = `${[...nameInput.value].length}/24`; draft.name = nameInput.value; draft.color = hexInput.value.toUpperCase();
      const valid = /^#[\dA-F]{6}$/.test(draft.color);
      previewBadge.textContent = draft.name.trim() || '新标签';
      if (valid) { previewBadge.style.background = draft.color; previewBadge.style.color = rules.foreground(draft.color); colorPicker.value = draft.color; }
      for (const swatch of swatches.children) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === draft.color));
    }
    function setColor(color) { hexInput.value = color.toUpperCase(); paint(); }
    nameInput.addEventListener('input', paint); hexInput.addEventListener('input', paint); colorPicker.addEventListener('input', () => setColor(colorPicker.value));
    function renderList() {
      list.replaceChildren();
      for (const label of library) {
        const row = button('', () => choose(label)); row.dataset.labelId = label.id; row.setAttribute('aria-pressed', String(draftId === label.id && !isNew));
        const dot = el('span', 'flora-tag-dot'); dot.style.background = label.color; row.append(dot, el('span', 'flora-tag-name', label.name)); list.append(row);
      }
      if (!library.length) list.append(el('p', 'flora-tag-muted', '标签库为空。'));
    }
    function choose(label) {
      if (busy) return;
      isNew = !label; draftId = label?.id || `tag-${root.crypto.randomUUID()}`;
      draft = label ? { ...label } : { id: draftId, name: '', color: rules.presets[8] };
      nameInput.value = draft.name; hexInput.value = draft.color; remove.hidden = isNew;
      submit.textContent = isNew && manager?.assignNew ? '保存并添加到节点' : '保存';
      confirm.hidden = true; errorArea.hidden = true; renderList(); paint(); nameInput.focus();
    }
    function pending(value) { dialog.querySelectorAll('button,input').forEach(item => { item.disabled = value; }); submit.textContent = value ? '保存中…' : isNew && manager?.assignNew ? '保存并添加到节点' : '保存'; }
    async function save(event) {
      event?.preventDefault(); if (busy) return;
      try {
        paint(); const next = library.filter(label => label.id !== draftId);
        const index = library.findIndex(label => label.id === draftId);
        next.splice(index < 0 ? next.length : index, 0, draft); rules.validate(next);
        pending(true); const assign = isNew && manager?.assignNew;
        await commit({ definitions: next, ...(assign ? { node, labelId: draftId } : {}) });
        if (!dialog.isConnected) return;
        if (assign) { closeManager(); return; }
        isNew = false; draft = { ...library.find(label => label.id === draftId) }; remove.hidden = false; renderList(); errorArea.hidden = true;
      } catch (error) { showError(errorArea, error); }
      finally { pending(false); }
    }
    async function deleteDefinition() {
      if (busy) return;
      pending(true);
      try { await commit({ definitions: library.filter(label => label.id !== draftId) }); pending(false); choose(library[0] || null); }
      catch (error) { showError(errorArea, error); }
      finally { pending(false); }
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) closeManager(); });
    dialog.addEventListener('click', event => { const r = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) && !busy) closeManager(); });
    dialog.showModal(); choose(creating ? null : library.find(label => label.id === node?.dataset.nodeLabelId) || library[0] || null);
  }
  function close() { closePicker(false); closeManager(false); }
  root.addEventListener('canvas:selectionchange', () => { syncAll(); if (picker && !picker.node.classList.contains('is-selected')) closePicker(false); });
  root.addEventListener('resize', positionPicker);
  root.addEventListener('fullscreenchange', close);
  root.FloraNodeTags = { mount, unmount, sync, setDefinitions, definitions, resolve, hydrate, close, setHost(value) { host = value; } };
})(window);
