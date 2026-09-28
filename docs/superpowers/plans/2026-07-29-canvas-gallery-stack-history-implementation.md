# 画布图集堆叠封面与历史记录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把画布生成图集改造成单张活动封面堆叠节点，并通过历史面板切换下游实际使用的图片。

**Architecture:** 保留现有 `galleryImages` 数组，新增稳定图片 ID 与 `galleryActiveImageId`。图集节点主体改为活动封面视图，右侧浮动面板倒序渲染历史；`getCanvasNodeOutput` 只返回活动图片。所有状态变化统一经过活动图选择、删除和追加函数，以同步封面、下游引用和画布存储。

**Tech Stack:** 原生 JavaScript、DOM、CSS Grid/absolute positioning、Node.js 静态与纯函数契约测试、Playwright 浏览器验证。

## Global Constraints

- 新生成图片自动成为活动封面。
- 选择旧图只切换活动项，不改变历史数组顺序。
- 图集下游只接收一张活动图片。
- 普通图片组和循环节点继续保持多图行为。
- 历史面板不撑大图集节点，并随画布移动和缩放。
- 保留预览、下载、删除和拖出图片功能。
- 不提交 `script.js`、`styles.css`、`package.json` 中已有功能改动。

---

### Task 1: 建立图集活动图片数据契约

**Files:**
- Create: `tools/check-canvas-gallery-history.js`
- Modify: `package.json`
- Modify: `script.js:3762-3785`

**Interfaces:**
- Produces: `normalizeCanvasGalleryImages(images)`, `resolveCanvasGalleryActiveImage(images, preferredId)`, `getCanvasGalleryActiveImage(node)`, `setCanvasGalleryActiveImage(node, imageId)`.
- Consumes: `createId()`, `getCanvasGalleryImages(node)`, `setCanvasGalleryImages(node, images)`.

- [ ] **Step 1: 写失败测试**

测试必须提取真实函数并验证：

```js
assert.deepStrictEqual(
  resolveCanvasGalleryActiveImage(
    [{ id: "old", src: "/old.png" }, { id: "new", src: "/new.png" }],
    "old",
  ).id,
  "old",
);
assert.strictEqual(
  resolveCanvasGalleryActiveImage(
    [{ id: "old", src: "/old.png" }, { id: "new", src: "/new.png" }],
    "missing",
  ).id,
  "new",
);
```

并静态检查序列化字段 `galleryActiveImageId` 与图集单图输出 `type: "image"`。

- [ ] **Step 2: 运行测试确认 RED**

Run: `node tools/check-canvas-gallery-history.js`

Expected: FAIL，提示缺少 `normalizeCanvasGalleryImages` 或 `resolveCanvasGalleryActiveImage`。

- [ ] **Step 3: 实现图片规范化和活动项解析**

```js
function normalizeCanvasGalleryImages(images) {
  return (Array.isArray(images) ? images : []).map((image, index) => ({
    ...image,
    id: String(image?.id || createId()),
    name: image?.name || `生成图 ${index + 1}`,
    src: image?.src || image?.url || image?.savedUrl || "",
    savedUrl: image?.savedUrl || image?.src || image?.url || "",
    createdAt: image?.createdAt || "",
  })).filter((image) => image.src);
}

function resolveCanvasGalleryActiveImage(images, preferredId) {
  const list = Array.isArray(images) ? images : [];
  return list.find((image) => image.id === String(preferredId || "")) || list[list.length - 1] || null;
}
```

`getCanvasGalleryImages` 在读取旧数据时写回规范化数组；`getCanvasGalleryActiveImage` 在活动 ID 缺失时写回最新有效图片 ID。

- [ ] **Step 4: 把测试加入总检查并验证 GREEN**

在 `package.json` 的 `check` 末尾追加：

```json
" && node tools/check-canvas-gallery-history.js"
```

Run: `node tools/check-canvas-gallery-history.js`

Expected: 数据契约测试通过，渲染相关静态断言仍失败。

### Task 2: 实现堆叠封面与历史面板

**Files:**
- Modify: `script.js:2692-2703`
- Modify: `script.js:3788-3970`
- Modify: `styles.css:1745-1838`
- Modify: `styles.css:7502-7540`

**Interfaces:**
- Consumes: `getCanvasGalleryImages`, `getCanvasGalleryActiveImage`, `setCanvasGalleryActiveImage`, `removeCanvasGalleryImage`, `openCanvasGalleryPreview`, `downloadAsset`, `bindCanvasGalleryItemDrag`.
- Produces: `.canvas-gallery-stack`, `.canvas-gallery-cover`, `.canvas-gallery-history-toggle`, `.canvas-gallery-history-panel`, `renderCanvasGalleryHistory(node)`, `setCanvasGalleryHistoryOpen(node, open)`.

- [ ] **Step 1: 重构图集节点骨架**

`renderCanvasGalleryNode` 创建：

```js
const stack = document.createElement("div");
stack.className = "canvas-gallery-stack";
const historyToggle = document.createElement("button");
historyToggle.className = "canvas-gallery-history-toggle";
const historyPanel = document.createElement("section");
historyPanel.className = "canvas-gallery-history-panel";
historyPanel.hidden = true;
node.append(inputPort, outputPort, bar, stack, historyToggle, historyPanel, createCanvasResizeHandle());
```

传入并恢复 `activeImageId`。

- [ ] **Step 2: 渲染活动封面**

`renderCanvasGalleryImages` 只渲染当前图片：

- 最多三层 `.canvas-gallery-stack-layer`。
- 一张 `.canvas-gallery-cover`。
- 历史按钮徽标显示总数。
- 点击封面从当前索引打开预览。
- 封面支持拖出为图片节点。

- [ ] **Step 3: 渲染历史面板**

历史列表使用 `[...images].reverse()` 展示，但选择时使用图片 ID：

```js
row.addEventListener("click", () => setCanvasGalleryActiveImage(node, image.id));
```

每项包含预览、下载和删除按钮；控制按钮调用 `stopPropagation()`。当前项使用 `.is-active`。

- [ ] **Step 4: 增加开关和关闭规则**

- 点击历史按钮切换面板。
- 关闭按钮关闭面板。
- 画布内点击面板和按钮以外区域关闭所有图集面板。
- 画布激活时按 `Escape` 关闭图集面板。
- 面板交互阻止节点拖拽和画布平移。

- [ ] **Step 5: 实现视觉样式**

主封面使用圆角、边框和阴影。三个堆叠层依次偏移 5px、10px、15px。历史面板定位：

```css
.canvas-gallery-history-panel {
  width: 320px;
  max-height: min(560px, 72vh);
  position: absolute;
  left: calc(100% + 16px);
  top: 0;
  overflow: hidden;
}
```

列表内部滚动；面板不参与节点尺寸计算。

- [ ] **Step 6: 运行布局契约**

Run: `node tools/check-canvas-gallery-history.js`

Expected: 堆叠封面、历史面板和活动项 CSS/DOM 契约通过。

### Task 3: 实现追加、删除、保存和单图输出

**Files:**
- Modify: `script.js:3762-3785`
- Modify: `script.js:5039-5107`
- Modify: `script.js:5493-5507`
- Modify: `script.js:5684-5701`
- Modify: `script.js:5928-5945`
- Modify: `script.js:6442-6459`

**Interfaces:**
- Consumes: `galleryActiveImageId` 和规范化图集图片。
- Produces: 活动图单图输出、保存/恢复活动 ID、新图自动活动、删除回退。

- [ ] **Step 1: 新图自动成为活动项**

`appendCanvasGenerationToGallery` 为新图写入 `id: createId()`，追加后把该 ID 设为活动 ID，再刷新下游并保存。

- [ ] **Step 2: 删除时回退**

删除后调用 `resolveCanvasGalleryActiveImage`。如果删除的是活动图，活动 ID 回退到剩余数组最后一项；没有剩余项时删除活动 ID。

- [ ] **Step 3: 图集只输出活动图片**

```js
const image = getCanvasGalleryActiveImage(node);
if (!image) return null;
return {
  type: "image",
  name: image.name || "生成图",
  url: image.savedUrl || image.src || image.url,
};
```

- [ ] **Step 4: 保存和恢复活动 ID**

序列化写入：

```js
base.galleryActiveImageId = node.dataset.galleryActiveImageId || "";
```

恢复和复制图集节点时传入：

```js
activeImageId: item.galleryActiveImageId || ""
```

- [ ] **Step 5: 运行数据和输出测试**

Run: `node tools/check-canvas-gallery-history.js`

Expected: PASS，输出 `Canvas gallery history checks passed.`

### Task 4: 完整回归和浏览器验收

**Files:**
- Verify: `script.js`
- Verify: `styles.css`
- Verify: `package.json`
- Verify: `tools/check-canvas-gallery-history.js`

**Interfaces:**
- Produces: 自动检查和真实浏览器行为证据。

- [ ] **Step 1: 运行静态检查**

Run: `node --check script.js`

Expected: exit code 0。

Run: `git diff --check`

Expected: exit code 0。

- [ ] **Step 2: 运行完整检查**

Run: `npm run check`

Expected: 所有现有检查和 `Canvas gallery history checks passed.` 均通过。

- [ ] **Step 3: Playwright 验证**

在测试图集节点注入四张图片并验证：

1. 主体只存在一张封面和三层堆叠。
2. 数量徽标为 4。
3. 历史面板顺序是第 4、3、2、1 张。
4. 选择第 1 张后数组顺序不变，活动 ID 更新。
5. `getCanvasNodeOutput` 返回第 1 张单图。
6. 删除第 1 张后活动图回退到第 4 张。
7. 页面无新增 JavaScript 错误。

- [ ] **Step 4: 保留功能代码在当前工作区**

不执行功能代码的 `git add`、`git commit`、推送或 PR 操作。
