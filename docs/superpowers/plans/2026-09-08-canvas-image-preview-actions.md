# Canvas Image Preview Actions Implementation Plan

**Goal:** 640 像素优先预览与按需原图、图片上方工具栏。

**Architecture:** image-loading-rules 负责门槛；server-image-thumbnails 与 store 管理规格和缓存；canvas-image-toolbar 独立处理交互，script.js 提供画布操作。

**Tech Stack:** 原生 JavaScript、Node、sharp、Playwright。

## Steps

- [x] 先更新 tools/check-image-loading-rules.js 和 tools/check-server-thumbnails.js，验证默认倍率、640 输出和旧缓存迁移的失败，再实现统一规格与加载门槛。
- [x] 使用 tools/check-lan-canvas-access.js --browser 的隔离账号/后端测试真实点击、原图请求计数、图集删除及撤销；先验证缺失工具栏的失败。
- [x] 新增 canvas-image-toolbar.js，在 script.js 注入图片来源、原图预览、下载与可撤销删除回调；在 index.html 和 styles.css 接入。
- [x] 修正 script.js 按单张图片实际显示尺寸调度原图；初次加载保留预览，再升级；本地缩略图缺失不触发隐式原图下载。
- [x] 运行图片可靠性、资源管理和浏览器测试；检查截图；确认运行时未启动后启动更新版本，并验证本机及局域网加载了新文件。

保留已有工作，不提交 Git，不重新调用付费生图接口。浏览器生成测试只用隔离的本地模拟接口。
