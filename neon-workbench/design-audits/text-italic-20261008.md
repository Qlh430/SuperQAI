# 中文斜体显示修复

用户反馈斜体按钮点亮，但选中的中文仍直立。复现时选区已正确写入 `<i>`，计算 `font-style` 为 `italic`，但 `font-synthesis-style` 是 `none`。宿主 styles.css 的 body 规则禁止字体合成，中文回退字体的倾斜字形因此无法合成。上一轮只验证按钮状态，遗漏实际字形显示。

在 Flora 文字内容 `.canvas-text-markdown` 内局部设置 `font-synthesis-style: auto`，允许需要的中文斜体合成，继续使用原有字体与视觉令牌。没有修改按钮逻辑或其他页面的字体策略。

新增实际渲染回归先失败（none 不等于 auto），修复后通过；同一段中文的直立与斜体截图像素不同，画布恢复后仍允许斜体渲染。部署后完整富文本专项通过，390/768/1440/1728、三档缩放、历史、撤销/重做、复制粘贴、失焦、全屏检查通过。证据 `acceptance/text-rich-editor/chinese-normal.png` 与 `chinese-italic.png`，51 张界面截图及 2 张字形比较图。

构建成功后经 deploy.mjs 备份部署，缓存版本 `20261008-text-italic`，备份 `.design/deploy-backups/2026-10-08T02-50-03-431Z`。部署后 acceptance.cjs 48 图验收通过，无 pageerror 和横向溢出。业务 API 拦截模拟，未读写用户真实画布或调用生成服务，真实登录保存与生成不属于本次验证结论。未停止或重启 3199 服务；Better Design MCP 未连接，没有动态审查结果。
