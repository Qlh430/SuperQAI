# ComfyUI 生成结果连不上生成节点（2026-10-12）

## 用户反馈

「生成的图怎么连接不到另一个生成节点上」——截图里左边是刚出图的 ComfyUI 节点（1184×2112，端口在右边），右边是空的「图片生成 5」，从左边端口拖到右边没有建立连线。

## 现场

只读打开真实画布库（`AI-OS-Portable-1.0.5-win-x64/data/canvas.db`，board `pk=11`），截图里那两个节点是：

| 节点 | kind | 名字 | 结果 |
| --- | --- | --- | --- |
| `d2fcff22` | `comfy` | 图片生成 6 | `resultSrc=/output/qwen_image21_1791802317047_…`，`comfyAspect=9:16`，历史 2 |
| `71a7bd7d` | `image` | 图片生成 5 | 空节点（没有 `resultSrc` / `imageSrc`） |

两节点同 y（1625）、x 相差 852，正是截图里的左右关系。

## 根因

`script-before-save-bridge.js` 的 `getCanvasNodeOutput()` 里，ComfyUI 节点**无条件**按「生成节点」上报输出：

```js
if (node.classList.contains("canvas-node-comfy")) {
  return { type: "generator", name: "ComfyUI 生成" };   // 不管有没有出图
}
```

而连线兼容规则里 `output.type === "generator"` 只放行素材合集和旧图集：

```js
if (output.type === "generator") {
  return targetNode.classList.contains("canvas-node-gallery-container")
    || targetNode.classList.contains("canvas-node-asset-collection")
    ? { ok: true, message: "已连接，生成结果会追加到素材合集。" }
    : { ok: false, message: "生成节点只能连接到素材合集或旧图集节点。" };
}
```

于是拖到任何生成节点都会被挡下来，提示「生成节点只能连接到素材合集或旧图集节点。」。对照：API 生图节点（`canvas-node-image` + `canvas-node-generator`）走的是图片分支，`getCanvasNodeOutput()` 会带 `resultSrc` 返回 `type: "image"`，所以它出的图能直接连到别的生成节点——同一个界面里两种生成节点行为不一致，就是这次问题的来源。

## 改动

`script-before-save-bridge.js` 两处（挂载态与离屏虚拟态）改成与 API 生图节点同一口径：

- `getCanvasNodeOutput()`：ComfyUI 节点有 `resultSrc` / `imageSrc` 时返回 `{ type: "image", name, url, originalUrl }`；没出图时仍返回 `{ type: "generator", name: "ComfyUI 生成" }`。
- `getCanvasVirtualNodeOutput()`（`kind === 'comfy'`）：同样按 `model.resultSrc` 判断，避免节点被画布分页卸载后连线丢掉参考素材。

副作用都是顺带变好的：出图的 ComfyUI 节点现在也能被打组、能作为 H3 / 循环 / 文生视频节点的参考素材、能被素材合集以外接受图片的目标接收；没出图的空节点行为完全不变。

## 验证

`qwen-image21-node-regression.cjs` 新增第 7 段「生成的图能连到另一个生成节点」：

- 有结果时 `getCanvasNodeOutput(comfy).type === "image"`，`url` 指向 `resultSrc`，`name` 取节点名；
- `getCanvasConnectionCompatibility(comfy, 生成节点)` 返回 `ok: true` +「已连接，图片会作为生成参考图。」，`connectCanvasNodes()` 真的写入连线，目标节点 `getCanvasIncomingRefs()` 拿到这张图，参考带出现 1 个缩略图；
- 空 ComfyUI 节点仍上报 `generator`，兼容性判断仍是 `ok: false` +「生成节点只能连接到素材合集或旧图集节点。」，连线不会被写入；
- 离屏（虚拟节点）口径一致：有 `resultSrc` → `image` 带地址，无 → `generator`。

截图：`acceptance/qwen-image21-wiring.png`。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T11-03-46-934Z`）后复跑：该用例通过、`canvas-group-chrome-regression` 通过、`canvas-cutout-result-regression` 通过；`acceptance.cjs` 48 张截图、0 个页面错误、0 处横向溢出。

## 边界

- 本次只改判定与上报口径，旧的空节点连线状态不变；已经存在的连线不受影响。
- 真实登录会话里的手工拖动验收仍建议你自己再拖一次（本次验收走的是隔离模拟接口与自建画布夹具）。
- 画布数据没有改动，服务 3199 未重启；工作台需 Ctrl+R 加载新资源。
