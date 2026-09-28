# 画布 Agent MCP 统一工具协议设计

日期：2026-08-21  
状态：已实施并完成验证  
适用范围：内置画布 Agent 的工具发现、工具调用、Skill 编排与未来外部 Agent 接入

## 1. 目标

把当前画布 Agent 的全部能力收敛到一套标准 MCP（Model Context Protocol）工具协议，使不同 LLM 可以复用同一批工具，更换模型时不改画布执行逻辑，也不影响现有画布交互性能。

最终固定数据流为：

```text
用户
  ↓
Agent Host（上下文、Skill、审批、循环控制）
  ↓
LLM Connector（只兼容不同模型 API）
  ↓ 返回“调用哪个 MCP 工具及参数”的意图
Agent Host
  ↓ MCP tools/call
进程内 MCP Client ⇄ 进程内 MCP Server
  ↓
Canvas Agent Broker（画布边界、校验、幂等、数量限制）
  ↓
现有画布功能适配器
  ↓
当前画布
```

“LLM 不能直接执行画布工具”不表示 Agent 不能立即执行。它表示 LLM 不得绕过 MCP 和 Broker 直接调用 DOM、全局函数或画布节点 API。用户无需多做一步：LLM 产生工具意图后，Agent Host 会立即通过进程内 MCP `tools/call` 执行；只有付费生成、删除和批量覆盖等既定高风险动作进入确认流程。

## 2. 核心边界

### 2.1 MCP 是唯一工具合同

- 所有模型看到的工具，都来自同一份 MCP Tool 定义。
- 所有由模型发起的画布操作，都必须进入 MCP `tools/call`。
- Skill 只能引用 MCP 工具名，不能保存某家模型专用的 function schema。
- 画布前端、LLM Connector 和 Skill 不各自维护一份工具参数定义，避免三份协议漂移。

### 2.2 LLM Connector 只处理模型差异

现有 Model Adapter 的职责保留，但产品和代码概念改称 **LLM Connector**。它只负责：

- 把统一消息、上下文和 MCP Tool 定义转换为 OpenAI Responses、OpenAI Chat，以及未来其他模型 API 的请求格式；
- 把流式文本、工具调用意图、结束原因和错误转换为 Agent Host 的统一事件；
- 把 MCP 工具结果转换成对应模型继续推理所需的 tool-result 格式。

LLM Connector 不得：

- 调用画布 Broker 或画布适配器；
- 自己决定审批规则、目标画布或批量上限；
- 修改 MCP 工具 schema；
- 把提供商私有字段渗透到画布执行层。

这样更换 LLM 时只替换 Connector 和路由配置，MCP 工具、Skill、审批和执行代码保持不变。

### 2.3 Broker 仍是最终执行边界

MCP Server 不重新实现画布业务，而是将合法的 `tools/call` 委托给现有 Canvas Agent Broker。Broker 继续负责：

- 将 `boardId + runId + callId` 绑定到当前画布；
- JSON Schema 参数校验和未知字段拒绝；
- 同一次调用的幂等处理；
- 单次和批量目标数量上限；
- 画布节点归属校验；
- 调用现有画布能力适配器；
- 将异常转换为结构化执行结果。

任何模型参数都不能覆盖可信执行上下文中的 `boardId`、`runId` 或权限状态。

## 3. 协议版本与首期范围

首期按照 MCP `2025-11-25` 的稳定工具协议实现以下方法：

- `initialize`
- `notifications/initialized`
- `tools/list`
- `tools/call`

基础消息遵循 JSON-RPC 2.0。Server 在 `initialize` 中声明 `tools` capability，首期 `listChanged` 为 `false`。工具集合由当前 Skill 和 Agent 能力范围决定，但在一次运行内固定并缓存。

首期不使用实验性的 MCP Tasks；当前 Agent 已有运行状态、取消、超时和恢复机制，叠加 Tasks 会增加状态同步复杂度且没有直接收益。

首期也不开放网络 MCP 端口。内置 Agent 使用同一页面进程内的 MCP Client/Server transport，传递标准 JSON-RPC 对象但不做 HTTP、WebSocket 或 JSON 字符串往返，因此不会给画布热路径增加网络延迟。未来接外部 Agent 时，再增加经过身份验证的 Streamable HTTP transport；协议层和工具层无需重写。

## 4. MCP Tool 的唯一数据源

`canvas-agent-capabilities.js` 中的能力定义改为以 MCP Tool 为规范源。每个工具至少包含：

```js
{
  name: "create_image_node",
  title: "创建图片节点",
  description: "在当前画布创建图片节点",
  inputSchema: {
    type: "object",
    properties: { /* ... */ },
    required: [/* ... */],
    additionalProperties: false
  },
  outputSchema: { /* 可验证的结构化结果 */ },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  }
}
```

本地能力元数据继续与 MCP Tool 并列保存，包括 `risk`、`maxTargets`、Skill 分类和内部 adapter id。审批与安全不能只依赖 MCP `annotations`；annotations 是模型提示，不是授权机制。

现有提供商格式不再由 capability 文件直接生成。LLM Connector 从 MCP Tool 转换：

- OpenAI Responses：`name + description + inputSchema` 映射为 function tool；
- OpenAI Chat：映射为 `type:function` 及 `function.parameters`；
- 未来 Claude、Gemini 或本地模型：只在相应 Connector 内增加映射。

迁移期间如保留 `getToolDefinitions()` 兼容函数，它也必须从 MCP Tool 派生，不能拥有第二份 schema。

## 5. 进程内 MCP Client/Server

### 5.1 MCP Server

新增通用 MCP 协议模块，负责 JSON-RPC 生命周期、方法分发与错误封装；新增画布 MCP Server 适配层，负责把工具调用交给 Broker。

`tools/list` 返回当前运行允许使用的 MCP Tools，顺序稳定，便于缓存和测试。当前工具数量较小，首期不分页。

`tools/call` 请求只接受：

```json
{
  "name": "create_image_node",
  "arguments": {}
}
```

可信的画布上下文通过进程内 transport 的调用上下文传入，不作为模型可填写的 `arguments`。MCP Server 收到调用后构造 Broker 所需的 scope 和 call id，再由 Broker 二次校验。

### 5.2 MCP Client

Agent UI/Host 不再直接调用 `broker.execute()`，而是调用 MCP Client：

```text
normalized tool call
  → MCP tools/call
  → CallToolResult
  → normalized tool result
  → LLM Connector
  → 模型继续推理
```

进程内 transport 保留请求 id、初始化状态和标准消息形状。这样现在没有网络成本，未来换成 Streamable HTTP 时，Agent Host 上层逻辑也不变化。

## 6. 返回值与错误语义

成功结果使用标准 `CallToolResult`：

```js
{
  content: [{ type: "text", text: "已创建图片节点" }],
  structuredContent: {
    ok: true,
    nodeIds: ["..."]
  },
  isError: false
}
```

错误分为两层：

1. **协议错误**：未知 JSON-RPC 方法、非法请求、未初始化、未知工具名。返回 JSON-RPC error。
2. **工具执行错误**：参数业务校验失败、目标节点不存在、画布运行已失效、下游生图失败。返回正常 `tools/call` result，但 `isError: true`，并给出可让模型修正或向用户解释的结构化信息。

工具执行失败不直接把堆栈或提供商原始错误展示给用户。Agent Host 将结果交还模型一次，让模型选择修正参数、换工具或用自然语言说明。以下情况停止自动重试：

- 用户主动取消；
- 当前画布或运行已切换；
- 同类错误达到既定重试上限；
- 需要用户确认但用户拒绝。

拒绝确认返回 `user_declined` 工具结果，模型可以继续对话，但不能偷偷换一个等价高风险工具执行。

## 7. Skill、自动模式与确认

- “自动”模式由 Agent Host 根据意图选择 Skill 或直接选择 MCP 工具；用户不必先选 Skill。
- Skill 是流程模板：规定工具顺序、必要输入、质量检查和失败回退；实际每一步都使用同一套 MCP Tool。
- 普通安全操作可直接执行。
- 付费生成、删除、批量覆盖仍必须确认。
- 如果用户对当前画布明确授予全权执行，Agent Host 记录画布级授权；除上述强制确认动作外，后续符合范围的操作直接执行，不重复询问。
- 授权、会话、Skill 运行和 MCP scope 都绑定当前 `boardId`，不能跨画布继承。

## 8. 上下文与画布隔离

MCP 只承载工具协议，不替代现有按画布保存的对话上下文。Agent Host 继续加载当前画布的消息历史、摘要、选中节点和运行状态。

每次 MCP 调用必须同时满足：

- MCP Client 属于当前页面会话；
- scope 中的 `boardId` 等于当前打开画布；
- `runId` 仍处于活动状态；
- 目标节点属于该画布；
- call id 在本次运行内唯一或命中幂等缓存。

切换画布时取消旧运行、销毁旧 MCP session 并创建新 session。旧模型响应即使晚到，也无法操作新画布。

## 9. 性能约束

MCP 改造不得影响画布拖拽、缩放、连线和选择：

- MCP 模块不监听 pointermove、wheel 或画布渲染循环；
- `tools/list` 在 Agent 打开或 Skill 变化时生成并缓存，不在每帧计算；
- 进程内 transport 不发送 HTTP，不做无意义的 stringify/parse；
- 工具结果只返回模型继续推理所需的最小结构，不复制整张画布；
- 图片视觉上下文沿用异步压缩与数量限制；
- 批量工具仍受 Broker 上限约束；
- Agent 面板初始关闭且空闲时不启动 MCP 会话和模型请求；用户已经明确开始的任务在折叠面板后继续，只有点击“停止”才取消运行和 MCP session。

## 10. 文件与职责调整

计划中的代码边界如下：

- `canvas-agent-capabilities.js`
  - MCP Tool 成为唯一工具 schema；保留本地风险和数量策略。
- `canvas-agent-mcp-protocol.js`（新增）
  - JSON-RPC 2.0、MCP initialize、`tools/list`、`tools/call`、进程内 transport。
- `canvas-agent-mcp-server.js`（新增）
  - 绑定当前 board/run scope，将 `tools/call` 委托给 Broker。
- `canvas-agent-broker.js`
  - 继续作为唯一执行与安全边界，不暴露给 LLM Connector。
- `canvas-agent-ui.js`
  - 通过 MCP Client 执行模型工具调用；保留审批、取消和等待反馈。
- `canvas-agent-runtime.js`
  - Agent 循环消费 MCP 工具列表和标准化工具结果。
- `canvas-agent-model-adapters.js`
  - 迁移为 `canvas-agent-llm-connectors.js`，只保留模型 API 兼容职责。
- `server.js`
  - 使用 LLM Connector 进行模型请求和流式解析，不执行画布工具。
- `index.html`、`build-portable.bat` 与验证脚本
  - 加载和打包新增模块，检查便携版不缺文件。

本设计在 MCP 工具协议部分取代 `2026-08-21-canvas-agent-model-adapter-design.md` 中“暂不引入 MCP”的旧边界；模型高可用与提供商兼容设计继续有效，只是统一改称 LLM Connector。

## 11. 测试与验收

### 协议测试

- 初始化前调用工具会得到协议错误；初始化完成后可正常调用。
- `initialize` 协商版本并返回 tools capability。
- `tools/list` 返回标准 MCP Tool，schema 唯一、顺序稳定。
- `tools/call` 成功时返回 `content + structuredContent`。
- 未知工具和非法 JSON-RPC 使用协议错误；业务失败使用 `isError: true`。

### 模型可替换性测试

- OpenAI Responses 和 OpenAI Chat 从同一批 MCP Tools 派生各自请求格式。
- 两种 Connector 产生同一标准化工具意图，并通过同一 MCP 调用路径执行。
- 切换模型不修改 capability、Skill、Broker 和画布适配器。
- 主模型失败时，现有高可用路由切换备用模型；工具 session 与运行上下文不丢失。

### 安全与隔离测试

- LLM Connector 无法直接访问 Broker 执行入口。
- 模型伪造 board id、run id 或风险字段无效。
- 旧画布晚到响应无法操作新画布。
- 删除、付费生成、批量覆盖保持强制确认。
- 相同 run/call 并发提交只执行一次。
- 超过批量上限时不会部分越权执行。

### 回归与性能测试

- 现有 Agent、Broker、Skill、对话持久化、恢复、UI 和便携版测试全部通过。
- Agent 面板关闭状态下，画布交互性能与改造前一致。
- Agent 打开但空闲时无轮询、无持续序列化、无额外画布遍历。
- 执行工具时不阻塞画布主交互；图片上下文处理继续异步。

## 12. 验收结果

完成后应满足以下用户可见结果：

- 用户无需理解或选择模型专用工具格式；
- 用户无需先选择 Skill，也能自然对话并让 Agent 执行画布操作；
- 更换 LLM 不影响 Agent 的工具能力和 Skill；
- 同一个画布保留上下文，不同画布严格隔离；
- Agent 能直接执行安全操作，高风险操作按既定规则确认；
- 工具失败时 Agent 优先自我修正或给出可理解说明，不直接暴露协议报错；
- 引入 MCP 后画布拖拽、缩放、选择和渲染流畅度不下降。
