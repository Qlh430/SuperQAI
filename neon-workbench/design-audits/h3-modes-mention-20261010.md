# MiniMax H3 生成方式与 @ 素材引用（2026-10-10）

## 一、用户要求

1. 视频操作区提示词里输入 @ 要弹出素材列表（图片/视频/音频等全部已连接素材），选中后插入内容，提交给模型的内容必须能被模型读懂。
2. 给 MiniMax H3 增加「全能参考 / 文生视频 / 首帧 / 首尾帧」四种生成方式，选项放在最下面参数区之后、发送按钮之前。
3. 按生成方式切换对应 ComfyUI 工作流。

## 二、现状与根因

- H3 的 @ 菜单代码早已存在，但只挂在 `.canvas-h3-prompt-field` 上；操作区会把提示词输入框搬进 `.flora-generator-prompt-area`，`closest()` 返回 null，因此输入 @ 只有字符、不弹菜单。实测探针：`menuExists: false`、`promptValue: "@"`。
- 菜单几何样式只存在于运行时旧主题 `styles.css`（legacy 变量），设计源里只有一条边框规则。
- 节点只有素材、画幅、分辨率、采样质量、时长参数，提交固定使用 `data/workflows/minimax-h3-video.json`（`MiniMaxH3ReferenceToVideo`，即「多样参考生视频」）。

## 三、工作流来源与转换

从用户 ComfyUI（192.168.1.53:8188，只读取 userdata / object_info）确认：

- 保存的 `Minimax+H3+最新8步增速工作流.json` 是**同一条 UI 工作流里的两个分组**：「文/图/首尾帧生视频（8步）」（含 `MiniMaxH3ImageToVideo`，如节点 445）与「多样参考生视频（8步）」（含 `MiniMaxH3ReferenceToVideo`，如节点 390）。
- `MiniMaxH3ImageToVideo` 的 `first_frame`、`last_frame` 都是可选输入 → 文生视频不接帧、首帧只接 first_frame、首尾帧接两个。

新增转换脚本 `neon-workbench/build-h3-workflow-templates.mjs`：按分组把 UI 工作流转成 API 格式，处理 widget/link 游标、动态组合控件（如 `SaveVideo` 的 `format` / `format.codec`）、跳过前端专用节点（Note/MarkdownNote），并补齐 ComfyUI 能接受的键名。**自校验**：用同一套逻辑转换「多样参考」分组，与已部署的 `minimax-h3-video.json` 逐节点逐输入对比，除状态值（提示词、种子、素材名、比例）外没有结构差异，说明转换器可靠。产物 `design-sources/workflows/minimax-h3-video-frames.json`（20 个节点）由 `deploy.mjs` 同步到运行时 `workflows/` 与 `data/workflows/`。

## 四、改动

客户端：

- `script-before-save-bridge.js`
  - @ 菜单容器回退到 `.flora-generator-prompt-area`，并以 `popover="manual"` + 固定定位按输入框锚点渲染在顶层，避免被操作区 overflow 裁切；打开前先定位，关闭时 `hidePopover()`。
  - 新增 `CANVAS_H3_MODES`（reference/text/first/last 与各自素材上限）与 `normalizeCanvasH3Mode` / `getCanvasH3Mode`。
  - 提交请求新增 `mode`，素材按模式裁剪（全能参考 9图/3视频/3音频；首帧 1 图；首尾帧 2 图；文生视频 0）；引用标记校验与自动补齐只在全能参考模式执行。
  - 序列化 `minimaxH3Mode`，两条恢复路径带回 `mode`。
- `canvas-h3-node-renderer.js`
  - 新增生成方式分段控件 `.canvas-h3-mode-switch`（role=radiogroup，44px 触达），写入 `node.dataset.minimaxH3Mode`，触发保存并广播 `canvas-h3-mode-change`。
- `flora-generator-composer.js`
  - 生成方式控件移动到 `.flora-generator-actions` 首位（参数区之后、发送按钮之前）。
  - 新增 `flora-generator-mode-note` 中文提示：文生视频「不使用参考素材，已连接的 N 个素材会被忽略」、首帧「只使用第一张图片作为首帧，其余 N 个会被忽略」、首尾帧「使用前两张图片作为首帧和尾帧，其余 N 个会被忽略」，并监听 `data-minimax-h3-mode` 变化。
- `flora-node-shell.css`
  - 生成方式分段控件、模式提示、@ 菜单（分组标题、44px 选项、36px 缩略图、选中主色、`:popover-open` 顶层显示）全部使用 Neon 语义令牌。

服务端（`design-sources`，随 deploy 复制）：

- `minimax-h3-workflow.js`：`normalizeMinimaxH3Request` 增加 `mode` 并按模式裁剪素材；非全能参考模式不再做引用标记校验；新增 `prepareMinimaxH3FramesWorkflow` 与按 `mode` 分派的 `prepareMinimaxH3Workflow`（文生视频删除首尾帧、首帧只接 first_frame、首尾帧接两张，注入提示词/分辨率/步数/时长/种子/保存前缀，并清理模板自带的帧加载节点）。
- `minimax-h3-task-service.js`：HTTP 层把 `mode` 透传（`params: { mode }`，媒体桥只转发固定参数键）；`runTask` 按模式选择模板——全能参考用 `minimax-h3-video.json`，其余用同目录 `minimax-h3-video-frames.json`，缺模板时给出中文错误。
- `deploy.mjs`：同步两份模板到运行时与 `data/workflows`；缓存版本提到 `20261010-h3-modes-mention`。

## 五、验证

新增三个回归（源码与部署运行时都跑过）：

| 脚本 | 覆盖 |
| --- | --- |
| `h3-modes-mention-regression.cjs` | 操作区提示词输入 @ 弹出顶层列表（图片/视频/音频分组、缩略图、`<Picture 1>/<Video 1>/<Audio 1>`）、默认高亮第一项、方向键移动、回车插入标记并关闭、Esc 关闭；四种生成方式文案与位置（在发送按钮之前）、默认全能参考、序列化/恢复保留；提交请求 `mode` 与素材裁剪（reference 1/1/1、first 1/0/0、text 0/0/0）与中文提示 |
| `h3-mode-workflow-regression.cjs` | 服务端模块：模式裁剪素材、非参考模式跳过引用标记校验；文生视频不接帧且无帧节点、首帧接第一张、首尾帧接前两张、分辨率/步数/时长/种子/保存前缀注入；全能参考仍走参考模板并接线三类素材 |
| `h3-mode-service-regression.cjs` | 任务服务按模式读模板（reference → 默认模板，text/first/last → frames 模板），缺 frames 模板时中文报错 |

其余门禁：`h3-video-parameters-regression.cjs` 通过；`h3-workflow-regression.cjs` `{"ok":true,"checks":28}`；`composer-expanded-regression.cjs` `{"ok":true,"screenshots":49,"errors":[]}`；`generator-composer-regression.cjs` `{"checked":12,"errors":[]}`；`acceptance.cjs` `{"errors":[],"overflow":[],"screenshots":48}`。截图 `acceptance/h3-mention-menu.png`（@ 列表，顶层显示不被裁切）。运行时 `minimax-h3-workflow.js`、`minimax-h3-task-service.js`、`canvas-h3-node-renderer.js`、`flora-node-shell.css` 与源码 SHA256 一致，两份模板已落地 `workflows/` 与 `data/workflows/`。

## 六、边界与待办

- **服务端改动需要重启本地服务才生效**：`minimax-h3-workflow.js` 与 `minimax-h3-task-service.js` 由 3199 的 `node.exe` 进程加载，未重启前仍执行旧逻辑（生成方式会被忽略、一律按全能参考提交）。客户端部分刷新即可生效。重启方式：退出并重开应用（应用会重新拉起服务），或按项目既有记录手动拉起；不得按端口结束 3199 进程。
- 本轮未向用户 ComfyUI 提交任何任务，只读取工作流与节点 schema；首帧/首尾帧真实出片需要在重启后由用户实跑确认（GPU 时间由用户决定）。
- @ 列表本轮只列已连接素材（图片/视频/音频），文本节点与「个人素材库（角色/场景）」未纳入；标记按 `<Picture n>` 等模型可读文本插入，尚未做成图 2 那种彩色 chip（需要升级提示词编辑器，另行评估）。
- 预存在失败未修：`h3-reference-regression.cjs` 第 75 行「H3 不再显示通用加号」。
