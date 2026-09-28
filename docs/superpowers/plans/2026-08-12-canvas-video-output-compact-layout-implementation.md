# 视频输出节点紧凑布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除视频输出节点冗余底栏，把历史入口改成参考生成图集的右下侧悬浮按钮。

**Architecture:** 保留现有视频历史状态与侧边面板，只收敛 `renderCanvasVideoOutputNode` 生成的节点结构以及对应 CSS。通过聚焦源码契约测试固定“无底栏、无独立下载、悬浮历史入口”，再用现有完整测试与浏览器验证覆盖回归。

**Tech Stack:** 原生 JavaScript、CSS、Node.js 合约检查、浏览器原生 `<video controls>`。

## Global Constraints

- 节点主体只保留标题栏和视频播放器。
- 当前视频下载依赖原生视频控件，不再提供独立下载按钮。
- 历史面板中的文件名、提示词、下载和删除能力保持不变。
- 不修改视频历史数据、生成链路、保存恢复和下游引用逻辑。

---

### Task 1: 锁定紧凑节点结构契约

**Files:**
- Modify: `tools/check-canvas-video-history.js`
- Test: `tools/check-canvas-video-history.js`

**Interfaces:**
- Consumes: `renderCanvasVideoOutputNode` 和 `renderCanvasVideoOutputHistory` 的函数源码。
- Produces: 节点结构与历史面板功能的静态回归契约。

- [ ] **Step 1: 写入失败测试**

增加断言：渲染函数不包含 `canvas-video-output-meta`，不创建当前视频下载锚点，节点直接追加 `historyToggle`；CSS 将按钮绝对定位在右下侧；历史渲染仍含文件名、提示词和下载。

- [ ] **Step 2: 运行测试确认失败**

Run: `node tools/check-canvas-video-history.js`

Expected: FAIL，指出旧底栏或旧按钮布局仍存在。

- [ ] **Step 3: 保留失败证据并进入最小实现**

不修改历史规则文件或生成链路，只进入渲染和样式实现。

### Task 2: 实现节点紧凑布局

**Files:**
- Modify: `script.js:4457`
- Modify: `styles.css:17346`
- Test: `tools/check-canvas-video-history.js`

**Interfaces:**
- Consumes: 现有 `historyToggle`、`historyPanel`、`setCanvasVideoHistoryOpen`。
- Produces: 标题栏 + 播放器 + 右下悬浮历史按钮的节点结构。

- [ ] **Step 1: 删除底栏 DOM**

从 `renderCanvasVideoOutputNode` 移除 `meta`、`copy`、`metaActions` 和当前视频下载锚点，将 `historyToggle` 直接追加到节点。

- [ ] **Step 2: 改为图集式悬浮样式**

删除无用的 `.canvas-video-output-meta` / `.canvas-video-output-actions` 样式，将 `.canvas-video-history-toggle` 设置为绝对定位、42px 方形、右侧负偏移、靠下，并把数量徽标定位到按钮右下角。

- [ ] **Step 3: 运行聚焦测试**

Run: `node tools/check-canvas-video-history.js`

Expected: PASS，输出 canvas video history checks passed。

### Task 3: 回归与浏览器验收

**Files:**
- Verify: `script.js`
- Verify: `styles.css`
- Verify: `tools/check-canvas-video-history.js`

**Interfaces:**
- Consumes: 完成后的前端代码。
- Produces: 可交付的测试与视觉验收证据。

- [ ] **Step 1: 运行完整检查**

Run: `npm run check`

Expected: exit code 0，所有检查通过。

- [ ] **Step 2: 检查补丁格式**

Run: `git diff --check`

Expected: 无新增空白错误（允许仓库既有 CRLF 警告）。

- [ ] **Step 3: 浏览器验证**

打开本地画布并确认：节点没有底部信息条和独立下载按钮；历史按钮位于右侧靠下且不遮挡播放器三点菜单；点击可打开历史面板；历史项仍可切换、下载和删除。

- [ ] **Step 4: 最终复核**

对照设计文档确认没有改动历史数据、生成和连接逻辑，并汇报验证结果。
