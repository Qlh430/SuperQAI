(function installFloraTextTools(root) {
  'use strict';
  const states = new Map();
  const backgrounds = [
    ['default', '默认背景', null], ['cyan', '青色背景', 7], ['blue', '蓝色背景', 5],
    ['purple', '紫色背景', 4], ['orange', '橙色背景', 1], ['yellow', '黄色背景', 0],
  ];
  let host;
  function normalize(value) { return backgrounds.some(([id]) => id === value) ? value : 'default'; }
  function color(id) {
    const index = backgrounds.find(([key]) => key === id)?.[2];
    return index == null ? 'var(--canvas-neon-card)' : root.CanvasNodeTagRules.presets[index];
  }
  function sync(node) {
    const id = normalize(node.dataset.textBackground);
    node.dataset.textBackground = id;
    node.style.setProperty('--flora-text-background', id === 'default' ? 'var(--canvas-neon-card)' : `color-mix(in srgb, ${color(id)} 22%, var(--canvas-neon-card))`);
    const state = states.get(node);
    if (!state) return;
    state.background.style.setProperty('--flora-text-swatch', color(id));
    state.palette.querySelectorAll('[data-text-background]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.textBackground === id)));
    if (state.title) state.title.textContent = `${node.dataset.nodeTitle || node.dataset.textName || '文字'}.md`;
  }
  function action(id, title, icon) {
    const button = root.CanvasNodeActionBar.createButton({ id, title, icon, modifierClass: 'flora-node-action flora-node-icon-action' });
    button.dataset.floraAction = id;
    return button;
  }
  function closePalette(state, focus = false) {
    state.palette.hidden = true;
    state.background.setAttribute('aria-expanded', 'false');
    if (focus) state.background.focus({ preventScroll: true });
  }
  function placePalette(state) {
    const rect = state.background.getBoundingClientRect(), palette = state.palette;
    const width = palette.offsetWidth, height = palette.offsetHeight;
    palette.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.x + rect.width / 2 - width / 2))}px`;
    palette.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, rect.bottom + 8))}px`;
  }
  function download(node) {
    const text = node.querySelector('.canvas-text');
    // Read the current semantic DOM while editing, including uncommitted input.
    const markdown = root.CanvasTextNodeRenderer.toMarkdown(text);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    const name = (node.dataset.nodeTitle || node.dataset.textName || '文字').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.md$/i, '').trim() || '文字';
    link.href = url; link.download = `${name}.md`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function collapse(state, focus = true) {
    if (!state.expanded) return;
    state.expanded = false;
    if (state.dialog.open) state.dialog.close();
    state.textSlot.replaceWith(state.text);
    state.formatSlot?.replaceWith(state.formats);
    state.text.classList.remove('is-flora-expanded-text');
    root.CanvasTextNodeRenderer.commitEdit(state.text);
    state.expand.setAttribute('aria-expanded', 'false');
    if (focus && state.node.isConnected) state.expand.focus({ preventScroll: true });
  }
  function expand(state) {
    closePalette(state);
    root.FloraGeneratorParameters?.close?.(state.node);
    if (!state.dialog) {
      const dialog = document.createElement('dialog');
      dialog.className = 'flora-text-expanded-dialog'; dialog.setAttribute('aria-label', '放大文字编辑');
      const header = document.createElement('div'); header.className = 'flora-text-expanded-header';
      const title = document.createElement('span'); title.className = 'flora-text-expanded-title';
      const save = action('expanded-text-download', '下载 Markdown 文档', 'download');
      const close = action('expanded-text-close', '关闭文字放大界面', 'x');
      save.addEventListener('click', () => download(state.node)); close.addEventListener('click', () => collapse(state));
      header.append(title, save, close);
      const formats = document.createElement('div'); formats.className = 'flora-text-expanded-format-bar'; formats.setAttribute('role', 'toolbar'); formats.setAttribute('aria-label', '文字格式');
      const body = document.createElement('div'); body.className = 'flora-text-expanded-body';
      dialog.append(header, formats, body); state.node.querySelector('.flora-node-shell').append(dialog);
      Object.assign(state, { dialog, title, body, formatBar: formats });
      dialog.addEventListener('cancel', event => { event.preventDefault(); collapse(state); });
      dialog.addEventListener('close', () => collapse(state));
      dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); collapse(state); }
      }, true);
      for (const type of ['pointerdown', 'click', 'dblclick', 'wheel', 'keydown', 'keyup', 'paste', 'drop']) dialog.addEventListener(type, event => event.stopPropagation());
    }
    state.text = state.node.querySelector('.canvas-text');
    state.formats = state.node.querySelector('.flora-text-format-tools');
    state.textSlot = document.createComment('Flora text editor'); state.text.replaceWith(state.textSlot);
    if (state.formats) { state.formatSlot = document.createComment('Flora text formats'); state.formats.replaceWith(state.formatSlot); state.formatBar.append(state.formats); }
    state.body.append(state.text); state.text.classList.add('is-flora-expanded-text');
    state.expanded = true; sync(state.node); state.expand.setAttribute('aria-expanded', 'true');
    state.dialog.showModal(); root.CanvasTextNodeRenderer.beginEdit(state.text);
    root.lucide?.createIcons?.({ root: state.dialog });
  }
  function unmount(node) {
    const state = states.get(node); if (!state) return;
    collapse(state, false);
    state.palette.remove(); state.dialog?.remove();
    document.removeEventListener('pointerdown', state.outside, true);
    document.removeEventListener('keydown', state.escape, true);
    root.removeEventListener('resize', state.resize); root.removeEventListener('canvas:selectionchange', state.selection);
    states.delete(node);
  }
  function mount(node, toolbar) {
    if (!node.classList.contains('canvas-node-text')) return;
    const existing = states.get(node);
    if (existing?.toolbar === toolbar) { sync(node); return; }
    if (existing) unmount(node);
    const background = action('text-background', '背景色', 'square');
    background.classList.add('flora-text-background-action'); background.setAttribute('aria-expanded', 'false');
    const expandButton = action('text-expand', '放大文字', 'maximize-2'); expandButton.setAttribute('aria-expanded', 'false');
    const save = action('text-download', '下载 Markdown 文档', 'download');
    const palette = document.createElement('div'); palette.className = 'flora-text-palette'; palette.hidden = true;
    palette.setAttribute('role', 'group'); palette.setAttribute('aria-label', '文字背景色');
    (document.querySelector('#canvasEditorScreen') || document.body).append(palette);
    const state = { node, toolbar, background, expand: expandButton, palette, expanded: false }; states.set(node, state);
    backgrounds.forEach(([id, title]) => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.textBackground = id;
      button.setAttribute('aria-label', title); button.title = title; button.style.setProperty('--flora-text-swatch', color(id));
      button.addEventListener('click', event => { event.stopPropagation(); host?.setBackground(node, id); sync(node); closePalette(state, true); });
      palette.append(button);
    });
    for (const type of ['pointerdown', 'click', 'dblclick', 'keydown']) palette.addEventListener(type, event => event.stopPropagation());
    background.addEventListener('click', event => {
      event.stopPropagation();
      if (!palette.hidden) return closePalette(state);
      states.forEach(other => closePalette(other)); palette.hidden = false; placePalette(state);
      background.setAttribute('aria-expanded', 'true'); palette.querySelector('[aria-pressed="true"]')?.focus();
    });
    expandButton.addEventListener('click', event => { event.stopPropagation(); expand(state); });
    save.addEventListener('pointerdown', event => event.preventDefault());
    save.addEventListener('click', event => { event.stopPropagation(); download(node); });
    toolbar.append(background, expandButton, save);
    state.outside = event => { if (!palette.contains(event.target) && !background.contains(event.target)) closePalette(state); };
    state.escape = event => { if (event.key === 'Escape' && !palette.hidden) { event.preventDefault(); event.stopPropagation(); closePalette(state, true); } };
    state.resize = () => { if (!palette.hidden) placePalette(state); };
    state.selection = () => { if (!node.classList.contains('is-selected')) closePalette(state); };
    document.addEventListener('pointerdown', state.outside, true); document.addEventListener('keydown', state.escape, true);
    root.addEventListener('resize', state.resize); root.addEventListener('canvas:selectionchange', state.selection);
    sync(node); queueMicrotask(() => root.lucide?.createIcons?.({ root: toolbar }));
  }
  root.FloraTextTools = Object.freeze({ mount, unmount, sync, normalize, setHost(value) { host = value; } });
})(window);
