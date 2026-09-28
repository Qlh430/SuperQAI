# 图集容器与裁切迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将旧“生成图集”的封面+历史抽屉升级为可嵌套、可连线、可拖出单图的图集容器，并将裁切统一为同事版的比例/自由/宫格工作台。

**Architecture:** 继续使用 `script.js` 的 DOM 画布与现有画布序列化格式；在读取旧 `galleryImages` 时一次性归一化为 `galleryContainer` 及成员记录，运行时只渲染容器。容器输出端既提供整组参考图片清单，成员输出端仍提供单张图片；裁切工具仅写入新容器，不改源图。

**Tech Stack:** Vanilla JavaScript、DOM canvas、现有 `GridSlicingRules`、Node `assert` 静态/规则检查、项目现有浏览器检查。

## Global Constraints

- 不删除、不覆盖无关的工作区改动；不执行 `git reset`、`git checkout --` 或清理命令。
- 旧画布加载必须自动迁移，保留图片 URL、尺寸、名字、创建时间和当前图；迁移前持久化一份可恢复快照。
- UI 与运行时只使用新容器交互；兼容读取代码仅用于旧存档迁移。
- 容器缩放、平移、拖动及连线不得一次解码所有原图；可见成员才请求缩略图，原图仅用于详情、编辑和裁切。
- 不修改既有 Agent、图片生成、历史画布、普通图片节点的行为，除非它们消费图集输出时需要接收新容器的单图/整组数据。
- 不在本任务中创建提交：当前工作树包含用户未提交改动，提交会有误收录风险。

---

### Task 1: 建立旧图集到容器成员的纯数据迁移

**Files:**
- Modify: `script.js`（`normalizeCanvasGalleryImages`、序列化/反序列化分支、画布加载入口附近）
- Create: `tools/check-canvas-gallery-container-migration.js`
- Test: `tools/check-canvas-gallery-container-migration.js`

**Interfaces:**
- Consumes: 旧存档 `{ kind: "gallery", galleryImages, galleryActiveImageId, galleryTitle }`。
- Produces: `normalizeCanvasGalleryContainer(value)`，返回 `{ version: 2, title, members, activeMemberId, columns, gap }`；每个成员至少有 `id`, `src`, `savedUrl`, `name`, `createdAt`, `width`, `height`。
- Produces: `migrateLegacyCanvasGalleryItem(item)`，只转换旧 `kind: "gallery"`，其余节点原样返回。

- [ ] **Step 1: 写失败的迁移规则测试**

```js
const migrated = ctx.migrateLegacyCanvasGalleryItem({
  kind: "gallery",
  galleryTitle: "旧结果",
  galleryActiveImageId: "b",
  galleryImages: [
    { id: "a", src: "/output/a.png", name: "A", width: 1024, height: 1024 },
    { id: "b", src: "/output/b.png", savedUrl: "/output/b.png", name: "B", createdAt: "2026-08-31T00:00:00.000Z" },
  ],
});
assert.equal(migrated.kind, "gallery-container");
assert.equal(migrated.galleryContainer.version, 2);
assert.equal(migrated.galleryContainer.members.length, 2);
assert.equal(migrated.galleryContainer.activeMemberId, "b");
assert.equal(migrated.galleryContainer.members[0].savedUrl, "/output/a.png");
```

- [ ] **Step 2: 运行测试并确认其失败**

Run: `node tools/check-canvas-gallery-container-migration.js`

Expected: FAIL，缺少 `migrateLegacyCanvasGalleryItem`。

- [ ] **Step 3: 实现纯迁移和加载快照**

```js
function migrateLegacyCanvasGalleryItem(item) {
  if (item?.kind !== "gallery") return item;
  const members = normalizeCanvasGalleryImages(item.galleryImages || []);
  return {
    ...item,
    kind: "gallery-container",
    galleryContainer: {
      version: 2,
      title: String(item.galleryTitle || "图集"),
      members,
      activeMemberId: resolveCanvasGalleryActiveImage(members, item.galleryActiveImageId)?.id || "",
      columns: Number(item.galleryColumns || 0) || null,
      gap: Number.isFinite(Number(item.galleryGap)) ? Number(item.galleryGap) : null,
    },
  };
}
```

在画布写入迁移结果前，将原始画布 JSON 通过既有本地存储接口存为带时间戳的 `gallery-container-pre-migration` 快照；同一画布/版本只写一次。迁移成功后不再序列化 `galleryImages` 或 `galleryActiveImageId`。

- [ ] **Step 4: 运行迁移与旧存档回归检查**

Run: `node tools/check-canvas-gallery-container-migration.js && node tools/check-canvas-schema.js && node tools/check-canvas-export-roundtrip.js`

Expected: 三项 PASS；旧图集可读且已转换为容器格式。

### Task 2: 将图集渲染替换为容器、成员与双层端口

**Files:**
- Modify: `script.js`（替换 `renderCanvasGalleryNode`/`renderCanvasGalleryImages` 及旧历史抽屉渲染调用；更新 `getCanvasNodeKind`、创建和恢复路径）
- Modify: `styles.css`（新增 `.canvas-gallery-container`、`.canvas-gallery-member`、容器/成员端口和虚拟缩略图样式；移除旧封面堆栈和历史抽屉选择器）
- Create: `tools/check-canvas-gallery-container-ui.js`
- Test: `tools/check-canvas-gallery-container-ui.js`

**Interfaces:**
- Consumes: `galleryContainer.members`。
- Produces: `renderCanvasGalleryContainerNode(node, container)`；容器左/右端口为 `input`/`output`，每个成员提供 `member-input:<id>` 与 `member-output:<id>`。
- Produces: `getCanvasGalleryContainerMembers(node)` 和 `setCanvasGalleryContainerMembers(node, members)`。

- [ ] **Step 1: 写失败的容器 UI 合约测试**

```js
const render = extractFunction(script, "renderCanvasGalleryContainerNode");
assert.ok(render.includes("canvas-gallery-container"));
assert.ok(render.includes("canvas-gallery-member"));
assert.ok(render.includes("member-output:"));
assert.ok(render.includes("data-gallery-member-id"));
assert.ok(!render.includes("canvas-gallery-history-panel"));
assert.match(styles, /\.canvas-gallery-container\s*\{/);
assert.match(styles, /\.canvas-gallery-member\s*\{/);
```

- [ ] **Step 2: 运行测试并确认其失败**

Run: `node tools/check-canvas-gallery-container-ui.js`

Expected: FAIL，当前只有 `renderCanvasGalleryNode` 和历史抽屉。

- [ ] **Step 3: 实现容器渲染、自动布局和可见缩略图**

```js
function suggestedCanvasGalleryContainerColumns(count) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return 5;
}

function renderCanvasGalleryContainerNode(node, container) {
  const members = normalizeCanvasGalleryImages(container.members || []);
  node.className = "canvas-node canvas-node-gallery-container";
  // 渲染容器输入/输出端口和每张成员的单图输出端口。
  // 成员 img 使用 createDeferredThumbnail；IntersectionObserver 进入可见区后再赋 src。
}
```

使用固定单元格最大边长、`suggestedCanvasGalleryContainerColumns` 和 CSS grid 自动计算宽高；成员的画布原始位置不创建额外节点。节点选中和缩放只改容器，不重建 `members` 数组。

- [ ] **Step 4: 运行 UI、虚拟化和画布性能检查**

Run: `node tools/check-canvas-gallery-container-ui.js && node tools/check-canvas-virtualization-rules.js && node tools/check-canvas-virtualization-integration.js && node tools/check-canvas-seamless-zoom-ui.js`

Expected: 全部 PASS；容器没有旧历史抽屉。

### Task 3: 实现容器整体/单成员连线与拖进拖出

**Files:**
- Modify: `script.js`（`getCanvasNodeOutput`、`getCanvasNodeInput`、连线端点解析、拖放处理、删除处理）
- Modify: `tools/check-canvas-gallery-container-ui.js`
- Create: `tools/check-canvas-gallery-container-operations.js`
- Test: `tools/check-canvas-gallery-container-operations.js`

**Interfaces:**
- Consumes: 容器端口 `output` 和成员端口 `member-output:<memberId>`。
- Produces: `getCanvasGalleryContainerOutput(node, handle)`：整体返回 `{ type: "images", images: [...] }`；成员返回 `{ type: "image", url, name, width, height }`。
- Produces: `detachCanvasGalleryMember(node, memberId, point)` 与 `appendCanvasGalleryMember(node, image)`。

- [ ] **Step 1: 写失败的连线与拖放规则测试**

```js
const output = ctx.getCanvasGalleryContainerOutput(container, "member-output:b");
assert.equal(output.type, "image");
assert.equal(output.url, "/output/b.png");
assert.equal(ctx.getCanvasGalleryContainerOutput(container, "output").type, "images");
assert.equal(ctx.detachCanvasGalleryMember(container, "b", { x: 700, y: 300 }).detached.id, "b");
assert.equal(ctx.appendCanvasGalleryMember(container, { id: "c", src: "/output/c.png" }).members.length, 2);
```

- [ ] **Step 2: 运行测试并确认其失败**

Run: `node tools/check-canvas-gallery-container-operations.js`

Expected: FAIL，旧图集只允许当前封面单图输出。

- [ ] **Step 3: 实现端口解析、成员拖出和拖回归组**

```js
function getCanvasGalleryContainerOutput(node, handle = "output") {
  const members = getCanvasGalleryContainerMembers(node).filter(isCanvasGalleryImageReady);
  const memberId = String(handle).replace(/^member-output:/, "");
  if (String(handle).startsWith("member-output:")) {
    const member = members.find((item) => item.id === memberId);
    return member ? { type: "image", url: member.savedUrl || member.src, name: member.name, width: member.width, height: member.height } : null;
  }
  return { type: "images", images: members.map((member) => ({ url: member.savedUrl || member.src, name: member.name, width: member.width, height: member.height })) };
}
```

成员拖出时，从容器成员数组删除并调用现有 `addCanvasImage` 在释放点创建普通图片节点；撤销/保存与普通节点拖放走同一路径。普通图片拖入容器时追加成员并删除原节点及其内部容器无关连线；存在外部连线时提示用户保留为独立节点而不自动吞入，避免无提示丢失连接。

- [ ] **Step 4: 运行端口、拖放、存储回归检查**

Run: `node tools/check-canvas-gallery-container-operations.js && node tools/check-canvas-engine-contract.js && node tools/check-canvas-repository-operations.js && node tools/check-canvas-export-roundtrip.js`

Expected: 全部 PASS；容器整体和单成员输出均可用。

### Task 4: 将裁切入口改为比例/自由/宫格一体工作台

**Files:**
- Modify: `script.js`（替换 `ensureCanvasGridMenuMarkup`、`openCanvasGridMenu`、`createCanvasGridEditorState` 的入口与输出；复用 `GridSlicingRules`）
- Modify: `styles.css`（裁切工作台、比例按钮、自由裁切框、逐格选择样式）
- Modify: `tools/check-canvas-gallery-grid-slicing.js`
- Modify: `tools/check-canvas-grid-editor.js`
- Create: `tools/check-canvas-crop-workbench.js`
- Test: `tools/check-canvas-crop-workbench.js`

**Interfaces:**
- Consumes: 单张容器成员的本地 `savedUrl` 和原图 `width`/`height`。
- Produces: `openCanvasCropWorkbench(sourceNode, memberId)`；状态为 `{ mode: "ratio"|"free"|"grid", aspectRatio, freeRect, rows, columns, cellTransforms }`。
- Produces: `createCanvasCropResultContainer(sourceNode, sourceMember, crops, mode)`，返回新图集容器。

- [ ] **Step 1: 写失败的裁切工作台合约测试**

```js
const markup = extractFunction(script, "ensureCanvasCropWorkbenchMarkup");
const open = extractFunction(script, "openCanvasCropWorkbench");
const output = extractFunction(script, "createCanvasCropResultContainer");
["比例裁切", "自由裁切", "宫格裁切", "1:1", "9:16", "16:9"].forEach((label) => assert.ok(markup.includes(label)));
assert.ok(open.includes("memberId"));
assert.ok(output.includes("persistCanvasGridCrops"));
assert.ok(output.includes("gallery-container"));
```

- [ ] **Step 2: 运行测试并确认其失败**

Run: `node tools/check-canvas-crop-workbench.js`

Expected: FAIL，当前仅有小型宫格菜单和独立宫格编辑节点入口。

- [ ] **Step 3: 实现精简裁切工作台**

```js
function createCanvasCropWorkbenchState(source, member) {
  return {
    sourceNode: source,
    memberId: member.id,
    source: member,
    mode: "ratio",
    aspectRatio: "1:1",
    freeRect: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
    rows: 2,
    columns: 2,
    cellTransforms: [],
    busy: false,
  };
}
```

比例模式允许 `1:1`、`4:3`、`3:4`、`3:2`、`2:3`、`16:9`、`9:16`；自由模式只保留一个可拖拽矩形；宫格模式保留 1–5 行列及逐格拖动位置/缩放。所有坐标依据图片记录的原图像素，不能用缩略图自然尺寸。输出前通过 `getSliceRegions`/`getCellCrop` 验证每张输出至少 1×1 像素，失败时停留工作台并显示具体原因。

- [ ] **Step 4: 运行裁切规则、UI 与旧画布回归**

Run: `node tools/check-grid-slicing-rules.js && node tools/check-canvas-crop-workbench.js && node tools/check-canvas-gallery-grid-slicing.js && node tools/check-canvas-grid-editor.js`

Expected: 全部 PASS；旧宫格编辑入口不再出现在图集容器。

### Task 5: 将裁切输出改为新图集容器并完成端到端验收

**Files:**
- Modify: `script.js`（`persistCanvasGridCrops` 的调用方、容器放置、防重叠、序列化）
- Modify: `tools/check-canvas-gallery-container-operations.js`
- Modify: `tools/check-portable-package.js`（仅在新文件加入便携打包白名单时）
- Test: `tools/check-canvas-gallery-container-operations.js`

**Interfaces:**
- Consumes: `persistCanvasGridCrops(image, crops, options)` 的完整成功数组。
- Produces: 一个标题为“裁切图集”的 `gallery-container`，成员依行列顺序排列，位于源节点右侧非重叠位置，且容器整体连线到源节点。

- [ ] **Step 1: 写失败的输出顺序与放置测试**

```js
const created = ctx.createCanvasCropResultContainer(source, member, [
  { id: "r1c1", row: 1, column: 1, savedUrl: "/output/1.png" },
  { id: "r1c2", row: 1, column: 2, savedUrl: "/output/2.png" },
], "grid");
assert.equal(created.dataset.kind, "gallery-container");
assert.deepEqual(ctx.getCanvasGalleryContainerMembers(created).map((item) => item.id), ["r1c1", "r1c2"]);
assert.ok(Number(created.dataset.x) > Number(source.dataset.x));
```

- [ ] **Step 2: 运行测试并确认其失败**

Run: `node tools/check-canvas-gallery-container-operations.js`

Expected: FAIL，当前输出创建旧图集或多个独立图片节点。

- [ ] **Step 3: 实现完整成功后一次性创建容器**

```js
async function createCanvasCropResultContainer(sourceNode, sourceMember, crops, mode) {
  const persisted = await persistCanvasGridCrops(/* 已验证的原图和裁切区域 */);
  if (persisted.length !== crops.length) throw new Error("裁切保存不完整，未创建图集。");
  return addCanvasGalleryContainer({
    title: mode === "grid" ? "裁切图集" : "裁切结果",
    members: persisted,
    sourceNode,
    sourceMember,
  });
}
```

使用现有 `findCanvasGridImageBlockPoint` 的碰撞检测逻辑寻找源节点右侧空位；只有所有文件上传成功才插入容器并连线。失败不创建残缺节点，源图和源容器均不变。

- [ ] **Step 4: 跑完整验证与便携包检查**

Run: `npm run check && node tools/check-portable-package.js && git diff --check`

Expected: `npm run check` 和便携包检查均 PASS；`git diff --check` 仅允许现有 CRLF 提示，不允许新增空白错误。

## Self-Review

- 旧图集迁移与迁移前快照：Task 1。
- 容器、成员、自动排布、懒加载：Task 2。
- 整组/单图连线、拖出/拖回：Task 3。
- 同事版裁切方式的比例、自由、宫格和逐格调整：Task 4。
- 裁切输出、非重叠放置与完整回归：Task 5。
- 计划未引入服务端、Agent 或图片生成协议改动；它们只通过统一节点输出契约消费新容器。
