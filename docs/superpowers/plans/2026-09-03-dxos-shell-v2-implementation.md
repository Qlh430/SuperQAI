# DX OS 风格桌面壳 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实窗口状态、应用注册和适配器体系替换当前通过隐藏浮层与点击旧工具按钮实现的桌面外壳。

**Architecture:** 新增纯 JavaScript 窗口管理内核和应用运行时，`desktop-shell.js` 只负责会话、DOM 渲染和输入事件。现有业务功能通过 legacy DOM adapter 接入，未来应用通过受限 iframe adapter 接入；后端账户、SQLite ACL、共享和备份保持不变。

**Tech Stack:** Node.js 24、原生 JavaScript、HTML/CSS、Electron 44、Node 内置测试断言、现有 HTTP/SQLite 服务。

## Global Constraints

- 保留当前未提交业务改动，不执行 reset、checkout 或批量覆盖。
- 不复制 DX OS 源码或品牌资产，只重新实现已确认的行为。
- 不新增前端框架或联网依赖。
- 新业务行为必须先有失败测试，再写实现。
- 未登录不挂载业务应用；服务端 ACL 是权限事实来源。
- 小屏宽度小于 860px 时使用单窗口全屏模式。

---

### Task 1: 可测试窗口管理内核

**Files:**
- Create: `desktop-window-manager.js`
- Create: `tools/check-desktop-window-manager.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `createWindowManager({ storage, storageKey, viewport, onChange })`
- Produces methods: `registerApp`, `open`, `focus`, `move`, `resize`, `minimize`, `maximize`, `restore`, `toggleMaximize`, `close`, `closeAll`, `getWindow`, `getSnapshot`, `setViewport`。

- [x] **Step 1: Write the failing behavior check**

覆盖首次居中、级联、多实例复用、z-index、边界限制、最小化恢复、最大化还原、账号级持久化和损坏持久化回退。

- [x] **Step 2: Run test to verify RED**

Run: `node tools/check-desktop-window-manager.js`
Expected: FAIL with `Cannot find module '../desktop-window-manager'`。

- [x] **Step 3: Implement the minimal state machine**

使用 CommonJS/Browser UMD 导出；所有变更生成不可变快照并调用 `onChange(snapshot, event)`；持久化只保存几何和最大化前几何。

- [x] **Step 4: Run test to verify GREEN**

Run: `node tools/check-desktop-window-manager.js`
Expected: `Desktop window manager checks passed.`

### Task 2: 应用注册表和适配器协议

**Files:**
- Create: `desktop-app-runtime.js`
- Create: `tools/check-desktop-app-runtime.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: WindowManager app metadata。
- Produces: `createAppRuntime({ document, sessionProvider, invokeHost })`。
- Produces methods: `register`, `listVisible`, `mount`, `activate`, `deactivate`, `unmount`, `handleMessage`。

- [x] **Step 1: Write the failing runtime check**

验证 manifest 字段、角色过滤、单实例约束、legacy 生命周期、iframe sandbox、消息来源校验和动作白名单。

- [x] **Step 2: Run test to verify RED**

Run: `node tools/check-desktop-app-runtime.js`
Expected: FAIL with missing runtime module。

- [x] **Step 3: Implement registry and adapters**

legacy adapter 调用显式 `onActivate`；iframe adapter 只创建 `sandbox="allow-scripts allow-forms"` 的 iframe，并只处理 `{ protocol:'ai-os/v1', id, action, args }`。

- [x] **Step 4: Run test to verify GREEN**

Run: `node tools/check-desktop-app-runtime.js`
Expected: `Desktop app runtime checks passed.`

### Task 3: 桌面渲染器与真实窗口交互

**Files:**
- Modify: `index.html`
- Modify: `desktop-shell.js`
- Modify: `desktop-shell.css`
- Modify: `tools/check-ai-os-shell.js`

**Interfaces:**
- Consumes: `window.AiOsWindowManager.createWindowManager`、`window.AiOsAppRuntime.createAppRuntime`。
- Preserves: `window.AiOsDesktop.openApp/focusApp/minimizeApp/closeApp/setSession/toast/getSession`。

- [x] **Step 1: Extend shell checks and verify RED**

静态检查必须包含窗口层、启动台、真实标题栏、八方向 resize handle、最大化按钮、运行态 Dock、两个新模块脚本和禁止 `selectLegacyTool`。

Run: `node tools/check-ai-os-shell.js`
Expected: FAIL on missing V2 contracts。

- [x] **Step 2: Add neutral window host markup**

保留业务 DOM，新增 `#aiOsWindowLayer` 和 `#aiOsLaunchpad`；为现有业务主工作台、共享、账户和设置标注稳定的 app host，不复制业务表单。

- [x] **Step 3: Replace shell orchestration**

注册 canvas、image、chat、records、shared、accounts、settings；根据状态生成窗口 chrome，将对应 app host 移入窗口 content；实现 pointer capture 拖动/缩放、双击最大化、Dock 恢复、Escape 关闭启动台。

- [x] **Step 4: Apply the refined Apple-style visual system**

增加焦点/非焦点层次、交通灯 hover glyph、运行点、玻璃阴影、启动台动画和 860px 单窗口媒体规则；保持 `prefers-reduced-motion`。

- [x] **Step 5: Run shell checks and syntax checks**

Run: `node tools/check-ai-os-shell.js && node --check desktop-shell.js`
Expected: all pass。

### Task 4: 文件/共享应用与资源打开上下文

**Files:**
- Modify: `account-management-ui.js`
- Modify: `index.html`
- Modify: `desktop-shell.css`
- Create: `tools/check-files-app.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `/api/resources` and existing share endpoints。
- Produces: `AiOsManagement.openResource(resourceId)` and `setResourceFilter(filter)`。

- [x] **Step 1: Write failing files app checks and verify RED**

验证“我的内容/与我共享/全部可见”计数与筛选、只给 owner 显示共享按钮、打开资源时把 `resourceId` 传给桌面应用。

- [x] **Step 2: Implement resource-aware opening**

`openApp(appId, { resourceId })` 保存启动参数并向 adapter 发送 activate；禁止把被共享图片错误地一律打开成生图首页。

- [x] **Step 3: Improve file states and sharing feedback**

为 locked、read、edit、copy、owner 显示清楚徽标；共享保存或撤销后刷新资源视图。

- [x] **Step 4: Run checks**

Run: `node tools/check-files-app.js && node --check account-management-ui.js`
Expected: all pass。

### Task 5: 回归、浏览器交互和文档

**Files:**
- Modify: `tools/check-ai-os-mvp.js`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-03-dxos-shell-v2-design.md`

**Interfaces:**
- Verifies all earlier task interfaces and existing host features。

- [x] **Step 1: Run focused checks**

Run: `npm run check:desktop-v2 && npm run check:ai-os-shell && npm run check:resources && npm run desktop:check`
Expected: all pass。

- [x] **Step 2: Run browser smoke test**

使用隔离临时数据启动服务，验证登录后能同时打开三个窗口，拖动/缩放/最小化/最大化/恢复有效，普通账号无法打开账户管理，文件共享入口仍可用。

- [x] **Step 3: Run full relevant regression**

Run: `npm run check:system && npm run check:auth && npm run check:resources && npm run check:backup && npm run check:ai-os && npm run desktop:check`
Expected: all pass；任何既有失败单独记录，不删除检查。

- [x] **Step 4: Record implementation status**

在 V2 规格追加实际完成项、验证命令和已知限制；README 更新窗口操作和主机使用说明。

## Self-review

- 五项任务覆盖窗口内核、应用协议、桌面交互、共享资源上下文和完整回归。
- 所有跨任务接口命名一致；没有依赖 Vue、Pinia 或外部网络包。
- iframe adapter 是协议骨架，现有画布本阶段明确通过 legacy adapter 接入，不假装已完成独立拆包。
