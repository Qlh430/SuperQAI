# 操作区放大界面 Implementation Plan

用户要求按参考图在操作区右上角加入放大入口，打开专用的大编辑界面，并移除输入框原生缩放角。参考仅用于功能和交互，继续复用 Neon/Flora。

**Goal:** 共享生成操作区提供可以正常编辑、选择模型/参数、添加素材和生成的放大界面。

**Architecture:** 原生 modal dialog 放在当前节点内，暂时容纳同一个 composer，所有真实控件仍为节点后代。不复制数据或生成事件。关闭将 composer 还原；模型选择浮层打开时进入当前 dialog 保持可交互。参数浮层保留现有原生 popover。样式复用 Flora 与语义令牌。

**Tech Stack:** 现有宿主 DOM/JavaScript、原生 dialog、Neon CSS、Playwright 回归。

## 约束

简体中文，禁止 localStorage 存画布/生成数据。保留已有未提交改动。运行时仅由 deploy.mjs 备份部署，构建成功后部署，部署后 acceptance.cjs；禁止结束 3199 服务。测试拦截业务 API，不调用付费生成或写入用户画布。

- [x] 新回归先证明没有放大入口及提示词仍可原生缩放。
- [x] composer 加入放大/关闭按钮、dialog 生命周期、Esc/背景关闭、焦点回到入口、卸载/切换节点清理。
- [x] 编辑、上传、模型/参数选择和生成继续使用原控件；下拉在 dialog 内可交互。
- [x] CSS 去掉原生缩放角，放大时提示词伸展、底排保持可访问；四宽度/缩放/全屏检查。
- [x] 构建、备份部署、直接运行时回归、工作台验收和边界报告。

部署后结果：49 张放大操作区截图、51 张富文本截图、48 张工作台截图；页面错误与横向溢出为空。七种共享节点均有入口；上传/生成 API 为隔离模拟。详细记录见 `neon-workbench/design-audits/composer-expanded-20261008.md`。
