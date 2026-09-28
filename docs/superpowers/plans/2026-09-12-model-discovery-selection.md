# 模型发现选择与按钮优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让模型目录拉取结果只默认勾选当前已保存模型，并优化发现区底部加入/取消操作的视觉与状态反馈。

**Architecture:** 在 `system-settings-ui.js` 中增加一个纯函数计算发现模型的默认选中状态。同步模型时保留完整上游目录，渲染时用当前草稿提供商的模型 ID 集合设置复选框和“已保存”标识；追加逻辑继续按 ID 去重。`system-settings.css` 仅扩展发现区 footer 按钮的语义 class、交互状态和零选择禁用状态。

**Tech Stack:** 原生 JavaScript、HTML 模板字符串、CSS、自包含 Node `assert` 检查脚本。

**执行结果（2026-09-12）:** 已完成。默认选择、完整目录及 ID 去重、主次按钮、筛选/取消均已实现。实际渲染检查修正了旧主题覆盖蓝色按钮和已保存标识截断的问题，已检查浅色、深色与 390px 窄屏截图。系统设置检查、独立组件行为检查、完整提供商浏览器烟测通过。浏览器烟测此前的失败已通过等待 URL 渲染和在切换协议后恢复测试模型工具能力解决。代码保留在当前工作区，未提交。

## Global Constraints

- 已保存模型默认勾选，新模型默认不勾选。
- 搜索和分类筛选只影响可见性，不清除或重置选择。
- 已保存模型即使勾选也不得重复追加。
- 选中数量为 0 时，加入按钮禁用；取消按钮始终可用。
- 不引入新的依赖、弹窗或快捷选择器。

---

### Task 1: 添加默认选择状态的失败测试

**Files:**
- Modify: `tools/check-system-settings-ui.js`，在 `normalizeProviderModels` 检查之后加入纯函数行为断言。
- Test: `tools/check-system-settings-ui.js`（通过现有 `npm run check:system-settings` 入口执行）。

**Interfaces:**
- Consumes: 尚不存在的 `settings.modelDiscoverySelectionState(discoveredModels, savedModels)`。
- Produces: 明确约束返回值为 `[{ id, selected }]`，供后续渲染代码使用。

- [ ] **Step 1: Write the failing test**

```js
assert.equal(typeof settings.modelDiscoverySelectionState, "function");
assert.deepEqual(
  settings.modelDiscoverySelectionState(
    [{ id: "saved-a", displayName: "A" }, { id: "new-b", displayName: "B" }, { id: "saved-c", displayName: "C" }],
    [{ id: "saved-a" }, { id: "saved-c" }],
  ),
  [
    { id: "saved-a", selected: true },
    { id: "new-b", selected: false },
    { id: "saved-c", selected: true },
  ],
);
```

- [ ] **Step 2: Run the failing test**

Run: `node tools/check-system-settings-ui.js`

Expected: FAIL at `typeof settings.modelDiscoverySelectionState` because the helper is not exported yet.

### Task 2: 实现模型默认选择与发现区渲染

**Files:**
- Modify: `system-settings-ui.js:35-100`，增加并导出 `modelDiscoverySelectionState`。
- Modify: `system-settings-ui.js:414-423`，让发现区展示完整拉取结果，并按当前提供商模型 ID 生成 checked、已保存标识与初始数量。
- Modify: `system-settings-ui.js:696-711`，移除只保留新模型的过滤，继续以 `normalized.models` 作为已保存配置。
- Modify: `system-settings-ui.js:426-440`，更新数量时同步加入按钮的 disabled 状态。

**Interfaces:**
- Consumes: Task 1 的 `modelDiscoverySelectionState(discoveredModels, savedModels)`。
- Produces: `state.modelDiscovery.models` 包含完整推断目录；渲染后的 `[data-discovered-model]` 只有已保存 ID 带 `checked`；`[data-model-discovery-add]` 在无选择时 disabled。

- [ ] **Step 1: Write the minimal helper and export it**

```js
function modelDiscoverySelectionState(discoveredModels = [], savedModels = []) {
  const savedIds = new Set((savedModels || []).map(model => String(model?.id || "")).filter(Boolean));
  return (discoveredModels || []).map(model => ({
    id: String(model?.id || ""),
    selected: savedIds.has(String(model?.id || "")),
  }));
}
```

在文件底部返回对象中加入 `modelDiscoverySelectionState`。

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `node tools/check-system-settings-ui.js`

Expected: Task 1 的 helper 断言 PASS；后续新增的静态断言可能仍因旧模板而失败，失败点应指向尚未修改的发现区模板。

- [ ] **Step 3: Update sync state and markup**

在 `syncModels()` 中将发现状态改为完整目录：

```js
const normalized = normalizeProviderModels({ ...provider, protocol: platformProtocol }, inferred, state.protocolCatalog, { includeInferred: false });
state.modelDiscovery = {
  models: inferred,
  platformProtocol,
  filter: "all",
  query: "",
};
state.draftProvider = { ...provider, protocol: platformProtocol, models: normalized.models };
```

在 `modelDiscoveryMarkup()` 中以 `selectedProvider()?.models || []` 调用 helper；每个卡片的 checkbox 根据 `selected` 写入 `checked`，已保存项在协议标签后追加 `<span class="settings-discovered-model-status">已保存</span>`。footer 的加入按钮初始 `disabled` 只在没有已选项时出现。

- [ ] **Step 4: Update live selection count and disabled state**

将 `applyDiscoveryFilter()` 的尾部统一为：

```js
const selected = section.querySelectorAll("[data-discovered-model]:checked").length;
const summary = section.querySelector("[data-discovery-selected]");
if (summary) summary.textContent = `已选择 ${selected} 个`;
const addButton = section.querySelector("[data-model-discovery-add]");
if (addButton) addButton.disabled = selected === 0;
```

保留 `addDiscoveredModels()` 的 `existingIds` 去重逻辑，使已保存模型不会重复追加。

- [ ] **Step 5: Add focused static assertions**

在 `tools/check-system-settings-ui.js` 中断言：

```js
assert.match(ui, /modelDiscoverySelectionState/);
assert.match(ui, /data-model-discovery-add[^>]*disabled/);
assert.match(ui, /settings-discovered-model-status/);
assert.match(ui, /models:\s*inferred/);
```

- [ ] **Step 6: Run the focused test again**

Run: `node tools/check-system-settings-ui.js`

Expected: PASS，输出 `System settings UI checks passed.`。

### Task 3: 优化发现区底部操作按钮样式

**Files:**
- Modify: `system-settings-ui.js:421-422`，给加入和取消按钮添加 `settings-model-discovery-add settings-primary-button` 与 `settings-model-discovery-cancel settings-secondary-button` class。
- Modify: `system-settings.css:351-352` 之后，补充发现区状态标识与按钮交互样式。
- Modify: `tools/check-system-settings-ui.js`，加入 class 与 CSS 静态断言。

**Interfaces:**
- Consumes: Task 2 的 footer markup 与 disabled 属性。
- Produces: 蓝色实心主按钮、白底描边次按钮、hover/active/focus-visible/disabled 状态，在窄屏下继续保持 footer 可用。

- [ ] **Step 1: Write the failing static assertions**

```js
assert.match(ui, /settings-model-discovery-add settings-primary-button/);
assert.match(ui, /settings-model-discovery-cancel settings-secondary-button/);
assert.match(css, /\.settings-model-discovery-add/);
assert.match(css, /\.settings-model-discovery-cancel/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tools/check-system-settings-ui.js`

Expected: FAIL because the new semantic classes and CSS selectors are not present.

- [ ] **Step 3: Implement the button and status styles**

在 footer 模板中使用：

```html
<button type="button" class="settings-model-discovery-add settings-primary-button" data-model-discovery-add>加入所选模型</button>
<button type="button" class="settings-model-discovery-cancel settings-secondary-button" data-model-discovery-cancel>取消</button>
```

在 `system-settings.css` 中加入：

```css
.settings-discovered-model-status { color: var(--settings-blue); background: var(--settings-blue-soft); border-radius: 999px; padding: 3px 6px; font-size: .52rem; font-style: normal; white-space: nowrap; }
.settings-model-discovery > footer > div { display: flex; align-items: center; gap: 7px; }
.settings-model-discovery-add,
.settings-model-discovery-cancel { min-height: 32px; border-radius: 9px; padding: 0 13px; font-weight: 650; transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease; }
.settings-model-discovery-add:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(47,128,237,.2); }
.settings-model-discovery-cancel:hover { border-color: rgba(47,128,237,.32); color: var(--settings-blue); background: rgba(255,255,255,.94); }
.settings-model-discovery-add:active:not(:disabled), .settings-model-discovery-cancel:active { transform: translateY(0); }
.settings-model-discovery-add:focus-visible, .settings-model-discovery-cancel:focus-visible { outline: 2px solid var(--settings-blue); outline-offset: 3px; }
.settings-model-discovery-add:disabled { cursor: not-allowed; opacity: .48; box-shadow: none; }
```

- [ ] **Step 4: Run the focused test to verify styles pass**

Run: `node tools/check-system-settings-ui.js`

Expected: PASS，且 CSS 静态断言全部通过。

### Task 4: 完整验证

**Files:**
- Test: `system-settings-ui.js`、`system-settings.css`、`tools/check-system-settings-ui.js`。

- [ ] **Step 1: Run syntax checks**

Run: `node --check system-settings-ui.js`

Expected: exit code 0，无输出。

- [ ] **Step 2: Run the complete system settings check**

Run: `npm run check:system-settings`

Expected: exit code 0，并包含 `System settings UI checks passed.`。

- [ ] **Step 3: Inspect the final diff**

Run: `git diff -- system-settings-ui.js system-settings.css tools/check-system-settings-ui.js docs/superpowers/specs/2026-09-12-model-discovery-selection-design.md docs/superpowers/plans/2026-09-12-model-discovery-selection.md`

Expected: 仅包含本需求相关的模型选择逻辑、按钮样式、检查脚本与规格/计划文档；不改写工作区中其他已有变更。
