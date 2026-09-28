# Canvas image hover info implementation

**Goal:** Show filename/name and original pixel dimensions above the hovered canvas image without changing canvas geometry.

**Architecture:** A small UMD `CanvasImageInfo` module owns one viewport overlay and delegated events. `script.js` supplies optional gallery metadata and refreshes during image/viewport updates. Existing theme CSS and toolbar stay intact.

**Constraints:** Existing dirty checkout; no commits/resets, user data changes, downloads of originals for metadata, generation, or service restarts. Approved visual direction uses the user's reference.

- [x] Add `tools/check-canvas-image-info.js` and browser regression, observe missing module red.
- [x] Add `canvas-image-info.js`: `getInfo(image, metadata)` and `create({viewport,getMetadata})` returning `refresh/hide/destroy`. Use original dimensions first; no thumbnail natural-size fallback. One shared overlay, event-driven animation-frame refresh, no per-image listeners or persistent polling.
- [x] Integrate module before script.js in index.html; create in initializeCanvasBoard and refresh in updateCanvasImageQualities. Supply gallery member source metadata. Add scoped styles and cache revision.
- [x] Run unit/browser tests for filename escaping, original vs thumbnail, late metadata, gallery focus, hover, drag suppression, transform anchoring, fixed info position with toolbar overlay, deletion, theme and long names.
- [x] Add full-app coverage through the existing isolated `check-lan-canvas-access.js --browser --image-actions` hook (no separate `--image-hover` flag). Cover small-image caption bounds and actual gallery rename/save interactions while preserving previous assertions and data isolation.
- [x] Verify screenshots, syntax, portable inclusion and bounded read-only review; document results and handoff.

## Verification record

- `node --check canvas-image-info.js`
- `node --check script.js`
- `node tools/check-canvas-image-info.js`
- `node tools/check-canvas-image-info-browser.js`
- `tools/check-canvas-image-actions-browser.js` is an exported browser hook, exercised by `npm run check:image-ui`, not a standalone test command.
- `npm run check:image-ui`
- `node tools/check-portable-runtime-manifest.js`

## Follow-up fix (2026-09-15)

画布缩放/平移后，`applyCanvasTransformNow()` 立即刷新图片信息栏和工具栏的屏幕坐标，避免延迟的图片质量更新造成浮层漂移。工具栏的定位规则和位置未改变，信息栏保持贴近图片顶部并置于工具栏下层。

## Follow-up enhancement (2026-09-15)

信息栏名称改为可编辑输入框，回车或失焦后保存到图片节点；重名会自动分配递增后缀（例如“生成图 2”“生成图 3”），文件扩展名保持在后缀之后。普通图片节点和图集成员均支持改名。

## Follow-up enhancement (2026-09-15, interaction polish)

默认状态改回纯文字展示，点击名称后才切换为输入框；信息栏容器接收鼠标事件，允许从图片移动到信息栏并选中文字。图集成员的定位回归按成员图片自身的 `getBoundingClientRect()` 计算，确保不同尺寸和缩放下都贴着对应图片。

## Follow-up fix (2026-09-15, hover bridge and gallery placement)

图片与信息栏之间的可通行区域扩大，鼠标经过短暂间隙时不再隐藏；图集成员若图片上方空间会进入图集标题栏，则改为贴在成员图片顶部内部，并增加半透明背景以保证可读性。

## Follow-up fix (2026-09-15, stale overlay state)

画布变换后立即同步重算信息栏，取消旧的 RAF 排队位置，避免编辑态输入框停留在变换前的位置；隐藏编辑输入框增加强制隐藏规则，防止状态残留时意外露出。

## Follow-up fix (2026-09-15, exit editing)

点击画布外部、移出画布或按 Escape 时会先结束名称编辑，再隐藏/恢复信息栏，避免焦点阻止隐藏逻辑导致输入框持续跟随画布。

## Follow-up fix (2026-09-15, narrow image bounds)

移除信息栏绘制宽度的 220px 下限。图片显示宽度不足 220 个视口 CSS 像素时，信息栏整体等比例缩小（名称、尺寸、编辑框均包含在内），按缩放后的高度计算顶部间距；较大的图片仍保持原字号。工具栏位置、层级和屏幕尺寸不变，更新脚本及样式缓存版本。

验证：浏览器先复现了“126px 图片对应 220px 信息栏”的失败，再通过修复后的测试。覆盖普通图片和图集成员、5%–125% 画布缩放（含 220px 临界点）、100%/125% 外层显示缩放、长名称编辑及 Esc 退出；检查各可见子元素的实际屏幕边界。`npm run check:image-ui` 新增真实应用 50%/25% 缩放下的边界检查，通过并保留原图加载/预览/下载与图集删除撤销检查。截图：`artifacts/canvas-image-actions/caption-small-app.png`。

## Follow-up fix (2026-09-15, gallery rename focus and pointer lifecycle)

在真实应用的图集中先复现三个失败：选中文字/拖动已选文字触发 `pointermove(buttons)` 或浏览器原生 `pointercancel`，误走隐藏路径；预览按钮持有焦点时点击名称，按钮先失焦导致名称在 click 前消失；双击输入框会冒泡打开画布节点菜单。

修复只限信息栏的交互边界：编辑时保留图片锚点，不把文字选择当作画布拖动；禁止名称文字的原生拖放进入画布图片导入通道；点击名称文字先保留预览焦点，再直接转交输入框，焦点转移到信息栏内部不触发隐藏；双击编辑框不进入画布菜单或场景命中逻辑。点击画布其他位置、Enter/Escape、失焦仍退出编辑。工具栏、缩放边界、图集数据结构均不变。

真实应用回归覆盖已选图集成员、从预览按钮转交焦点、按住鼠标编辑、双击选词、Enter 保存、Escape 取消、点击空白处退出、重新悬停恢复文字、重名后缀，以及真实保存端点返回的成员名称。测试使用临时数据库和本地模拟接口，不修改用户配置或调用付费生成服务。截图：`artifacts/canvas-image-actions/gallery-rename-edit.png`、`artifacts/canvas-image-actions/gallery-rename-saved.png`。

## Follow-up fix (2026-09-16, gallery edge hover feedback loop)

真实浏览器中将鼠标固定在图集图片上边缘内 1px 处，逐帧采样 1100ms。修复前，即使鼠标不动，图片顶部仍在约 149.5–155px 间反复移动，命中元素在图片和信息栏文字间交替：信息栏位于图集成员 DOM 之外，覆盖鼠标后导致成员失去 `:hover`，图片下落后又重新获得悬停，形成反馈循环。

信息栏现在为当前图集成员保留一个临时的 `is-image-info-hover` 类，让图片和可交互信息栏共享原有浮起、阴影及输出端口的悬停效果。隐藏/移开/切换图片时移除旧状态；纯键盘焦点不额外触发浮起。不更改工具栏或图片节点几何。

同时回归了连线：鼠标离开外置信息栏时，原有成员 `pointerleave` 已经结束，连线曾残留约 4.92px 的端点偏差。成员的 transform transitionrun 现在启动既有的短时连线同步，使退出动画期间端点始终跟随接口，而不是新增常驻渲染循环。

验证：`npm run check:image-ui` 调用新增的 `tools/check-canvas-gallery-hover-browser.js`，覆盖 25%/100%/200% 缩放下四条边的静止悬停、动画稳定后图片/信息栏/端口位置与命中目标、保留浮起效果、移开清理、成员切换和连线端点贴合；原有图集改名保存、取消、原图预览下载、删除撤销和六图缩放回归继续通过。模块浏览器测试与信息栏规则测试通过，更新脚本和样式缓存版本。
