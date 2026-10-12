# ComfyUI 共用图片生成操作区验收

切换到ComfyUI会更换原生节点实现；此前只有API生成节点挂载下方操作区，导致ComfyUI回退到输入摘要和节点内执行按钮的旧布局。已先将回归改为要求ComfyUI保留操作区，并确认旧实现失败，再修复。

ComfyUI原生类、工作流事件与序列化类型保持comfy，视觉统一为generator家族。API和ComfyUI共用Flora预览、上排参考素材、中间提示词、底排参数及圆形生成按钮。ComfyUI工作流选择保留八个原生选项，不会被API模型目录覆盖；支持的分辨率、扩图和Qwen角度区域放入既有Neon参数浮层。

提示词跨切换保存，Flux2编辑使用操作区的真实草稿；无提示词输入的工作流只读保留并明确提示。实际宿主保存接口负责持久化，不新增localStorage。按钮保留实际运行事件，忙碌状态禁用并显示加载图标；成功结果进入同一预览，失败显示原中文原因。ComfyUI序列化及恢复保留结果预览、提示词和参数。

验证结果：

- `npm run build` 成功；随后仅通过 `node deploy.mjs` 构建、备份、部署。
- 部署后 `node generator-composer-regression.cjs`：12组宽度/缩放检查通过，pageerror为空；另覆盖ComfyUI四宽度、默认/选中/悬停/焦点/全屏、缺失参考图提示、API切换保留、工作流/分辨率选择、扩图/角度参数可见、重装监听、宿主保存恢复、模拟请求成功及503失败。宿主实际提交的两次Flux2请求均带输入草稿和真实参考连接。
- 部署后 `node acceptance.cjs`：375/390/768/1280/1440/1728，共48张截图，errors与overflow为空；项目创建、回收站、素材、模拟生图/对话、返回及移动导航流程通过。
- `node flora-toolbar-regression.cjs`：281项隔离DOM检查通过，errors为空。

已人工查看桌面、390移动端及全屏参数弹层截图，复用既有语义颜色、16px弹层圆角、8px控件圆角、44px点击高度与现有细边框。移动布局自动换行；切换ComfyUI不再出现旧输入摘要卡片或节点内执行按钮。

截图：`acceptance/comfy-shared-composer-{390,768,1440,1728}.png`、`comfy-shared-{default,hover,focus,fullscreen}.png`。报告：`acceptance/generator-composer-report.json`、`acceptance/report.json`。

运行入口 `http://127.0.0.1:3199/`；资源版本 `20261007-comfy-shared-composer`。备份 `.design/deploy-backups/2026-10-07T06-22-32-601Z`。四个Flora源文件与运行时SHA256全部一致：

| 文件 | SHA256 |
| --- | --- |
| flora-generator-composer.js | EECF704647CDA57478D9D6805157A1C8665ED66D7C79DDF3E7ADB9ACC3009317 |
| flora-generator-parameters.js | C15357C1D7D4AE3C9470C09234BB2C770B42E00F419851B95F7069C50CB1F3AE |
| flora-node-shell.js | 0AEF787B8EC9E045E4A052A27FE66CB09E3193EFF415E6CFA8A463900DFD586B |
| flora-node-shell.css | BB5003DEA24E71D7544478AF273BD72EE79554B0A2C21232C0C25A8331A37E1F |

业务接口与ComfyUI任务返回为隔离模拟；宿主按钮、请求组装、参考连接、运行与恢复函数真实执行。未访问用户密钥、真实登录画布或真实ComfyUI服务。真实登录及服务商生成/保存仍需用户现有会话最终业务验收。Better Design MCP本轮未连接，未宣称动态审查结果。刷新工作台即可载入本轮前端及宿主脚本修复。
