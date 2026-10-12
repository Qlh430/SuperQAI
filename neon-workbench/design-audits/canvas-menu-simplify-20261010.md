# 画布添加节点菜单收敛（2026-10-10）

## 一、用户要求

去掉「添加节点」菜单里的循环批处理与素材合集，「提示词文本」改名为「文本」。

## 二、改动

`design-sources/script-before-save-bridge.js` 的画布菜单模板（`#canvasNodeMenu`）：

- 「提示词文本」按钮文案改为「文本」（`data-canvas-node="text"` 与图标不变）。
- 删除整个「工具与输出」分组（`data-canvas-menu-group="tools"`），循环批处理与素材合集入口一并移除；连接菜单（`#canvasConnectMenu`）与节点创建函数保持不变，已有画布里的素材合集节点照常渲染与使用。

菜单现在只剩三组：添加节点（便签、文本）、生成节点（图片生成、视频生成、音频生成、3D 导演台）、添加资源（上传）。

## 三、验证

新增 `neon-workbench/canvas-menu-regression.cjs`：在真实画布上右键空白处打开菜单，断言分组为 `['添加节点','生成节点','添加资源']`、入口清单为 `['note','text','image-generator','video-generator','audio-generator','director3d','asset-upload']`、文案为 `['便签','文本','图片生成','视频生成','音频生成','3D 导演台','上传']`、且不存在 `loop` / `asset-collection` 入口；截图 `acceptance/canvas-node-menu.png`。

`text-node-llm-regression.cjs` 同步补充菜单断言（文案、分组、入口）。该脚本在更后面的「点击文字模型选择器」步骤存在**预存在失败**：模型选择器位于视口外，Playwright 报 `element is outside of the viewport`；用未包含本轮改动的运行时（把菜单断言跳过）同样复现，与本轮无关。

其余门禁：`composer-expanded-regression.cjs` 49 图、`generator-composer-regression.cjs` 12 项、`h3-modes-mention-regression.cjs`、`acceptance.cjs` 48 图全部通过，`errors/overflow` 为空。

## 四、边界

- 仅收敛「添加节点」菜单入口；循环、素材合集的创建函数、连接能力与既有节点保持不变，避免影响已有画布。
- 本轮只改客户端脚本，刷新画布页即可生效；未停止 3199、未修改真实画布数据。
