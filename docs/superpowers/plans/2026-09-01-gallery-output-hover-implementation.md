# 图集连接点与悬浮交互 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图集的整体输出与单图输出以克制的空间、形态和悬浮交互区分，而不在端口内显示文字。

**Architecture:** 仅调整 `renderCanvasGalleryContainerNode` 输出的端口呈现标记，以及图集容器和成员的 CSS。端口句柄和连接计算不变：`output` 仍代表整组图集，`member-output:<id>` 仍代表单张图片。

**Tech Stack:** 原生 JavaScript、CSS、Node.js 静态回归脚本。

## Global Constraints

- 图片继续按原始比例渲染，禁止裁切或重建成员网格。
- 单图图集仍只显示图集整体输出。
- 不在任一端口中显示“图”或“集”文字。
- 图片悬浮上移精确为 5px，过渡时长为 180ms。

---

### Task 1: 端口语义标记与无文字回归

**Files:**
- Modify: `tools/check-canvas-gallery-container-ui.js`
- Modify: `script.js:renderCanvasGalleryContainerNode`

**Interfaces:**
- Consumes: `createCanvasPort(kind, { handle })` 与现有 `member-output:<memberId>` 句柄。
- Produces: 图集输出端口类名 `canvas-gallery-container-output-port`，单图输出端口类名 `canvas-gallery-member-output-port`；两者均没有文本子内容。

- [ ] **Step 1: 写出失败的 UI 回归断言**

```js
assert.ok(render.includes("canvas-gallery-container-output-port"));
assert.doesNotMatch(render, /outputPort\.textContent\s*=/, "gallery output must not render text inside the port");
assert.doesNotMatch(render, /memberPort\.textContent\s*=/, "member output must not render text inside the port");
```

- [ ] **Step 2: 运行检查，确认它因现有端口文字而失败**

Run: `node .\\tools\\check-canvas-gallery-container-ui.js`

Expected: 退出码 `1`，错误信息包含 `gallery output must not render text inside the port`。

- [ ] **Step 3: 最小化修改渲染器**

```js
outputPort.classList.add("canvas-gallery-container-output-port");
outputPort.title = "图集输出：整组图片连接到后续节点";
outputPort.setAttribute("aria-label", "图集输出：整组图片连接到后续节点");

memberPort.classList.add("canvas-gallery-member-port", "canvas-gallery-member-output-port");
memberPort.title = `图片输出：${member.name || `图片 ${index + 1}`}`;
memberPort.setAttribute("aria-label", `图片输出：${member.name || `图片 ${index + 1}`}`);
```

- [ ] **Step 4: 重新运行 UI 检查**

Run: `node .\\tools\\check-canvas-gallery-container-ui.js`

Expected: 输出 `Canvas gallery container UI checks passed`。

### Task 2: 图集留白、端口形态与克制悬浮动效

**Files:**
- Modify: `tools/check-canvas-gallery-container-ui.js`
- Modify: `styles.css:.canvas-gallery-container-members`
- Modify: `styles.css:.canvas-gallery-member`
- Modify: `styles.css:.canvas-gallery-member-preview`
- Modify: `styles.css:.canvas-gallery-member-output-port`

**Interfaces:**
- Consumes: Task 1 输出的端口类名。
- Produces: 图集图片区相对容器 16px 留白；无文字单图端口；悬停或焦点时图片前浮 5px 并显示其端口。

- [ ] **Step 1: 写出失败的 CSS 断言**

```js
assert.match(extractCssRule(styles, ".canvas-gallery-container-members"), /margin:\s*16px/);
assert.match(extractCssRule(styles, ".canvas-gallery-member-preview"), /transition:\s*transform 180ms ease, box-shadow 180ms ease/);
assert.match(styles, /\.canvas-gallery-member:hover \.canvas-gallery-member-preview[\s\S]*transform:\s*translateY\(-5px\)/);
assert.match(extractCssRule(styles, ".canvas-gallery-member-output-port"), /border-radius:\s*999px/);
assert.doesNotMatch(extractCssRule(styles, ".canvas-gallery-member-output-port"), /font-size/);
```

- [ ] **Step 2: 运行检查，确认它因缺少留白与悬浮规则而失败**

Run: `node .\\tools\\check-canvas-gallery-container-ui.js`

Expected: 退出码 `1`，错误信息指向缺失的图片区内边距或 180ms 悬浮规则。

- [ ] **Step 3: 最小化修改 CSS**

```css
.canvas-gallery-container-members { margin: 16px; }

.canvas-gallery-member-preview {
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.canvas-gallery-member:hover .canvas-gallery-member-preview,
.canvas-gallery-member:focus-within .canvas-gallery-member-preview {
  transform: translateY(-5px);
  box-shadow: 0 16px 30px rgba(0, 0, 0, 0.24);
}

.canvas-gallery-member-output-port {
  border-radius: 999px;
  font-size: initial;
}
```

- [ ] **Step 4: 重新运行 UI 和图集操作检查**

Run: `node .\\tools\\check-canvas-gallery-container-ui.js`

Expected: 输出 `Canvas gallery container UI checks passed`。

Run: `node .\\tools\\check-canvas-gallery-container-operations.js`

Expected: 输出 `Canvas gallery container operations checks passed`。

### Task 3: 最终验证

**Files:**
- Verify: `script.js`
- Verify: `styles.css`
- Verify: `tools/check-canvas-gallery-container-ui.js`

**Interfaces:**
- Consumes: 前两项任务完成的端口样式与连线句柄。
- Produces: 通过全量工程检查的图集视觉调整。

- [ ] **Step 1: 运行工程全量检查**

Run: `npm run check`

Expected: 退出码 `0`，全部检查通过。

- [ ] **Step 2: 检查本次修改的补丁空白错误**

Run: `git diff --check -- script.js styles.css tools/check-canvas-gallery-container-ui.js`

Expected: 退出码 `0`；仅允许与工作树行尾转换有关的 Git 警告。
