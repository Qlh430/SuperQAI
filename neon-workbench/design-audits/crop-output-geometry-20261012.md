# 裁切输出取错区域修复（2026-10-12）

## 一、用户要求

「裁剪出的图不对」：裁切工作台预览里的宫格位置是对的，但生成出来的 9 张切片内容不对，看起来像被放大、位置跑偏。

## 二、定位过程与证据

先不动代码，直接把用户现场产出的文件与源图逐像素比对（`data/output/0e3154dd…-r0*-c0*_1791767840*.png`，共 9 张）。

| 项目 | 数值 |
| --- | --- |
| 源图 `0e3154dd…-ad06c34d.png` | 1536 × 1024 |
| 预期 3×3 切片 | 512×341 / 512×342 |
| 实际切片 | 213×142 / 214×142 / 213×143 |
| 切片内容 | 与原图 `x0..640, y0..427` 区域**逐像素完全一致**（最大通道差 0） |

切片尺寸不对称（中间列 214、中间行 143）恰好等于把 1536×1024 按长边缩到 640 后（640×427）再三等分的结果，说明几何尺寸取的是**缩略图尺寸**。再查 `image-resource-manager.js`：`THUMBNAIL_MAX_SIDE = 640`，节点显示缩略图时 `img.dataset.imageQuality = "thumbnail"`，原始尺寸记在 `img.dataset.originalWidth`。

于是链路清楚了：

1. `getCanvasCropWorkbenchSource()` 读 `<img>.naturalWidth` → 拿到 640×427（缩略图）。
2. `outputCanvasCropWorkbench()` 导出时读 `state.source.savedUrl` 的原图 → 1536×1024。
3. 几何用 640 空间、像素用 1536 空间，格子坐标全部落到原图左上角，并且按 1:1 抠出，所以又小又偏。

预览不受影响是因为预览只用百分比定位，比例一致就看着正常。

## 三、改动

`design-sources/script-before-save-bridge.js`：

- `getCanvasCropWorkbenchSource()`：两处节点分支改用 `getCanvasImageIntrinsicDimensions(image)`（先读 `dataset.originalWidth`，与图集成员同步逻辑一致），不再直接信 `<img>.naturalWidth`。
- `openCanvasCropWorkbench()`：无论记录里有没有尺寸，都以 `savedUrl` 原图自身尺寸作为裁切坐标系，保证几何与像素同源。
- `outputCanvasCropWorkbench()`：导出前再兜底一次，若几何尺寸与像素尺寸不一致就以图片尺寸重算（裁切框都是比例量，重算结果与预览一致），避免再写出错图。

## 四、验证

- 新增 `canvas-crop-output-regression.cjs`：用用户真实源图、按线上状态复现（节点显示 640 宽缩略图、`dataset.originalWidth = 1536`），断言工作台显示「原图 1536 × 1024px」，并对上传的每张切片与原图对应区域逐像素比对（最大通道差 0）。宫格 3×3 与默认比例裁切 1:1 均覆盖。
- 反向验证：把三处改动临时还原后，同一用例失败并报「实际「1 张输出 · 原图 640 × 427px」」，确认用例不是空跑。
- 部署后以 `CROP_USE_DEPLOYED=1` 复测运行时实际脚本，9 张切片尺寸 512×341/512×342、内容逐像素一致。
- `npm run build`、`node deploy.mjs`（备份 `2026-10-12T02-09-02-655Z`）通过；`node acceptance.cjs` 48 图、`errors=[]`、`overflow=[]`；图片工具栏抠图/裁剪用例、`canvas-image-quality-regression.cjs`、`material-image-regression.cjs` 通过。

## 五、边界

业务接口为模拟，真实登录会话下的生成与持久化仍需用户验收。本次未停止或重启 3199；工作台需要刷新（Ctrl+R）才会加载新脚本。
