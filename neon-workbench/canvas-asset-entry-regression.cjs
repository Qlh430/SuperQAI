const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = path.join(__dirname, 'design-sources/canvas-asset-entry.js');
assert.ok(fs.existsSync(file), '画布应安装资产快照入口');
const dispatched = [], nodes = new Map(), models = new Map();
const state = { activeBoardId: 'board-a', selectedIds: new Set() };
const root = { location: { href: 'http://localhost/' }, dispatchEvent: event => dispatched.push(event), addEventListener() {} };
function node(id, kind, output, data = {}) {
  const value = { dataset: { id, boardId: 'board-a', ...data }, output,
    classList: { contains: name => name === `canvas-node-${kind}` || name === 'is-selected' && state.selectedIds.has(id) },
    querySelector: () => null };
  nodes.set(id, value); return value;
}
const context = { window: root, URL, CustomEvent: class { constructor(type, detail) { this.type = type; Object.assign(this, detail); } },
  document: { addEventListener() {}, querySelector: () => null }, canvasState: state,
  getCanvasNode: id => nodes.get(String(id)), getCanvasNodeModel: id => models.get(String(id)),
  getCanvasNodeOutput: value => value.output, getCanvasVirtualNodeOutput: value => value.output,
  getCanvasGroupMemberIds: value => value.members || [], getCanvasAssetCollection: value => value.collection,
  getCanvasGalleryContainer: value => value.gallery,
};
vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
const api = root.NeonCanvasAssets;
const plain = value => JSON.parse(JSON.stringify(value));
const image = node('image', 'image', { type: 'image', url: '/output/thumb.jpg', originalUrl: '/output/original.png', name: '画面' }, { resultDownloadUrl: '/output/saved.png', currentGenerationId: 'current' });
root.FloraGenerationHistory = { serialize: () => ({ currentGenerationId: 'current', generationHistory: [{ id: 'old', kind: 'image', src: '/output/old.png' }, { id: 'current', kind: 'image', src: '/output/preview.png', savedUrl: '/output/current.png' }] }) };
assert.deepEqual(plain(api.snapshotSelection(image)), [{ url: '/output/current.png', kind: 'image', title: '画面' }]);
const snapshot = api.snapshotSelection(image); image.dataset.currentGenerationId = 'next'; image.output.url = '/output/next.png';
assert.equal(snapshot[0].url, '/output/current.png', '更换节点结果不能改写已捕获快照');
delete root.FloraGenerationHistory;
const video = node('video', 'video-api', { type: 'video', url: '/output/movie.mp4', name: '视频', mimeType: 'video/mp4' });
const empty = node('empty', 'image', { type: 'generator', name: '任务' });
state.selectedIds = new Set(['image', 'video', 'empty', 'virtual']);
models.set('virtual', { id: 'virtual', kind: 'audio', output: { type: 'audio', url: '/output/voice.mp3', name: '声音' } });
assert.deepEqual(plain(api.snapshotSelection(video)).map(value => value.kind), ['image', 'video', 'audio']);
assert.deepEqual(plain(api.snapshotSelection(empty)), [{ url: '/output/saved.png', kind: 'image', title: '画面' }, { url: '/output/movie.mp4', kind: 'video', title: '视频', mimeType: 'video/mp4' }, { url: '/output/voice.mp3', kind: 'audio', title: '声音' }]);
state.selectedIds.clear(); assert.deepEqual(plain(api.snapshotSelection(empty)), []);
const group = node('group', 'group', null); group.members = ['image', 'virtual'];
assert.equal(api.snapshotSelection(group).length, 2, '组内离屏媒体也应来自现有模型快照');
const gallery = node('gallery', 'gallery-container', null); gallery.gallery = { members: [{ id: 'one', src: '/output/small.jpg', savedUrl: '/output/large.png', name: '成员' }] };
assert.deepEqual(plain(api.snapshotSelection(gallery, 'one')), [{ url: '/output/large.png', kind: 'image', title: '成员' }]);
assert.equal(api.open([{ url: 'javascript:alert(1)', kind: 'image' }]), false);
assert.equal(api.open([{ url: '/output/stable.png', kind: 'image', title: '稳定', nodeId: 'ignore' }]), true);
assert.deepEqual(plain(dispatched.at(-1).detail), { items: [{ url: '/output/stable.png', kind: 'image', title: '稳定' }], boardId: 'board-a' });
assert.equal(api.open([{ url: 'http://localhost/output/original.png?cache=1#view', kind: 'image' }]), true);
assert.equal(dispatched.at(-1).detail.items[0].url, '/output/original.png');
assert.equal(api.open([{ url: 'https://foreign.example/output/original.png', kind: 'image' }]), false);
assert.equal(api.open([{ url: '/output/invalid%5Cfile.png', kind: 'image' }]), false);
const canonical = fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8');
assert.match(canonical, /NeonCanvasAssets\?\.handleContextMenu\(event\)/, '宿主右键事件必须接入新入口');
const bar = fs.readFileSync(path.join(__dirname, 'design-sources/node-action-bar.js'), 'utf8');
assert.match(bar, /NeonCanvasAssets\?\.mountToolbar/, '移动端共享更多入口必须复用节点工具栏');
console.log('画布资产入口：当前结果快照、空任务过滤、批量、离屏成员、原图与入口回归通过');

async function bridgeRegression() {
  const elements = new Map(), events = new Map(), messages = [];
  let session = { user: { id: 'account-a' } };
  function element(tag) {
    const item = { tag, hidden: false, inert: false, isConnected: true, style: { display: '', zIndex: '', pointerEvents: '', background: '' }, dataset: {}, children: [],
      append(...children) { this.children.push(...children); children.forEach(child => { child.parentNode = this; if (child.id) elements.set(child.id, child); }); },
      appendChild(child) { this.append(child); }, remove() { this.isConnected = false; elements.delete(this.id); },
      querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, focus() { document.activeElement = this; },
      style: Object.assign({ setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } }, { display: '', zIndex: '', pointerEvents: '', background: '' }) };
    if (tag === 'iframe') item.contentWindow = { postMessage: message => messages.push(message) };
    return item;
  }
  const desktop = element('desktop'); elements.set('aiOsDesktop', desktop);
  const body = element('body'); body.classList = { add() {}, remove() {} };
  const document = { getElementById: id => elements.get(id), createElement: element, body, documentElement: { dataset: {} }, activeElement: null };
  const view = element('view');
  const window = { AiOsDesktop: { getSession: () => session, openInlineApp: async () => {} }, AiOsModuleLoader: { ensure: async () => ({ ok: true }) },
    AiOsLegacyWorkbench: { getView: () => view }, CanvasWorkspace: { saveForNavigation: async () => {}, openBoardByResourceId: async () => true },
    addEventListener(type, fn) { events.set(type, fn); }, dispatchEvent(event) { events.get(event.type)?.(event); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'host-bridge.js'), 'utf8'), { window, document, URL, location: { origin: 'http://localhost', reload() {} }, CustomEvent: context.CustomEvent, MutationObserver: class { observe() {} } });
  const frame = elements.get('aiOsNeonFrame');
  const action = (name, params = {}) => events.get('message')({ source: frame.contentWindow, origin: 'http://localhost', data: { type: 'neon:action', action: name, params } });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  events.get('canvas:board-changed')?.({ detail: { boardId: 'board-a' } });
  events.get('neon:request-add-assets')?.({ detail: { items: [{ url: '/output/first.png', kind: 'image', title: '图片' }], boardId: 'board-a' } });
  assert.equal(messages.filter(item => item.type === 'neon:add-assets').length, 0, '管理页不能打开画布资产弹窗');
  action('canvas', { resourceId: 'resource-a' }); await tick();
  const surface = elements.get('neonEngineSurface');
  frame.style.display = ''; frame.style.zIndex = '9999'; frame.style.pointerEvents = ''; frame.style.background = 'original';
  surface.style.pointerEvents = 'auto'; view.focus();
  const request = (url, boardId = 'board-a') => events.get('neon:request-add-assets')?.({ detail: { items: [{ url, kind: 'image', title: '图片', nodeId: 'strip' }], boardId } });
  request('/output/snapshot.png'); await tick();
  assert.equal(frame.hidden, false, '画布上方必须显示 React 弹窗 iframe');
  assert.equal(frame.style.background, 'transparent'); assert.equal(surface.style.pointerEvents, 'none');
  const first = messages.at(-1); assert.equal(first.type, 'neon:add-assets'); assert.ok(first.requestId);
  assert.deepEqual(plain(first.items), [{ url: '/output/snapshot.png', kind: 'image', title: '图片' }]);
  action('assetDialogClosed', { requestId: 'stale' }); await tick(); assert.equal(frame.hidden, false);
  action('assetDialogClosed', { requestId: first.requestId }); await tick();
  assert.equal(frame.hidden, true); assert.equal(frame.style.background, 'original'); assert.equal(frame.style.zIndex, '9999');
  assert.equal(surface.style.pointerEvents, 'auto'); assert.equal(document.activeElement, view);
  request('/output/second.png'); await tick(); const second = messages.at(-1);
  action('assetDialogClosed', { requestId: first.requestId }); await tick(); assert.equal(frame.hidden, false, '旧关闭回调不能关闭新的弹窗');
  events.get('canvas:board-changed')({ detail: { boardId: 'board-b' } }); await tick();
  assert.equal(frame.hidden, true, '画布改变必须清理旧弹窗');
  request('/output/wrong.png'); await tick(); assert.equal(messages.filter(item => item.type === 'neon:add-assets').length, 2);
  session = { user: { id: 'account-b' } };
  request('/output/cross-account.png', 'board-b'); await tick(); assert.equal(messages.filter(item => item.type === 'neon:add-assets').length, 2);
  events.get('ai-os-session')(); assert.equal(frame.isConnected, false);
  assert.ok(second.requestId !== first.requestId);
  console.log('画布资产桥接：会话与画布守卫、透明层、准确状态与焦点恢复、过期关闭回调回归通过');
}
bridgeRegression().catch(error => { console.error(error); process.exitCode = 1; });
