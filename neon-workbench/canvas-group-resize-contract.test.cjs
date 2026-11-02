const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const bridgePath = path.join(root, 'design-sources', 'script-before-save-bridge.js');
const surfacePath = path.join(root, 'design-sources', 'neon-canvas-surface.css');
const floraPath = path.join(root, 'design-sources', 'flora-node-shell.css');
const shellPath = path.join(root, 'design-sources', 'flora-node-shell.js');
const bridge = fs.readFileSync(bridgePath, 'utf8');
const surface = fs.readFileSync(surfacePath, 'utf8');
const flora = fs.readFileSync(floraPath, 'utf8');
const shell = fs.readFileSync(shellPath, 'utf8');

assert.match(bridge, /canvas-selection-resize-handle/,
  '多选框必须提供独立的整体缩放控制点');
assert.match(bridge, /function beginCanvasSelectionResize\(/,
  '多选缩放必须有独立的交互处理器');
assert.match(bridge, /function ensureCanvasGroupResizeProxy\(/,
  '正式组必须有独立于成员层级的缩放命中代理');
assert.match(bridge, /function getCanvasGroupResizeModel\(/,
  '正式组缩放必须先把旧组几何归一化为有限值');
assert.match(bridge, /function syncCanvasGroupResizeProxies\(/,
  '正式组选择状态变化时必须同步缩放代理的可见性');
assert.match(bridge, /selectedIds[\s\S]*groupMembers[\s\S]*canvas-group-resize-proxy/,
  '选中组内成员时也必须显示所属组的缩放代理');
assert.match(bridge, /selectedSingleImage[\s\S]*flora-hide-image-info/,
  '选中 Flora 单图节点时必须持续隐藏共享图片信息栏');
assert.match(bridge, /function updateCanvasSelectionFrame\(\)[\s\S]*?syncCanvasGroupResizeProxies\(\)/,
  '选中或取消选中组时必须刷新缩放代理');
assert.match(bridge, /function expandCanvasGroupFrameToMembers\(/,
  '恢复画布时必须检查组框是否覆盖全部成员');
assert.match(bridge, /function completeCanvasBoardRestore\([\s\S]*?expandCanvasGroupFramesAfterRestore\(\)/,
  '打开画布完成恢复前必须修复过小的组框');
assert.match(bridge, /event\.currentTarget\.dataset\.groupId[\s\S]*?getCanvasNode\(event\.currentTarget\.dataset\.groupId\)/,
  '组缩放代理必须把事件路由回正式组节点');

const groupResize = bridge.match(/async function beginCanvasGroupResize[\s\S]*?\r?\n}\r?\n\r?\nasync function beginCanvasSelectionResize/);
assert.ok(groupResize, '组缩放处理器应保持独立边界');
assert.doesNotMatch(groupResize[0], /model\.width \* factor|model\.height \* factor|model\.x - anchorX|model\.y - anchorY/,
  '正式组缩放不能按比例改写成员的位置和尺寸');
assert.match(groupResize[0], /getCanvasGroupResizeGeometry\(group\)/,
  '正式组缩放的起始框必须使用有限几何值');
assert.match(groupResize[0], /Number\(memberFrame\.x\) \+ Number\(memberFrame\.width\)/,
  '正式组缩放的成员最小边界必须按模型的 x/width 计算');
assert.doesNotMatch(groupResize[0], /memberFrame\.right|memberFrame\.bottom/,
  '正式组缩放不能读取不存在的成员 right/bottom 字段');
assert.doesNotMatch(groupResize[0], /loadCanvasSelectedModels\(\[group\.dataset\.id, \.\.\.ids\]\)/,
  '正式组缩放不能等待成员异步加载后再提交组框');
assert.match(groupResize[0], /after\?\.\[0\] \|\| getCanvasGroupResizeModel\(group, start\.box\)/,
  '正式组缩放结束时必须提交合法组模型，不能重新序列化 NaN DOM');
assert.match(groupResize[0], /调整组框/,
  '正式组缩放应记录为组框调整');

assert.match(surface, /canvas-selection-resize-handle[\s\S]*?pointer-events:\s*auto/,
  '多选缩放控制点必须可交互');
assert.match(surface, /canvas-group-resize-proxy:is\(:hover, :focus-visible\)[\s\S]*?pointer-events:\s*auto/,
  '鼠标移到组缩放代理时不能因为组失去 hover 而丢失命中');
assert.match(flora, /data-canvas-group-member[\s\S]*?canvas-node-bar[\s\S]*?display:\s*none/,
  '组成员的旧标题栏必须从可见绘制层移除');
assert.match(flora, /canvas-node\[data-flora-node="true"\] > \.canvas-resize-handle[\s\S]*?position:\s*absolute\s*!important/,
  'Flora 壳体的直接子元素层不能把缩放控件重新设回流式定位');
assert.match(shell, /const resizeHandle = node\.querySelector\("\:scope > \.canvas-resize-handle"\)[\s\S]*?resizeHandle\.style\.setProperty\("position", "absolute", "important"\)/,
  'Flora 壳体挂载时必须把既有缩放控件恢复到右下角定位');
assert.match(flora, /\.flora-node-label-icon\s*\{[\s\S]*?display:\s*grid[\s\S]*?flex:\s*0\s+0\s+16px[\s\S]*?min-width:\s*16px/,
  'Flora 标题图标必须保留固定槽位，避免点击前后发生布局变化');
assert.match(flora, /\.flora-node-label-title\s*\{[\s\S]*?flex:\s*1\s+1\s+auto[\s\S]*?width:\s*0[\s\S]*?box-sizing:\s*border-box/,
  'Flora 标题必须在节点宽度内稳定布局');
assert.match(surface, /\.canvas-light-title\s*\{[\s\S]*?flex:\s*1\s+1\s+auto[\s\S]*?width:\s*0[\s\S]*?box-sizing:\s*border-box/,
  'Light 标题必须与 Full 使用相同的图标槽位和剩余宽度布局');
const composer = fs.readFileSync(path.join(root, 'design-sources', 'flora-generator-composer.js'), 'utf8');
const requestReveal = composer.match(/function requestReveal\([\s\S]*?\r?\n  \}\r?\n/);
assert.ok(requestReveal, '点击节点显示操作区必须保留独立的显示逻辑');
assert.doesNotMatch(requestReveal[0], /flora-generator-reveal|screenDeltaX|screenDeltaY|dispatchEvent\(/,
  '点击节点显示操作区时不能自动平移或缩放节点所在画布');
assert.match(shell, /const savedWidth = Number\(node\.dataset\.width\)[\s\S]*?const savedHeight = Number\(node\.dataset\.height\)[\s\S]*?savedWidth > 0 \? savedWidth : FLORA_NODE_WIDTH/,
  '点击从 Light 切换到 Full 时必须沿用节点当前宽度');
assert.match(shell, /savedHeight > 0 \? savedHeight : FLORA_NODE_HEIGHT/,
  '点击从 Light 切换到 Full 时必须沿用节点当前高度');
assert.match(flora, /canvas-node\[data-flora-node="true"\]\s*\{[\s\S]*?width:\s*var\(--flora-node-width,\s*400px\)[\s\S]*?height:\s*calc\(var\(--flora-node-height,\s*400px\)/,
  'Flora 节点外框必须接受手动宽高，不能继续锁死 400px');
assert.match(surface, /canvas-node:not\(\.canvas-node-group\) > \.canvas-node-bar[\s\S]*?display:\s*none/,
  '普通节点的兼容标题栏必须从可见绘制层移除');

const selectionResize = bridge.match(/async function beginCanvasSelectionResize[\s\S]*?\r?\n}\r?\n\r?\nfunction beginCanvasNodeResize/);
assert.ok(selectionResize, '多选缩放处理器应保持独立边界');
assert.match(selectionResize[0], /const before = ids\.map\(id =>/,
  '多选缩放必须在 pointerdown 同步读取当前节点模型');
assert.match(selectionResize[0], /const frames = before\.map\(model =>/,
  '多选缩放必须基于每个节点当前视觉外框计算相对位置');
assert.doesNotMatch(selectionResize[0], /const loaded = await loadCanvasSelectedModels\(ids\)/,
  '多选缩放不能在拖动开始后异步加载旧模型覆盖实时坐标');
assert.match(selectionResize[0], /after: toCanvasOperationNode\(model\)/,
  '多选缩放结束时应提交拖动期间生成的模型快照');
assert.match(bridge, /function updateCanvasSelectionFrame\([\s\S]*?getCanvasGroupSubjectBounds\(model\)[\s\S]*?toClientRect/,
  '多选选框必须使用与节点模型一致的世界坐标外框，不能读取滞后的 DOM 宽度');
assert.match(bridge, /function beginCanvasNodeResize\([\s\S]*?node\.dataset\.mediaSizeMode = "manual";/,
  '单节点手动缩放必须切换到 manual 尺寸模式，避免自适应媒体把结果覆盖');

console.log('canvas-group-resize-contract: ok');

assert.match(bridge, /renderCanvasGroupNode[\s\S]*?node\.append\(createCanvasPort\("input"\), outputPort, bar, count\);/,
  '正式组只能使用画布顶层代理作为缩放命中点，不能保留会遮挡代理的组内旧 handle');
assert.match(surface, /canvas-group-resize-proxy[\s\S]*?z-index:\s*1000000/,
  '正式组缩放代理必须位于高 z-index 组框之上，确保右下角可命中');
assert.match(bridge, /const restoredWidth = Number\(item\.width\)[\s\S]*?const restoredHeight = Number\(item\.height\)[\s\S]*?Number\.isFinite\(restoredWidth\)/,
  '恢复旧组时必须拒绝 NaN 尺寸，避免组代理定位失效');
