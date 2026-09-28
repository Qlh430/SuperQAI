# 生成图集宫格裁切 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为生成图集当前图片提供所见即所得的宫格裁切工作台，并将每次切片保存为新的独立图集。

**Architecture:** 新建无 DOM 的 `grid-slicing-rules.js` 作为原图像素边界、间隔带约束和区域计算的唯一数据源。`script.js` 负责生成图集悬浮入口、模态工作台、显示坐标到原图像素的映射、PNG 编码上传和新图集创建；`styles.css` 负责节点入口和精确拖线界面。所有切片使用现有 `/api/upload-image` 持久化并复用现有图集结构。

**Tech Stack:** 原生 JavaScript、Canvas 2D、CSS、Node.js `assert` 合约测试、Playwright 浏览器验收。

## Global Constraints

- 每次只处理源图集当前显示的图片，源图、源图集和历史保持不变。
- 横线、竖线分别支持 0–4 根，默认各 1 根且等分。
- 分割线和间隔带使用原图像素坐标，屏幕预览与最终裁切边界一致。
- 修改统一间隔会应用到全部线并清除单线宽度覆盖；之后仍可逐线移动或改单线宽度。
- 间隔带像素不进入任何切片，每个保留区域至少 1×1 原图像素。
- 全部 PNG 保存成功后才创建新的“宫格裁切图集”。

---

### Task 1: 原图像素宫格规则

**Files:**
- Create: `grid-slicing-rules.js`
- Create: `tools/check-grid-slicing-rules.js`
- Modify: `index.html`
- Modify: `package.json`

**Interfaces:**
- Produces: `GridSlicingRules.createEvenBands(length, count, gap, prefix)`、`applyUniformGap(length, bands, gap)`、`moveBand(length, bands, id, center)`、`resizeBandEdge(length, bands, id, edge, coordinate)`、`setBandGap(length, bands, id, gap)`、`getRegions(length, bands)`、`getSliceRegions(width, height, verticalBands, horizontalBands)`。
- Guarantees: count 限制 0–4；band 使用整数 `[start,end)`；排序且边界内；相邻保留区至少 1px；输出按行优先。

- [x] **Step 1: 写规则失败测试**

测试默认等分、0/4 根边界、统一间隔、统一值清除覆盖、单带移动、固定一侧边界缩放、精确单带间隔、非法设置钳制、区域尺寸和行优先顺序。

- [x] **Step 2: 运行测试确认缺少模块而失败**

Run: `node tools/check-grid-slicing-rules.js`

Expected: FAIL，提示找不到 `grid-slicing-rules.js`。

- [x] **Step 3: 实现最小规则模块并接入页面**

使用 UMD 导出纯函数；所有坐标在进入规则时舍入为整数；统一和单线操作都返回规范化的新数组，不修改输入数组。

- [x] **Step 4: 运行规则测试**

Run: `node tools/check-grid-slicing-rules.js`

Expected: PASS，输出 grid slicing rules checks passed。

### Task 2: 图集入口与宫格裁切工作台

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Create: `tools/check-canvas-gallery-grid-slicing.js`

**Interfaces:**
- Consumes: Task 1 的 `GridSlicingRules`；现有 `getCanvasGalleryActiveImage`、`loadImageElement`。
- Produces: `openCanvasGalleryGridSlicer(node)`、`closeCanvasGalleryGridSlicer()`、`renderCanvasGalleryGridSlicer()`、节点直属 `.canvas-gallery-slice-toggle` 和动态 `.canvas-grid-slicer` 模态工作台。

- [x] **Step 1: 写入口和 UI 合约失败测试**

断言图集节点渲染宫格按钮；按钮只在有 active 图片时可见；工作台包含横竖线 0–4、统一间隔、重新等分、选中线精确间隔、状态、取消和生成按钮；Escape 关闭；拖动调用规则模块。

- [x] **Step 2: 运行测试确认失败**

Run: `node tools/check-canvas-gallery-grid-slicing.js`

Expected: FAIL，指出图集渲染中缺少宫格入口。

- [x] **Step 3: 实现入口和工作台**

宫格按钮定位在节点右上外侧，只在 hover/focus/is-selected 时显示。工作台用当前 active 图片建立临时状态，按图片显示矩形把指针映射为原图整数坐标；单线/间隔带中部拖动调用 `moveBand`，两侧边界调用 `resizeBandEdge`。

- [x] **Step 4: 实现实时预览和约束反馈**

按规则返回的 bands 绘制单线或半透明间隔带、双边界和拖柄；用 regions 绘制行优先编号与尺寸；实时更新原图尺寸、输出数、选中线方向/序号/中心/间隔和错误信息。

- [x] **Step 5: 运行聚焦检查**

Run: `node tools/check-canvas-gallery-grid-slicing.js`

Expected: PASS，输出 canvas gallery grid slicing checks passed。

### Task 3: PNG 切片上传与独立图集

**Files:**
- Modify: `script.js`
- Modify: `tools/check-canvas-gallery-grid-slicing.js`

**Interfaces:**
- Consumes: Task 1 的 `getSliceRegions`、现有 `uploadCanvasImageFile`、`renderCanvasGalleryNode`、`addCanvasGallery`、`selectCanvasNode`、`scheduleCanvasSave`。
- Produces: `createCanvasGalleryGridSlices()` 和 `createCanvasGridSliceGallery(sourceNode, images)`；每个输出 image 使用持久 `/output` URL。

- [x] **Step 1: 写生成管线失败测试**

断言按 `getSliceRegions` 顺序逐块 `drawImage`、编码 PNG、通过现有上传函数保存；只有 `Promise.all` 全部成功后创建新图集；新图集不连接或修改源图集，位于源节点右侧并包含行列命名。

- [x] **Step 2: 运行测试确认失败**

Run: `node tools/check-canvas-gallery-grid-slicing.js`

Expected: FAIL，指出缺少切片生成和独立图集创建函数。

- [x] **Step 3: 实现切片和原子式创建**

把 source image 按每个原图像素 region 绘制到独立 canvas，`canvasToPngBlob` 后包装为 PNG File，通过 `uploadCanvasImageFile` 保存。收集完全部 URL 后创建图集；失败时保留工作台且不创建图集。

- [x] **Step 4: 运行聚焦和完整检查**

Run: `node tools/check-grid-slicing-rules.js && node tools/check-canvas-gallery-grid-slicing.js && npm run check`

Expected: 全部 PASS，exit code 0。

### Task 4: 真实浏览器验收

**Files:**
- Create: `tools/check-canvas-gallery-grid-slicing-ui.js`
- Verify: `script.js`
- Verify: `styles.css`

**Interfaces:**
- Consumes: 完成后的页面与本地 `/api/upload-image`。
- Produces: 对节点显隐、工作台拖线、统一/单线间隔、真实 PNG、独立图集及源图不变的端到端证据。

- [x] **Step 1: 写 Playwright 验收脚本**

创建含一张已知尺寸测试图的源图集；验证宫格按钮 hover 显示/移开隐藏；打开工作台，设置线数和统一间隔，拖动单线及边界；点击生成并等待新图集。

- [x] **Step 2: 验证输出**

确认源图集图片数组和 active ID 不变；只新增一个图集；切片数、顺序、尺寸、持久 `/output` URL 正确；新图集历史面板可打开，下载按钮和拖拽绑定存在；页面无异常。

- [x] **Step 3: 完整回归与补丁检查**

Run: `npm run check`

Run: `git diff --check -- grid-slicing-rules.js index.html script.js styles.css package.json tools/check-grid-slicing-rules.js tools/check-canvas-gallery-grid-slicing.js tools/check-canvas-gallery-grid-slicing-ui.js`

Expected: exit code 0；只允许仓库换行符提示，不允许空白错误。

- [x] **Step 4: 独立复核**

对照设计规格复核规则约束、UI 所见即所得、上传原子性、源图集不变和回归覆盖；修复所有 Critical/Important 问题后交付。
