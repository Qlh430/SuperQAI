# Midjourney 版本与动态参数验收

日期：2026-10-09。范围：统一图片生成节点，不重新增加独立 Midjourney 节点。

## 行为

- 单一真实 Midjourney 接入在模型列表展开版本配置，提交仍保留真实目录 ID；真实独立版本模型不展开伪 ID。搜索可匹配版本。
- Flora 操作区新增独立齿轮入口，普通与放大操作区共用设置。使用现有语义令牌、弹层、控件尺寸与焦点样式，简体中文标签和说明。
- 参数能力为接入与模型版本支持范围的交集；切换版本清理不兼容参数，前后端共享规则。未核实其它接入的参数不冒用 APIMart。
- 数字、字符串枚举、布尔值严格转换；零值和显式关闭保留，越界值在请求前显示中文错误。使用宿主 `params` 参数袋，避免旧顶层白名单丢掉新字段。
- 完整参数随节点保存、恢复、复制；已提交参数快照随节点生成历史保存，避免修改设置影响旧结果记录。
- 目录加载较晚或失败时暂存完整参数，目录恢复后再规范化，不退回默认版本。APIMart 未确认支持的独立版本在提交前中文拒绝，避免静默使用上游默认版本。

## 已核对矩阵

| 版本 | 版本特有选项 | 不提供的选项 |
| --- | --- | --- |
| V8.2 / V8.1 | 高清输出 | 质量、快速草图、完成程度、极速 |
| V7 | 质量 1 / 2、快速草图 | 高清输出、完成程度 |
| V6.1 | 质量 0.5 / 1 / 2、完成程度 | 高清输出、快速草图 |
| V5.2 / V5.1 | 质量 0.25 / 0.5 / 1、完成程度 | 高清输出、快速草图 |
| Niji 7 | 贴近提示词、变化程度等适用核心选项 | 质量、创意偏离、快速草图、完成程度、极速 |
| Niji 6 | 完成程度等适用核心选项 | 质量、创意偏离、快速草图、高清输出、极速 |

参考图影响仅有图片输入时提供；范围随版本变化。APIMart 文档质量枚举没有 4，界面不提供原生 V7 的质量 4。

依据：[APIMart Imagine](https://docs.apimart.ai/cn/api-reference/images/midjourney/imagine)、[Midjourney 版本兼容表](https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version)、[旧版本参数](https://docs.midjourney.com/hc/en-us/articles/33329788681101-Legacy-Features)、[图片提示](https://docs.midjourney.com/hc/en-us/articles/32040250122381-Image-Prompts)、[草图模式](https://docs.midjourney.com/hc/en-us/articles/35577175650957-Draft-Conversational-Modes)、[Niji 7](https://nijijourney.com/zh/blog/niji-7-prompting)。

## 验证

- `npm run build` 成功；通过 `deploy.mjs` 备份部署，最终备份 `.design/deploy-backups/2026-10-09T03-28-04-231Z`，资源版本 `20261009-midjourney-parameters`。新规则模块已接入画布懒加载清单。
- `midjourney-protocol-regression.cjs`：58 项，含实际宿主 bridge / resolver / executor / registry / engine / adapter 和公开目录代码；只替换存储、外部网络为测试夹具。
- `midjourney-parameters-regression.cjs`：源码与最终部署资源均通过。八版本、旧参数清理、零值关闭、中文校验、实际请求字段、真实 ID、保存恢复、复制粘贴、历史、其它模型隐藏选项，以及 390 / 768 / 1440 / 1728 宽度的放大、焦点、Escape。无 pageerror。
- 通用生成操作区 12 项、生成历史 58 项通过。最终部署后 `acceptance.cjs` 48 张截图，四宽度项目创建、回收站、素材、模拟生图、模拟对话、返回、移动导航，无 pageerror / 横向溢出。
- 七类共用放大操作区回归通过：四宽度、0.65 / 1 / 1.5 缩放，49 张截图，无 pageerror。
- 截图：`.design/midjourney-parameters/settings-{390,768,1440,1728}.png`。逐图检查颜色、间距、44px 控件、边框圆角、说明与焦点样式复用当前体系。
- 独立复审发现并复核修复两项 P2：未验证独立版本退回默认版本、目录迟到丢失保存参数。测试定位区分新增齿轮弹层与原比例弹层。

## 边界

所有业务调用均为隔离模拟，没有付费 Midjourney 生成或更改用户真实画布。真实登录服务商条目、权限、生成效果仍需已有登录会话验收。Better Design MCP 未连接，不声称动态审查。

未停止或重启桌面主进程拉起的 3199 服务，诊断 serverPid=5972。后端 CommonJS 规则需应用从托盘完全退出后重新打开才能加载；页面资源刷新即可加载。未核实其它服务商的参数能力时隐藏专属设置，真实独立模型列表保留。
