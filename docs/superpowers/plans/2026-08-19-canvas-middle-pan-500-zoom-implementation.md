# 画布中键平移与 500% 缩放实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户可在画布任意位置按住鼠标中键平移，并把画布最大缩放比例从 400% 提高到 500%。

**Architecture:** 复用现有 `beginCanvasPan(event)` 平移路径，以捕获阶段的独立 `pointerdown` 监听器优先接管中键，避免节点内部控件阻止冒泡。缩放继续由 `normalizeCanvasScale` 统一约束，只调整上限常量；静态检查覆盖捕获优先级、默认行为阻止、提示文案和缩放边界。

**Tech Stack:** 原生 JavaScript、Pointer Events、Node.js `assert` 静态契约检查、现有 npm 回归脚本。

## Global Constraints

- 缩放范围必须为 5%–500%。
- 中键必须能从空白区域和任意节点内容上开始平移。
- 中键平移不得选中、移动或取消选择节点。
- 保留左键节点操作、空白左键平移、Ctrl 框选和滚轮缩放现有行为。
- 阻止中键自动滚动和 `auxclick` 默认行为。
- 不修改图片原图加载策略。

---

### Task 1: 500% 缩放边界

**Files:**
- Modify: `tools/check-canvas-zoom-range.js`
- Modify: `script.js:322-328`

**Interfaces:**
- Consumes: `normalizeCanvasScale(value, fallback = 1) -> number`
- Produces: `CANVAS_SCALE_MAX = 5`，所有缩放和恢复入口共享 500% 上限。

- [x] **Step 1: 写入失败的缩放边界检查**

把测试中的上限契约改为：

```js
assert.match(script, /const CANVAS_SCALE_MAX = 5;/);

vm.runInNewContext(`
  const CANVAS_SCALE_MIN = 0.05;
  const CANVAS_SCALE_MAX = 5;
  ${normalizeSource}
  this.normalizeCanvasScale = normalizeCanvasScale;
`, scaleContext);

assert.strictEqual(scaleContext.normalizeCanvasScale(4), 4);
assert.strictEqual(scaleContext.normalizeCanvasScale(5), 5);
assert.strictEqual(scaleContext.normalizeCanvasScale(6), 5);
```

- [x] **Step 2: 运行检查并确认按预期失败**

Run: `node .\tools\check-canvas-zoom-range.js`

Expected: FAIL，因为生产代码仍声明 `CANVAS_SCALE_MAX = 4`。

- [x] **Step 3: 实现最小缩放修改**

在 `script.js` 中修改：

```js
const CANVAS_SCALE_MIN = 0.05;
const CANVAS_SCALE_MAX = 5;
```

- [x] **Step 4: 运行缩放检查确认通过**

Run: `node .\tools\check-canvas-zoom-range.js`

Expected: `Canvas zoom range checks passed.`

### Task 2: 中键优先平移

**Files:**
- Modify: `tools/check-canvas-zoom-range.js`
- Modify: `script.js:2973`
- Modify: `script.js:3358-3380`
- Modify: `script.js:11142-11161`

**Interfaces:**
- Consumes: `beginCanvasPan(event) -> void`
- Produces: 中键捕获阶段平移入口，以及视口中键 `auxclick` 抑制。

- [x] **Step 1: 写入失败的中键交互检查**

在缩放检查中加入：

```js
const middlePanBlock = extractBlock(
  'viewport.addEventListener("pointerdown", (event) => {\n    if (event.button !== 1) return;',
  '}, { capture: true });',
);
assert.match(middlePanBlock, /event\.stopImmediatePropagation\(\)/);
assert.match(middlePanBlock, /beginCanvasPan\(event\)/);
assert.match(script, /viewport\.addEventListener\("auxclick", \(event\) => \{[\s\S]*event\.button === 1[\s\S]*event\.preventDefault\(\)[\s\S]*\}, \{ capture: true \}\);/);
assert.match(extractFunction("beginCanvasPan"), /event\.button !== 0 && event\.button !== 1/);
assert.match(script, /中键拖动画布/);
```

- [x] **Step 2: 运行检查并确认按预期失败**

Run: `node .\tools\check-canvas-zoom-range.js`

Expected: FAIL，因为尚无中键优先分支和提示文案。

- [x] **Step 3: 实现中键平移和默认行为抑制**

在视口上增加独立的捕获阶段入口：

```js
viewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 1) return;
  event.stopImmediatePropagation();
  beginCanvasPan(event);
}, { capture: true });

viewport.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
}, { capture: true });
```

扩展平移入口：

```js
function beginCanvasPan(event) {
  if (event.button !== 0 && event.button !== 1) return;
  // 保留现有坐标和平移保存逻辑
}
```

将提示更新为：

```html
<span>Ctrl 框选 · 中键拖动画布 · 滚轮缩放 · 双击文字编辑</span>
```

- [x] **Step 4: 运行中键交互检查确认通过**

Run: `node .\tools\check-canvas-zoom-range.js`

Expected: `Canvas zoom range checks passed.`

### Task 3: 缓存刷新与完整回归

**Files:**
- Modify: `tools/check-global-image-demand-loading.js`
- Modify: `tools/check-canvas-shell-history-theme.js`
- Modify: `index.html:594`
- Verify: `script.js`

**Interfaces:**
- Consumes: 浏览器加载 `script.js` 的查询版本号。
- Produces: `v=20260819-middle-pan`，确保刷新后获取本次交互代码。

- [x] **Step 1: 先更新缓存版本检查**

把两处脚本版本断言更新为：

```js
assert.match(index, /script\.js\?v=20260819-middle-pan&vh=20260812-video-history-gallery&mj=20260806-hd/);
assert.match(html, /script\.js\?v=20260819-middle-pan/);
```

- [x] **Step 2: 运行检查并确认按预期失败**

Run: `node .\tools\check-global-image-demand-loading.js`

Expected: FAIL，因为 `index.html` 仍使用 `20260819-detail-stability`。

- [x] **Step 3: 更新页面脚本缓存键**

在 `index.html` 中改为：

```html
<script src="./script.js?v=20260819-middle-pan&vh=20260812-video-history-gallery&mj=20260806-hd"></script>
```

- [x] **Step 4: 运行聚焦检查和语法检查**

Run:

```powershell
node .\tools\check-canvas-zoom-range.js
node .\tools\check-global-image-demand-loading.js
node .\tools\check-canvas-shell-history-theme.js
node --check .\script.js
```

Expected: 全部退出码为 0。

- [x] **Step 5: 运行完整回归**

Run: `npm run check`

Expected: 全部检查通过，退出码为 0。

- [x] **Step 6: 检查补丁格式和改动范围**

Run:

```powershell
git diff --check
git diff -- script.js index.html tools/check-canvas-zoom-range.js tools/check-global-image-demand-loading.js tools/check-canvas-shell-history-theme.js
```

Expected: 无空白错误；仅包含本功能及工作区原有未提交改动，不覆盖无关内容。
