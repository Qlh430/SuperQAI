# 裁剪编辑器的两处外观修正（2026-10-12）

## 用户反馈

「取消按钮要么跟确认按键一样保持在按钮框中心，要么就只保留叉叉。裁剪时图片怎么四个角跑出圆角框外了」

## 原因

1. **取消按钮**：`.canvas-inline-crop-cancel { width: 34px; padding: 0; font-size: 15px; }` 把按钮框写死成 34px 宽，而它的内容是「✕ 图标 + 取消」（15px 图标 + 6px 间隔 + 两个中文字），实测内容 46px > 框 34px，于是文字溢出到按钮框外面。
2. **图片四角出框**：裁剪舞台 `.canvas-inline-crop-stage` 只有 `overflow: hidden`、没有圆角，裁剪出来的是矩形；而它盖住的那块图片（结果区媒体壳 `.canvas-image-upload` / `.canvas-node-result`）是 `border-radius: 16px`。矩形舞台一压上去，图片四角就顶出卡片圆角。

## 改动（`flora-node-shell.css`）

- `.canvas-inline-crop-stage` 补 `border-radius: 16px`（与媒体壳、`.flora-node-card` 同一档）。
- `.canvas-inline-crop-cancel` 去掉写死的宽度/内边距/字号，按内容定宽并沿用操作条按钮的居中规则（`justify-content: center` + `padding: 0 12px`），与「确认」同一套；叉叉仍是 15px，和其它按钮图标一致。

## 验证

新增 `canvas-inline-crop-chrome-regression.cjs`（1440 视口，1024×768 纯红图）：

- 打开裁剪后，`取消` 按钮的内容包围盒中心与按钮框中心偏差 ≤1px（横竖都是），内容宽 50px ≤ 框宽，`scrollWidth - clientWidth ≤ 1`（不溢出）；按钮高度与操作条其它按钮一致（32px）。
- 裁剪舞台四角 `border-radius` 均为 `16px`、`overflow: hidden`，盒子与结果区媒体壳逐像素对齐（413×400 → 实测 533×400 同源同位置）。
- 像素校验：舞台中心是图片本身的红色 `[240,60,60]`；舞台左上角 +3px/+3px 处是 `[8,10,14]`（卡片底色），说明圆角真的裁掉了图片的角。
- 截图 `acceptance/inline-crop-chrome-1440.png`（可以看到红色图片四角是圆的，取消按钮内容居中）。

**红绿验证**：临时去掉舞台圆角 → 用例在「裁剪舞台应四角 16px」失败（实测 `0px`）；临时恢复取消按钮旧样式 → 用例在「取消按钮内容不该溢出按钮框」失败（内容 46 vs 框 34）。恢复后全绿。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T11-52-49-927Z`）后复跑：该用例 exit 0、`canvas-inline-outpaint-scale` exit 0、`canvas-image-tool-panel` exit 0、`canvas-connection-node-edge` exit 0、`canvas-group-chrome` exit 0；`acceptance.cjs` 48 张截图、0 页面错误、0 横向溢出。

## 边界

- 取消按钮选了"跟确认一样居中"这一种（保留文字标签）；如果你更想只留叉叉，把 `.canvas-inline-crop-cancel` 的 `span` 去掉即可，一行改动。
- 纯前端改动，Ctrl+R 生效；未改真实画布数据、未重启 3199。
