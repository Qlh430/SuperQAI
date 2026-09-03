# DX OS 式 API 架构统一迁移设计

- 日期：2026-09-03
- 状态：用户已确认，可进入实施计划
- 目标项目：`Q:\音乐\Documents\New project`
- 参考实现：`F:\DXOS-Portable-0.2.0-win-x64`
- 决策：完整采用 DX OS 的 API 管理方法和行为边界，不直接复制其品牌、前端构建产物或与本项目不兼容的源文件

## 1. 背景与目标

当前项目已经能够接入多类文本、视觉、图片和视频接口，但同一份 API 配置被环境变量、系统设置、Agent 候选发现、Agent 验证、运行监测、历史健康度和图片路由分别解释。多个控制面会产生互相矛盾的模型状态，也让上游短暂超时、限流或模型列表接口不兼容被放大成系统级故障。

本次迁移把所有远程模型接入收敛为与 DX OS 相同的主链路：

```text
系统设置中的模型服务
        ↓
唯一 Provider Store（平台、模型、能力、顺序、密钥）
        ↓
统一 Capability Resolver（按任务能力选模型）
        ↓
统一 Protocol Engine（鉴权、URL、请求、解析、流式、工具调用）
        ↓
上游 API
```

聊天、Agent、视觉理解、图片生成、图片编辑、视频和音频不得再自行维护另一套平台选择或健康度排序。所有消费者只能提交“需要什么能力”，不能直接读取配置文件或 API Key。

## 2. “完全采用”的准确含义

本设计比较了三种实施方式：

1. **直接复制 DX OS 打包代码**：外观上最快，但参考项目使用 TypeScript、Vue 和自己的运行时数据结构，前端还是压缩产物；直接复制会破坏当前 CommonJS 服务、已有画布和账户系统，也可能带来许可与升级风险，因此不采用。
2. **架构和行为完全对齐，按现有技术栈重新实现**：保留 DX OS 的单一配置源、协议数据化、能力路由、顺序回退、密钥边界、按需测试和恢复策略，同时利用现有 SQLite、账户与备份系统。这是采用方案。
3. **一次性替换整个服务端**：能快速消除旧代码，但会同时影响画布、聊天、图片、视频、历史和局域网账户，无法可靠回滚，因此不采用。

“完整采用”指方案 2：最终所有模型消费者都经过统一架构，旧的 Agent 模型控制面、主动 API 监测和健康度路由全部退出；不要求把 DX OS 支持但本项目从未使用的商业平台或品牌配置原样带入。

## 3. 范围与非目标

### 3.1 本次必须完成

- 主机级唯一 Provider Catalog。
- 平台协议、模型协议、模型能力和排序。
- AES-256-GCM 本地密钥保险库。
- 密钥永不返回浏览器，只公开是否存在和掩码。
- DX OS 式协议验证、模型拉取和最小真实调用测试。
- DX OS 式严格选择与顺序自动回退。
- 聊天、Agent、视觉、图片、视频、音频统一使用能力路由。
- 取消独立“Agent 模型”和“API 监测”设置页。
- 超级管理员独占模型服务配置，普通账号只能使用管理员开放的模型目录。
- 兼容导入现有 `settings.json` 和 `.env` 平台配置。
- 备份、恢复、审计和错误脱敏。

### 3.2 不属于本次范围

- 从 DX OS 在线服务自动下载未签名协议包。
- 复制 DX OS 名称、图标、品牌资产或压缩前端代码。
- 新增当前项目从未支持的第三方商业平台。
- GPU 工作节点、多主机同步或公网部署。
- 基于历史延迟自动重排线路、熔断器和后台主动探测。

## 4. 核心架构

### 4.1 Provider Store：唯一事实源

Provider Store 是运行期平台配置的唯一读写入口。迁移完成后，业务请求不得再从 `.env`、`settings.json` 或浏览器草稿直接组装 Provider；为可恢复性而保留的旧文件不再参与运行。

在现有 `system.sqlite` 中新增：

```text
providers
  id                    TEXT PRIMARY KEY
  name                  TEXT NOT NULL
  base_url              TEXT NOT NULL
  provider_protocol     TEXT NOT NULL
  source                TEXT NOT NULL DEFAULT 'api'
  cli_tool              TEXT
  encrypted_api_key     TEXT NOT NULL DEFAULT ''
  encrypted_wallet_key  TEXT NOT NULL DEFAULT ''
  enabled               INTEGER NOT NULL DEFAULT 1
  sort_order            INTEGER NOT NULL
  capability_sort_json  TEXT NOT NULL DEFAULT '{}'
  metadata_json         TEXT NOT NULL DEFAULT '{}'
  created_at            TEXT NOT NULL
  updated_at            TEXT NOT NULL

provider_models
  provider_id           TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE
  model_id              TEXT NOT NULL
  display_name          TEXT
  model_protocol        TEXT NOT NULL
  capabilities_json     TEXT NOT NULL DEFAULT '[]'
  sort_order            INTEGER NOT NULL
  capability_sort_json  TEXT NOT NULL DEFAULT '{}'
  metadata_json         TEXT NOT NULL DEFAULT '{}'
  PRIMARY KEY(provider_id, model_id)

provider_settings
  singleton             INTEGER PRIMARY KEY CHECK(singleton = 1)
  auto_fallback         INTEGER NOT NULL DEFAULT 1
  updated_at            TEXT NOT NULL

user_preferences
  user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
  value_json            TEXT NOT NULL
  updated_at            TEXT NOT NULL
```

SQLite 使用现有 WAL、外键和 `BEGIN IMMEDIATE` 事务。保存一个平台及其模型必须在同一事务完成。公开对象只包含：平台 ID、名称、Base URL、协议、启用状态、排序、模型、`hasApiKey` 和 `apiKeyMasked`。

### 4.2 Secret Vault：服务端密钥边界

保险库文件位于 `data/security/provider-master.key`。首次启用且数据库中不存在加密密钥时，以独占创建方式生成 32 字节随机主密钥。若数据库已有加密内容而主密钥丢失，服务必须停止加载这些 Provider 并报告可恢复错误，禁止生成新密钥掩盖数据损坏。

密文格式使用带版本前缀的 AES-256-GCM：

```text
aiosenc:v1:<base64(iv[12] + authTag[16] + ciphertext)>
```

API Key 只允许在以下服务端位置出现明文：保存前的单次请求内存、解密后的单次上游调用内存。日志、审计、异常、API 响应、浏览器状态和导出文件默认不含完整密钥。

删除现有完整 Key 回显行为。编辑平台时，空 Key 或掩码表示保留旧密钥；只有显式“清除密钥”操作才删除密钥。

### 4.3 Protocol Registry 与 Protocol Engine

协议定义是数据优先的注册表。每个定义说明：

- 协议 ID、显示名称和运行时协议。
- Base URL 站点匹配规则。
- 鉴权类型、请求头和前缀。
- 模型列表端点及解析方式。
- 每项能力的 HTTP 方法、路径、请求模式、参数模板、响应路径和流式协议。
- 支持的模型能力与默认参数。
- 对复杂图片、视频或本地工作流使用的受控适配器 ID。

第一版内置覆盖当前项目实际使用的协议族：OpenAI 兼容 Chat/Responses/Tools/Vision/Images、Anthropic Messages、Gemini、APIMart/Midjourney、RunningHub、现有图片中转协议、ComfyUI 和已有视频/音频适配器。平台特殊代码只能注册为协议适配器，不能再直接进入通用聊天或 Agent 路由。

Protocol Engine 统一提供：

```js
buildRequest(provider, model, intent, input, params)
execute(provider, model, intent, input, params, options)
stream(provider, model, intent, input, params, onDelta, options)
executeWithTools(provider, model, messages, system, tools, options)
fetchModels(provider, options)
verifyProtocol(draftProvider, options)
```

URL 拼接必须去除重复的 `/v1`、`/v2`、`/v1beta` 和 `/api/v3`。所有网络调用使用 `AbortController`，上游错误正文限制长度并在输出前脱敏。流式 SSE 解析、工具调用分片合并和非流式解析只能在协议引擎实现一次。

### 4.4 Capability Resolver：统一模型选择

统一能力采用细粒度意图，例如：

```text
llm.chat
llm.chat.vision
llm.tools
image.generate
image.edit
video.generate
audio.generate
```

调用方提交：任务意图、必须全部满足的能力、至少满足其一的能力，以及可选的平台/模型偏好。Resolver 只读取 Provider Store，按模型声明能力、管理员配置的能力顺序、模型顺序和平台顺序评分。

规则固定为：

- 用户或调用方明确指定平台/模型：`strict`，不偷偷更换模型；能力不足时返回缺少能力和可选替代。
- 没有指定平台/模型：`best_available`，选择管理员排序中第一个满足能力的候选。
- 开启自动回退且请求未固定模型：执行失败后按同一确定性顺序尝试下一个兼容候选。
- 自动回退不参考历史在线率、EWMA 延迟、连续失败次数或熔断状态。
- Resolver 返回选择原因、警告和最多五个替代候选，但含密钥的内部 Route 不得传给浏览器。

### 4.5 消费者统一

- GPT 对话请求 `llm.chat`；带图片时请求 `llm.chat.vision`。
- 无限画布 Agent 请求 `llm.tools`；带视觉输入时同时请求 `llm.chat.vision`。
- 在线生图请求 `image.generate`，编辑请求 `image.edit`。
- 视频和音频使用各自能力，复杂任务由协议适配器执行。
- 当前模型列表接口从 Provider Store 生成公开目录。

Agent 可以保留工具编排、会话恢复和画布操作能力，但必须删除自己的 Provider 发现、验证、健康排名、熔断和密钥来源。图片路由可以保留尺寸、平台和模型族约束，但候选来源必须是 Capability Resolver，不得读取监测历史。

## 5. API 与权限

### 5.1 管理接口

以下接口必须通过登录和 `superadmin` 双重验证：

```text
GET    /api/providers
POST   /api/providers
GET    /api/providers/:id
POST   /api/providers/:id/enabled
DELETE /api/providers/:id
POST   /api/providers/reorder
POST   /api/providers/models/reorder
GET    /api/providers/auto-fallback
POST   /api/providers/auto-fallback
POST   /api/providers/verify-protocol
POST   /api/providers/infer-protocols
POST   /api/providers/models
POST   /api/providers/test
POST   /api/providers/test-image
POST   /api/providers/test-video
POST   /api/providers/test-audio
POST   /api/providers/test-vision
GET    /api/protocols
```

普通账号使用 `/api/models`、`/api/vision-models` 和 `/api/image-models` 获取管理员已启用的公开模型目录。这些响应不包含 Base URL、协议内部参数或密钥掩码，防止普通账号推断主机凭据结构。

### 5.2 设置拆分

- 用户偏好：主题、动画、画布偏好，按账号写入 `user_preferences`。
- 主机设置：网络、自动启动、备份，只允许超级管理员修改。
- 模型服务：Provider、协议、模型和排序，只允许超级管理员查看和修改。

迁移期保留 `/api/settings` 作为兼容聚合接口，但它只返回当前账号有权看到的字段。旧 `/api/settings/providers/*` 路由逐步转发到新服务并强制超级管理员权限；完整 Key 回显接口在新设置页切换完成后返回 `410 Gone`。

所有平台增删改、启停、排序、密钥更新、导入和自动回退修改写入现有 `audit_events`，审计详情只记录平台 ID 和变更字段名，不记录旧值或新密钥。

## 6. 模型服务界面

系统设置应用保留给所有账号，但按角色展示栏目：

### 普通账号

- 外观
- 画布偏好
- 隐私与安全
- 系统信息

### 超级管理员额外栏目

- APP 权限
- 磁盘与备份
- 模型服务

“模型服务”完全采用 DX OS 的 Provider 中心交互：左侧平台列表和顺序，右侧单个平台编辑器。编辑器包含名称、启用状态、Base URL、平台协议、API Key 掩码、验证协议、拉取模型、模型能力、模型协议、排序、保存和删除。

删除独立“Agent 模型”和“API 监测”栏目。Agent 使用统一模型排序；连接状态仅在用户主动执行验证、拉模型或测试时显示本次结果。系统不再每五分钟主动扫描所有平台。

## 7. 数据迁移与回滚

迁移以数据库 schema version 2 执行，流程如下：

1. 创建迁移前备份，校验 `system.sqlite` 和数据文件清单。
2. 在事务中创建 Provider、模型、Provider 设置和用户偏好表。
3. 读取现有 `settings.json` Provider；再读取当前有效环境变量 Provider 作为一次性导入来源。
4. 使用标准化 Base URL 和密钥指纹去重，保留设置页的名称、模型能力与顺序，补充环境变量中存在但设置页未保存的平台。
5. 加密所有密钥后写入 SQLite。
6. 读取回校验每个平台和模型数量；执行数据库 `quick_check`。
7. 写入迁移完成标记。此后运行时不再把 `.env` 当作 Provider 配置来源。

迁移不修改或删除 `.env`、旧 `settings.json`、旧监测历史和 Agent 路由历史。它们保留为只读回滚材料。只有新架构完成全量验证后，旧代码停止读取这些文件；清理文件需要单独、明确的用户授权。

迁移必须幂等：重复启动不会重复导入、生成重复平台或改变管理员排序。任一步失败都回滚数据库事务并继续使用旧运行路径，不能留下半迁移状态。

## 8. 备份与恢复

主密钥放在现有 `data/` 根目录下，因此当前备份遍历会将其包含在 `data/security/` 中。备份验证增加一致性规则：只要快照数据库中存在非空加密密钥，快照必须包含主密钥且长度正确，否则快照无效。

恢复顺序为：验证全部 SHA-256、创建恢复前快照、关闭数据库、恢复数据库和数据目录、删除 WAL/SHM、重新启动。启动时先加载主密钥并验证一条加密记录，再开放模型相关接口。

导出 Provider 默认不包含密钥。若未来允许管理员导出密钥，必须使用单独加密导出格式和二次确认；该能力不在本次实现中。

## 9. 错误处理与诊断

- 没有可用模型：提示超级管理员先配置并启用平台。
- 指定模型能力不足：返回缺少能力和替代候选，不自动换模型。
- 协议验证失败：返回逐个尝试的协议、延迟和截断后的错误。
- 上游超时：明确区分连接超时、首事件超时和总超时，但不建立长期健康状态。
- 密钥无法解密：平台禁用并提示从包含主密钥的备份恢复。
- 配置写入失败：事务回滚，旧配置继续有效。
- 日志过滤 `Authorization`、Bearer Token、API Key、Secret、Password 和 Cookie。

保留进程内存、主机健康、任务队列和通用网络错误诊断；删除 Provider 在线率趋势、余额主动抓取、历史延迟排名和 Agent 路由健康看板。

## 10. 实施切片

迁移按可独立验证的顺序执行：

1. **Provider 基础层**：SQLite schema、Secret Vault、Provider Store、迁移器、备份一致性和超级管理员权限。
2. **协议与路由层**：Protocol Registry、Protocol Engine、Capability Resolver、按需验证和公开模型目录。
3. **消费者迁移**：聊天、Agent、视觉、图片，再迁移视频与音频；每迁移一个消费者就用兼容测试对比旧行为。
4. **设置界面与收尾**：DX OS 式模型服务界面、个人偏好拆分、移除 Agent 模型与 API 监测页面，停用旧状态文件读取。

每个切片均采用测试先行。没有通过本切片的兼容性和权限测试，不进入下一切片。

## 11. 测试策略

### 11.1 单元检查

- Secret Vault：随机 IV、正确解密、篡改失败、错误主密钥失败、空值处理。
- Provider Store：事务保存、保留密钥、显式清除、级联删除、掩码、排序和权限无关的纯数据行为。
- Protocol Engine：URL 去重、鉴权头、三类文本协议请求体与解析、SSE 分片、工具调用、模型列表容错和错误脱敏。
- Capability Resolver：严格选择、最佳可用、能力缺失、管理员排序、顺序回退和禁用平台。
- 迁移器：设置 Provider、环境 Provider、重复数据、重复运行、损坏输入和回滚。

### 11.2 服务端检查

- 普通账号访问所有 Provider 管理接口均为 403。
- 超级管理员可增删改、验证、拉模型和测试。
- 任何响应均不出现完整密钥。
- `/api/models` 只包含启用且具备对应能力的模型。
- 用户固定模型时不回退；默认模型失败时按配置顺序回退。
- 聊天和 Agent 对同一能力请求得到同一首选候选。
- 备份缺少主密钥时验证失败；完整快照恢复后密钥可解密。

### 11.3 浏览器检查

- 超级管理员在系统设置中完成添加平台、验证协议、拉取模型、设置能力、保存和测试。
- 普通账号看不到模型服务栏目，直接请求也被拒绝。
- API Key 编辑时只显示掩码，网络响应不含完整密钥。
- “Agent 模型”和“API 监测”栏目不存在。
- 浅色、深色和跟随系统按账号保存。
- 配置一个平台后，GPT 对话、Agent 和无限画布生成共用该平台目录。

## 12. 验收标准

1. 最终运行期代码只有 Provider Store 可以持久化或读取模型平台密钥；保留但停用的旧配置文件不参与运行。
2. 全项目只有 Protocol Engine 构造远程模型请求和解析通用协议响应；复杂平台只能通过注册适配器进入。
3. 聊天、Agent、视觉、图片、视频和音频全部通过 Capability Resolver 获取候选。
4. 不再存在后台 Provider 定时扫描、EWMA 排名、Provider 熔断或独立 Agent 候选验证。
5. 超级管理员可以完成 DX OS 式平台配置流程，普通账号无法查看或修改平台配置。
6. 数据库、主密钥、账户、共享、画布和聊天可以作为同一快照备份并恢复。
7. 现有用户数据和旧配置在迁移中不被删除，迁移失败可回到旧路径。
8. 所有专项测试、现有 AI OS 测试和浏览器冒烟通过后，才宣布迁移完成。

本规格是此次完整迁移的唯一架构依据。后续实现计划必须逐条映射以上验收标准，任何改变单一配置源、密钥边界、统一路由或超级管理员权限的实现都必须先修改并重新确认本规格。
