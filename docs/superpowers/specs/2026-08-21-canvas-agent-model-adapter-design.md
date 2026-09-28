# 画布 Agent 模型适配层设计

## 背景

画布 Agent 已经把画布能力集中在 `canvas-agent-capabilities.js`、`canvas-agent-broker.js` 和 `canvas-agent-tool-adapters.js` 中，但服务端运行与验证路径仍直接判断 `responses` 或 `chat` 协议。这样虽然可以切换 OpenAI 兼容模型，却会让新增模型协议时继续修改 Agent 主循环。

用户需要复用同一批画布工具和 Skill，并在以后更换 LLM 时不改变 Agent 的权限、上下文、确认、故障转移和画布执行行为。

## 目标

- 建立稳定、与模型供应商无关的模型适配器契约。
- 现有 Responses API 与 OpenAI-compatible Chat Completions 通过同一契约运行。
- 服务端 Agent 主循环不再包含协议分支。
- 更换兼容模型只改变候选模型配置，不改变工具、Skill 或前端。
- 新增原生 Claude、Gemini 等协议时只注册新适配器，不修改 Agent 主循环。
- 保持现有顺序故障转移、当前画布边界、工具幂等、风险确认和对话持久化。
- 不增加前端轮询，不进入画布拖拽、缩放、渲染等高频路径。

## 非目标

- 本次不把内置工具改造成 MCP 服务。MCP 以后可以作为同一工具注册表的外部出口。
- 本次不使用 CLI 作为浏览器运行时。
- 本次不新增 Claude/Gemini 原生账号配置界面；当前应用的 API 设置仍以 OpenAI 兼容接口为主。
- 本次不改变普通用户 Agent 面板，也不显示模型名称。

## 架构

运行链路调整为：

```text
候选模型路由
    ↓
Model Adapter Registry
    ↓
统一 Agent Turn（message / tool_calls / usage）
    ↓
Agent Runtime / Tool Broker
    ↓
同一批 Canvas Tools 与 Skills
```

新增 `canvas-agent-model-adapters.js`，内置：

- `openai-responses`
- `openai-chat`

每个适配器提供一致接口：

```js
{
  id,
  protocol,
  capabilities,
  buildRequest(payload, options),
  getEndpoint(candidate),
  getHeaders(candidate),
  parseResponse(data),
  consumeStream(stream, callbacks),
  buildToolProbe(options),
  buildVisionProbe(options)
}
```

注册表提供 `registerModelAdapter`、`getModelAdapter`、`resolveModelAdapter` 和 `listModelAdapters`。适配器注册时校验完整契约，防止无效实现进入运行时。

## 候选模型

候选模型增加稳定的 `adapterId`：Responses 对应 `openai-responses`，Chat Completions 对应 `openai-chat`。旧的 `protocol` 字段继续保留，保证已有健康历史和配置兼容。候选唯一标识纳入 `adapterId`，避免同一模型的两个协议互相覆盖健康记录。

模型路由仍然只根据能力、健康和速度选择候选，不依赖工具实现。模型切换后，适配器把上游结果规范化为：

```js
{
  response_id: "...",
  message: "...",
  tool_calls: [{ call_id, name, arguments }],
  usage: null
}
```

前端和 Tool Broker 只接收该结构，因此不知道也不关心具体模型协议。

## 服务端边界

`runCanvasAgentCandidate` 只做会话、超时、请求发送、故障统计和统一结果校验。请求体、端点、认证头、JSON 解析和 SSE 解析全部委托给适配器。

设置页的 Agent 能力验证也走同一适配器契约，避免“正式运行支持新协议，但验证仍写死旧协议”。能力历史同时保存 `adapterId` 与兼容的 `protocol`。

## 扩展方式

未来新增原生协议时，创建并注册一个新适配器即可。例如 `anthropic-messages` 负责 `x-api-key`、Messages 请求和 `tool_use/tool_result`；`gemini-generate-content` 负责 Gemini contents、functionCall/functionResponse。Agent 主循环、画布工具、Skills、确认和前端均无需修改。

MCP 如需加入，应作为 Tool Registry 的可选外部传输层，不替代 Model Adapter，也不进入内置 Agent 的低延迟热路径。

## 错误与回退

- 未注册适配器属于协议错误，可由现有路由切换下一候选。
- 上游认证、限流、超时、畸形响应继续使用现有错误分类与熔断。
- 适配器不得吞掉错误或伪造回复。
- 工具输出、付费确认与幂等键仍由现有 Agent/Tool Broker 保存，不由适配器管理。

## 性能约束

- 适配器是纯服务端、按请求调用的轻量对象。
- 不增加浏览器脚本、定时器、轮询或画布事件监听。
- 不复制画布大对象；请求构建继续沿用现有三张视觉素材上限。
- 不并发竞速模型，保持现有顺序故障转移，避免重复计费。

## 验收标准

- 服务端运行路径不再通过 `candidate.protocol === ...` 选择请求构建、端点或解析器。
- Responses 与 Chat 两个适配器产生相同的规范化 Turn。
- 自定义测试适配器可以注册并被解析，无需修改 Agent Runtime 或工具代码。
- 现有工具定义、Skill、Broker、画布 API 和前端行为不变。
- 新模块进入便携版复制与校验清单。
- 聚焦检查、完整 `npm run check` 和现有浏览器 Agent 检查通过。
