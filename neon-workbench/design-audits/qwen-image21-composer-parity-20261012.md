# ComfyUI 图片生成操作区对齐 API 版 + 分辨率改 1K/2K/4K（2026-10-12）

## 用户要求

1. 图片生成节点的 ComfyUI 操作区（图1）要跟 API 版（图2）一样简洁。
2. 图片参数（图3）也要「上面比例，下面分辨率」，并把 Qwen-image2.1 的分辨率换算成 1K / 2K / 4K。
3. 说明 4K 这个工作流支不支持。

## 现场（改动前实测）

用 Playwright 打开共享操作区，把 ComfyUI 节点与 API 节点并排量了一遍：

| 位置 | ComfyUI（改动前） | API |
| --- | --- | --- |
| 参考行 | 多一句 `canvas-comfy-hint` 摘要：`无参考图 · Qwen-image2.1 生图 · 1:1 · 1 MP` | 只有 44px 加号 |
| 提示词 | 占位符「描述画面；连上参考图后就是图像编辑」+ 下面挂 `.flora-generator-prompt-note`「有参考图时走图像编辑，没有参考图时走文生图。」 | 占位符「输入本次生成要求，可连接文字或图片作为参考素材」 |
| 底排第三项 | `比例 1:1 方形 · 1 MP（约 1024²）`（原生「比例」标签还露着，CSS 只藏了 `canvas-comfy-mode-field > span`） | `1:1 · 1K` |
| 参数弹层 | 上「选择比例」8 个长文案，下「选择分辨率」`0.5 / 1 / 1.5 / 2 / 3 / 4 MP` | 上比例，下 `1K / 2K / 4K` |

尺寸链路：提交只带 `aspect_ratio` + `megapixels` → 服务端 `applyQwenImage21Resolution()` 把 megapixels 夹到 **0.1~16** 写进模板 `ResolutionSelector(aspect_ratio, megapixels, multiple=32)` → `EmptyLatentImage` 算宽高。所以尺寸不是固定枚举，换成 1K/2K/4K 只要换算 MP，不用改工作流。

关于 4K：模板与服务端都容得下（上限就是 16 MP，等于当年按 16 MP 留的口），1:1 的 4K 约 14.75 MP 正好在口内。真实能否跑完取决于本地 ComfyUI 与显存（Qwen-Image 2.1 属 1~2 MP 级模型，16 MP 会非常重）；本机 8188 端口未开，无法在这里实测，因此界面上把 4K 放出来并在悬停提示里标注「显存占用大」。

## 改动

`canvas-comfy-node-renderer.js`

- 比例改短标签（`1:1` / `2:3` / … / `21:9`），取值仍是工作流 `ResolutionSelector` 的下拉值。
- 新增 `COMFY_RESOLUTION_TIERS`（长边 1024 / 2048 / 3840 → 1K / 2K / 4K）与三个纯函数：`comfyMegapixelsFor()`（档位 + 比例 → 提交用 MP）、`comfyPixelSizeFor()`（档位 + 比例 → 尺寸预览，短边取 32 倍数）、`comfyTierForMegapixels()`（老节点按长边就近归档）。
- 像素档下拉随比例重算：1:1 → `1.05 / 4.19 / 14.75`，16:9 → `0.59 / 2.36 / 8.29`，标签为 `1K / 2K / 4K`，悬停提示写「1K · 约 1024×1024」，4K 追加「显存占用大」。
- 档位写入 `node.dataset.comfyTier`；像素档写入 `node.dataset.comfyMegapixels`（提交值）。

`flora-generator-composer.js`

- 不再把 `canvas-comfy-hint` 搬进参考区（摘要回到隐藏的 `.canvas-comfy-input-summary` 里）；参考行只留加号。
- 不再创建提示词下的解释句。
- 提示词占位符统一成 API 那句。

`flora-node-shell.css`

- 共用操作区里隐藏原生 `.canvas-comfy-aspect-field > span` 与 `.canvas-comfy-megapixels-field > span`。
- 删掉不再产生的 `.flora-generator-prompt-note` 规则。

`script-before-save-bridge.js`

- `renderCanvasComfyNode()` 接 `tier` 并透传给渲染器；序列化、两处恢复、粘贴、Agent 接口共五处补 `comfyTier`。
- 节点自己的摘要文案改成档位写法（`1:1 · 1K`）。

## 验证

`qwen-image21-node-regression.cjs`（浏览器内，1440）扩到八段：

1. 模型列表仍只有 Qwen-image2.1。
2. 操作区与参数：比例恰为 8 个短标签、分辨率恰为 `1K/2K/4K` 且取值为 `1.05/4.19/14.75`、底排读作 `1:1 · 1K`、原生标签 `display:none`、无解释文案、占位符与 API 一致、参考行没有摘要文字。
3. 换 16:9 → 三档重算成 `0.59/2.36/8.29` 且档位不跳（仍 1K），点 4K → `comfyTier=4`、`comfyMegapixels=8.29`、摘要 `16:9 · 4K`。
4. 序列化 → 重新渲染：`comfyTier=4`、`comfyMegapixels=8.29`、摘要 `16:9 · 4K` 都还原。
5. 老值归档：1 MP、1.5 MP → 1K；1:1 的 4 MP → 2K；16:9 的 2.36 MP → 2K。
6. 工具栏三个工具仍各开各的界面（放大=节点参数面板、扩图=节点内联编辑器 8 个手柄、换角度=角度对话框 9 个预设）。
7. 提交载荷：`aspect_ratio=16:9 (Widescreen)`、`megapixels=8.29`；带参考图时走编辑、不带时走生图。
8. 没有 pageerror。

顺手修正了该用例里两段**过期断言**（扩图早就改成节点内联编辑器 `#canvasInlineOutpaint`、换角度早就改成角度对话框，不再有 `flora-node-tool-panel`），它们与本次改动无关，只是之前几轮没回跑。

截图：`acceptance/qwen-image21-parameters.png`（图片参数弹层：上比例、下 1K/2K/4K，4K 选中）、`acceptance/qwen-image21-tool-panel.png`。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T10-42-54-538Z`）后复跑：`qwen-image21-node-regression` 通过、`composer-panel-reference-regression` 通过、`composer-expanded-regression`（49 图、0 错误）通过、`canvas-group-chrome-regression` 通过；`acceptance.cjs` 48 张截图，`errors: []`、`overflow: []`。运行时已确认带上新代码（`COMFY_RESOLUTION_TIERS`、`comfyTier`、API 版占位符）。

## 边界

- 4K 只是「链路容得下」：真实 4K 渲染没有在本地 ComfyUI 上跑过（端口未开），显存与耗时需要你在自己的机器上验收；界面用悬停提示标注，没有加额外警告文案。
- 比例仍只有工作流节点 `ResolutionSelector` 的 8 个值。图3 的 API 面板还有「自适应 / 4:5 / 5:4」，但工作流必须拿到一个具体比例，且这 8 个以外的值是否被该节点接受需要 `object_info/ResolutionSelector` 才能确认；ComfyUI 起来后可以补。
- 老节点打开时会按长边就近归档（例如 1.5 MP → 1K、4 MP → 2K），已提交的历史任务不受影响。
- 本轮验证走的是隔离模拟接口与自建画布夹具，未改动真实用户画布；工作台需 Ctrl+R 才会加载新资源。
