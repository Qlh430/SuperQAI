# GPT 对话历史菜单与批量删除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复对话历史三点菜单被相邻记录遮挡的问题，并用安全的多选管理模式替换“清空全部”。

**Architecture:** 保留现有三点菜单 DOM，通过打开菜单记录的堆叠层级和末行翻转解决遮挡；在聊天历史侧栏增加与图片历史一致的选择栏和删除确认栏。客户端使用 `Set<string>` 管理选择并复用现有按 id DELETE 接口串行删除。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Node.js `assert` 源码回归检查、Playwright 浏览器验证。

## Global Constraints

- 正常模式保留三点单条删除和点击卡片加载对话。
- “清空全部”替换为“管理”，不保留直接清空全部对话的前端路径。
- 管理模式隐藏三点按钮，整张卡片点击切换选择。
- 批量删除必须经过页面内二次确认并串行按 id 请求。
- 删除当前对话后必须重置为新空白会话。
- 不修改服务端协议、数据格式、历史文件或其他工具页面。
- 保留工作区中与本任务无关的已有修改。

---

### Task 1: 添加失败的菜单与批量删除回归检查

**Files:**
- Create: `tools/check-chat-history-management.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `index.html`、`script.js`、`styles.css`。
- Produces: `node tools/check-chat-history-management.js`，并由 `npm run check` 的 `precheck` 自动执行。

- [ ] **Step 1: 写入源码契约检查**

脚本读取三个源文件并使用 `assert` 检查：管理按钮与工具栏 id；`chatHistoryManaging`、`selectedChatHistoryIds`、确认状态和 UI 同步函数；不存在 `clearServerHistory(CHAT_HISTORY_API_URL)`；存在串行 `await deleteServerHistoryRecord(CHAT_HISTORY_API_URL, id)`；渲染记录设置 `data-history-id` 与 `aria-pressed`；CSS 为打开菜单行设置高层级、末行菜单向上展开、管理栏和选中状态存在。

核心断言：

```js
assert.match(html, /id="clearChatHistory"[^>]*aria-pressed="false"[^>]*>管理<\/button>/);
assert.match(script, /let chatHistoryManaging = false;/);
assert.match(script, /const selectedChatHistoryIds = new Set\(\);/);
assert.doesNotMatch(script, /clearServerHistory\(CHAT_HISTORY_API_URL\)/);
assert.match(script, /for \(const id of ids\) \{[\s\S]*await deleteServerHistoryRecord\(CHAT_HISTORY_API_URL, id\)/);
assert.match(styles, /history-chat-row:has\(\.history-chat-menu:not\(\[hidden\]\)\)[\s\S]*z-index:\s*20/);
assert.match(styles, /history-chat-row:last-child \.history-chat-menu[\s\S]*bottom:/);
```

将 `precheck` 改为：

```json
"precheck": "node tools/check-image-history-management.js && node tools/check-chat-history-management.js"
```

- [ ] **Step 2: 运行并确认 RED**

Run: `node tools/check-chat-history-management.js`

Expected: FAIL，首个失败指出聊天管理按钮或管理工具栏尚不存在。

### Task 2: 修复三点菜单堆叠与底部裁切

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: `.history-chat-menu:not([hidden])` 与现有 `.history-chat-row`。
- Produces: 打开菜单的行位于其他行上方，末行菜单向上展开。

- [ ] **Step 1: 增加最终层级规则**

在样式表末端添加：

```css
#chatView .history-chat-row:has(.history-chat-menu:not([hidden])) {
  z-index: 20;
}

#chatView .history-chat-row:last-child .history-chat-menu {
  top: auto;
  bottom: calc(50% + 17px);
}
```

- [ ] **Step 2: 运行菜单相关检查**

Run: `node tools/check-chat-history-management.js`

Expected: 菜单层级断言通过；管理模式断言仍因功能未实现而失败。

### Task 3: 实现对话历史管理、多选和二次确认

**Files:**
- Modify: `index.html`
- Modify: `script.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `deleteServerHistoryRecord(CHAT_HISTORY_API_URL, id)`、`renderChatHistory()`、`resetCurrentChat()`、`setChatStatus(message)`。
- Produces: `setChatHistoryManaging(nextValue)`、`updateChatHistoryManagementUi()`、`resetChatHistoryDeleteConfirmation()`、`updateChatHistoryRowSelection(row, button)`。

- [ ] **Step 1: 增加聊天管理 DOM**

将标题按钮改为带 `aria-pressed="false"` 的“管理”，并在 `chatHistory` 前后加入：

```html
<div class="chat-history-selection-bar" id="chatHistorySelectionBar" hidden>
  <span id="chatHistorySelectionCount" aria-live="polite">已选 0 条</span>
  <button id="selectAllChatHistory" type="button">全选</button>
</div>
<div class="chat-history-delete-bar" id="chatHistoryDeleteBar" hidden>
  <button id="deleteSelectedChatHistory" type="button" disabled>删除所选（0）</button>
  <div class="chat-history-delete-confirm" id="chatHistoryDeleteConfirm" hidden>
    <span id="chatHistoryDeletePrompt">确定删除 0 条？</span>
    <button id="cancelDeleteSelectedChatHistory" type="button">取消</button>
    <button id="confirmDeleteSelectedChatHistory" type="button">确认删除</button>
  </div>
</div>
```

- [ ] **Step 2: 添加状态与事件**

增加：

```js
let chatHistoryManaging = false;
const selectedChatHistoryIds = new Set();
let chatHistoryDeleteConfirming = false;
```

管理按钮切换模式并重新渲染；全选基于当前 `[data-history-id]`；首次删除只显示确认条；取消确认恢复删除按钮。确认删除时使用：

```js
let deletedCurrentConversation = false;
for (const id of ids) {
  await deleteServerHistoryRecord(CHAT_HISTORY_API_URL, id);
  if (id === currentConversationId) deletedCurrentConversation = true;
}
if (deletedCurrentConversation) {
  currentConversationId = createId();
  resetCurrentChat();
}
```

成功后退出管理并刷新；异常时同样处理已删除的当前会话、刷新列表并显示失败状态。

- [ ] **Step 3: 改造 `renderChatHistory()`**

渲染前清理不存在的选择 id。每行设置 `data-history-id`，加入 `.chat-history-check`；管理模式下对话按钮只切换选择和 `aria-pressed`，三点按钮由 CSS 隐藏；正常模式保留加载对话与单条删除。菜单打开事件继续关闭其他菜单。

- [ ] **Step 4: 添加管理样式**

管理状态将侧栏网格改成四行；选择栏、删除栏、确认条沿用在线生图的暗房配色与焦点状态；选中行使用信号黄边框/背景和勾选圆点；`.chat-history.is-managing .history-chat-more` 隐藏。

- [ ] **Step 5: 运行 GREEN 检查**

Run: `node --check script.js && node tools/check-chat-history-management.js`

Expected: `Chat history management checks passed.`

### Task 4: 完整回归与无损浏览器验证

**Files:**
- Create: `artifacts/design-qa/chat-history-management.png`

**Interfaces:**
- Consumes: 本地页面与 Playwright 拦截的假聊天历史。
- Produces: 菜单命中证据、串行删除证据、控制台检查和管理模式截图。

- [ ] **Step 1: 运行完整检查**

Run: `npm run check && git diff --check`

Expected: exit code 0，无新增错误。

- [ ] **Step 2: 验证菜单可点击**

打开第一条三点菜单，读取重叠区域的 `elementFromPoint`，期望命中 `.history-chat-menu` 或 `.history-chat-delete`，不是下一条 `.history-chat`。打开最后一条菜单，断言菜单 `bottom <= chatHistory.bottom` 且 `top >= chatHistory.top`。

- [ ] **Step 3: 验证管理模式**

使用两条拦截的假记录：进入管理、点击整卡、全选/取消全选、二次确认和退出状态都正确；第一次点击删除后的 DELETE 数量为 0。

- [ ] **Step 4: 验证串行删除与当前会话处理**

拦截 id DELETE，每个请求延迟 60ms 并记录 start/end；期望顺序为 `start:1,end:1,start:2,end:2`、最大并发 1。选中当前对话后确认删除，期望消息区回到欢迎空状态并生成新的当前会话 id。

- [ ] **Step 5: 保存截图并复核工作区**

保存 `artifacts/design-qa/chat-history-management.png`，确认窄侧栏内工具栏和确认条不溢出；浏览器 `pageerror` 与非资源型 console error 均为空。最后运行 `git status --short`，不暂存已有脏文件。
