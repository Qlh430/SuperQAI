# 在线生图历史管理与控件修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复在线生图尺寸控件溢出与提示框白线，并将图片历史的一键清空替换为安全的多选删除管理模式。

**Architecture:** 保留现有 HTML/CSS/原生 JavaScript 架构，在历史侧栏增加管理工具栏和确认条，以 `Set<string>` 保存本次选择；复用现有按 id 删除接口并串行请求。样式修复继续放在在线生图作用域内，避免影响其他工具页。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Node.js `assert` 回归脚本、Playwright 浏览器验证。

## Global Constraints

- 不修改图片历史的数据格式或保存路径。
- 不保留“一键清空图片历史”的前端入口。
- 管理模式中整张卡片点击即切换选择；正常模式仍打开历史预览。
- 删除前必须经过页面内第二次明确确认。
- 删除多个记录时串行调用现有按 id DELETE 接口。
- 不引入依赖、网络字体、前端框架或新的服务端路由。
- 保留工作区中与本任务无关的已有修改。

---

### Task 1: 添加失败的在线生图历史管理回归检查

**Files:**
- Create: `tools/check-image-history-management.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `index.html`、`script.js`、`styles.css` 的最终源文件。
- Produces: 可独立运行的 `node tools/check-image-history-management.js`，并加入 `npm run check`。

- [ ] **Step 1: 写入失败检查**

检查脚本使用 `fs.readFileSync` 与 `assert`，至少验证以下源码契约：

```js
assert.match(html, /id="clearImageHistory"[^>]*>管理<\/button>/);
assert.match(html, /id="imageHistorySelectionBar"[^>]*hidden/);
assert.match(html, /id="deleteSelectedImageHistory"[^>]*disabled/);
assert.match(script, /let imageHistoryManaging = false;/);
assert.match(script, /const selectedImageHistoryIds = new Set\(\);/);
assert.doesNotMatch(manageHandler, /clearServerHistory/);
assert.match(script, /for \(const id of ids\)[\s\S]*await deleteServerHistoryRecord/);
assert.match(styles, /grid-template-columns:\s*42px minmax\(0, 1fr\) minmax\(116px, 128px\)/);
assert.match(darkroomPromptRule, /box-shadow:\s*none/);
```

将 `node tools/check-image-history-management.js` 追加到 `package.json` 的 `check` 脚本末尾。

- [ ] **Step 2: 运行检查并确认正确失败**

Run: `node tools/check-image-history-management.js`

Expected: FAIL，首个失败指出“管理”按钮或管理工具栏尚不存在，而不是语法或文件读取错误。

- [ ] **Step 3: 提交测试基线（仅在工作区允许独立提交时）**

```bash
git add tools/check-image-history-management.js package.json
git commit -m "test: cover image history management"
```

如果 `package.json` 已含用户未提交修改，则不提交，只保留工作区补丁并在交付说明中列出。

### Task 2: 实现管理模式、多选和二次确认

**Files:**
- Modify: `index.html`
- Modify: `script.js`

**Interfaces:**
- Consumes: `deleteServerHistoryRecord(url, id)`、`renderImageHistory()`、`renderUnifiedHistory()`、`setImageStatus(message)`。
- Produces: `setImageHistoryManaging(nextValue)`、`updateImageHistoryManagementUi()`、`resetImageHistoryDeleteConfirmation()` 以及基于 `selectedImageHistoryIds` 的选择状态。

- [ ] **Step 1: 增加历史管理 DOM**

历史面板使用以下结构，保留现有 `imageHistory` 容器：

```html
<div class="history-head">
  <span>历史记录</span>
  <button id="clearImageHistory" type="button" aria-pressed="false">管理</button>
</div>
<div class="image-history-selection-bar" id="imageHistorySelectionBar" hidden>
  <span id="imageHistorySelectionCount">已选 0 张</span>
  <button id="selectAllImageHistory" type="button">全选</button>
</div>
<div class="image-history" id="imageHistory"></div>
<div class="image-history-delete-bar" id="imageHistoryDeleteBar" hidden>
  <button id="deleteSelectedImageHistory" type="button" disabled>删除所选（0）</button>
  <div id="imageHistoryDeleteConfirm" class="image-history-delete-confirm" hidden>
    <span id="imageHistoryDeletePrompt">确定删除 0 张？</span>
    <button id="cancelDeleteSelectedImageHistory" type="button">取消</button>
    <button id="confirmDeleteSelectedImageHistory" type="button">确认删除</button>
  </div>
</div>
```

- [ ] **Step 2: 添加选择状态与 UI 同步函数**

在元素引用区读取新增控件，并添加：

```js
let imageHistoryManaging = false;
const selectedImageHistoryIds = new Set();
let imageHistoryDeleteConfirming = false;

function resetImageHistoryDeleteConfirmation() {
  imageHistoryDeleteConfirming = false;
  imageHistoryDeleteConfirm.hidden = true;
  deleteSelectedImageHistory.hidden = false;
}

function updateImageHistoryManagementUi() {
  const count = selectedImageHistoryIds.size;
  imageHistoryPanelEl.classList.toggle("is-managing", imageHistoryManaging);
  clearImageHistoryButton.textContent = imageHistoryManaging ? "取消" : "管理";
  clearImageHistoryButton.setAttribute("aria-pressed", String(imageHistoryManaging));
  imageHistorySelectionBar.hidden = !imageHistoryManaging;
  imageHistoryDeleteBar.hidden = !imageHistoryManaging;
  imageHistorySelectionCount.textContent = `已选 ${count} 张`;
  deleteSelectedImageHistory.textContent = `删除所选（${count}）`;
  deleteSelectedImageHistory.disabled = count === 0;
  imageHistoryDeletePrompt.textContent = `确定删除 ${count} 张？`;
}
```

- [ ] **Step 3: 替换一键清空事件并增加管理事件**

管理按钮切换模式时清空选择与确认状态；“全选”基于当前带 `data-history-id` 的卡片；首次删除只展开确认条；确认后串行删除：

```js
for (const id of ids) {
  await deleteServerHistoryRecord(IMAGE_HISTORY_API_URL, id);
}
```

成功后退出管理模式并刷新两个历史视图；异常时使用 `setImageStatus(error.message)`，并在 `finally` 中恢复按钮可用状态。

- [ ] **Step 4: 让历史卡片按模式切换行为**

`renderImageHistory()` 为有 id 的卡片增加 `data-history-id`、`aria-pressed` 与勾选标记。管理模式点击时只切换 `selectedImageHistoryIds` 和 `.selected`；普通模式保留设置提示词、渲染图片和状态文案的现有逻辑。选择变化必须调用 `resetImageHistoryDeleteConfirmation()`。

- [ ] **Step 5: 运行语法检查与回归检查**

Run: `node --check script.js && node tools/check-image-history-management.js`

Expected: 语法检查成功；历史管理检查仍可能只因 CSS 契约缺失而失败，DOM 与 JavaScript 断言通过。

### Task 3: 修复尺寸布局、提示框白线和管理模式视觉

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: `.is-managing`、`.selected`、`.image-history-selection-bar`、`.image-history-delete-bar` 与 `.history-thumb-check` 状态类。
- Produces: 不溢出的尺寸行、无白色内阴影的深色提示框、可访问的管理状态样式。

- [ ] **Step 1: 修复尺寸行与提示词框**

将在线生图尺寸行改为：

```css
#imageView .size-row {
  grid-template-columns: 42px minmax(0, 1fr) minmax(116px, 128px);
}

#imageView .size-row > select,
#imageView .size-row > input {
  min-width: 0;
  width: 100%;
}
```

在最终深色主题 `#imageView #imagePrompt` 规则中加入 `box-shadow: none;`。

- [ ] **Step 2: 增加管理工具栏和选中卡片样式**

管理状态将历史面板网格切换为四行；工具栏使用紧凑弹性布局；底部确认条不覆盖滚动区域。卡片为 `position: relative`，管理模式显示圆形勾选标记，`.selected` 使用信号黄边框、浅色混合背景和清晰焦点环。删除按钮禁用时降低对比但保持可读，确认删除使用危险语义的暖红色文字/边框而非大面积红底。

- [ ] **Step 3: 运行新增检查确认转绿**

Run: `node tools/check-image-history-management.js`

Expected: `Image history management checks passed.`

- [ ] **Step 4: 运行完整检查**

Run: `npm run check`

Expected: exit code 0，所有既有与新增检查通过，无错误输出。

### Task 4: 真实浏览器交互验证

**Files:**
- Create: `artifacts/design-qa/image-history-management.png`

**Interfaces:**
- Consumes: 本地 `http://localhost:3000` 页面与现有图片历史。
- Produces: 浏览器计算样式证据、交互断言和管理模式截图。

- [ ] **Step 1: 验证布局计算值**

使用 Playwright 在 2048×1024、深色黄黑主题打开在线生图。断言 `#imageResolution.getBoundingClientRect().right <= .control-card.getBoundingClientRect().right`，提示词框 `getComputedStyle(...).boxShadow === "none"`。

- [ ] **Step 2: 验证管理交互而不改真实历史**

点击“管理”，断言选择栏和删除栏可见；点击第一张卡片，断言 `aria-pressed="true"`、计数为 1、删除按钮可用。记录 DELETE 请求数，第一次点击“删除所选”后断言仍为 0；点击确认条“取消”后确认条关闭。点击顶部“取消”后，卡片重新恢复预览行为。

- [ ] **Step 3: 验证确认后的按 id 删除调用**

在页面内临时包装 `window.fetch`，仅拦截 `/api/history/images?...id=` 的 DELETE 并返回成功 JSON；选择两张卡片并确认删除，断言捕获到两个不同 id 且请求按顺序完成，不写入真实历史数据。

- [ ] **Step 4: 保存截图并检查控制台**

截图保存为 `artifacts/design-qa/image-history-management.png`。断言浏览器控制台无新增 `error`，页面无横向溢出，选择、确认和取消状态在窄历史栏内清晰可见。

- [ ] **Step 5: 最终工作区复核**

Run: `git diff --check`，并查看 `git diff -- index.html script.js styles.css package.json tools/check-image-history-management.js`。

Expected: 无空白错误；diff 只包含本方案相关改动，并保留这些文件内原有用户修改。
