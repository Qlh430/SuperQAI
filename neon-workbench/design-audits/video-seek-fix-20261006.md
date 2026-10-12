# 视频进度拖动修复

日期：2026-10-06

## 原因与修复

宿主 `static-http-api.js` 的输出媒体和静态媒体响应忽略 `Range`，只返回 200 完整文件，未提供 `Accept-Ranges`、`Content-Range` 和对应部分内容。实际 MP4 解码中滑块能够触发 input，但视频跳转后时间返回 0。旧视频回归模拟 currentTime，因此没有检出此服务端问题。

已在 `design-sources/static-http-api.cjs` 补齐单段字节范围响应：明确区间、开放区间、后缀区间返回 206；不可满足的区间返回 416；格式错误、多段请求及不匹配的 If-Range 回退完整响应。媒体通过流读取。输出媒体仍先执行登录与资源读取权限检查，保留 private/no-store 缓存边界。

部署脚本先备份运行时 `static-http-api.js`，再将规范源文件复制到目标位置。没有修改页面、节点、控件样式或图标。

## 验证证据

- 修复前 `media-range-regression.cjs` 失败：媒体响应没有字节范围支持声明。
- 实际宿主页面配合非范围媒体响应时，拖动事件正常，但 currentTime 返回 0；提供正确范围响应后跳转成功。
- 修复后，以部署到运行时的模块执行 `media-range-regression.cjs`：完整响应、四类部分响应、非法范围、If-Range 条件及 401/403 权限隔离通过。
- `video-seek-host-regression.cjs`：使用真实宿主模块和实际 8 秒 MP4，390、768、1440、1728 宽度，0.5、1、1.75 缩放，暂停与播放拖动、键盘调节、全屏跳转共 25 项通过；节点坐标不随滑块拖动变化；pageerror 为空。
- `npm run build`：通过。
- `node deploy.mjs`：通过，运行时文件与规范源文件 SHA256 一致。
- 部署后 `node acceptance.cjs`：通过，48 张截图，errors=[]、overflow=[]；项目创建、回收站、素材、模拟生图、模拟对话、返回和移动导航流程通过。

截图和报告位于 `acceptance/video-seek-host-*.png`、`acceptance/video-seek-host-report.json`。测试视频位于 `test-fixtures/video-seek-fixture.mp4`，由 ffmpeg 生成纯色素材，不包含用户媒体。

## 生效与验收边界

运行中的宿主服务已在内存加载旧模块，需从托盘完全退出后重新打开应用；仅刷新网页不能重新加载服务端模块。本次未强制结束用户正在使用的应用。

业务 API 与身份均为隔离测试数据；真实画布模块及浏览器视频解码用于交互验证，未修改用户画布。仍需重启后在用户已有登录会话中确认原视频拖动。未执行新的 Better Design 动态视觉审查，本次没有视觉改动。
