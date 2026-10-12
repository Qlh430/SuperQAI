# 图片生成操作区重排验收（2026-10-07）

用户要求生成方式呈现为下拉，不显示“引擎”；操作区上排参考素材，中间提示词，底排参数和生成按钮。按此结构实现，保持当前 Neon/Flora 语义颜色、Lucide 图标、16px面板圆角、8px控件圆角、44px控件与焦点。参考图只用于结构与交互，未采纳其浅色视觉。

API生成 / ComfyUI生成下拉委托现有真实切换入口，保留原模型、尺寸、生成按钮及提示词DOM。ComfyUI现有参数托盘也采用同一下拉以便切回。未重构ComfyUI工作流编辑器。取消选择保留草稿、多选隐藏和节点下方面板跟随规则保留。桌面底排左侧参数、右侧生成；窄屏自动折行，控件保持可点击尺寸。这降低常驻面积，切换方式需要打开下拉，手机端底排可能占多行。

## 验证

- 先运行新下拉回归，旧实现因缺少下拉超时失败；实现后通过。
- `npm run build` 成功；通过 `deploy.mjs` 备份部署，最终备份 `.design/deploy-backups/2026-10-07T02-22-08-150Z`。运行时入口为 `http://127.0.0.1:3199/`，HTTP已确认新版本 `20261007-generator-layout`，组合器、壳体JS/CSS与源码SHA256一致。
- 最终部署后 `node generator-composer-regression.cjs`：四宽度390/768/1440/1728与三档画布缩放，共12组几何检查，pageerror为空；API/ComfyUI来回切换、草稿保留、生成仅调用一次、参考图真实宿主上传与连线、错误显示、节点拖动、默认/悬停/选中/Tab焦点/全屏/移动端、重装及卸载通过。
- 最终部署后 `node acceptance.cjs`：48张页面截图，项目创建、回收站、素材、模拟生图与对话、返回及移动导航等通过；无pageerror与横向溢出。真实运行时仅验证未登录入口。
- 共享壳体回归：音频26项、视频交互、工具栏281项通过，无pageerror。视频/工具栏使用真实源码的隔离DOM，音频使用当前宿主与模拟API。
- 同宽度基线：`acceptance/generator-layout-before-{390,768,1440,1728}.png`；新布局：`acceptance/generator-composer-after-{390,768,1440,1728}.png`。已查看桌面和移动端前后截图，新面板将底部三排收为一排；移动端参数自动换行。预览 `acceptance/generator-composer-preview.png`。

## Better Design 与边界

本轮Better Design工具可调用，已读取spacing/forms原则与review rules。文案检查通过；第一次把下拉选项误计为独立操作，纠正为实际参数与按钮后通过。最终inspect-spacing为completed，390/1440/1728及悬停/Tab焦点有实测，无critical/serious，29项moderate保留原始报告 `generator-layout-spacing-20261007.json`。25项为端口/工具栏可见28/32px，实际透明扩展点击区域此前及本轮elementFromPoint测试通过；4项为390宽度下44px控件经过画布变换后的浮点误差，最大低于44px约0.004px。没有把工具分数当视觉批准，也没有公开HTTPS VALID最终审查收据。

页面业务API、图片上传响应与图片生成回调为模拟，未写入用户真实画布。真实登录下的服务商、模型返回、付费生成、ComfyUI执行及服务端保存/权限仍需在用户现有登录会话验收。
