# 桌面启动浅色渐变修正

日期：2026-10-02。

用户反馈程序刚打开时仍短暂显示旧浅色渐变。前次只检查网页登录入口，遗漏了 Electron 在本地服务启动前加载的 `resources/app/desktop/startup.html`。该文件内联浅色背景和蓝青渐变；`desktop/main.js` 中启动窗口、主窗口的原生 `backgroundColor` 也仍为浅色。

## 修改

- 新增可维护的 `neon-workbench/design-sources/desktop-startup.html` 模板，保持宿主更新进度使用的 `status`、`detail`、`progress` 元素和现有启动流程。
- 部署时从 `neon-workbench/src/index.css` 提取官方语义令牌，直接内联到本地启动 HTML，首次绘制不依赖登录页样式、网络或系统明暗偏好。
- 启动背景为纯色深色，品牌与进度条为纯色 primary。两个原生窗口的初始底色同步为背景令牌 `oklch(0.145 0.01 264)` 的 sRGB 值 `#080a0e`。
- 新增网页 `startup-overlay.css` 源码，移除基础加载遮罩的旧浅色与渐变，并更新样式 URL 版本。
- 通过 `deploy.mjs` 备份 `desktop/main.js`、`desktop/startup.html`、`startup-overlay.css` 后部署。备份目录：`.design/deploy-backups/2026-10-02T11-17-43-723Z/`。

## 验证

`npm run build`、`node deploy.mjs`、`node startup-acceptance.cjs`、`node acceptance.cjs` 和运行时桌面主进程语法检查通过。

启动专项从本地 file URL 检查 390、486、768、1440、1728 宽度，即使浏览器系统偏好为浅色，本地启动页仍为 dark。首次动画帧与最终背景一致，背景、品牌和进度条 `background-image` 均为 `none`，无横向溢出。另检查基础网页遮罩的 pending、login、ready 状态，不依赖最后加载的认证覆盖层。

使用项目实际打包 `AI OS Runtime.exe`，在独立便携目录和独立端口启动，确认加载的真实本地文件为 `desktop/startup.html`；原生窗口填充为 `#080A0E`，启动页为深色纯底，主窗口到达认证入口且网页启动遮罩结束。截图为 `native-startup.png`、`native-login.png`；完整数据保存在本机 `report.json`。

常规验收为 48 张页面截图，`errors: []`，`overflow: []`，覆盖模拟项目创建、回收站、素材、生图、对话、返回及移动导航。

## 边界与应用方式

桌面启动专项启动真实桌面程序与服务，但使用隔离测试目录，没有使用用户真实账户，也没有验证生产服务商或真实画布数据。常规工作台业务流程使用模拟 API。本次没有追加 Better Design 动态审核或最终 VALID 声明。

用户当前运行中的桌面主进程保持原状。需要通过托盘“退出”完全结束程序后重新打开；仅关闭主窗口会隐藏到托盘，仅刷新网页不会重新加载桌面主进程或本地启动窗口。
