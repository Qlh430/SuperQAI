# 独立 Midjourney 节点入口移除验收

用户要求去掉单独的 Midjourney 节点。创建菜单与连接菜单各移除一项；Midjourney 继续作为通用图片生成的模型，旧节点保留渲染、运行、序列化、恢复与历史兼容，不迁移用户数据。没有修改 CSS 或其它节点交互。

修改宿主规范源 `design-sources/script-before-save-bridge.js`，部署脚本同时清理旧静态入口并将宿主脚本缓存版本设为 `20261009-midjourney-entry`。

## 验收结果

- `npm run build`：通过。沙箱首次构建受子进程权限限制，正常本机构建通过，无依赖更改。
- `node deploy.mjs`：通过；运行时备份 `.design/deploy-backups/2026-10-09T02-12-42-264Z`。
- `.design/midjourney-entry/verify.cjs`：390、768、1440、1728 四宽度检查通过。真实宿主创建和连接菜单均无独立入口；点击图片生成可创建节点，模拟目录里的 Midjourney 模型可选择、序列化，六项原有参数仍存在；旧 Midjourney 节点可序列化并恢复提示词、操作与运行入口。8 张菜单截图，页面错误为空。
- `node acceptance.cjs`：48 张截图，项目创建、回收站、素材、模拟图片生成、模拟对话、返回和移动导航通过，errors/overflow 均为空。
- `git diff --check`：本次修改文件通过；只有既有 Windows 换行提示。

业务 API 全部隔离模拟，未调用真实付费生成或操作用户已有登录画布。旧节点验证覆盖恢复及运行入口，不宣称本次执行了真实 Midjourney 生成。桌面3199服务（serverPid5972）保持运行。Better Design MCP 未连接，未报告动态审查结果。刷新页面后使用新菜单；已有旧节点不会被自动删除。
