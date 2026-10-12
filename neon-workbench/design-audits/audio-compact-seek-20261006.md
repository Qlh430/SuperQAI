# 音频节点紧凑样式与进度拖动验收

用户要求：单音频节点减少体积和空白、保持 Neon/Flora 风格，并修复进度不能拖动。

## 最终结果

- 主体从 400×400 改为 400×128，保留外部 48px 标题带，节点总高度 176px。保存字段与可见几何同步，其他节点不改变尺寸。
- 复用当前 Flora 单层外壳、16px 圆角、8px 内层留白、Neon 语义颜色与现有 Lucide 图标。左侧 44px 播放键，右侧波形进度与时间，移除重复内框和就绪提示。
- 波形仍是稳定装饰条，代表播放进度，不代表真实音频振幅；已播放部分及位置线使用 primary。
- 波形支持连续拖动、指针捕获、边界钳制、取消后恢复、左右方向键与 Home/End。操作波形或播放键不会拖动节点，拖动空白区域仍移动节点。拖进度保留播放或暂停状态。
- 精简主体减少占用，波形的视觉高度同时缩短；播放键和时间仍清晰可辨，控制区域保留 44px 高度。

## 根因与验证

原实现只响应 click，没有 pointermove，且画布会接收 pointerdown；进度线的 `width:0 !important` 覆盖了脚本赋值。新回归测试在修复前失败：390px/0.5 缩放按住拖动时 currentTime 仍为 0。修复后移除固定起点规则，并用指针生命周期隔离进度操作。

- `npm run build` 成功；`deploy.mjs` 部署时重新构建成功。
- `audio-node-regression.cjs`：26 组进度测试通过；390、768、1440、1728 宽度，0.5/1/1.75 缩放，真实浏览器 WAV 解码，暂停及播放拖动、拖出边界、键盘、取消恢复、节点拖动、全屏画布。触摸为合成 PointerEvent，不等同于真实触屏设备验收。
- 默认、悬停、选中、焦点、移动宽度、全屏画布：8 个渲染状态，截图人工检查，DOM 使用 Better Design 官方捕获脚本测量。
- `flora-toolbar-regression.cjs`：281 项通过，共享工具栏定位和节点类型未回退。
- 部署后 `video-seek-host-regression.cjs`：37 项通过，此前视频的进度、点击暂停和暂停后拖节点交互保持正常。
- 部署后 `node acceptance.cjs`：48 张截图，pageerror 与横向溢出均为空；模拟项目创建、回收站、素材、生图、对话、返回与移动导航流程通过。

## Better Design

本轮 get-ui-principle、get-ux-principle、get-review-rules、check-comprehension 与 inspect-spacing 实际调用成功。默认播放器文案可理解性通过。

DOM 间距检查指出标题重命名的点击区域偏小，已扩大为 44×44，不改变文字层级。修正后的检查状态为 completed，无 critical 或 serious。剩余 moderate 为共享连接端口和工具栏的可见圆形/图标尺寸：测量工具未计入透明伪元素点击区。端口已有 `::before inset:-10px`，实际命中范围 48px，并以浏览器 elementFromPoint 验证；工具栏既有 32px 图标按钮通过 `::before inset:-6px` 保留 44px 操作范围。保留共享壳体规则，原始发现见 audio-spacing-review-20261006.json。间距分数不能代替视觉或业务验收。

## 部署与边界

- 实际项目入口为 `http://127.0.0.1:3188`；3199 属于另一个运行项目，未修改。
- 仅通过 `neon-workbench/deploy.mjs` 部署；备份为 `.design/deploy-backups/2026-10-06T10-29-05-232Z`。
- 已部署 JS/CSS 与源文件 SHA256 一致；入口加载 `20261006-audio-compact-seek` 缓存版本。重新加载应用后生效。
- 使用隔离合成 WAV/MP4 与模拟业务 API，未读取或写入用户真实画布；实际浏览器播放和进度测试是真实媒体解码。真实登录后的素材访问权限、具体文件及宿主保存流程仍需在用户已有会话中完成最终业务验收。
- 音频本身不新增全屏播放器；本轮全屏测试指无限画布进入浏览器全屏时的播放器表现。
- 未声明整个产品设计审查完成，未获取公开 HTTPS dashboard receipt。

预览：`../acceptance/audio-node-preview.png`。完整音频证据：`../acceptance/audio-node-report.json`。
