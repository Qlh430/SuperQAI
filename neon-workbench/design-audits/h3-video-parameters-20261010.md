# ComfyUI 视频参数独立入口与字段收敛（2026-10-10）

## 一、用户提出的问题

1. ComfyUI 视频生成的视频参数要单独一个入口，不要跟模型放在一个列表里。
2. 去掉视频参数里的模型选择、种子、参考图。
3. 种子一律回到随机。

截图现状：底排「ComfyUI生成 ⌄ | MiniMax H3 ⌄ | ↑」里的第二项其实是「视频参数」入口，但 `flora-generator-parameters.js` 给 H3 取的触发文案用的是模型名；弹层里同时列着 模型 / 画幅 / 分辨率 / 采样质量 / 参考图 / 时长 / 种子。

## 二、根因

- 参数模块 `sync()` 对 H3 使用 `modelCaption`（`.canvas-h3-controls select` 的当前选项文本），入口看起来像模型下拉。
- 组合器把 `.canvas-h3-controls` 里除 `.canvas-api-video-model-field` 之外的所有 `.canvas-h3-field` 搬进 `.flora-media-parameters`，于是 H3 的「模型」字段也进了弹层。
- 「种子」「参考图」是 H3 节点渲染器建的字段，只存在于这个弹层里。

## 三、改动

- `design-sources/canvas-h3-node-renderer.js`
  - 每个字段加 `data-h3-param`（model / aspectRatio / megapixels / steps / refImageSize / duration / seed），供组合器与样式区分归属。
  - `normalizePrevious` 的种子固定为 `""`：新建、恢复、复制一律回到随机，已保存的具体种子不再沿用。
- `design-sources/flora-generator-composer.js`
  - `.flora-media-parameters` 只收 画幅 / 分辨率 / 采样质量 / 时长（保留 `canvas-h3-resolution-hint`）；`data-h3-param="model"` 的字段留在底排，不再进弹层。
- `design-sources/flora-generator-parameters.js`
  - H3 入口文案改为参数摘要（`16:9 · 标准 · 8步 · 12秒`），弹层标题仍是「视频参数」；模型不再是入口文案。
- `design-sources/script-before-save-bridge.js`
  - H3 提交一律发送 `seed: ""`（服务端按随机处理），避免任何路径带出旧种子。
- `design-sources/flora-node-shell.css`
  - 底排 H3 模型项隐藏「模型」小标题、改用与其它底排控件一致的尺寸；弹层内 `[data-h3-param="seed"]`、`[data-h3-param="refImageSize"]` 隐藏（字段与取值保留，工作流注入不变）。
- `deploy.mjs`
  - 缓存版本提到 `20261010-video-parameters`，并把 `canvas-h3-node-renderer.js` 一并纳入版本替换（模块清单里此前停在 `20260924-node-owned-renderers`）。

## 四、验证

新增 `neon-workbench/h3-video-parameters-regression.cjs`（旧运行时红：底排找不到独立模型项；部署后绿）：

- 底排模型项存在且可见、取值 `minimax-h3`、不显示「模型」小标题；视频参数入口不在模型项里，文案为参数摘要且不含「MiniMax H3」。
- 弹层标题「视频参数」，可见字段恰为 `画幅 / 分辨率 / 采样质量 / 时长（秒）`，可见文案不含 模型 / 种子 / 参考图，分辨率保留「预计输出：1056 × 608」。
- `refImageSize`、`seed` 字段存在但不可见；`minimaxH3RefImageSize` 为 `match`。
- 真实序列化 + 恢复：历史种子 `12345` 仍写入序列化结果，恢复后 `dataset.minimaxH3Seed` 与隐藏输入都为 `""`；参考图仍为 `match`。
- 真实提交（拦截 `/api/minimax-h3-video`）：请求体 `seed` 为 `""`、`ref_image_size` 为 `match`；接口 503 时界面显示中文错误，`pageerror` 为空。

回归与验收（部署运行时、业务接口打桩）：

| 脚本 | 结果 |
| --- | --- |
| `h3-video-parameters-regression.cjs` | 通过（新增） |
| `h3-workflow-regression.cjs` | `{"ok":true,"checks":28}` |
| `composer-expanded-regression.cjs` | `{"ok":true,"widths":[390,768,1440,1728],"scales":[0.65,1,1.5],"screenshots":49,"sharedKinds":7,"errors":[]}` |
| `generator-composer-regression.cjs` | `{"checked":12,"errors":[]}` |
| `video-node-regression.cjs` | 通过 |
| `acceptance.cjs` | `{"errors":[],"overflow":[],"screenshots":48}` |

截图：`acceptance/h3-video-parameters-popover.png`（弹层只剩四个视频参数）、`acceptance/h3-video-parameters.png`（底排「ComfyUI生成 / MiniMax H3 / 16:9 · 标准 · 8步 · 12秒 / 生成」）。构建 `npm run build` 成功，仅经 `deploy.mjs` 备份部署，运行时四个源文件与源码 SHA256 一致，`script.js` 含种子固定分支。

## 五、预存在失败（本轮未修）

- `h3-reference-regression.cjs` 第 75 行仍断言「H3 不再显示通用加号」为 false，实际 true；用本轮改动前的备份 `.design/deploy-backups/2026-10-10T07-41-43-062Z` 同样复现，与 `DESIGN.md` 的 H3 三槽描述和现 CSS 三者不一致，需要产品确认后单独处理。
- `audio-generation-regression.cjs` 的「部署脚本提供可验证的幂等音频服务接线」失败，与本次改动无关。

## 六、边界与取舍

- 种子与参考图不再提供界面入口：种子每次提交留空随机（历史种子值保留在序列化数据里，但不再生效），参考图固定「匹配输出」。
- 模型项目前只有一个 MiniMax H3 选项；后续接入更多本地视频模型时直接在该项里扩展。
- 全部业务接口为隔离模拟，未触发真实生成；真实登录后的模型目录与保存路径仍需在用户会话里验收。
- 未停止 3199 服务、未修改真实画布数据。
