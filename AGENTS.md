# AI OS 工作规则

## 开始工作前

1. 阅读 `PROJECT_CONTEXT.md`（如果存在）。
2. 检查未提交工作区和运行时实际目录。
3. 先阅读 `PRODUCT.md`、`DESIGN.md`、`INFORMATION_ARCHITECTURE.md`、`BENDO-DESIGN-SYSTEM-V1.md`、`LAYOUT_ACCEPTANCE.md`。
4. 修改前确认页面属于 Neon 独立工作台，不能把旧页面当作布局参考。

## 开发规则

- 中文产品，用户可见文本必须是简体中文。
- React 页面只使用 `neon-workbench/src` 的官方组件和语义令牌。
- 真实 API 失败必须显示中文错误，不得静默变成空列表。
- 页面拆分、导航、返回、权限、加载、失败、空态和移动端都要考虑。
- 画布数据和生成数据不能放进 localStorage；接口由宿主服务负责。
- 改动运行时前先备份目标文件；部署只允许通过 `neon-workbench/deploy.mjs`。

## 验收规则

`npm run build` 成功后才能部署。部署后运行 `node acceptance.cjs`，检查 390、768、1440、1728 宽度，确认没有 pageerror 或横向溢出，并执行项目创建、回收站、素材、模拟生图、模拟对话、返回和移动导航流程。报告必须说明模拟 API 和真实登录的边界。

## 当前风险

Better Design MCP 当前未连接，不能虚构其动态审查结果。真实登录后的服务商、图片模型和画布数据仍需在用户已有登录会话中做最终业务验收。
