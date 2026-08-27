# 画布图片原子清晰度升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让画布图片从缩略图升级到原图时始终保持可见，并在用户停止缩放后无需再次移动画布即可自动显示已解码原图。

**Architecture:** 保留单个画布 `<img>`，把“当前显示质量”和“目标请求质量”分开；质量调度切换或取消时不再清空当前 `src`。原图通过受控队列预载、解码和请求令牌校验后原子提交，并用当前缩略图背景覆盖目标元素切源期间的浏览器绘制空窗。

**Tech Stack:** 原生 JavaScript、HTMLImageElement、MutationObserver、Node.js、Playwright、现有 CanvasMediaScheduler 与 ImageResourceManager。

## Global Constraints

- 不增加常驻第二张图片 DOM，不扩大画布节点挂载上限。
- 缩略图并发保持 6，原图并发保持 2。
- 只有图片真正离开保留范围、节点卸载、离开画布视图或场景层接管时才允许删除 `src`。
- 原图取消、失败或旧请求晚到均必须保留当前缩略图。
- 原图已经显示后不得主动降级为缩略图。
- 原图切换只能刷新对应图片元素，不能触发全画布重绘。
- 保持旧画布、图片预览、裁剪、虚拟化与 5 万节点场景层行为不变。

---

## 文件结构

- `image-resource-manager.js`：管理图片显示质量、请求目标、请求版本、缩略图加载和原图预载解码提交。
- `script.js`：根据视口与缩放选择目标质量，把任务交给调度器；取消质量任务时决定是否真正卸载图片。
- `styles.css`：移除可见虚拟节点图片上的自动内容跳过，并提供原子切源期间的元素级绘制约束。
- `tools/check-canvas-image-atomic-upgrade-ui.js`：用真实浏览器复现 55%→217% 质量升级，验证无 `src` 空窗、静止自动清晰和失败保底。
- `tools/check-image-resource-manager.js`：静态检查状态分离、解码、请求版本和不降级约束。
- `tools/check-global-image-demand-loading.js`：静态检查调度器不在质量切换或中止时卸载可见图片。
- `package.json`：把新回归加入画布视觉保真检查。

---

### Task 1: 建立原图升级闪烁的失败浏览器回归

**Files:**
- Create: `tools/check-canvas-image-atomic-upgrade-ui.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `window.imageResources`, `window.canvasMediaScheduler`, `canvasState`, `scheduleCanvasTransform()`, `canvasVirtualizer`。
- Produces: 浏览器验收命令 `node tools/check-canvas-image-atomic-upgrade-ui.js`；设置 `CANVAS_IMAGE_ATOMIC_APP_URL` 与 `CANVAS_IMAGE_ATOMIC_BOARD_ID` 时切换为正式画布只读模式；成功输出 `Canvas image atomic upgrade UI checks passed.`。

- [ ] **Step 1: 创建一个受控旧画布和延迟原图响应**

测试启动临时端口的 `server.js`，使用临时 `CANVAS_DB_FILE`、`CANVAS_LEGACY_FILE` 和备份目录。浏览器拦截画布列表，返回一个包含单图片节点的旧格式画布；缩略图接口立即返回蓝色 64×64 SVG，原图接口延迟 500 ms 返回红色 1600×1600 SVG。

```js
const THUMBNAIL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%2300f'/%3E%3C/svg%3E";
const ORIGINAL_PATH = "/__atomic-upgrade-original.svg";
const board = {
  id: "atomic-image-upgrade-board",
  title: "Atomic image upgrade",
  viewport: { x: 520, y: 360, scale: 0.55 },
  nodes: [{
    id: "image-1",
    kind: "image",
    uploadOnly: true,
    imageSrc: ORIGINAL_PATH,
    imageName: "atomic-upgrade.svg",
    x: 0,
    y: 0,
    width: 420,
    height: 420,
  }],
  connections: [],
};

await page.route(`**${ORIGINAL_PATH}`, async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  await route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1600'><rect width='1600' height='1600' fill='red'/></svg>",
  });
});
```

- [ ] **Step 2: 记录同一挂载节点在质量升级期间的图片状态**

打开测试画布，将图片固定在视口中心，确认缩略图已显示。设置 217% 并调用 `scheduleCanvasTransform()`，之后不再发送输入；用 MutationObserver 和 10 ms 定时采样追踪当前节点的新旧 `<img>`。

```js
const samples = await page.evaluate(async () => {
  const nodeId = "image-1";
  const current = () => document.querySelector(
    `#canvasPlane .canvas-node[data-id="${nodeId}"] img[data-canvas-original-src]`,
  );
  const result = [];
  const timer = setInterval(() => {
    const img = current();
    result.push({
      mounted: Boolean(img),
      hasSrc: Boolean(img?.hasAttribute("src")),
      quality: img?.dataset.imageQuality || "",
      naturalWidth: Number(img?.naturalWidth || 0),
    });
  }, 10);
  canvasState.scale = 2.17;
  scheduleCanvasTransform();
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  clearInterval(timer);
  return result;
});

assert.equal(samples.filter((item) => item.mounted && !item.hasSrc).length, 0);
assert.equal(samples.at(-1).quality, "original");
assert.equal(samples.at(-1).naturalWidth, 1600);
```

同一测试文件还必须在产品修改前加入三个竞态场景：

```js
assert.equal(failedOriginal.emptySamples, 0);
assert.equal(failedOriginal.finalQuality, "thumbnail");
assert.equal(canceledOriginal.emptySamples, 0);
assert.match(staleSource.finalSrc, /original-b\.svg$/);
assert.equal(staleSource.aCommittedAfterB, false);
```

失败原图返回 503；取消场景在延迟 800 ms 的原图发起 100 ms 后调用 `markCanvasViewportInteraction()`；旧请求场景先请求 `/original-a.svg`，随即把两个原图 URL 属性改为 `/original-b.svg` 并发起新请求。

- [ ] **Step 3: 运行测试并确认 RED**

Run:

```powershell
$env:NODE_PATH='C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tools/check-canvas-image-atomic-upgrade-ui.js
```

Expected: FAIL，提示挂载期间出现至少一个无 `src` 采样；当前实现会在原图请求前调用 `unload()`。

- [ ] **Step 4: 将测试加入视觉保真脚本但暂不提交**

在 `check:canvas-visual-fidelity` 的旧画布检查前加入：

```json
"node tools/check-canvas-image-atomic-upgrade-ui.js"
```

保留失败测试与产品修复在同一个 TDD 提交中，避免主分支停留在必然失败状态。

---

### Task 2: 实现可见图片的原子质量升级

**Files:**
- Modify: `image-resource-manager.js:1-390`
- Modify: `script.js:14509-14644`
- Modify: `styles.css:13909-13923`
- Modify: `tools/check-image-resource-manager.js`
- Modify: `tools/check-global-image-demand-loading.js`
- Test: `tools/check-canvas-image-atomic-upgrade-ui.js`

**Interfaces:**
- Consumes: `ImageResourceManager.showThumbnail(img)`, `showOriginal(img)`, `unload(img)` 与 `CanvasMediaScheduler.enqueue(task)`。
- Produces: `beginImageRequest(img, quality, source) -> number`、`isCurrentImageRequest(img, version, quality, source) -> boolean`、`preserveCanvasImagePaint(img) -> () => void`；现有公开方法签名不变。

- [ ] **Step 1: 扩展静态测试并确认 RED**

`tools/check-global-image-demand-loading.js` 必须检查质量调度与中止处理不包含可见图片卸载：

```js
const scheduleMedia = extractFunction("scheduleCanvasMediaImage");
assert.doesNotMatch(scheduleMedia, /window\.imageResources\.unload\(img\)/);
assert.doesNotMatch(scheduleMedia, /abort[\s\S]*unload\(img\)/);
assert.match(scheduleMedia, /dataset\.requestedQuality\s*===\s*quality/);
```

`tools/check-image-resource-manager.js` 必须检查请求版本、预载解码、显示质量保留和原图不降级：

```js
assert.match(manager, /this\.requestVersions\s*=\s*new WeakMap/);
assert.match(manager, /preload\.decode/);
assert.match(manager, /data-image-upgrade-pending|imageUpgradePending/);
assert.match(manager, /imageQuality\s*===\s*["']original["'][\s\S]*showThumbnail/);
```

Run:

```powershell
node tools/check-global-image-demand-loading.js
node tools/check-image-resource-manager.js
```

Expected: 两个测试都因新状态机尚未实现而 FAIL。

- [ ] **Step 2: 在 ImageResourceManager 中加入请求版本与显示状态保护**

构造函数增加：

```js
this.requestVersions = new WeakMap();
this.originalPromises = new WeakMap();
```

加入以下内部方法：

```js
beginImageRequest(img, quality, source) {
  const version = Number(this.requestVersions.get(img) || 0) + 1;
  this.requestVersions.set(img, version);
  img.dataset.requestedQuality = quality;
  return { version, quality, source };
}

isCurrentImageRequest(img, request) {
  return Boolean(
    img?.isConnected
    && Number(this.requestVersions.get(img) || 0) === request.version
    && img.dataset.requestedQuality === request.quality
    && img.getAttribute("data-original-src") === request.source
  );
}

hasDisplayedImage(img) {
  return Boolean(
    img?.hasAttribute("src")
    && ["thumbnail", "original"].includes(img.dataset.imageQuality || "")
  );
}
```

首次无内容时仍可设置 `data-image-quality="loading"`；已有缩略图或原图时，发起新请求必须保留当前质量值和 `src`。

- [ ] **Step 3: 修改缩略图路径，禁止原图降级和旧请求覆盖**

`showThumbnail()` 首先处理已显示原图：

```js
if (
  img.dataset.imageQuality === "original"
  && img.getAttribute("src") === source
) {
  img.dataset.requestedQuality = "original";
  return Promise.resolve({ source, thumbnailUrl: source, lightweight: false });
}
```

随后创建请求版本；缩略图结果返回后必须先调用 `isCurrentImageRequest()`。失败且已有显示资源时，只把 `requestedQuality` 恢复为当前显示质量，不调用 `markImageError()`、`fallbackToOriginal()` 或 `removeAttribute("src")`。

- [ ] **Step 4: 原图预载解码后原子提交**

`showOriginal()` 对相同 URL 的进行中请求返回同一 Promise。队列任务保存请求版本和开始时的显示资源。预载完成后先解码，再验证请求仍有效：

```js
preload.onload = async () => {
  try { await preload.decode?.(); } catch {}
  if (!this.isCurrentImageRequest(task.img, task.request)) {
    finish(false);
    return;
  }
  const previousSrc = task.img.getAttribute("src") || "";
  const objectFit = root.getComputedStyle?.(task.img)?.objectFit || "cover";
  if (previousSrc) {
    task.img.style.backgroundImage = `url(${JSON.stringify(previousSrc)})`;
    task.img.style.backgroundPosition = "center";
    task.img.style.backgroundRepeat = "no-repeat";
    task.img.style.backgroundSize = objectFit;
  }
  task.img.dataset.imageUpgradePending = "true";
  task.img.src = task.source;
  try { await task.img.decode?.(); } catch {}
  if (task.img.getAttribute("data-original-src") !== task.source) {
    finish(false);
    return;
  }
  task.img.dataset.imageQuality = "original";
  task.img.dataset.requestedQuality = "original";
  task.img.dataset.fallbackStage = "original";
  await new Promise((resolve) => (root.requestAnimationFrame || setTimeout)(resolve));
  delete task.img.dataset.imageUpgradePending;
  task.img.style.backgroundImage = "";
  task.img.style.backgroundPosition = "";
  task.img.style.backgroundRepeat = "";
  task.img.style.backgroundSize = "";
  finish(true);
};
```

`finish()` 必须只清理与当前任务相同的 `originalPromises` 条目、递减 `originalActive`、启动下一个队列任务并解析原 Promise。

- [ ] **Step 5: 原图失败时保留缩略图**

`preload.onerror` 使用以下规则：

```js
if (this.isCurrentImageRequest(task.img, task.request)) {
  if (this.hasDisplayedImage(task.img)) {
    task.img.dataset.requestedQuality = task.img.dataset.imageQuality;
  } else {
    task.img.dataset.requestedQuality = "thumbnail";
    void this.showThumbnail(task.img, { allowOriginalFallback: false });
  }
}
finish(false);
```

不得在已有缩略图时调用 `unload()` 或移除 `src`。

- [ ] **Step 6: 修改画布媒体调度器调用点**

`scheduleCanvasMediaImage()` 的幂等条件改为同时识别正在请求的目标质量：

```js
if (
  previousKey
  && img.dataset.canvasScheduledQuality === quality
  && (
    img.dataset.requestedQuality === quality
    || img.dataset.imageQuality === quality
  )
) return previousKey;
```

取消旧调度键后不得调用 `window.imageResources.unload(img)`。任务中止处理只拒绝调度 Promise；如果元素已断开，节点卸载流程会负责释放资源：

```js
const abort = () => {
  reject(Object.assign(new Error("Canvas media request aborted."), { name: "AbortError" }));
};
```

`cancelCanvasMediaImage(img, { unload: true })` 保持为真正离屏、离开画布或节点卸载时的唯一显式释放入口。

- [ ] **Step 7: 移除可见图片的自动内容跳过**

将：

```css
#canvasPlane img[data-canvas-original-src] {
  contain: paint;
  content-visibility: auto;
}
```

改为：

```css
#canvasPlane img[data-canvas-original-src] {
  contain: paint;
  content-visibility: visible;
}

#canvasPlane img[data-image-upgrade-pending="true"] {
  background-color: transparent;
}
```

图片质量完成状态和背景清理产生元素级样式失效，使静止画布在不改变 transform 的情况下重绘清晰原图。

- [ ] **Step 8: 运行核心测试并确认 GREEN**

Run:

```powershell
node tools/check-global-image-demand-loading.js
node tools/check-image-resource-manager.js
$env:NODE_PATH='C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tools/check-canvas-image-atomic-upgrade-ui.js
```

Expected: 三项均 PASS；浏览器采样中无 `src` 空窗，最终质量为 `original`、自然宽度为 1600。

- [ ] **Step 9: 提交核心修复**

```powershell
git add -- image-resource-manager.js script.js styles.css package.json tools/check-image-resource-manager.js tools/check-global-image-demand-loading.js tools/check-canvas-image-atomic-upgrade-ui.js
git commit -m "fix: upgrade canvas images without flicker"
```

---

### Task 3: 正式画布、旧画布和性能验收

**Files:**
- Verify: `package.json`, `tools/check-canvas-image-atomic-upgrade-ui.js` and existing test tools

**Interfaces:**
- Consumes: Tasks 1–2 的产品代码与回归测试。
- Produces: 可发布的验证证据和无测试残留的工作区。

- [ ] **Step 1: 运行画布快速与全项目检查**

Run:

```powershell
npm run check:canvas-fast
npm run check:canvas-browser-core
npm run check
```

Expected: 全部退出码 0，无语法、存储、调度器或 Agent 回归。

- [ ] **Step 2: 运行视觉保真与旧画布矩阵**

Run:

```powershell
$env:NODE_PATH='C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
npm run check:canvas-visual-fidelity
```

Expected: 35 张非空旧画布通过；5%–160% 无空壳、坏图或未加载可见图片；原子升级 UI 测试通过。

- [ ] **Step 3: 运行 5 万节点性能测试**

Run:

```powershell
node --disable-warning=ExperimentalWarning tools/generate-canvas-50000-fixture.js
$env:NODE_PATH='C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tools/check-canvas-50000-performance-ui.js
```

Expected: 50,000 节点、100,000 连接通过；交互 P95 ≤ 20 ms、视口查询 P95 ≤ 100 ms、页面错误 0、空壳 0。

- [ ] **Step 4: 删除压力测试画布和临时产物**

```powershell
node -e "require('./tools/generate-canvas-50000-fixture').removePressureRoot()"
Test-Path -LiteralPath '.\tmp\canvas-pressure'
```

Expected: `False`。不得删除正式 `data/`、历史画布或用户未提交文件。

- [ ] **Step 5: 重启 3099 正式本地服务并验证协议**

```powershell
$projectRoot = (Resolve-Path -LiteralPath '.').Path
$listener = Get-NetTCPConnection -LocalPort 3099 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  $expectedServer = Join-Path $projectRoot 'server.js'
  if ($process.Name -ne 'node.exe' -or $process.CommandLine -notlike "*$expectedServer*") {
    throw "Port 3099 belongs to an unrelated process: $($listener.OwningProcess)"
  }
  Stop-Process -Id $listener.OwningProcess
}
Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $projectRoot -WindowStyle Hidden
Invoke-WebRequest -Uri 'http://127.0.0.1:3099/api/canvas/boards' -UseBasicParsing
```

Expected: HTTP 200；不得操作其他端口或无关 Node 进程。

- [ ] **Step 6: 在正式“画布 17”执行只读浏览器验收**

Run:

```powershell
$env:CANVAS_IMAGE_ATOMIC_APP_URL='http://127.0.0.1:3099'
$env:CANVAS_IMAGE_ATOMIC_BOARD_ID='544a8769-7103-4058-8fc4-9b2816e3d5a0'
$env:NODE_PATH='C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tools/check-canvas-image-atomic-upgrade-ui.js --live
```

只读模式将同一图片固定在中心，模拟连续滚轮从 55% 到 217%，停止输入 2 秒，并用 10 ms 采样执行：

```js
assert.equal(emptySamples, 0);
assert.equal(finalQuality, "original");
assert.ok(finalNaturalWidth >= Number(img.dataset.originalWidth || 0));
assert.deepEqual(pageErrors, []);
```

测试不得创建、修改或删除正式画布。

- [ ] **Step 7: 最终状态检查**

```powershell
git status --short
git diff --check -- image-resource-manager.js script.js styles.css package.json tools/check-image-resource-manager.js tools/check-global-image-demand-loading.js tools/check-canvas-image-atomic-upgrade-ui.js
```

确认只提交本计划范围文件，保留工作区已有的无关未提交改动。
