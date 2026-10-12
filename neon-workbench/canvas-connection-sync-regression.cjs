const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'design-sources', 'script-before-save-bridge.js'), 'utf8')
assert.match(source, /function scheduleCanvasNodePositionPaint\(\)/, '拖动需要有批量位置绘制调度器')
assert.match(source, /start\.nodes\.forEach\(\(item\) => \{[\s\S]*?updateCanvasNodePosition\(item\.node, \{ deferPaint: true \}\);/, '拖动必须延迟到同一帧提交节点位置')
assert.doesNotMatch(source, /function flushCanvasConnectionRenderNow\(\)/, '拖动不能在鼠标事件中同步重算整批连线')
assert.match(source, /function updateCanvasNodePosition\(node, options = \{\}\) \{[\s\S]*?scheduleCanvasConnectionRender\(\{ trailing: false \}\)/, '普通位置更新仍需保留合帧刷新')

const paintBody = source.match(/function scheduleCanvasNodePositionPaint\(\) \{[\s\S]*?\n\}\n\nfunction getCanvasPortPoint/)
assert.ok(paintBody, '找不到拖动位置绘制调度器主体')
assert.match(paintBody[0], /renderCanvasConnectionsNow\(\)/, '拖动必须在同一帧内绘制连线')
assert.doesNotMatch(paintBody[0], /scheduleCanvasConnectionRender/, '拖动不能把连线再推迟一帧')

const scenePaint = source.match(/const paint = \(\) => \{[\s\S]*?\n  \};/)
assert.ok(scenePaint, '找不到多选拖动绘制主体')
assert.match(scenePaint[0], /renderCanvasConnectionsNow\(\)/, '多选拖动必须在同一帧内绘制连线')
assert.doesNotMatch(scenePaint[0], /scheduleCanvasConnectionRender/, '多选拖动不能把连线再推迟一帧')

// Live port rectangles are measured from the painted DOM, so they must be
// converted with the applied viewport instead of the pending canvasState.
assert.match(source, /function screenPointToCanvas\(x, y\) \{[\s\S]*?getCanvasAppliedViewport\(\)/, '端口测量必须按已应用视口换算')
assert.match(source, /function getCanvasPortPoint[\s\S]*?screenPointToCanvas\(/, '端口换算不能使用未应用的画布状态')
assert.match(source, /plane\.style\.transform = `translate\(\$\{canvasState\.x\}px, \$\{canvasState\.y\}px\) scale\(\$\{canvasState\.scale\}\) translateZ\(0\)`;[\s\S]{0,160}?canvasAppliedViewport = \{ x: canvasState\.x, y: canvasState\.y, scale: canvasState\.scale \}/, '应用画布变换时必须记录已应用视口')

// The first board fill may use a wider mount slice, but it must always be
// released once the fill ends or the user takes over the viewport.
assert.match(source, /function applyCanvasRestoreMountBudget\(\)/, '首屏挂载需要更宽的切片')
assert.match(source, /function releaseCanvasRestoreMountBudget\(\)/, '首屏预算必须可以恢复')
assert.match(source, /if \(!detail\.remaining\) releaseCanvasRestoreMountBudget\(\)/, '首屏填充完成后必须恢复交互预算')
assert.match(source, /function markCanvasViewportInteraction\(\) \{[\s\S]*?releaseCanvasRestoreMountBudget\(\)/, '平移缩放开始必须恢复交互预算')
assert.match(source, /viewport\.addEventListener\("pointerdown", \(event\) => \{[\s\S]*?releaseCanvasRestoreMountBudget\(\)/, '用户点按画布必须恢复交互预算')
console.log(JSON.stringify({ ok: true, checks: ['drag-connection-sync', 'batched-node-move', 'deferred-fallback'] }))
