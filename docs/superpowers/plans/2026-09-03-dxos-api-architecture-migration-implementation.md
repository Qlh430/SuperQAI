# DX OS 式 API 架构统一迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有账户、画布、聊天和媒体数据的前提下，把 API 提供商、模型能力、协议适配、回退与诊断收敛为一套与 DX OS 行为一致的稳定架构。

**Architecture:** SQLite Provider Store 是运行期唯一事实源；Secret Vault 只在服务端解密密钥；Protocol Registry/Engine 统一协议差异；Capability Resolver 只按能力、启用状态和人工顺序做确定性选择。聊天、Agent、视觉、图片、视频和音频全部通过同一 Executor，旧环境变量/设置仅用于一次性迁移，历史健康度不再参与路由。

**Tech Stack:** Node.js 24 CommonJS、`node:sqlite`、原生 HTTP 服务、原生 HTML/CSS/JavaScript、`node:assert/strict` 可执行检查、Electron 44。

## Global Constraints

- 参考目录 `F:\DXOS-Portable-0.2.0-win-x64` 只读；采用其架构边界，不复制品牌、压缩前端或不兼容运行时代码。
- 工作树已有大量用户修改。每个提交只能暂存该任务明确列出的文件，提交前必须运行 `git diff --cached --name-only`。
- 所有新功能严格执行 red-green-refactor：先加入能因缺少行为而失败的检查，观察失败，再写最少实现。
- 不记录真实 API Key、Authorization 请求头、完整上游响应或用户提示词；测试一律用假密钥和注入式 `fetch`。
- 兼容优先：旧源在迁移期间保留但不可成为新运行时事实源；仅在最终验证通过后关闭旧入口。
- 普通账号只能读取脱敏模型目录和自己的外观偏好；提供商增删改、明文密钥、排序、测试与模型同步均为超级管理员权限。
- 每个任务结束都更新本计划对应复选框和 `.planning/dxos_api_architecture/progress.md`。`.planning` 只作本机恢复记忆；已跟踪的实施计划在最终文档提交一并暂存。

---

## Task 1: 建立本地 Secret Vault

**Files:**

- Create: `provider-secret-vault.js`
- Create: `tools/check-provider-secret-vault.js`
- Modify: `package.json`

**Public interface:**

```js
createProviderSecretVault({
  dataDir,
  keyFile,
  randomBytesImpl
}) => {
  encrypt(plainText),
  decrypt(envelope),
  isEncrypted(value),
  mask(secret),
  assertReady({ encryptedSecretCount }),
  keyFile
}
```

- [x] **Step 1: Write the failing vault check**

在 `tools/check-provider-secret-vault.js` 使用临时目录和假密钥，覆盖随机 IV、认证解密、篡改拒绝、缺失主密钥保护和掩码：

```js
const assert = require("node:assert/strict");
const { createProviderSecretVault } = require("../provider-secret-vault");

const first = vault.encrypt("sk-test-secret");
const second = vault.encrypt("sk-test-secret");
assert.notEqual(first, second);
assert.equal(vault.decrypt(first), "sk-test-secret");
assert.throws(() => vault.decrypt(first.slice(0, -1) + "A"));
assert.throws(() => vaultWithWrongMasterKey.decrypt(first));
assert.equal(vault.mask("sk-test-secret"), "sk-t••••cret");
assert.throws(() => missingKeyVault.assertReady({ encryptedSecretCount: 1 }));
```

- [x] **Step 2: Run the check and confirm RED**

Run: `node tools/check-provider-secret-vault.js`
Expected: FAIL with `Cannot find module '../provider-secret-vault'`.

- [x] **Step 3: Implement the smallest secure vault**

使用 AES-256-GCM；主密钥为 `data/security/provider-master.key` 中的 32 个随机字节。密文格式固定为：

```text
aiosenc:v1:<base64(iv[12] + authTag[16] + ciphertext)>
```

首次写入明文前创建主密钥；发现已有密文但主密钥缺失时必须锁定 Provider 子系统并拒绝开放模型相关接口，不能生成新密钥覆盖；桌面、账户和文件等非模型功能仍可进入并显示可恢复错误。私钥文件通过独占创建或临时文件加原子重命名安全落盘。

- [x] **Step 4: Run focused verification and confirm GREEN**

Run: `node --check provider-secret-vault.js`
Run: `node tools/check-provider-secret-vault.js`
Expected: both PASS; stdout contains no `sk-test-secret`.

- [x] **Step 5: Commit**

```powershell
git add -- provider-secret-vault.js tools/check-provider-secret-vault.js package.json
git diff --cached --name-only
git commit -m "feat: add encrypted provider secret vault"
```

---

## Task 2: 把 Provider Records 放入 SQLite 唯一事实源

**Files:**

- Modify: `system-db.js`
- Create: `provider-store.js`
- Create: `tools/check-provider-store.js`
- Modify: `tools/check-system-db.js`
- Modify: `package.json`

**Database interface added to `system-db.js`:**

```js
listProviderRecords()
getProviderRecord(providerId)
saveProviderRecord(provider)
deleteProviderRecord(providerId)
reorderProviderRecords(providerIds)
reorderProviderModelRecords(providerId, modelIds)
getProviderSettings()
setProviderSettings(patch)
hasEncryptedProviderSecrets()
getUserPreferences(userId)
setUserPreferences(userId, patch)
```

**Provider Store interface:**

```js
createProviderStore({ db, vault }) => {
  listPublic(),
  getPublic(providerId),
  reveal(providerId),
  validateSecrets(),
  listInternal(),
  save(input),
  setEnabled(providerId, enabled),
  remove(providerId),
  reorderProviders(providerIds),
  reorderModels(providerId, modelIds),
  getAutoFallback(),
  setAutoFallback(enabled),
  publicModelsForCapability(capability)
}
```

- [x] **Step 1: Write failing schema/store checks**

在临时数据库中创建两个提供商和模型，验证加密落库、公开输出脱敏、排序稳定、能力过滤、用户偏好隔离，以及更新时空密钥不覆盖旧密钥：

```js
const saved = store.save({
  id: "openai-main",
  name: "OpenAI",
  baseUrl: "https://api.example.test",
  protocol: "openai",
  apiKey: "sk-private",
  walletKey: "wallet-private",
  models: [{ id: "gpt-test", capabilities: ["chat", "tools"] }]
});
assert.equal(saved.apiKey, undefined);
assert.equal(db.getProviderRecord("openai-main").secret.startsWith("aiosenc:v1:"), true);
store.save({ id: "openai-main", name: "Renamed", apiKey: "" });
assert.equal(store.reveal("openai-main").apiKey, "sk-private");
store.save({ id: "openai-main", clearWalletKey: true });
assert.equal(store.reveal("openai-main").walletKey, "");
assert.notDeepEqual(db.getUserPreferences("u1"), db.getUserPreferences("u2"));
```

- [x] **Step 2: Run the checks and confirm RED**

Run: `node --disable-warning=ExperimentalWarning tools/check-provider-store.js`
Expected: FAIL because Provider Store and schema v2 APIs do not exist.

- [x] **Step 3: Implement schema v2 and transaction-backed store**

新增 `providers`、`provider_models`、`provider_settings`、`user_preferences` 表及设计规格列：包括 provider/model 的 `sort_order`、`capability_sort_json`、协议、元数据、`encrypted_api_key` 和 `encrypted_wallet_key`；所有增删改与排序使用事务。Provider Store 是唯一能调用 Vault 明文解密的模块。空字符串、缺失字段或掩码值表示“保留现有密钥”，只有 `clearApiKey: true` / `clearWalletKey: true` 才删除对应密钥。`validateSecrets()` 在隔离的单条密文损坏时禁用该 Provider 并返回脱敏诊断。检查还覆盖显式清除、模型级联删除和事务失败时整单回滚。

- [x] **Step 4: Run focused and existing database checks**

Run: `node --disable-warning=ExperimentalWarning tools/check-provider-store.js`
Run: `npm run check:system`
Expected: PASS; v1 数据库可迁移为 v2，重复打开保持幂等。

- [x] **Step 5: Commit**

```powershell
git add -- system-db.js provider-store.js tools/check-provider-store.js tools/check-system-db.js package.json
git diff --cached --name-only
git commit -m "feat: add sqlite provider store"
```

---

## Task 3: 一次性迁移旧配置并保证密钥可恢复

**Files:**

- Create: `provider-migration.js`
- Create: `tools/check-provider-migration.js`
- Modify: `system-db.js`
- Modify: `backup-service.js`
- Modify: `tools/check-backup-service.js`
- Modify: `package.json`

**Migration interface:**

```js
migrateLegacyProviders({
  db,
  store,
  settingsProviders,
  environmentProviders,
  createSnapshot
}) => {
  migrated,
  skipped,
  providerIds,
  snapshotId
}
```

- [x] **Step 1: Write failing migration and recovery checks**

覆盖：首次迁移、重复运行不重复、`settings.json` 优先但合并环境变量模型、相同 URL+密钥去重、旧能力标签转换、旧文件不删除、快照仅创建一次、损坏输入和中途写入异常触发事务回滚。备份检查需断言：只要数据库中有 `aiosenc:v1` 密文，备份必须包含 32 字节主密钥；否则恢复校验失败。恢复检查覆盖 SHA-256 校验、恢复前快照、关闭数据库、恢复数据库和数据目录、删除 WAL/SHM 后重新打开。

```js
const first = migrateLegacyProviders(fixture);
const second = migrateLegacyProviders(fixture);
assert.equal(first.migrated > 0, true);
assert.equal(second.migrated, 0);
assert.equal(snapshotCalls, 1);
assert.equal(store.listInternal().length, 1);
assert.throws(() => verifyBackupBundle(backupWithoutMasterKey));
```

- [x] **Step 2: Run the checks and confirm RED**

Run: `node --disable-warning=ExperimentalWarning tools/check-provider-migration.js`
Run: `npm run check:backup`
Expected: migration check FAIL; existing backup tests remain green before their new assertion is enabled.

- [x] **Step 3: Implement compatibility-first migration**

使用系统设置标记 `providers.migration.v1` 保证幂等。导入前调用现有备份服务创建快照；以规范化 Base URL 加 API Key SHA-256 指纹去重，禁止在日志中输出指纹原文。`settings.json` 的显式字段优先，环境变量只补缺失字段和模型。保留旧文件用于回滚，但新运行时不得再次读取。

迁移任一步失败时回滚整个事务、不写成功标记，并在最终切换前继续使用兼容旧路径；只有成功标记写入后，新运行时才停止读取旧配置源。

扩展备份清单和恢复验证：Vault 主密钥与数据库必须作为同一恢复单元；数据库含密文而密钥缺失、长度错误或不可读时直接拒绝恢复。恢复顺序固定为校验清单与 SHA-256、创建恢复前快照、关闭数据库、恢复 SQLite 和数据目录、移除 WAL/SHM、重开数据库并抽样解密一条记录。

- [x] **Step 4: Run focused verification**

Run: `node --disable-warning=ExperimentalWarning tools/check-provider-migration.js`
Run: `npm run check:backup`
Expected: PASS，且临时目录中的旧配置文件仍存在。

- [x] **Step 5: Commit**

```powershell
git add -- provider-migration.js backup-service.js tools/check-provider-migration.js tools/check-backup-service.js package.json
git diff --cached --name-only
git commit -m "feat: migrate legacy providers safely"
```

---

## Task 4: 建立数据化 Protocol Registry 与统一 Engine

**Files:**

- Create: `provider-protocol-registry.js`
- Create: `provider-protocol-engine.js`
- Create: `tools/check-provider-protocol-registry.js`
- Create: `tools/check-provider-protocol-engine.js`
- Modify: `package.json`

**Registry interface:**

```js
createProtocolRegistry() => {
  get(protocolId),
  listPublic(),
  candidatesForBaseUrl(baseUrl),
  inferModelProtocol(model),
  getAdapter(protocolId)
}
```

**Engine interface:**

```js
createProtocolEngine({ registry, fetchImpl, outboundFetch }) => {
  buildRequest(provider, model, intent, input, params),
  execute(provider, model, intent, input, params, options),
  stream(provider, model, intent, input, params, onDelta, options),
  executeWithTools(provider, model, messages, system, tools, options),
  fetchModels(provider, options),
  verifyProtocol(draftProvider, options)
}
```

- [x] **Step 1: Write failing contract checks**

用注入的假 `fetch` 覆盖当前实际需要的协议族：OpenAI-compatible Chat/Responses/SSE/Tools/Vision/Images、Anthropic Messages、Gemini generateContent，以及 APIMart/Midjourney、RunningHub、现有图片中转、ComfyUI 和已有视频/音频特殊适配器。断言 URL 规范化不会生成重复 `/v1/v1`、`/v2/v2`、`/v1beta/v1beta` 或 `/api/v3/api/v3`，鉴权头正确，SSE 增量与工具调用统一成内部事件，模型列表不可用时能按候选协议顺序验证。

```js
const model = { id: "gpt-test", protocol: "openai" };
const input = { messages: [{ role: "user", content: "hi" }] };
const request = engine.buildRequest(provider, model, "llm.chat", input, {});
assert.equal(request.url, "https://api.example.test/v1/chat/completions");
assert.equal(request.headers.authorization, "Bearer sk-test");
assert.deepEqual(await engine.execute(provider, model, "llm.chat", input, {}, {}), { text: "ok", usage: null });
```

- [x] **Step 2: Run the checks and confirm RED**

Run: `node tools/check-provider-protocol-registry.js`
Run: `node tools/check-provider-protocol-engine.js`
Expected: both FAIL because the registry and engine are absent.

- [x] **Step 3: Implement pure adapters and one network boundary**

协议定义只描述端点、鉴权、请求构造、响应解析、SSE、工具调用和模型列表解析；只有 Engine 可以发起模型上游请求。所有网络调用经过现有 `outbound-fetch.js` 安全边界并使用 `AbortController`，分别报告连接、首事件和总超时；上游错误正文先截断再脱敏。`verifyProtocol` 是管理员点击触发的串行探测，不创建定时器、不写路由健康权重。

引擎抛出统一错误：

```js
{
  code: "UPSTREAM_AUTH" | "UPSTREAM_RATE_LIMIT" | "UPSTREAM_TIMEOUT" |
        "UPSTREAM_PROTOCOL" | "UPSTREAM_UNAVAILABLE",
  providerId,
  modelId,
  retryable,
  safeMessage
}
```

- [x] **Step 4: Run focused verification**

Run: `node --check provider-protocol-registry.js`
Run: `node --check provider-protocol-engine.js`
Run: `node tools/check-provider-protocol-registry.js`
Run: `node tools/check-provider-protocol-engine.js`
Expected: PASS; captured requests and errors contain no full secret.

- [x] **Step 5: Commit**

```powershell
git add -- provider-protocol-registry.js provider-protocol-engine.js tools/check-provider-protocol-registry.js tools/check-provider-protocol-engine.js package.json
git diff --cached --name-only
git commit -m "feat: add unified provider protocol engine"
```

---

## Task 5: 用 Capability Resolver 和 Executor 统一确定性路由

**Files:**

- Create: `model-capabilities.js`
- Create: `provider-capability-resolver.js`
- Create: `provider-executor.js`
- Create: `tools/check-provider-capability-resolver.js`
- Create: `tools/check-provider-executor.js`
- Modify: `package.json`

**Capability vocabulary:**

```js
const MODEL_CAPABILITIES = [
  "llm.chat", "llm.chat.vision", "llm.tools", "image.generate",
  "image.edit", "video.generate", "audio.generate"
];
```

**Resolver/Executor interface:**

```js
createCapabilityResolver({ store }) => {
  resolve({ intent, mustAll, anyOf, preferredProviderId, preferredModelId }),
  listCandidates({ intent, mustAll, anyOf, preferredProviderId, preferredModelId })
}

createProviderExecutor({ resolver, engine }) => {
  execute(request),
  stream(request, onDelta),
  executeWithTools(request, tools)
}
```

- [x] **Step 1: Write failing deterministic-routing checks**

构造两个启用提供商和一个禁用提供商。测试人工顺序、模型顺序、能力匹配、固定 provider/model 的严格失败、未固定请求的顺序回退，以及历史指标变化不影响候选次序。

```js
assert.deepEqual(
  resolver.listCandidates({ intent: "llm.tools", mustAll: ["llm.tools"] }).map((item) => item.model.id),
  ["primary-tools", "secondary-tools"]
);
assert.throws(
  () => resolver.resolve({ intent: "llm.chat.vision", mustAll: ["llm.chat.vision"], preferredProviderId: "text-only" }),
  { code: "PINNED_MODEL_UNAVAILABLE" }
);
metrics.primary = { errorRate: 1 };
assert.equal(resolver.resolve({ intent: "llm.chat", mustAll: ["llm.chat"] }).model.id, "primary-chat");
```

Executor 检查：只有未固定请求且 `autoFallback` 开启时才按候选顺序尝试；每次失败均生成脱敏尝试摘要；流式响应一旦已向客户端发出第一个 delta，就不得切换模型。

- [x] **Step 2: Run and confirm RED**

Run: `node tools/check-provider-capability-resolver.js`
Run: `node tools/check-provider-executor.js`
Expected: FAIL because resolver/executor modules do not exist.

- [x] **Step 3: Implement deterministic selection and request-scoped fallback**

排序键仅允许管理员配置的能力顺序、`provider.sortOrder`、`model.sortOrder` 和稳定 ID；禁止引入成功率、延迟、最后故障、EWMA、熔断状态或随机数。Resolver 返回选择原因、警告和最多五个脱敏替代候选。固定 provider/model 时只验证该目标并原样报告安全错误；未固定时由 Executor 依相同确定顺序回退，并把每次尝试写入被动审计摘要。

- [x] **Step 4: Run focused verification**

Run: `node --check model-capabilities.js`
Run: `node --check provider-capability-resolver.js`
Run: `node --check provider-executor.js`
Run: `node tools/check-provider-capability-resolver.js`
Run: `node tools/check-provider-executor.js`
Expected: PASS and repeated runs produce identical candidate order.

- [x] **Step 5: Commit**

```powershell
git add -- model-capabilities.js provider-capability-resolver.js provider-executor.js tools/check-provider-capability-resolver.js tools/check-provider-executor.js package.json
git diff --cached --name-only
git commit -m "feat: add deterministic capability routing"
```

---

## Task 6: 接入超级管理员 Provider HTTP API

**Files:**

- Create: `provider-http-api.js`
- Create: `tools/check-provider-http-api.js`
- Modify: `server.js`
- Modify: `package.json`

**Administrative endpoints:**

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

- [x] **Step 1: Write failing authorization and redaction checks**

用现有鉴权 fixture 分别模拟未登录、普通用户和超级管理员。对每条管理路由独立断言：未登录为 401，普通用户为 403，超级管理员可用；列表、保存、测试、同步和错误响应均没有完整密钥。

```js
for (const route of providerAdminRoutes) {
  assert.equal((await requestAs(null, route)).status, 401);
  assert.equal((await requestAs(ordinaryUser, route)).status, 403);
}
const body = await requestAs(superadmin, listProviders);
assert.equal(JSON.stringify(body).includes("sk-private"), false);
```

还要断言旧 `/api/settings/providers/key` 不再向任何浏览器返回完整 key。

- [x] **Step 2: Run and confirm RED**

Run: `node --disable-warning=ExperimentalWarning tools/check-provider-http-api.js`
Expected: FAIL because routes or role gates are missing.

- [x] **Step 3: Add the controller and compose services at startup**

`provider-http-api.js` 只接收已认证请求、校验 DTO、调用 Store/Engine，并输出脱敏对象。Provider 保存采用同一个 `POST /api/providers` upsert 契约；模型拉取与排序在请求体中携带 providerId。每个 route handler 自身调用：

```js
requireSignedIn(req);
requireRole(req, "superadmin");
```

`server.js` 在 `systemDb.migrate()` 后依次创建 Vault、Store、Migration、Registry、Engine、Resolver、Executor，再注册路由。只有 Vault 就绪且 `store.validateSecrets()` 至少验证一条已有加密记录后才开放模型相关接口；单条损坏禁用对应 Provider，缺少主密钥则锁定整个 Provider 子系统并返回可恢复错误。迁移失败且尚未最终切换时继续兼容旧路径。审计日志只记录 providerId、动作和变更字段名；检查断言审计中没有旧值、新值和密钥。兼容期的旧 provider 修改路由也必须加超级管理员门禁。

- [x] **Step 4: Run focused and auth regression checks**

Run: `node --check provider-http-api.js`
Run: `node --check server.js`
Run: `node --disable-warning=ExperimentalWarning tools/check-provider-http-api.js`
Run: `npm run check:auth`
Expected: PASS; response/log capture contains no test key.

- [x] **Step 5: Commit**

```powershell
git add -- provider-http-api.js server.js tools/check-provider-http-api.js package.json
git diff --cached --name-only
git commit -m "feat: add superadmin provider API"
```

---

## Task 7: 把模型目录与聊天切到统一 Executor

**Files:**

- Create: `tools/check-unified-chat-provider.js`
- Modify: `server.js`
- Modify: `script.js`
- Modify: `package.json`

**Public catalog endpoints:**

```text
GET /api/models
GET /api/vision-models
GET /api/image-models
```

- [x] **Step 1: Write failing catalog/chat integration check**

启动注入假 Store/Executor 的服务器，断言：

```js
assert.deepEqual(
  (await getJson("/api/models")).models.map((item) => item.id),
  ["chat-primary", "chat-secondary"]
);
assert.equal((await postJson("/api/chat", { prompt: "hello" })).text, "executor reply");
assert.equal(fakeExecutor.calls[0].intent, "llm.chat");
assert.equal(JSON.stringify(await getJson("/api/models")).includes("apiKey"), false);
```

再给旧监测历史文件写入“主模型失败”，断言目录顺序和聊天首选仍不改变；固定模型请求失败时不得自动换模型。

- [x] **Step 2: Run and confirm RED**

Run: `node --disable-warning=ExperimentalWarning tools/check-unified-chat-provider.js`
Expected: FAIL because current catalog/chat still read legacy configuration or routing state.

- [x] **Step 3: Replace catalog and chat data sources**

`/api/models` 等端点只调用 `store.publicModelsForCapability`，并且不得向普通账号返回 Base URL、协议内部参数或密钥掩码。`handleChat` 对纯文本使用 `llm.chat`，对图片输入使用 `llm.chat.vision`，把用户消息、系统提示、附件摘要、固定 provider/model 选择交给 Executor，保留当前前端需要的响应字段和流式事件名称。`script.js` 不再获取/保存 API Key，也不解释 provider 健康状态。

- [x] **Step 4: Run focused and chat regressions**

Run: `node --check server.js`
Run: `node --check script.js`
Run: `node --disable-warning=ExperimentalWarning tools/check-unified-chat-provider.js`
Run: `node tools/check-chat-history-management.js`
Expected: PASS;现有聊天历史行为保持不变。

- [x] **Step 5: Commit**

```powershell
git add -- server.js script.js tools/check-unified-chat-provider.js package.json
git diff --cached --name-only
git commit -m "refactor: route chat through provider executor"
```

---

## Task 8: 把 Canvas Agent 切到同一能力路由

**Files:**

- Create: `canvas-agent-provider-bridge.js`
- Create: `tools/check-canvas-agent-provider-bridge.js`
- Modify: `canvas-agent-router.js`
- Modify: `canvas-agent-llm-connectors.js`
- Modify: `canvas-agent-runtime.js`
- Modify: `server.js`
- Modify: `tools/check-live-agent-model-coherence.js`
- Modify: `package.json`

**Bridge interface:**

```js
createCanvasAgentProviderBridge({ executor }) => {
  runTurn({
    messages,
    tools,
    needsVision,
    providerId,
    modelId,
    signal,
    onDelta
  })
}
```

- [x] **Step 1: Write failing Agent bridge and coherence checks**

测试文本 Agent 请求提交 `chat + tools`，含图片请求增加 `vision`，取消信号可传递，固定模型严格失败，未固定模型按 Store 顺序回退。修改现有 coherence 检查，使 Agent 与聊天看到同一模型目录和顺序：

```js
await bridge.runTurn({ messages, tools, needsVision: true });
assert.equal(executor.calls[0].intent, "llm.tools");
assert.deepEqual(executor.calls[0].mustAll.sort(), ["llm.chat.vision", "llm.tools"]);
assert.equal(agentCatalog[0].id, chatCatalog[0].id);
```

检查还必须扫描运行路径，证明 `canvas-agent-verification.js`、历史 EWMA、circuit/half-open 状态不会决定候选资格或次序。

- [x] **Step 2: Run and confirm RED**

Run: `node tools/check-canvas-agent-provider-bridge.js`
Run: `node tools/check-live-agent-model-coherence.js`
Expected: FAIL because Agent still owns discovery/verification/health routing.

- [x] **Step 3: Route Agent turns through the bridge**

保留 Agent 的工具编排、MCP、会话、取消和 UI 事件；删除其模型发现、API 验证、健康排序、熔断和半开探测的运行期依赖。`canvas-agent-router.js` 仅负责把任务需求翻译成能力集合；`canvas-agent-llm-connectors.js` 变为兼容桥或被 Bridge 替代。

- [x] **Step 4: Run focused and Agent regression checks**

Run: `node --check canvas-agent-provider-bridge.js`
Run: `node tools/check-canvas-agent-provider-bridge.js`
Run: `node tools/check-live-agent-model-coherence.js`
Run: `node tools/check-canvas-agent-core.js`
Run: `node tools/check-canvas-agent-runtime.js`
Run: `node tools/check-canvas-agent-conversation-endpoint.js`
Run: `node tools/check-canvas-agent-endpoint.js`
Expected: PASS;工具调用、会话和取消行为保持不变。

- [x] **Step 5: Commit**

```powershell
git add -- canvas-agent-provider-bridge.js canvas-agent-router.js canvas-agent-llm-connectors.js canvas-agent-runtime.js server.js tools/check-canvas-agent-provider-bridge.js tools/check-live-agent-model-coherence.js package.json
git diff --cached --name-only
git commit -m "refactor: route canvas agent through provider executor"
```

---

## Task 9: 把图片、视频和音频统一为媒体能力请求

**Files:**

- Create: `media-provider-bridge.js`
- Create: `tools/check-media-provider-bridge.js`
- Modify: `image-model-routing.js`
- Modify: `image-job-manager.js`
- Modify: `server.js`
- Modify: `package.json`

**Media bridge interface:**

```js
createMediaProviderBridge({ executor, adapters }) => {
  generateImage(input),
  editImage(input),
  generateVideo(input),
  generateAudio(input)
}
```

- [x] **Step 1: Write failing media routing checks**

覆盖每类能力、固定目标、未固定回退、输入校验和现有作业队列契约。现有 MiniMax、APIMart、Gemini 等特殊实现注册为 Protocol Engine adapter，不允许继续独立读取环境变量或监测历史：

```js
await bridge.generateImage({ prompt: "tree", size: "1024x1024" });
assert.equal(executor.calls[0].intent, "image.generate");
await bridge.editImage({ prompt: "autumn", inputImages: ["data:image/png;base64,AA=="] });
assert.equal(executor.calls[1].intent, "image.edit");
```

- [x] **Step 2: Run and confirm RED**

Run: `node tools/check-media-provider-bridge.js`
Run: `node tools/check-image-model-routing.js`
Expected: new bridge check FAIL; legacy routing check identifies direct configuration paths to replace.

- [x] **Step 3: Introduce the bridge without changing job semantics**

`image-job-manager.js` 继续负责排队、状态、取消和结果持久化，但模型选择交给 Media Bridge。`image-model-routing.js` 可以保留尺寸、平台和模型族约束及旧输入转换，但候选只来自 Resolver，不再读取监测历史。视频使用 `video.generate`，音频使用 `audio.generate`；若当前无对应 UI，仍提供统一 Bridge/协议能力，不能创建第二套配置。

- [x] **Step 4: Run focused and media regressions**

Run: `node --check media-provider-bridge.js`
Run: `node --check image-model-routing.js`
Run: `node tools/check-media-provider-bridge.js`
Run: `npm run check:image-jobs`
Run: `node tools/check-image-model-revision.js`
Run: `node tools/check-canvas-agent-image-failover.js`
Expected: PASS;作业 ID、进度、恢复和结果格式不变。

- [x] **Step 5: Commit**

```powershell
git add -- media-provider-bridge.js image-model-routing.js image-job-manager.js server.js tools/check-media-provider-bridge.js package.json
git diff --cached --name-only
git commit -m "refactor: unify media provider routing"
```

---

## Task 10: 在系统设置实现 DX OS 风格的模型服务与个人外观

**Files:**

- Create: `system-settings-ui.js`
- Create: `system-settings.css`
- Create: `tools/check-system-settings-ui.js`
- Modify: `index.html`
- Modify: `desktop-shell.js`
- Modify: `server.js`
- Modify: `script.js`
- Modify: `package.json`

**Preference endpoints:**

```text
GET   /api/preferences
PATCH /api/preferences
```

只允许当前用户的：

```js
{
  appearance: {
    theme: "light" | "dark" | "system",
    scale: 0.75 | 1 | 1.25 | 1.5 | 1.75,
    animations: "full" | "reduced"
  },
  canvas: { theme: "light" | "dark" | "system" }
}
```

- [x] **Step 1: Write failing DOM/API permission checks**

静态 DOM 检查与浏览器 fixture 覆盖：

```js
assert.equal(settingsFor(ordinaryUser).querySelector("[data-settings-section='providers']"), null);
assert.ok(settingsFor(superadmin).querySelector("[data-settings-section='providers']"));
assert.equal(document.body.dataset.theme, "dark");
assert.equal(networkRequests.some((url) => url.includes("/providers/key")), false);
```

服务端检查断言普通用户只能读写自己的偏好，无法修改其他 userId 或主机设置；网络、自动启动、备份等主机设置修改只允许超级管理员。迁移期 `/api/settings` 只能聚合当前账号有权看到的字段。超级管理员 Provider UI 可新建、编辑、启停、排序、按需测试、同步模型，但 API Key 输入永远不回填原值。

- [x] **Step 2: Run and confirm RED**

Run: `node tools/check-system-settings-ui.js`
Run: `node tools/check-ai-os-shell.js`
Expected: FAIL because the new settings sections and role filtering are absent.

- [x] **Step 3: Build one settings surface**

在现有 `#aiOsSystemWindow` 内实现苹果风格分栏：

- 所有账号：外观（浅色/深色/跟随系统、缩放、画布主题）、账户摘要、系统信息。
- 仅超级管理员：模型服务、提供商顺序、模型顺序、自动回退、按需连接测试和同步模型。

删除“Agent 模型”和“API 监测”导航项；不显示成功率排行榜、定时探测状态或熔断按钮。主题变量作用于桌面壳、窗口、Dock、系统设置和应用内容；普通用户偏好按账号写入 `user_preferences`。

- [x] **Step 4: Run focused UI and shell verification**

Run: `node --check system-settings-ui.js`
Run: `node --check desktop-shell.js`
Run: `node --check script.js`
Run: `node tools/check-system-settings-ui.js`
Run: `npm run check:ai-os-shell`
Run: `npm run check:desktop-v2`
Run: `npm run check:ai-os`
Expected: PASS in light/dark/system modes and for both roles.

- [x] **Step 5: Commit**

```powershell
git add -- system-settings-ui.js system-settings.css index.html desktop-shell.js server.js script.js tools/check-system-settings-ui.js package.json
git diff --cached --name-only
git commit -m "feat: add DXOS style provider settings"
```

---

## Task 11: 最终切换、关闭旧控制面并做全量验收

**Files:**

- Modify: `server.js`
- Modify: `canvas-agent-router.js`
- Modify: `canvas-agent-runtime.js`
- Modify: `image-model-routing.js`
- Modify: `script.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-03-dxos-api-architecture-migration-design.md`
- Modify: `docs/superpowers/plans/2026-09-03-dxos-api-architecture-migration-implementation.md`
- Create: `tools/check-provider-cutover.js`
- Create: `tools/check-provider-browser-smoke.js`

- [ ] **Step 1: Write the cutover guard check**

检查运行时代码和 HTTP 行为，保证：

```js
assert.equal(runtimeUses("provider monitoring interval"), false);
assert.equal(runtimeUses("agent circuit breaker"), false);
assert.equal(runtimeUses("full api key reveal"), false);
assert.equal((await requestAs(ordinaryUser, legacyAdminRoute)).status, 403);
assert.equal((await requestAs(superadmin, legacyRemovedRoute)).status, 410);
```

允许保留仅供数据迁移/历史兼容的解析函数，但它们不能在启动、聊天、Agent、媒体或模型目录调用链中出现。浏览器 smoke 覆盖：登录、主题切换、超级管理员新建假 Provider、排序、手动测试、模型目录、聊天、Agent 工具调用、图片作业和普通用户不可见 Provider 管理。

- [ ] **Step 2: Run and confirm RED**

Run: `node tools/check-provider-cutover.js`
Run: `node tools/check-provider-browser-smoke.js`
Expected: FAIL while any legacy control plane remains active.

- [ ] **Step 3: Remove active legacy paths and document operations**

停止 Provider 监测定时器、balance probe、Agent 模型发现/验证、EWMA、circuit/half-open、完整密钥读取端点，以及运行时从 `settings.json`/环境变量加载 Provider 的逻辑。旧管理端点对普通账号返回 403，对超级管理员返回带迁移提示的 `410 Gone`；公共兼容目录端点继续返回 Store 的脱敏数据。

在 `README.md` 写明主机启动、首次迁移、Provider 配置、按需测试、自动回退、备份包含 Vault 密钥、缺密钥恢复失败处理，以及如何从迁移前快照回滚。

- [ ] **Step 4: Add one provider verification script**

`package.json`：

```json
{
  "scripts": {
    "check:providers": "node --disable-warning=ExperimentalWarning tools/check-provider-secret-vault.js && node --disable-warning=ExperimentalWarning tools/check-provider-store.js && node --disable-warning=ExperimentalWarning tools/check-provider-migration.js && node tools/check-provider-protocol-registry.js && node tools/check-provider-protocol-engine.js && node tools/check-provider-capability-resolver.js && node tools/check-provider-executor.js && node --disable-warning=ExperimentalWarning tools/check-provider-http-api.js && node --disable-warning=ExperimentalWarning tools/check-unified-chat-provider.js && node tools/check-canvas-agent-provider-bridge.js && node tools/check-media-provider-bridge.js && node tools/check-system-settings-ui.js && node tools/check-provider-cutover.js"
  }
}
```

- [ ] **Step 5: Run syntax and focused provider suite**

Run:

```powershell
node --check provider-secret-vault.js
node --check provider-store.js
node --check provider-migration.js
node --check provider-protocol-registry.js
node --check provider-protocol-engine.js
node --check provider-capability-resolver.js
node --check provider-executor.js
node --check provider-http-api.js
node --check canvas-agent-provider-bridge.js
node --check media-provider-bridge.js
node --check system-settings-ui.js
node --check server.js
npm run check:providers
```

Expected: all PASS.

- [ ] **Step 6: Run existing regression suites**

Run:

```powershell
npm run check:system
npm run check:auth
npm run check:resources
npm run check:backup
npm run check:ai-os-shell
npm run check:desktop-v2
npm run check:files-app
npm run check:image-jobs
npm run check:canvas-fast
npm run check
```

Expected: all PASS. 如果旧测试断言被有意淘汰的监测/熔断行为，应先把它改为新的确定性路由契约；不得为了绿灯保留双控制面。

- [ ] **Step 7: Run isolated browser smoke and recovery drill**

`check-provider-browser-smoke.js` 沿用现有 Playwright 加载策略，启动 `server.js` 子进程时设置独立的 `AI_OS_DATA_DIR`、`AI_OS_SYSTEM_DB_FILE`、`AI_OS_BACKUP_DIR` 和随机本机端口；上游统一指向测试进程内的假 HTTP 服务。测试结束关闭浏览器与子进程，并保留失败截图。

Run: `node tools/check-provider-browser-smoke.js`
Run: `node --disable-warning=ExperimentalWarning tools/check-backup-service.js`
Expected: PASS;测试只使用临时数据目录和假上游，不读取用户真实 Provider，不修改当前用户数据。

手动核对清单：

- 超级管理员：Provider CRUD、拖动排序、启停、手动测试、同步模型、自动回退。
- 普通账号：看不到 Provider 管理与密钥；可使用脱敏模型并保存个人主题。
- 聊天/Agent/图片：首选与回退顺序一致；固定目标不回退。
- 重启：SQLite、密钥、顺序和个人偏好保持。
- 恢复：数据库与 Vault 密钥成对恢复；故意移除密钥时 Provider 子系统被安全锁定，而账户、文件和桌面仍可进入。

- [ ] **Step 8: Mark the design complete and commit**

只有前述命令实际通过后，才把设计文档状态更新为“已实施并验收”。

```powershell
git add -- server.js canvas-agent-router.js canvas-agent-runtime.js image-model-routing.js script.js package.json README.md docs/superpowers/specs/2026-09-03-dxos-api-architecture-migration-design.md docs/superpowers/plans/2026-09-03-dxos-api-architecture-migration-implementation.md tools/check-provider-cutover.js tools/check-provider-browser-smoke.js
git diff --cached --name-only
git diff --cached --check
git commit -m "refactor: complete unified provider cutover"
```

---

## Verification Matrix

| Approved requirement | Primary implementation task | Required evidence |
|---|---:|---|
| SQLite Provider Store is the only runtime source | 2, 3, 11 | Store tests, idempotent migration, cutover scan |
| API keys encrypted and never returned to browser | 1, 2, 6 | Vault tamper tests, public DTO redaction, route capture |
| One protocol layer for auth/request/parse/SSE/tools/models | 4 | Registry and Engine contract tests |
| Deterministic capability routing without historical health | 5, 8, 9 | Resolver order test, Agent/media bridge tests, cutover scan |
| Fallback only for unpinned requests and configured deterministic order | 5, 7 | Executor and unified chat tests |
| Chat, Agent, vision, image, video, audio share the same resolver | 7, 8, 9 | Integration/coherence tests |
| Provider management is superadmin-only | 6, 10 | Per-route 401/403 checks and role-filtered DOM |
| Ordinary users retain per-account appearance/canvas settings | 2, 10 | user_preferences isolation and browser checks |
| No API monitoring/Agent-model control panels | 10, 11 | settings DOM check and cutover scan |
| Migration is snapshot-first, idempotent, and preserves legacy files | 3 | migration fixture assertions |
| Backup and restore keep DB and Vault key together | 3, 11 | backup verification and missing-key recovery drill |
| Existing account, canvas, chat, media, desktop and LAN behavior survives | 7-11 | existing regression suite and isolated browser smoke |

## Execution Discipline

每完成一个任务：

1. 保留失败检查的原始输出作为 RED 证据。
2. 只实现让当前检查通过的最小行为。
3. 运行该任务列出的旧回归检查。
4. 检查 `git diff --check` 和 `git diff --cached --name-only`。
5. 只提交该任务文件；发现与用户已有修改重叠时先阅读并合并，绝不覆盖或重置。
6. 更新本计划复选框和持久进度日志后再进入下一任务。
