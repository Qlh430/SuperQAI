# 画布 Agent 连续会话与工具恢复设计

## 背景与已确认根因

当前 Agent 有两个结构性问题：

1. 工具调用第一步已在画布创建节点，但客户端随后使用 `previous_response_id` 把工具结果交回 Responses 接口。部分反代无法可靠保存或命中上游响应状态，返回 `No tool call found for function call output`。该错误目前被归类为普通请求错误，既不重建上下文也不故障转移，所以后续 `run_canvas_node` 没有机会执行。
2. 每次发送消息都会调用 `resetCanvasAgentRun({ keepMessages: false })`，主动清空消息区。现有 `canvas-agent-runs-v1` 只保存任务摘要，不包含完整消息、工具结果或 `board_id`；画布存储也没有 Agent 会话，因此刷新、切换画布和继续追问都会丢失上下文。

## 成熟产品参考

- Figma Agent 将聊天归属于设计文件，允许在文件中返回聊天列表、继续多轮对话，并把所选图层、文件及设计系统资源加入上下文。
- Lovart 将 Project（画布工作区）和 Thread（连续对话）分层；相关任务默认复用既有 Thread，项目内可以回看历史会话和生成文件。
- Miro Sidekicks 将所选 board objects 作为当前提示的上下文，并让 Agent 直接创建或修改画布内容。

参考：

- https://help.figma.com/hc/en-us/articles/37998629035799-Work-with-the-Figma-agent-in-design-files
- https://www.lovart.ai/zh/docs/how-to-prompt/chat-tools
- https://github.com/lovartai/lovart-skill/blob/main/skills/lovart-skill/SKILL.md
- https://help.miro.com/hc/en-us/articles/29902701849618-Sidekicks-overview

## 方案比较

### 方案 A：按画布写入 localStorage

实现最小，但会话不能随服务端画布迁移，清理浏览器数据后丢失，也不适合多设备或便携版。只可作为短时缓存，不作为权威存储。

### 方案 B：把 Agent 消息直接嵌入画布 JSON

保存和恢复路径直观，但每条消息都会放大画布自动保存载荷，并污染画布撤销快照；长会话会影响保存、恢复和节点交互性能。

### 方案 C：画布与会话分开持久化（采用）

画布仍只保存节点、连线和视口；新增独立的 Agent 会话存储，以 `board_id` 为主键。两者通过稳定画布 ID 关联。这样既能跟随画布恢复，又不会进入画布撤销和高频渲染路径。

## 产品决策

- 一张画布只有一条连续 Agent 会话。用户在同一画布继续发送，永远追加，不自动清空。
- 去掉“新任务即清空”的行为；当前顶部“新任务”入口移除，避免误删上下文。若以后需要多线程，再独立设计会话列表，不把清空伪装成新任务。
- 切换画布时自动切换到该画布的会话；回到原画布恢复完整消息和已完成步骤。
- 空白落地页首次向 Agent 发送任务时，先静默创建稳定画布 ID，再保存消息和执行节点。
- 当前选择或 `@` 引用只影响这一条请求，不永久污染整条会话；Agent 每轮仍读取最新画布摘要。

## 数据模型

新增 `data/canvas-agent-conversations.json`，每个记录结构为：

```json
{
  "boardId": "board-id",
  "conversationId": "conversation-id",
  "revision": 1,
  "items": [
    {
      "id": "item-id",
      "role": "user|assistant|notice|error|tool",
      "text": "用户可见内容",
      "status": "running|completed|failed|recoverable|stopped",
      "toolName": "create_image_node",
      "nodeId": "63",
      "createdAt": "ISO timestamp"
    }
  ],
  "handoff": {
    "summary": "面向后续模型的有界摘要",
    "recentTranscript": []
  },
  "updatedAt": "ISO timestamp"
}
```

约束：

- 权威记录在服务端；前端内存只保存当前画布会话。
- 用户可见记录最多保留 200 项；模型上下文只发送最近 24 个有效 transcript 项及有界摘要。
- 不保存图片二进制、API Key、供应商请求体、trace id 或内部报错堆栈。
- 回收站中的画布保留会话；仅永久删除画布时删除对应会话。

## API 与画布切换

新增同源接口：

- `GET /api/canvas-agent/conversation?board_id=...`：读取当前画布会话。
- `POST /api/canvas-agent/conversation`：按 `board_id + revision` 追加或更新会话。
- `DELETE /api/canvas-agent/conversation`：只在永久删除画布时调用。

画布模块在新建、恢复、切换到空白落地页时分发 `canvas:board-changed` 事件。Agent 面板使用加载序号和 `AbortController` 防止快速切换画布时旧请求覆盖新会话；加载只发生在面板内部，不阻塞画布节点恢复。

## Agent 连续上下文

每次新用户消息开启一个新的运行 `run_id`，但请求同时携带当前画布的有界 `conversation_context`：

1. 最近用户/Agent 对话。
2. 已完成工具的结果摘要和真实 `node_id`。
3. 当前实时画布摘要，包括选中与显式引用节点。
4. 上一轮未完成或可恢复状态。

消息发送后立即追加并持久化；普通完成、失败、停止和工具步骤也增量保存。刷新后运行中的步骤标记为“已中断，可继续”，而不是伪装成仍在执行。

## 工具调用可靠性

### 无状态续接

工具结果回传不再依赖上游保存的 `previous_response_id`。服务端用当前运行的受控 transcript 重建 Responses/Chat 请求：

```text
初始用户请求 + 画布摘要
→ assistant function_call
→ function_call_output（真实节点结果）
→ 下一轮模型决策
```

同一份 transcript 可发送给当前线路，也可在故障转移时发送给备用线路，避免响应 ID 与 provider 实例绑定。

### 不重复执行

- 每个工具调用用 `run_id + call_id` 记录已完成输出。
- 创建、更新、连接和排列工具在恢复时复用已有输出，不重复创建节点。
- 已提交的付费 `run_canvas_node` 不做盲重试；有确定输出就复用，无确定状态则保留节点并进入可恢复状态。

### 自动恢复顺序

1. 发现 `previous_response_id`、`call_id` 或上游会话状态不匹配时，自动改用无状态 transcript 重放“模型决策”，不重跑画布工具。
2. 当前线路仍失败时切换下一条健康且支持 tools 的线路。
3. 所有线路失败时保存 checkpoint，在对话中显示友好说明与“继续”动作；下一次继续从已完成工具结果开始。

## 用户可见错误

不再直接展示 `call_id`、trace id、HTTP 状态或英文上游错误。错误分三层：

- 自动恢复中：保持等待动画，可用无障碍文本提示“正在恢复”，不打断用户。
- 可继续：显示“节点已保留，生成服务刚才没有接上。可以从这里继续。”以及“继续”按钮。
- 需要用户处理：只在素材缺失、余额/权限、付费确认或不可确定的外部任务状态下说明具体下一步。

技术错误只写入服务端诊断记录，并使用不含密钥的内部错误码关联。

## 性能与一致性

- 会话读写独立于画布自动保存、撤销栈和渲染循环。
- 消息追加采用轻量同源 JSON 请求；保存失败时保留内存副本并在下一次消息或页面隐藏前补写。
- 会话加载不触发节点重新渲染；画布切换期间旧 Agent 运行会停止并保存 checkpoint。
- 所有 DOM 更新限制在 Agent 面板；不增加画布级轮询或动画定时器。

## 验收标准

- 同一画布连续发送三条消息，三条均可见，第二、三条请求包含前文上下文。
- 刷新页面、关闭再打开 Agent、切换到其他画布再返回后，原会话完整恢复且不会串到另一画布。
- 在空白落地页发送任务后自动获得稳定画布 ID，会话和新建节点归属于同一画布。
- 图片任务完成 `create_image_node → run_canvas_node` 全链路；模拟 Responses 状态丢失时不出现 raw `call_id` 错误，工具结果不重复执行。
- 主线路失败后备用线路可依据同一 transcript 继续；已创建节点不重复、付费任务不重复提交。
- 全部线路失败时显示可恢复提示，刷新后可从已完成步骤继续。
- 永久删除画布会删除对应会话；移入回收站与恢复不会丢失会话。
- 浏览器回归覆盖连续对话、跨画布隔离、刷新恢复、状态丢失恢复、故障转移、停止和部分成功。
- 完整静态检查、端点测试和真实浏览器验收通过。

## 体验审查结论

当前入口收起/展开和等待动画已经达到清晰、低干扰的基础水平。最高优先级风险不是视觉，而是信任：成功步骤与紧接着的英文失败提示相互矛盾；下一条消息又清空现场，使用户无法确认 Agent 是否理解和保留了工作。上述设计把“连续上下文、工具真实落地、部分成功保留、自动恢复”设为同一条可靠性链路，避免继续以单点补丁修复表象。
