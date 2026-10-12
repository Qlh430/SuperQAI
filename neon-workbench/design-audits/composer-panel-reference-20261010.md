# 生成操作区跟随节点与参考带收敛（2026-10-10）

## 一、用户提出的两个问题

1. 不要让操作区离开节点的位置。截图里视频生成节点的操作区被推到节点左下方约 300px。
2. 素材参考区的小卡片后面不要出现名称，让加号紧挨着小卡片。截图里卡片后跟着「首帧参考：0e3154dd-….png」，加号被挤到最右。

## 二、根因（先复现再改）

### 2.1 操作区横向被视口夹取

`flora-generator-composer.js` 的 `placePanel` 原本先按节点中心定位，再用窗口宽度夹取：

```js
const left = Math.max(16, Math.min(shellRect.left + shellRect.width / 2 - width / 2, viewportWidth - width - 16));
```

操作区宽 760、普通节点宽 400–640，节点中心距离视口右边不足 396px 时夹取生效，把操作区整体推离节点；节点越靠边偏得越多。改动前用只读探针（Playwright、全部 `/api/**` 打桩、未触碰真实画布）实测：

| 场景（1440×900） | 节点中心 | 操作区左边 | 居中应为 | 偏差 |
| --- | --- | --- | --- | --- |
| 视口居中 | 754 | 374 | 374 | 0 |
| 靠右、缩放 1 | 1034 | 654 | 654 | 0 |
| 靠右、缩放 0.6 | 1162 | 664 | 782 | −118 |
| 缩到 1100 宽靠右 | 821 | 324 | 441 | −117 |

纵向始终是 16px 间距，所以偏差只发生在横向夹取。

### 2.2 参考带里的首帧名称把加号推走

`.canvas-api-video-reference` 由宿主渲染「首帧参考：<文件名>」，组合器把它移进参考带后，CSS 给了 `flex: 1 1 180px`，于是它占满整行、把 44px 加号顶到最右。改动前实测参考带子元素：

| 顺序 | 元素 | 左边 | 宽度 | flex |
| --- | --- | --- | --- | --- |
| 1 | `.flora-reference-materials`（素材卡片） | 220 | 54 | 0/0/auto |
| 2 | `.canvas-node-refs`（隐藏） | 0 | 0 | — |
| 3 | `.canvas-api-video-reference`「首帧参考：生成结果」 | 282 | 556 | 1/1/180px |
| 4 | `.flora-generator-add-reference` | 846 | 44 | 0/0/auto |

## 三、改动

- `neon-workbench/design-sources/flora-generator-composer.js`
  - `placePanel`：取消横向视口夹取，操作区始终以节点中心定位。
  - `requestReveal`：除纵向让位外新增 `screenDeltaX`；让位前 `refreshViewportOrigin()` 并实测外壳矩形（视口原点可能因宿主位移失效）。只有画布视口宽于操作区时优先贴合视口，否则退回窗口范围。
  - 新增 `placeReferenceAddButton`：加号紧跟素材卡片，宿主的说明文案排在加号之后；`composeSources` 与 `syncReferenceMaterials` 共用。
- `neon-workbench/design-sources/script-before-save-bridge.js`
  - `flora-generator-reveal` 监听同时处理 `screenDeltaX` / `screenDeltaY`，一次位移只调用一次 `applyCanvasTransformNow()`。
- `neon-workbench/design-sources/flora-node-shell.css`
  - 参考带内隐藏 `.canvas-api-video-reference`（元素保留供宿主同步，名称继续由卡片 `title` / `aria-label` 提供）。
  - 加号 `flex: 0 0 auto`；音频的「生成声音由 AI 合成」标识保留可见，但不再拉伸整行。
- `neon-workbench/deploy.mjs`
  - `script.js`、`flora-generator-composer.js`、`flora-generator-parameters.js`、`image-model-picker.js`、`flora-node-shell.css/js` 的缓存版本统一提到 `20261010-composer-panel-reference`（此前组合器一直停留在旧版本串，刷新可能命中缓存）。

## 四、验证

新增 `neon-workbench/composer-panel-reference-regression.cjs`（旧运行时红：卡片后出现「首帧参考：生成结果」，靠右时面板偏差 −118px；部署后绿）：

- 参考带空态不出现常驻说明，加号贴参考带起点。
- 接入首帧后卡片保留「图片1」角标，名称只在卡片提示中；可见文案不含「首帧参考」；`加号左边 − 卡片右边 = 8px ± 1.5`，加号 44px。
- 缩放 1 / 0.6 / 1.35、宽度 1440 / 1100 / 390、节点居中/靠左/靠右共 7 组：`|操作区中心 − 节点中心| ≤ 1.5px`、纵向间距 16px、选中后操作区完整落在窗口 16px 安全区内（画布视口足够宽时同时落在视口内）。

回归与验收（均对部署运行时、全部业务接口打桩）：

| 脚本 | 结果 |
| --- | --- |
| `composer-panel-reference-regression.cjs` | 通过（新增） |
| `generator-composer-regression.cjs` | `{"checked":12,"errors":[]}` |
| `composer-expanded-regression.cjs` | `{"ok":true,"widths":[390,768,1440,1728],"scales":[0.65,1,1.5],"screenshots":49,"sharedKinds":7,"errors":[]}` |
| `text-reference-materials-regression.cjs` | `{"ok":true,"widths":[390,768,1440,1728],"fullText":true,"errors":[]}` |
| `video-node-regression.cjs` | 通过 |
| `acceptance.cjs` | `{"errors":[],"overflow":[],"screenshots":48}` |

截图：`acceptance/composer-panel-reference.png`（视频节点 + 卡片与紧邻加号，操作区居中）、`acceptance/generator-composer-{390,768,1440,1728}.png`。构建：`npm run build` 成功；部署：`node deploy.mjs`，备份 `.design/deploy-backups/2026-10-10T07-31-57-378Z`（改动前）与 `2026-10-10T07-41-43-062Z`（最终）。运行时 `flora-generator-composer.js`、`flora-node-shell.css` 与源码 SHA256 一致，`script.js` 含新的 `screenDeltaX` 分支。

## 五、预存在的失败（本轮未修，已用改动前文件同样复现）

- `h3-reference-regression.cjs` 第 75 行：断言「H3 不再显示通用加号」为 false，实际 true。CSS 里 `[data-flora-kind="minimax-h3"] .flora-generator-add-reference { display: inline-flex !important }` 与 `DESIGN.md` 的 H3 三槽描述、以及这条断言三者不一致，需要产品确认后单独处理。
- `audio-generation-regression.cjs`：静态断言「部署脚本提供可验证的幂等音频服务接线」失败，与本次改动无关。
- 两个脚本中`.canvas-node-refs img` 是旧参考带选择器（现参考带由 `.flora-reference-card` 渲染），本轮已按当前实现修正，属于测试陈旧而非行为回归。

## 六、边界

- 全部业务接口为隔离模拟，未调用付费生成；真实登录后的服务商、模型目录与保存路径仍需在用户会话里验收。
- 未停止 3199 服务、未修改真实画布数据、未按端口结束任何进程。
- Better Design MCP 本轮未连接，未生成其动态审查结论。
- 已知取舍：操作区不再被夹取到视口内。手动平移画布把节点带出视口时，操作区会跟着一起移出；重新选中节点时画布会自动让位，保证操作区完整可见。
