# 四步制作工作台实施计划

已获用户授权：直接实现可操作版本，再根据效果修改。复用现有工作区中的 Neon/Flora 改动，不另开缺少未提交运行时源文件的工作树。

- [x] 定义 workflow v1 数据契约、四个内容 Skill、模型结构校验及稳定引用。
- [x] React 全屏工作台：脚本表格、人物/场景/道具、故事板、视频；官方组件及语义令牌。
- [x] 画布脚本节点、菜单、序列化/恢复、全屏工作台桥接；沿用现有图片/视频引擎。
- [x] 创建、编辑、上传、批量显式执行与真实结果回传；准备不执行。
- [x] 独立服务测试准备零媒体请求、刷新/恢复、范围与引用，以及移动端状态。
- [x] 构建、备份并经 deploy.mjs 部署；运行 acceptance.cjs；审查并修复。

2026-10-13 本机部署完成。49 项数据校验、8 项流程验收与完整 acceptance.cjs 均通过；详见 `.design/script-production-20261013/REPORT.md`。文本、图片、视频供应商请求为模拟，登录与画布存储使用独立真实服务和临时账户；用户已有登录会话的真实模型业务仍待试用。

工作台通信同源且绑定打开它的 iframe、当前 boardId/nodeId。父画布拥有节点、参考连线、生成引擎和保存能力；React 不另存画布快照，也不存 localStorage。

通信：子工作台使用 requestId 调用 `window.parent.postMessage({type:'neon:production-request', requestId, boardId, nodeId, action, payload}, origin)`；父端回复 `{type:'neon:production-response', requestId, data?, error?}`。动作 `snapshot`、`save`（workflow）、`prepare-assets`、`prepare-storyboards`、`prepare-videos`（workflow）、`run`（ids、stage、参数）、`focus`（id）、`close`。返回 snapshot：`{ workflow, nodes: Record<id,{id,prompt,model,src,status,error}>, models:{text,image,video}, readOnly }`。save/prepare 成功后都返回完整 snapshot，禁止模型驱动 run。

节点模型：`production` 保存 workflow；workflow 包含 version:1、source、title、settings:{textModel,imageModel,videoModel,ratio,style,characterLayout}、shots、assets、storyboards、videos、warnings。所有业务实体稳定 id；生成项 nodeId，shots 用 assetIds 引用；故事板 shotIds/assetIds；视频 shotIds/storyboardId/referenceMode。字段详见最终 types 文件。数据保存在已有宿主画布节点 payload；创建和修改调用已有画布函数并保存。

验收使用临时数据和自己启动的 33199 服务；不结束用户服务，不使用用户现有画布作自动化样例。模拟模型与真实登录的边界单独报告。
