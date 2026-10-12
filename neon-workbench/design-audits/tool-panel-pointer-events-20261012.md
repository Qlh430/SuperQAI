# 超清参数面板点不动 / 点哪都消失（2026-10-12）

## 一、用户要求

点「超清」展开的「放大图片」面板无法操作，点界面任何地方面板就消失。

## 二、根因

Flora 壳体自己是 `pointer-events: none`（节点空白处要能把点击穿透给画布），内容的点击由 `.flora-node-content { pointer-events: auto }` 收回，工具栏与操作区在可见状态下也各自写了 `pointer-events: auto`。但挂在壳体上的**浮层没有收回点击**：

| 浮层 | pointer-events |
| --- | --- |
| `.flora-node-toolbar` | auto ✓ |
| `.flora-node-actions` | auto ✓ |
| `.flora-node-parameter-tray` | auto ✓ |
| **`.flora-node-tool-panel`（超清 / 扩图面板）** | **未设置 → 继承 none ✗** |
| **`.flora-node-tools-menu`（文字工具菜单）** | **未设置 ✗** |
| **`.flora-node-replace-panel`（替换素材面板）** | **未设置 ✗** |

所以点面板等于点在后面的节点图片上：`window` 的 pointerdown 处理器发现点击不在面板内，立刻 `closeCanvasImageToolPanel()`，面板就消失了；面板里的下拉框也因此点不开。

实测证据：在面板标题中心调用 `document.elementFromPoint()` 命中的是 `img.deferred-image`（节点图片），而不是面板本身；用修复前的样式跑同一用例会停在「面板应接住点击，实际命中 deferred-image」。

## 三、改动

`design-sources/flora-node-shell.css`：给这三类壳体浮层加 `pointer-events: auto`，并写明原因（壳体穿透 + 浮层自收），避免以后新增浮层再踩同一个坑。

## 四、验证

新增 `canvas-image-tool-panel-regression.cjs`，覆盖：

1. 点「超清」面板展开；
2. 面板标题中心的 `elementFromPoint` 命中面板内部（修复前命中图片）；
3. 点面板标题、点面板内部空白都不关闭；
4. 切换「目标长边」到 4K：面板保持打开且 `node.dataset.comfyResolution` 写入 4096；
5. 点面板以外的画布才收起；
6. 点「执行」：面板关闭，`POST /api/upscale2` 请求体带 `resolution: 4096` 与来源图片，结果填充到新节点。

修复前该用例失败、修复后与部署后各跑一轮通过。同轮：换角度对话框、节点层级、裁切图集收缩（1920 宽度）、图集删除、裁切输出、工具栏标签回归与 `acceptance.cjs` 48 图（`errors=[]`、`overflow=[]`）全部通过。

`npm run build` + `node deploy.mjs`（备份 `2026-10-12T03-45-55-594Z`）已部署，未停止或重启 3199。

## 五、顺带修掉的一个隐患

上一轮为了让节点状态文字显示到壳体状态行，我在 `setCanvasNodeStatus()` 里调用了整节点同步（`syncToolbar`）。而同步流程自己会回写节点状态，存在循环刷新的风险；现在改成直接写入壳体状态行元素，不再触发整节点同步。

## 六、边界

- 只改指针事件与状态行写入方式，未改面板布局、按钮行为与请求契约。
- 工作台需刷新（Ctrl+R）加载新样式。
