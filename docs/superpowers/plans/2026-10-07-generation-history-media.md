# 生成节点与历史记录实施计划

> 执行：采用 subagent-driven-development 分派互不冲突的新模块，主线程集成宿主并审查验证；用户已批准方案，不重复确认，不提交已有未提交工作。

**目标：**统一生成节点呈现，真实结果进入原节点和节点历史，补齐音频生成。

**架构：**三个独立模块负责历史界面、媒体/文本操作区、音频执行及渲染。宿主桥接唯一负责画布创建、序列化、恢复、保存与实际结果提交。各模块只复用当前Neon/Flora规则，不改旧页面。

**技术：**原宿主JavaScript、Neon令牌、Flora DOM、同源协议引擎、Playwright及Node HTTP测试。

## 约束

只改规范源；先构建后通过deploy.mjs备份部署；部署后验收390/768/1440/1728及既有流程。模拟接口隔离登录和数据，不调用付费生成。真实失败中文展示。用户画布和生成数据不进localStorage。

## 任务

- [x] 历史模块：`flora-generation-history.js` 及 `.css` 已交付。接口 `FloraGenerationHistory.add`、`mount`、`serialize`、`hydrate`；选择派发 `flora-generation-history-select`，增删派发 `flora-generation-history-change`。58 项回归覆盖重复提交去重、恢复、选择、下载、删除、四宽度与全屏。
- [x] 媒体/文本操作区：以 `flora-generator-composer.js` + `flora-generator-parameters.js` 实现统一操作区，复用原生控件与监听，覆盖 generator/comfy/video-api/minimax-h3/llm/audio-generator；单选展开、取消收起保留草稿、多选隐藏、输入不拖节点。生成操作区 12 项与工具栏 281 项通过。
- [x] 音频：`canvas-audio-generator.js` 走真实 `/api/providers/generate-audio`，使用已保存模型与协议；HTTP 侧真实请求映射、鉴权、错误与音频返回通过，浏览器侧模拟播放、拖动与恢复通过（音频节点 26 项、音频协议专项）。
- [x] 宿主集成：`script-before-save-bridge.js`、`flora-node-shell.js/.css`、`host-bridge.js`、`deploy.mjs` 已接入。结果提交写入原节点预览与节点历史而非新建图集；尺寸偏差显示完成与具体差异；创建菜单、模型同步、音频节点序列化恢复与历史迁移兼容完成。
- [x] 独立审查：核对数据丢失、重复提交、未保存配置与卸载监听风险；修复视频节点宽度、文本编辑历史同步、音频节点输出与占位显隐、loader 旋转、placeholder 重复赋值等问题，其余无阻塞项。
- [x] 部署验收：`npm run build` 与 `node deploy.mjs` 成功（版本 20261007-generation-history-media，备份 `.design/deploy-backups/2026-10-07T07-37-34-573Z`），`node acceptance.cjs` 通过 48 张截图且页面错误与横向溢出为空；生成/历史/音频/视频/媒体范围专项通过，DESIGN 与 PROJECT_CONTEXT 已更新。
