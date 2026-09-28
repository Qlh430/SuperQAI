# 原始模型 ID 与只读模型配置

**目标：** API 设置及节点选择器统一显示接口原始模型 ID；删除显示名称编辑，禁止原地修改模型 ID。

**约束：** 用户已要求直接执行，不再重复确认。保留工作区既有变更；不提交、不重启真实服务、不调用付费 API、不直接修改真实配置。沿用当前设置卡片的颜色、字体与布局，模型 ID 占据原来两栏的位置。

## 实施与验收

- [x] 在 `tools/check-provider-model-identity.js` 写旧 GRSAI 等后缀迁移的失败测试：仅处理 `metadata.upstreamModel` 等于去掉已知旧后缀后的 ID；保留真正带后缀的原始模型；同站点重复项合并、站点隔离、加密密钥不变、迁移前快照、事务及幂等。
- [x] 在 `provider-migration.js` 增加独立版本的 ID 迁移，使用原始数据库记录保持协议、能力、密钥不被重新推断；在 `server.js` 接入启动迁移。迁移前快照失败则不写。
- [x] `provider-capability-resolver.js` 接受元数据中的旧 ID，精确 ID 优先。公开目录提供不展示的兼容 ID，`server.js` 将旧画布选择定位到原站点的原始 ID；已有任务继续查询而不重新生成。
- [x] 修改 `system-settings-ui.js`、`system-settings.css`：只读 ID、移除显示名称、保存/测试/排序使用原始模型 ID、保留参数配置。修改 `image-model-picker.js` 与目录展示使用原始 ID、平台独立区分。
- [x] 先更新 `tools/check-api-settings-browser.js`、`tools/check-image-model-picker.js` 复现新要求，再修改实现；浏览器检查只读、保存、拉取预勾选、新模型原名、窄屏和深浅主题。
- [x] 运行模型迁移、存储、路由、协议、额度切换、浏览器和语法检查；只读代码审查；记录源码与运行中版本的区别。

测试命令：`node tools/check-provider-model-identity.js`、`node tools/check-api-settings-browser.js`、`node tools/check-image-model-picker.js`、`npm run check:image-quota-fallback`。

## 最终验证

- `npm run check:model-identity`：8 项模型身份回归、真实本地 HTTP 端点、选择器通过。
- `npm run check:image-quota-fallback`：25 项额度回退回归及图片任务端点通过。
- 迁移、Store、协议引擎、resolver、executor、APIMart 可靠性、设置页、选择器 UI、模型版本、Agent 图片回退、便携运行时清单通过。
- `node tools/check-api-settings-browser.js`：只读、无显示名称、保存参数、已保存预勾选、新拉取真实后缀、深浅主题与 390px 窄屏通过；截图在 `artifacts/api-settings/`。
- 只读审查的三项反馈已复现、修复并复审通过：首次启动不得伪造上游映射、跨平台精确 ID 优先、收藏/最近记录别名兼容。
- 可选旧 `check-image-model-instance-rollover.js` 依赖 `127.0.0.1:3099`，该服务未运行，测试因连接拒绝未完成；没有为它启动真实数据服务。
- 本次仅修改源码；没有打包、重启真实服务或改写真实 API 配置。实际 ID 修复在新版启动时先备份后执行。
