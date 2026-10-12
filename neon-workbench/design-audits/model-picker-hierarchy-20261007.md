# 画布模型列表层级验收（2026-10-07）

- 当前选项用Neon primary文字与8% primary混合popover的浅绿色底色，自动选择也显示颜色；继续保持无说明、无收藏按钮、无勾标的简洁列表。
- 平台标题使用12px muted字，模型14px，模型行相对平台缩进8px。站点之间用现有border细线和8px间距区分，仍支持折叠、计数与真实模型ID选择。
- 原宿主desktop-shell.css的全局focus-visible使用强制蓝色轮廓；本轮在Flora模型浮层内用高优先级primary轮廓覆盖，并清除叠加阴影。没有修改旧页面样式或引入新色板。
- 规范源修改为 `design-sources/flora-node-shell.css`；复用既有生成节点专项，增加当前模型选中的四宽度、悬停、焦点及全屏截图。未增加业务逻辑或自动上游调用。

`npm run build` 与deploy.mjs再次构建成功。最终部署后 `generator-composer-regression.cjs` 的12组宽度/缩放检查通过（390/768/1440/1728，0.5/1/1.5缩放）；键盘选择、分组折叠、同名模型真实ID、取消选中、移动布局、清理与全屏继续通过，页面错误为空。`node acceptance.cjs` 完成48张工作台截图和既有项目创建、回收站、素材、模拟生图/对话、返回与移动导航流程，页面错误和横向溢出数组为空。

已人工查看默认自动选择、实际选中、悬停、焦点、移动端和全屏截图。最终焦点仅保留Neon绿色轮廓。截图在 `acceptance/model-picker-selected-*.png` 和 `generator-minimal-model-fullscreen.png`，机器报告为 `generator-composer-report.json` 和 `report.json`。本轮没有Better Design动态审查或VALID凭据。

实际入口为 `http://127.0.0.1:3199/`；使用deploy.mjs备份部署，最终备份 `.design/deploy-backups/2026-10-07T05-57-30-587Z`，资源版本 `20261007-model-picker-hierarchy-final`。CSS规范源与运行时文件SHA256一致：`7F48BF5BF8DDB2BF083247D4DC09F3C4101D74E30C624CF98998EE445BCE1792`。

测试使用隔离模拟业务API和生成回调、实际宿主控件；没有访问用户真实密钥、写入真实画布或调用付费生成。真实登录业务仍按前轮边界验收；本轮视觉修改刷新页面后加载。
