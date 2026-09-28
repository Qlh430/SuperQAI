# Protocol Center Normalization and Jimeng CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Separate connection packages from model request formats, retain existing runtime IDs, and add an account-isolated official 即梦 CLI provider.

**Architecture:** Registry presentation metadata creates separate platform/model catalogs while execution continues to use stable runtime IDs. A server-owned jimeng-cli-service resolves and invokes the official dreamina executable in an AI OS-owned CLI home; media adapters, the provider API, and settings UI consume only its safe status/action interface.

**Tech Stack:** Node.js CommonJS, child_process.spawn, SQLite system settings, existing protocol engine/adapters, vanilla JavaScript, Node assert, Playwright.

## Global Constraints

- Preserve openai-responses, openai-images, video-adapter, and audio-adapter persisted IDs, aliases, inference, routing, and execution.
- Only connection packages appear in 平台协议; model labels describe user operations and do not expose adapter terminology.
- Custom JSON remains declarative: id, label, summary, scope, runtimeProtocol, capabilities. It cannot add executable code, shell commands, parsers, or vendor protocols.
- cli:jimeng uses AI_OS_DATA_DIR/cli-home/jimeng. Never read, persist, proxy, or return passwords, cookies, QR payloads, raw tokens, or raw login output.
- Resolve a CLI only from bundled verified runtime, an administrator-saved absolute path, AI_OS_JIMENG_BIN/JIMENG_BIN/DREAMINA_BIN, then PATH.
- Spawn with shell: false, a fixed working directory, validated fixed arguments, bounded output, timeout/abort handling, and redacted errors.
- Resume an identified task after timeout; never repeat a billable submit solely because result polling failed.
- Every production behavior starts with a focused failing Node check. Automated checks make no real 即梦 request.

---

## File Map

- provider-protocol-registry.js: runtime definitions, aliases, scope-aware catalog and cli:jimeng package.
- protocol-contracts.js: CLI capabilities and route-diagnostic operation descriptions.
- protocol-center.js and protocol-center-ui.js: platform/model catalog filtering, readable groups and safe diagnostics.
- provider-model-rules.js and provider-store.js: 即梦 inference and no-HTTP-field CLI provider persistence.
- jimeng-cli-service.js: executable resolution, safe process runner, account state, models and media tasks.
- media-protocol-adapters.js and provider-protocol-engine.js: route CLI media requests without an HTTP fallback.
- provider-http-api.js and server.js: protected CLI admin endpoints and dependency composition.
- system-settings-ui.js and system-settings.css: CLI provider form, account controls and responsive layout.
- tools/check-provider-protocol-registry.js, tools/check-protocol-center.js, tools/check-provider-store.js, tools/check-provider-http-api.js, tools/check-provider-protocol-engine.js, tools/check-protocol-center-browser.js: focused regression coverage.
- tools/check-jimeng-cli-service.js: fake executable tests for CLI service behavior.

### Task 1: Scope-Aware Built-In Protocol Catalog

**Files:**
- Modify: provider-protocol-registry.js
- Modify: protocol-contracts.js
- Test: tools/check-provider-protocol-registry.js

**Interfaces:**
- Produces registry.listForScope(scope, options), registry.presentation(protocolId), and public catalog fields platformVisible, modelVisible, advanced, displayGroup, modelLabel, connectionType.
- Consumes existing createProtocolRegistry({ adapters, getCustomProtocols }).

- [ ] **Step 1: Write the failing test**

    const platform = registry.listForScope("platform");
    assert.deepEqual(platform.map(item => item.id), [
      "openai", "anthropic", "gemini", "apimart", "runninghub", "image-relay", "comfyui", "cli:jimeng",
    ]);
    assert.equal(platform.some(item => item.id === "video-adapter"), false);
    assert.equal(registry.listForScope("model").find(item => item.id === "video-adapter").label, "通用视频生成 API");
    assert.equal(registry.runtimeId("openai-responses"), "openai-responses");

- [ ] **Step 2: Run test to verify it fails**

Run: node tools/check-provider-protocol-registry.js

Expected: FAIL because listForScope and cli:jimeng do not exist.

- [ ] **Step 3: Write minimal registry/contract implementation**

    "cli:jimeng": {
      id: "cli:jimeng",
      label: "即梦 CLI",
      modelLabel: "即梦媒体生成",
      summary: "本机官方 dreamina CLI；在此设备完成账户登录。",
      categories: ["image", "video"],
      adapterId: "jimeng-cli",
      connectionType: "cli",
      platformVisible: true,
      modelVisible: true,
      displayGroup: "即梦",
    },
    "video-adapter": {
      id: "video-adapter",
      label: "通用视频生成 API",
      modelLabel: "通用视频生成 API",
      platformVisible: false,
      modelVisible: true,
      displayGroup: "视频",
      adapterId: "video-adapter",
    }

    function listForScope(scope, { includeAdvanced = true, includeRuntimeIds = [] } = {}) {
      const visible = scope === "platform" ? "platformVisible" : "modelVisible";
      const retained = new Set(includeRuntimeIds.map(id => runtimeId(id)));
      return Object.values(DEFINITIONS)
        .filter(definition => definition[visible] || retained.has(definition.id))
        .filter(definition => includeAdvanced || !definition.advanced || retained.has(definition.id))
        .map(definition => publicDefinition(definition, adapterMap));
    }

Add the jimeng-cli adapter capabilities image.generate, image.edit, video.generate. Make protocol-contracts return operation { method: "CLI", path: "本机 dreamina CLI", mode: "local-cli" } for that adapter. Mark OpenAI Responses advanced/model-only, OpenAI Images model-only, and audio/video adapters model-only while retaining their IDs.

- [ ] **Step 4: Run test to verify it passes**

Run: node tools/check-provider-protocol-registry.js

Expected: PASS with all existing aliases and URL checks.

- [ ] **Step 5: Commit**

    git add provider-protocol-registry.js protocol-contracts.js tools/check-provider-protocol-registry.js
    git commit -m "feat: separate protocol presentation scopes"

### Task 2: Protocol Center Catalog and Route Presentation

**Files:**
- Modify: protocol-center.js
- Modify: protocol-center-ui.js
- Test: tools/check-protocol-center.js

**Interfaces:**
- Consumes registry.listForScope and engine.describeExecution.
- Produces platformProtocols/modelProtocols that include used legacy runtime IDs only in their valid scope, plus safe platform/model labels in route results.

- [ ] **Step 1: Write the failing test**

    const catalog = center.list();
    assert.equal(catalog.platformProtocols.some(item => item.id === "openai-responses"), false);
    assert.equal(catalog.platformProtocols.some(item => item.id === "audio-adapter"), false);
    assert.equal(catalog.modelProtocols.find(item => item.id === "audio-adapter").label, "通用音频生成 API");
    assert.equal(catalog.platformProtocols.find(item => item.id === "cli:jimeng").connectionType, "cli");

- [ ] **Step 2: Run test to verify it fails**

Run: node --disable-warning=ExperimentalWarning tools/check-protocol-center.js

Expected: FAIL because existing code copies every built-in definition to both lists.

- [ ] **Step 3: Write minimal catalog/UI implementation**

    function list() {
      const providers = store.listPublic();
      const usedPlatformIds = providers.map(provider => provider.protocol || provider.providerProtocol);
      const usedModelIds = providers.flatMap(provider => provider.models.map(model => model.protocol || model.modelProtocol));
      return {
        protocols: registry.listPublic(),
        platformProtocols: [
          ...registry.listForScope("platform", { includeRuntimeIds: usedPlatformIds }).map(item => describe(item, "platform", true)),
          ...custom().filter(item => item.scope === "platform").map(item => describe(item, "platform", false)),
        ],
        modelProtocols: [
          ...registry.listForScope("model", { includeRuntimeIds: usedModelIds }).map(item => describe(item, "model", true)),
          ...custom().filter(item => item.scope === "model").map(item => describe(item, "model", false)),
        ],
        capabilities: MODEL_CAPABILITIES.map(id => ({ id, label: CAPABILITY_LABELS[id] })),
      };
    }

In protocol-center-ui.js, use modelLabel only in the model tab, group rows by displayGroup, and move runtimeProtocol to a small details diagnostic. Keep custom profile editing and legacy selection behavior intact.

- [ ] **Step 4: Run test to verify it passes**

Run: node --disable-warning=ExperimentalWarning tools/check-protocol-center.js

Expected: PASS with existing custom profile/route behavior unchanged.

- [ ] **Step 5: Commit**

    git add protocol-center.js protocol-center-ui.js tools/check-protocol-center.js
    git commit -m "feat: normalize protocol center catalogs"

### Task 3: CLI Provider Persistence and Model Inference

**Files:**
- Modify: provider-model-rules.js
- Modify: provider-store.js
- Test: tools/check-provider-store.js

**Interfaces:**
- Produces CLI records with baseUrl empty, source cli, cliTool jimeng, and no API key requirement.
- Keeps normalizeProviderBaseUrl mandatory for every non-CLI protocol.

- [ ] **Step 1: Write the failing test**

    const jimeng = store.save({
      id: "jimeng-local",
      name: "即梦（本地 CLI）",
      protocol: "cli:jimeng",
      source: "cli",
      cliTool: "jimeng",
      models: [{ id: "jimeng-image", capabilities: ["image.generate"] }],
    });
    assert.equal(jimeng.baseUrl, "");
    assert.equal(jimeng.hasApiKey, false);
    assert.equal(jimeng.models[0].protocol, "cli:jimeng");
    assert.throws(() => store.save({ id: "bad-http", name: "Bad", protocol: "openai", baseUrl: "", models: [] }), /baseUrl/i);

- [ ] **Step 2: Run test to verify it fails**

Run: node --disable-warning=ExperimentalWarning tools/check-provider-store.js

Expected: FAIL at provider baseUrl required.

- [ ] **Step 3: Write minimal store/model implementation**

    function isCliProtocol(protocol) {
      return registry?.getBuiltin(protocol)?.connectionType === "cli";
    }

    const cliProtocol = isCliProtocol(protocol);
    const baseUrl = cliProtocol
      ? ""
      : normalizeProviderBaseUrl(requiredText(input.baseUrl ?? existing?.baseUrl, "provider baseUrl"));
    const source = cliProtocol ? "cli" : requiredText(input.source ?? existing?.source ?? "api", "provider source");
    const cliTool = cliProtocol ? "jimeng" : existing?.cliTool || null;

In inferModelConfiguration, handle siteProtocol === "cli:jimeng" before host heuristics. Return cli:jimeng with video.generate for video IDs and image.generate for image IDs.

- [ ] **Step 4: Run test to verify it passes**

Run: node --disable-warning=ExperimentalWarning tools/check-provider-store.js && node --disable-warning=ExperimentalWarning tools/check-protocol-center.js

Expected: PASS; empty HTTP URL remains invalid.

- [ ] **Step 5: Commit**

    git add provider-model-rules.js provider-store.js tools/check-provider-store.js
    git commit -m "feat: persist jimeng cli providers"

### Task 4: Isolated Jimeng CLI Service

**Files:**
- Create: jimeng-cli-service.js
- Test: tools/check-jimeng-cli-service.js

**Interfaces:**
- Produces createJimengCliService({ dataDir, settings, spawnImpl, env, platform, clock }) returning status(), setPath(value), login(), loginStatus(), logout(), models(), generate(request), close().
- Stores only configured executablePath in setting jimeng_cli_settings.
- Returns only safe state: state, executable, source, version, minimumVersion, signedIn, account, credits, models, message.

- [ ] **Step 1: Write the failing fake-CLI test**

    const fixture = createFakeDreamina(root, {
      "--version": { stdout: "dreamina 1.2.0\n" },
      "status --json": { stdout: JSON.stringify({ signedIn: false }) },
      "models --json": { stdout: JSON.stringify({ models: ["jimeng-image", "jimeng-video"] }) },
    });
    const service = createJimengCliService({ dataDir: root, settings, spawnImpl: fixture.spawn });
    assert.equal((await service.status()).state, "ready-signed-out");
    assert.deepEqual(await service.models(), ["jimeng-image", "jimeng-video"]);
    assert.equal((await service.login()).state, "login-running");

Test absent executable, non-absolute configured path, too-low version, login failure, timeout, logout, task resume, and redaction of a fake Bearer secret.

- [ ] **Step 2: Run test to verify it fails**

Run: node tools/check-jimeng-cli-service.js

Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal trusted process service**

    function validateConfiguredPath(value) {
      const candidate = String(value || "").trim();
      if (!candidate) return "";
      if (!path.isAbsolute(candidate) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
        throw safeError("jimeng_cli_path_invalid", "即梦 CLI 路径必须是当前设备上的绝对可执行文件。", 400);
      }
      return path.resolve(candidate);
    }

    function run(args, { timeoutMs = 30000, signal } = {}) {
      const safeArgs = args.map(value => String(value));
      if (safeArgs.some(value => value.includes("\0"))) throw safeError("jimeng_cli_argument_invalid", "即梦 CLI 参数无效。", 400);
      return new Promise((resolve, reject) => {
        const child = spawnImpl(executable, safeArgs, {
          shell: false,
          windowsHide: true,
          cwd: path.dirname(executable),
          env: { ...baseEnv, DREAMINA_HOME: cliHome, JIMENG_HOME: cliHome },
          stdio: ["ignore", "pipe", "pipe"],
        });
        collectBoundedOutput(child, { maxBytes: 64 * 1024, timeoutMs, signal }).then(resolve, reject);
      });
    }

Create dataDir/cli-home/jimeng but do not inspect it. Use fixed command arrays for --version, status --json, login, logout, models --json, image generate, video generate, and task get. Parse JSON after bounded/redacted capture. Register an abort listener and kill only this spawned child. Convert task output to existing image/video data result shape.

- [ ] **Step 4: Run test to verify it passes**

Run: node tools/check-jimeng-cli-service.js

Expected: PASS without an installed CLI, account, or network.

- [ ] **Step 5: Commit**

    git add jimeng-cli-service.js tools/check-jimeng-cli-service.js
    git commit -m "feat: add isolated jimeng cli service"

### Task 5: CLI Media Adapter and Engine Dispatch

**Files:**
- Modify: media-protocol-adapters.js
- Modify: provider-protocol-engine.js
- Test: tools/check-provider-protocol-engine.js

**Interfaces:**
- Consumes createMediaProtocolAdapters({ jimengCli }).
- Produces jimeng-cli.fetchModels and jimeng-cli.execute, plus image/video result { data, task_id } compatible with media job resumption.

- [ ] **Step 1: Write the failing adapter dispatch test**

    const calls = [];
    const adapters = createMediaProtocolAdapters({
      jimengCli: { generate: async request => { calls.push(request); return { data: [{ url: "file:///out.png" }], task_id: "task-1" }; } },
    });
    const registry = createProtocolRegistry({ adapters });
    const engine = createProtocolEngine({ registry });
    const result = await engine.execute(
      { id: "jimeng", protocol: "cli:jimeng", baseUrl: "" },
      { id: "jimeng-image", protocol: "cli:jimeng", capabilities: ["image.generate"] },
      "image.generate", { prompt: "cloud" }, {}, {}
    );
    assert.equal(calls[0].intent, "image.generate");
    assert.equal(result.task_id, "task-1");

- [ ] **Step 2: Run test to verify it fails**

Run: node tools/check-provider-protocol-engine.js

Expected: FAIL because jimeng-cli is absent from adapters.

- [ ] **Step 3: Write minimal adapter implementation**

    const jimengCli = {
      available: Boolean(cliService && typeof cliService.generate === "function"),
      async fetchModels() { return cliService.models(); },
      async execute({ provider, model, intent, input = {}, params = {}, options = {} }) {
        if (!["image.generate", "image.edit", "video.generate"].includes(intent)) {
          throw Object.assign(new Error("即梦 CLI 不支持此能力。"), { code: "UPSTREAM_PROTOCOL", retryable: false });
        }
        return cliService.generate({
          providerId: provider.id,
          modelId: upstreamModelId(model),
          intent,
          prompt: String(input.prompt || ""),
          references: await serializedImages(input),
          params,
          resumeTask: options.resumeTask || null,
          onTaskSubmitted: options.onTaskSubmitted,
          signal: options.signal,
        });
      },
    };

Expose it under the adapter map key jimeng-cli. In engine.buildRequest, fail with a local-CLI-only ProtocolEngineError instead of calling joinProtocolUrl. Keep execute/fetchModels adapter dispatch intact.

- [ ] **Step 4: Run test to verify it passes**

Run: node tools/check-provider-protocol-engine.js && node tools/check-jimeng-cli-service.js

Expected: PASS; all old HTTP request construction checks remain green.

- [ ] **Step 5: Commit**

    git add media-protocol-adapters.js provider-protocol-engine.js tools/check-provider-protocol-engine.js
    git commit -m "feat: route jimeng media through local cli"

### Task 6: Safe Superadministrator CLI API and Server Composition

**Files:**
- Modify: provider-http-api.js
- Modify: server.js
- Test: tools/check-provider-http-api.js

**Interfaces:**
- Consumes jimengCli from Task 4.
- Produces GET /api/jimeng-cli/status, POST /api/jimeng-cli/path, POST /api/jimeng-cli/login, GET /api/jimeng-cli/login-status, POST /api/jimeng-cli/logout, POST /api/jimeng-cli/models.

- [ ] **Step 1: Write failing authorization/redaction checks**

    for (const route of [
      { method: "GET", path: "/api/jimeng-cli/status" },
      { method: "POST", path: "/api/jimeng-cli/login", body: {} },
      { method: "POST", path: "/api/jimeng-cli/path", body: { executablePath: "C:/tools/dreamina.exe" } },
    ]) {
      assert.equal((await requestAs(api, null, route)).status, 401);
      assert.equal((await requestAs(api, ordinaryUser, route)).status, 403);
      const result = await requestAs(api, superadmin, route);
      assert.ok(result.status >= 200 && result.status < 300);
      assert.equal(JSON.stringify(result.body).includes(SECRET), false);
    }

- [ ] **Step 2: Run test to verify it fails**

Run: node --disable-warning=ExperimentalWarning tools/check-provider-http-api.js

Expected: FAIL because the CLI routes are not recognized.

- [ ] **Step 3: Write minimal endpoint/server wiring**

    const JIMENG_PATHS = new Set([
      "/api/jimeng-cli/status", "/api/jimeng-cli/path", "/api/jimeng-cli/login",
      "/api/jimeng-cli/login-status", "/api/jimeng-cli/logout", "/api/jimeng-cli/models",
    ]);

    if (pathname === "/api/jimeng-cli/status" && req.method === "GET") {
      publicSend(res, 200, { cli: await jimengCli.status() });
      return true;
    }
    if (pathname === "/api/jimeng-cli/path" && req.method === "POST") {
      const cli = await jimengCli.setPath(payload.executablePath);
      audit(auth, "jimeng_cli.path_changed", "jimeng-cli", ["executablePath"]);
      publicSend(res, 200, { cli });
      return true;
    }

Add all six handlers to recognized paths, require the standard superadministrator authorization for each, and sanitize each response. Compose the service once in server.js from DATA_DIR and systemDb; pass it to createMediaProtocolAdapters and createProviderHttpApi; invoke close during graceful shutdown.

- [ ] **Step 4: Run test to verify it passes**

Run: node --disable-warning=ExperimentalWarning tools/check-provider-http-api.js && node --disable-warning=ExperimentalWarning tools/check-protocol-center.js

Expected: PASS and no audit/response leaks a secret or raw CLI output.

- [ ] **Step 5: Commit**

    git add provider-http-api.js server.js tools/check-provider-http-api.js
    git commit -m "feat: add jimeng cli administration api"

### Task 7: Platform-Aware Settings and 即梦 Login Controls

**Files:**
- Modify: system-settings-ui.js
- Modify: system-settings.css
- Test: tools/check-protocol-center-browser.js

**Interfaces:**
- Consumes catalog connectionType and all Task 6 endpoints.
- Produces data-jimeng-cli-panel, data-jimeng-login, data-jimeng-logout, data-jimeng-models controls and HTTP fields only for HTTP protocols.

- [ ] **Step 1: Write the failing browser test**

    await root.locator('[data-settings-nav="protocols"]').click();
    assert.equal(await root.getByText("视频适配器", { exact: true }).count(), 0);
    assert.equal(await root.getByText("通用视频生成 API", { exact: true }).count(), 1);
    await root.locator('[data-settings-nav="providers"]').click();
    await providerForm.locator('[name="protocol"]').selectOption("cli:jimeng");
    await root.locator("[data-jimeng-cli-panel]").waitFor();
    assert.equal(await providerForm.locator('[name="baseUrl"]').count(), 0);
    assert.equal(await providerForm.locator('[name="apiKey"]').count(), 0);
    assert.equal(await root.getByRole("button", { name: "登录即梦" }).isVisible(), true);

- [ ] **Step 2: Run test to verify it fails**

Run: node --disable-warning=ExperimentalWarning tools/check-protocol-center-browser.js

Expected: FAIL because Base URL/API Key always render and no CLI panel exists.

- [ ] **Step 3: Write minimal UI/CSS implementation**

    function isJimengProvider(provider) {
      return provider?.protocol === "cli:jimeng";
    }

    function jimengPanelMarkup(cli = {}) {
      return '<section class="settings-jimeng-cli" data-jimeng-cli-panel>'
        + '<header><strong>即梦 CLI</strong><em data-jimeng-cli-state>' + escapeHtml(cli.state || "checking") + '</em></header>'
        + '<dl><div><dt>CLI</dt><dd>' + escapeHtml(cli.executable || "未找到") + '</dd></div>'
        + '<div><dt>版本</dt><dd>' + escapeHtml(cli.version || "—") + '</dd></div>'
        + '<div><dt>账户</dt><dd>' + escapeHtml(cli.account || "未登录") + '</dd></div></dl>'
        + '<div><button type="button" data-jimeng-login>登录即梦</button><button type="button" data-jimeng-logout>退出登录</button><button type="button" data-jimeng-models>刷新模型</button></div></section>';
    }

Render this in place of Base URL/API Key for cli:jimeng. On platform selection set baseUrl empty, source cli, cliTool jimeng, load GET /api/jimeng-cli/status, and filter model protocols by platform/capability while retaining saved legacy selections. Implement the three controls with the Task 6 endpoints. Add CSS with compact grid, overflow-wrap:anywhere, and a single-column layout at 620px.

- [ ] **Step 4: Run test to verify it passes**

Run: node --disable-warning=ExperimentalWarning tools/check-protocol-center-browser.js && node tools/check-system-settings-ui.js

Expected: PASS at desktop/narrow sizes with no console error or horizontal overflow.

- [ ] **Step 5: Commit**

    git add system-settings-ui.js system-settings.css tools/check-protocol-center-browser.js
    git commit -m "feat: add jimeng cli provider controls"

### Task 8: Focused Regression and Environment Documentation

**Files:**
- Modify: package.json if a check:jimeng-cli script matches existing script conventions.
- Modify: .env.example to document executable-path precedence only.

**Interfaces:**
- Consumes all preceding interfaces.
- Produces reproducible checks and no account-specific configuration in source control.

- [ ] **Step 1: Add the package check**

    "check:jimeng-cli": "node tools/check-jimeng-cli-service.js"

- [ ] **Step 2: Run it**

Run: npm run check:jimeng-cli

Expected: PASS and exercise the real focused fake-CLI check.

- [ ] **Step 3: Document optional executable variables**

    # Optional absolute path to official local dreamina CLI.
    AI_OS_JIMENG_BIN=
    # JIMENG_BIN and DREAMINA_BIN are used only when AI_OS_JIMENG_BIN is unset.

- [ ] **Step 4: Run focused regression checks**

Run: node tools/check-provider-protocol-registry.js && node --disable-warning=ExperimentalWarning tools/check-provider-store.js && node tools/check-jimeng-cli-service.js && node tools/check-provider-protocol-engine.js && node --disable-warning=ExperimentalWarning tools/check-provider-http-api.js && node --disable-warning=ExperimentalWarning tools/check-protocol-center.js && node --disable-warning=ExperimentalWarning tools/check-protocol-center-browser.js

Expected: every command exits 0 and makes no real upstream request.

- [ ] **Step 5: Run syntax and portable checks**

Run: node --check jimeng-cli-service.js && node --check provider-protocol-registry.js && node --check provider-http-api.js && node --check system-settings-ui.js && node tools/check-portable-runtime.js

Expected: every command exits 0.

- [ ] **Step 6: Commit**

    git add package.json .env.example tools/check-jimeng-cli-service.js
    git commit -m "test: verify jimeng cli protocol integration"

## Self-Review

1. **Spec coverage:** Tasks 1-2 create clear platform/model presentation and keep runtime compatibility. Task 3 makes a local provider persistable without weakening HTTP validation. Task 4 handles trusted discovery, isolation, login state, models, output safety and resume. Task 5 connects actual media execution. Task 6 protects administrative operations. Task 7 supplies login controls and responsive presentation. Task 8 verifies compatibility, packaging paths and configuration variables.
2. **Placeholder scan:** Every task contains affected files, an interface, a failing assertion, a command, implementation code/behavior, passing verification and a commit command.
3. **Type consistency:** Runtime ID is cli:jimeng; adapter ID is jimeng-cli; factory is createJimengCliService; setting is jimeng_cli_settings; endpoint family is /api/jimeng-cli; capability names use MODEL_CAPABILITIES.

Plan complete and saved to docs/superpowers/plans/2026-09-10-protocol-center-jimeng-cli-implementation.md. The user explicitly chose execution, so use executing-plans with test-first steps.

