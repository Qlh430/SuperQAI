# Draft API Agent Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 验证未保存的 API 草稿及其 Agent 工具调用能力；保存同一配置后才把该结果加入正式候选池。

**Architecture:** 浏览器仅在用户明确点击验证时发送当前 Provider 草稿。`server.js` 在内存中验证并以非敏感指纹短暂缓存成功结果；`PUT /api/settings` 只提升与保存内容匹配的结果。未保存草稿永远不参与任何路由。

**Tech Stack:** Browser JavaScript、Node.js HTTP server、Canvas Agent LLM connector、Node assert、Playwright。

## Global Constraints

- 草稿 API 不得参与 Agent、聊天或生图路由。
- 草稿 Key 不得写入设置、路由健康、监控、候选池或日志。
- 验证继续使用 `report_agent_probe`、现有模型适配器、超时和错误分类。
- 修改地址、Key、模型或能力、关闭设置或刷新页面后，草稿结果不得继续使用。
- 保存后只提升地址、Key、模型均匹配的成功结果。

---

### Task 1: Server draft verification and promotion

**Files:**

- Modify: `server.js:425-443`, `server.js:936-951`, `server.js:1397-1569`
- Test: `tools/check-provider-agent-verification.js`

**Interfaces:**

- Consumes: `POST /api/settings/providers/agent-verify` body `{ providerId, modelId, draftProvider? }`.
- Produces: `normalizeDraftAgentVerificationProvider(draftProvider, providerId, modelId)`, `buildDraftAgentVerificationFingerprint(provider, model)`, `promoteDraftAgentVerifications(savedSettings)`.
- Produces: `draftAgentVerificationCache: Map`, holding only result, expiry and URL/Key digest fingerprint.

- [ ] **Step 1: Write the failing test**

Append to `tools/check-provider-agent-verification.js`:

```js
assert.match(server, /const draftAgentVerificationCache\s*=\s*new Map\(\)/);
assert.match(server, /function buildDraftAgentVerificationFingerprint\(/);
assert.match(server, /function normalizeDraftAgentVerificationProvider\(/);
assert.match(server, /async function promoteDraftAgentVerifications\(/);
assert.match(server, /draftProvider:\s*payload\.draftProvider/);
assert.match(server, /verifyProviderAgentCandidate\(provider, model, \{ persistResult: !draftProvider \}\)/);
assert.match(server, /await promoteDraftAgentVerifications\(next\)/);
```

- [ ] **Step 2: Verify RED**

Run: `node tools/check-provider-agent-verification.js`  
Expected: `AssertionError` mentioning `draftAgentVerificationCache` because there is no draft isolation yet.

- [ ] **Step 3: Implement the server boundary**

Add a 15-minute `draftAgentVerificationCache`. Its fingerprint is Provider ID + model ID + normalized base URL + SHA-256 API-Key digest; entries must not retain a Key. Normalize the optional draft and require a matching provider ID, non-empty address/Key and a model that exists in its submitted list.

Extend `verifyProviderAgentCandidate(provider, model, { persistResult = true })`. For a draft call, run exactly the current probe but skip `setCanvasAgentCapability`, `queueCanvasAgentRouteEvent` and `flushCanvasAgentRouteEvents`; cache only `state: "verified"` results. For saved calls, preserve all existing behavior.

After `writeSettingsFile(next)` call `await promoteDraftAgentVerifications(next)`. It computes the same fingerprint for each saved model, uses `setCanvasAgentCapability` only for matching, unexpired successful cache entries, and deletes consumed/expired entries before sending the response.

- [ ] **Step 4: Verify GREEN**

Run: `node tools/check-provider-agent-verification.js`  
Expected: `Provider Agent verification checks passed.`

- [ ] **Step 5: Commit**

```bash
git add server.js tools/check-provider-agent-verification.js
git commit -m "feat: verify unsaved Agent API drafts"
```

### Task 2: Browser draft payload and status

**Files:**

- Modify: `script.js:2528-2615`, `script.js:2887-2910`, `script.js:3514-3537`
- Test: `tools/check-canvas-agent-browser.js`

**Interfaces:**

- Consumes: current `settingsState.providers` draft and verification response field `draft`.
- Produces: `createAgentVerificationDraft(provider)`, `clearDraftProviderVerification(providerId)`, and an explicit “已验证，未保存” state.

- [ ] **Step 1: Write the failing browser test**

Add a new unsaved provider fixture, intercept the request, and add assertions:

```js
assert.deepEqual(agentVerificationPayloads.at(-1).draftProvider, {
  id: "draft-provider",
  name: "未保存接口",
  enabled: true,
  baseUrl: "https://draft.test/v1",
  apiKey: "draft-key",
  models: [{ id: "draft-agent", capabilities: ["text"] }],
});
await page.getByText("已验证，未保存").waitFor({ state: "visible" });
assert.equal(agentCandidateRequestsForDraft, 0);
```

- [ ] **Step 2: Verify RED**

Run: `node tools/check-canvas-agent-browser.js`  
Expected: assertion failure because current verification sends only `providerId` and `modelId`.

- [ ] **Step 3: Implement the browser flow**

Create `createAgentVerificationDraft(provider)` that includes current `id`, `name`, `enabled`, `baseUrl`, in-memory `apiKey`, and current model IDs/capabilities. In `verifyProviderAgent`, compare the active Provider with `savedSettingsSnapshot`; only attach `draftProvider` when it differs from saved configuration.

Record `draft: true` from the response. Render verified drafts as `已验证，未保存` with `工具调用 · N ms · 保存后加入 Agent 备用池`; a candidate pool refresh must not show the Provider before save. When address, Key, enabled, model ID or capability values change, delete the page-local verification states for that Provider. On a successful save, replace matching `draft: true` UI states with normal verified state and refresh candidates.

- [ ] **Step 4: Verify GREEN**

Run: `node tools/check-canvas-agent-browser.js`  
Expected: exit code 0; verification succeeds before saving but appears in the candidate pool only after the save response.

- [ ] **Step 5: Commit**

```bash
git add script.js tools/check-canvas-agent-browser.js
git commit -m "feat: validate API drafts before saving"
```

### Task 3: Full regression verification

**Files:**

- Test: `tools/check-provider-agent-verification.js`, `tools/check-canvas-agent-browser.js`, package check suite

**Interfaces:**

- Consumes: server draft cache/promotion and browser draft payload.
- Produces: repeatable passing checks for saved and unsaved verification paths.

- [ ] **Step 1: Add the remaining negative test**

Add a source assertion that only `state === "verified"` cached results may be promoted and that the draft branch validates address, Key and selected model before invoking `verifyProviderAgentCandidate`.

- [ ] **Step 2: Run focused checks**

```bash
node --check server.js
node --check script.js
node tools/check-provider-agent-verification.js
node tools/check-canvas-agent-browser.js
```

Expected: all commands exit with code 0.

- [ ] **Step 3: Run project regression suite**

Run: `npm run check`  
Expected: exit code 0.

- [ ] **Step 4: Commit final test updates**

```bash
git add tools/check-provider-agent-verification.js tools/check-canvas-agent-browser.js
git commit -m "test: cover draft Agent verification"
```
