# 画布右上角功能栏常驻 + Agent 面板不再压住功能栏（2026-10-12）

## 用户要求

「图1 画布右上角功能栏要常驻。点击 Agent 的时候，现在的对话框顶部向下移，范围就是红框，不要跟功能栏重叠了」

## 原因

1. **功能栏不是常驻**：`neon-canvas-surface.css` 把画布 chrome 当"按需出现"的一层——`.canvas-actions`（右上角功能栏：Agent / 资产库 / 新建画布 / 复位 / 整理 / 清空）和 `.canvas-status` 一起 `opacity: 0; visibility: hidden; pointer-events: none`，只有 `#canvasEditorScreen:focus-within` 或"有节点悬停/选中/连线中"时才显形。实测没有悬停也没有选中时是 `opacity: 0 / visibility: hidden / pointer-events: none`，按钮也点不到。
2. **Agent 面板压住功能栏**：`canvas-agent.css` 里 `.canvas-agent-panel { position: absolute; top: 0; height: 100% }`，而功能栏是 `position: fixed; top: 16px; height: 40px`（`neon-page-rebuild.css`）→ 面板顶边在 0，被 16..56 的功能栏盖住一截；窗口偏窄时（媒体查询把功能栏放回 `right: 12px`）两者还会水平重叠，于是面板顶部那块被压住。

## 改动

- `neon-canvas-surface.css`：在原有的显形规则后补一条 `.canvas-actions` 常驻（`opacity: 1; visibility: visible; pointer-events: auto; transform: none`）。只对功能栏生效，`.canvas-status`（缩放/提示条）仍按需显示；选择器与原有规则同级、文件顺序在后，所以稳定获胜。
- `neon-page-rebuild.css`：给 Agent 面板加 `top: 64px`（功能栏 16 + 高 40 + 8 间隙）与 `height: calc(100% - 64px)`，面板顶边落到功能栏下沿之下、底边仍在工作区底部。与资产库面板的 `top: 64px` 保持同一档。

## 验证

新增 `canvas-actions-persistent-regression.cjs`（1440×1000）：

1. 把鼠标挪到 (4,900)、清空选中并收起焦点后：`.canvas-actions` 仍是 `opacity: 1 / visibility: visible / pointer-events: auto`，且「复位」按钮中心 `elementFromPoint` 命中它自己（真的能点）。
2. 点 `#canvasAgentToggle` 打开 Agent：`.canvas-workspace.canvas-agent-open` 成立、面板可见，**面板顶边 64 ≥ 功能栏底 56 + 4**（不再重叠），面板底边 966 = 工作区底边 966（`height: calc(100% - 64px)` 生效），打开面板后功能栏依旧可见。
3. 截图 `acceptance/canvas-actions-persistent-1440.png`：功能栏在右上完整显示，Agent 面板从它下方开始、头部与输入区都完整。

**红绿验证**：去掉功能栏常驻规则 → 用例第一步失败并打印「功能栏应常驻可见（不透明）：{"opacity":"0","visibility":"hidden","pointerEvents":"none"}」；去掉面板下移规则 → 第二步失败并打印「面板顶边应在功能栏下沿之下：面板 0 vs 功能栏底 56」。恢复后全绿。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T12-07-20-536Z`）后确认运行时 `neon-canvas-surface.css`、`neon-page-rebuild.css` 都带上新规则，复跑该用例 exit 0、`canvas-angle-panel` / `canvas-inline-crop-chrome` / `canvas-connection-node-edge` / `canvas-group-chrome` 全 exit 0；`acceptance.cjs` 48 张截图、0 页面错误、0 横向溢出。

## 边界

- 只让功能栏常驻；底部缩放/提示条仍按需出现（用户没要求它常驻）。
- 偏移量 64px 是按功能栏固定 16 + 40 推出来的；若以后功能栏高度或位置改了，这里要跟着改（测试会因重叠断言而失败，能立刻发现）。
- 纯前端改动，Ctrl+R 生效；未改真实画布数据、未重启 3199。
