# API 设置简化

用户已授权直接执行，不重复确认设计。保留当前工作区的已有修改。

设计：沿用现有浅蓝/深色主题；名称第一行，平台协议和网络线路第二行，Base URL、API Key 各占整行；内部 ID 隐藏。模型采用紧凑摘要行，测试和移除直接可见，编辑字段和参数放入折叠详情。验证结果常驻按钮旁；错误协议可探测有限的目录接口并建议切换，不静默替换当前协议，不用生成请求验证。

- [x] 协议诊断：先在 tools/check-provider-protocol-engine.js 添加失败用例，再为 verifyProtocol 的显式 suggestAlternatives 选项添加 available、recommendedProtocol 和 guidance。默认严格验证行为保持兼容。运行 node tools/check-provider-protocol-engine.js。
- [x] 表单和模型列表：先增加 tools/check-api-settings-browser.js 浏览器断言，再调整 system-settings-ui.js 和 system-settings.css。测试隐藏 ID、布局顺序、可见测试、折叠编辑、内联状态、建议切换与选择保留。
- [x] 回归：更新已有浏览器测试访问自动生成 ID/折叠详情的方式；运行设置、协议、API、浏览器测试与 git diff --check；检查浅色、深色和窄屏截图。

边界：认证失败提示检查密钥/权限；限流提示稍后重试；超时提示地址/网络线路；其他失败可建议目录验证通过的协议，没有证据时不声称有正确协议。异步验证不得覆盖另一站点或更新后的连接配置。保留已保存模型默认勾选及仅追加新选择的行为。
