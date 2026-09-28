# 生成节点底部控件响应式布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让生成节点在保持底部控件单行的同时，窄状态不挤压、宽状态不无限拉长，并保留提示词区域自由拉宽能力。

**Architecture:** 给空白图片生成节点增加稳定的 `canvas-node-generator` 类型类名，由 CSS 容器查询控制底部网格的宽、窄两种布局。把节点拖拽最小宽度提取为纯函数，使生成节点使用 320px 下限，其他节点维持原规则。

**Tech Stack:** 原生 JavaScript、CSS Grid、CSS Container Queries、Node.js 静态契约测试。

## Global Constraints

- 生成按钮必须始终与比例和分辨率处于同一行。
- 节点最大宽度保持现状，提示词和模型选择继续随节点拉宽。
- 仅生成节点使用 320px 最小宽度，其他节点保持现有最小宽度。
- 不改变图像请求、模型能力、分辨率校验或 Auto 行为。
- 不暂存或提交工作区内已有的功能代码改动。

---

### Task 1: 建立布局与最小宽度回归契约

**Files:**
- Create: `tools/check-canvas-generator-layout.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `script.js` 和 `styles.css` 源码。
- Produces: `node tools/check-canvas-generator-layout.js`，检查生成节点类名、320px 最小宽度、单行宽/窄网格和节点最小宽度函数。

- [ ] **Step 1: 写失败的静态与纯函数测试**

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

assert.match(script, /classList\.toggle\("canvas-node-generator",\s*!src\)/);
assert.match(styles, /\.canvas-node\.canvas-node-generator\s*\{[^}]*min-width:\s*320px/s);
assert.match(styles, /grid-template-columns:\s*minmax\(96px,\s*180px\)\s+112px\s+minmax\(0,\s*1fr\)\s+120px/);
assert.match(styles, /@container\s*\(max-width:\s*459px\)[\s\S]*grid-template-columns:\s*minmax\(76px,\s*1fr\)\s+minmax\(104px,\s*1\.15fr\)\s+96px/);

const functionStart = script.indexOf("function getCanvasNodeMinWidth(");
assert.notStrictEqual(functionStart, -1);
const functionEnd = script.indexOf("\n}", functionStart) + 2;
const context = {};
vm.runInNewContext(`${script.slice(functionStart, functionEnd)}; this.fn = getCanvasNodeMinWidth;`, context);
const node = (...classes) => ({ classList: { contains: (name) => classes.includes(name) } });
assert.strictEqual(context.fn(node("canvas-node-generator")), 320);
assert.strictEqual(context.fn(node("canvas-node-group")), 180);
assert.strictEqual(context.fn(node("canvas-node-image")), 220);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node tools/check-canvas-generator-layout.js`

Expected: FAIL，因为类型类名、响应式网格和 `getCanvasNodeMinWidth` 尚不存在。

- [ ] **Step 3: 把新检查加入总检查**

在 `package.json` 的 `check` 命令末尾追加：

```json
" && node tools/check-canvas-generator-layout.js"
```

### Task 2: 实现生成节点类型与专用最小宽度

**Files:**
- Modify: `script.js:2551`
- Modify: `script.js:7099`

**Interfaces:**
- Consumes: `renderCanvasImageNode(node, { src, name })` 中的 `src` 状态。
- Produces: `canvas-node-generator` 类名和 `getCanvasNodeMinWidth(node): number`。

- [ ] **Step 1: 标记空白生成节点**

在 `renderCanvasImageNode` 更新 `canvas-node-frameless` 后增加：

```js
node.classList.toggle("canvas-node-generator", !src);
```

- [ ] **Step 2: 提取节点最小宽度规则**

在拖拽缩放处理函数之前增加：

```js
function getCanvasNodeMinWidth(node) {
  if (node.classList.contains("canvas-node-group")) return 180;
  if (node.classList.contains("canvas-node-generator")) return 320;
  return 220;
}
```

并把拖拽中的内联判断替换为：

```js
const minWidth = getCanvasNodeMinWidth(node);
```

- [ ] **Step 3: 运行纯函数测试**

Run: `node tools/check-canvas-generator-layout.js`

Expected: 仍然 FAIL，仅缺少 CSS 布局规则。

### Task 3: 实现宽、窄两种单行网格

**Files:**
- Modify: `styles.css:1270`
- Modify: `styles.css:11657`

**Interfaces:**
- Consumes: `.canvas-node-generator`、`.canvas-node-controls`、`.canvas-node-size`、`.canvas-node-resolution`、`.canvas-node-run`。
- Produces: 宽状态四列网格、459px 以下三列紧凑网格，以及隐藏分辨率时的单行兼容布局。

- [ ] **Step 1: 增加生成节点宽状态布局**

```css
.canvas-node.canvas-node-generator {
  min-width: 320px;
}

.canvas-node-generator .canvas-node-controls {
  grid-template-columns: minmax(96px, 180px) 112px minmax(0, 1fr) 120px;
}

.canvas-node-generator .canvas-node-size { grid-column: 1; }
.canvas-node-generator .canvas-node-resolution { grid-column: 2; }
.canvas-node-generator .canvas-node-run { grid-column: 4; }
```

- [ ] **Step 2: 增加窄状态布局**

```css
@container (max-width: 459px) {
  .canvas-node-generator .canvas-node-controls {
    grid-template-columns: minmax(76px, 1fr) minmax(104px, 1.15fr) 96px;
  }

  .canvas-node-generator .canvas-node-run {
    grid-column: 3;
  }
}
```

- [ ] **Step 3: 兼容不显示分辨率的模型**

```css
.canvas-node-generator.canvas-resolution-hidden .canvas-node-controls {
  grid-template-columns: minmax(96px, 180px) minmax(0, 1fr) 120px;
}

.canvas-node-generator.canvas-resolution-hidden .canvas-node-run {
  grid-column: 3;
}
```

- [ ] **Step 4: 运行布局契约测试**

Run: `node tools/check-canvas-generator-layout.js`

Expected: PASS，输出 `Canvas generator responsive layout checks passed.`

### Task 4: 完整验证

**Files:**
- Verify: `script.js`
- Verify: `styles.css`
- Verify: `package.json`

**Interfaces:**
- Consumes: 完整应用和现有检查。
- Produces: 无语法回归、无格式错误、窄/宽节点视觉验收结果。

- [ ] **Step 1: 运行语法与差异检查**

Run: `node --check script.js`

Expected: exit code 0。

Run: `git diff --check`

Expected: exit code 0。

- [ ] **Step 2: 运行完整检查**

Run: `npm run check`

Expected: 所有检查通过，包括 `Canvas generator responsive layout checks passed.`

- [ ] **Step 3: 浏览器验证**

在本地画布创建生成节点，验证：

1. 缩到 320px 时三个底部控件仍在同一行，“自动尺寸”和“生成”可辨认。
2. 拉宽到 820px 时提示词与模型框随节点增长。
3. 比例不超过 180px、分辨率保持约 112px、生成按钮约 120px 且靠右。
4. 页面控制台没有新增错误。

- [ ] **Step 4: 保留功能代码在当前工作区**

不执行 `git add` 或 `git commit`，避免把 `script.js`、`styles.css`、`package.json` 中用户已有改动一并提交。
