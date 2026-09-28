# Protocol Center Normalization and Jimeng CLI Design

**Date:** 2026-09-10

**Status:** User-approved design, awaiting written-spec review

## Goal

Make the AI OS protocol center as clear as DX OS by separating provider connection packages from per-model request formats. Add 即梦 as a first-class local CLI platform with official CLI login, account status, model discovery, and media generation. Existing provider settings and working routes must continue to work without manual migration.

## Current Problem

The protocol center currently lists every internal runtime in both the platform and model tabs. This makes `OpenAI 兼容`, `OpenAI Responses`, `OpenAI Images`, `视频适配器`, and `音频适配器` look like parallel provider choices even though several are request encoders or lower-level media executors. The user cannot tell which item supplies a URL and key, which item describes a model call, and which is an implementation detail.

The existing runtime already has the right foundations:

- `provider-protocol-registry.js` owns built-in protocol definitions and compatibility aliases.
- `provider-protocol-engine.js` executes HTTP protocol operations.
- `media-protocol-adapters.js` owns specialised and task-based media execution.
- `protocol-center.js` exposes platform and model catalogs, custom protocol persistence, and route diagnostics.
- `system-settings-ui.js` applies platform protocols to providers and model protocols to individual models.

DX OS demonstrates the intended boundary: its `cli:jimeng` provider package starts the local `dreamina` CLI, maintains a dedicated CLI home directory, checks login and credits through the CLI, and maps image/video tasks to its normal media workflow. Custom JSON in DX OS selects an already implemented runtime; it does not create arbitrary executable protocol code.

## Chosen Approach

Use a compatibility-first protocol package design.

The stored runtime IDs remain valid. The protocol catalog gains presentation metadata that controls whether an item is a platform package, a user-selectable model format, an advanced compatibility format, or internal-only. The UI presents clear names and groups while the executor continues to dispatch to the same proven runtime IDs.

This is preferred over a text-only rename because it fixes the configuration boundary and adds real 即梦 execution. It is preferred over arbitrary executable JSON because a JSON form cannot safely or reliably implement a vendor's login, polling, file upload, and response parsing behavior.

## User-Facing Protocol Model

### Platform Protocols

A platform protocol owns the connection to a service: login or API authentication, service address where applicable, model discovery, and default execution package. The normal platform catalog is:

| Display name | Runtime package | Configuration |
| --- | --- | --- |
| OpenAI-compatible API | `openai` | Base URL and API key |
| Anthropic Claude API | `anthropic` | Base URL and API key |
| Google Gemini API | `gemini` | Base URL and API key |
| APIMart / Midjourney | `apimart` | Base URL and API key |
| RunningHub | `runninghub` | Base URL and API key |
| Image relay service | `image-relay` | Base URL and API key |
| ComfyUI | `comfyui` | Local workflow configuration |
| 即梦 CLI | `cli:jimeng` | Local official `dreamina` CLI and account login |

`OpenAI Responses`, `OpenAI Images`, `视频适配器`, and `音频适配器` do not appear as platform protocols. They cannot be used to create a provider connection because they do not define an independent endpoint and authentication package.

Selecting 即梦 CLI changes the provider editor from the HTTP fields to a CLI panel. It has no Base URL or API Key field. Creating it adds one normal provider, named `即梦（本地 CLI）`, with platform protocol `cli:jimeng`; the provider can later be enabled, disabled, ordered, and selected like every other provider.

### Model Protocols

A model protocol determines the request and response shape for one model. The model tab and model editor group these by user intent:

| Group | Display name | Existing runtime ID | Visibility |
| --- | --- | --- | --- |
| Text and tools | Standard text API | `openai` | Default |
| Text and tools | Advanced text API (Responses) | `openai-responses` | Advanced; always shown for existing use |
| Images | Image generation API | `openai-images` | Default when image capability is selected |
| Videos | General video generation API | `video-adapter` | Default when video capability is selected |
| Audio | General audio generation API | `audio-adapter` | Default when audio capability is selected |
| 即梦 | 即梦 image generation | `cli:jimeng` | Available only with the 即梦 CLI platform |
| 即梦 | 即梦 video generation | `cli:jimeng` | Available only with the 即梦 CLI platform |

The display names describe the operation, not the implementation term "adapter". Existing models retain their old runtime IDs. When such a model is opened, the editor shows the normalized display name, so nothing must be rewritten in the database before it works.

The default model protocol menu is filtered by the selected platform and the model's enabled capabilities. Advanced text API remains available under an explicit advanced compatibility group, and remains visible whenever an existing model uses it. This preserves providers that only support `/v1/responses` without overwhelming normal OpenAI-compatible setup.

## Internal Contract and Compatibility

Each built-in definition will gain explicit presentation fields, including `platformVisible`, `modelVisible`, `advanced`, `displayGroup`, and user-facing label/summary. The registry continues to expose stable `runtimeProtocol` values to the execution engine.

`protocol-center.js` will list a platform catalog and a model catalog from those fields instead of copying every built-in definition into both lists. The route diagnostic will include user-facing platform/model labels plus the runtime protocol for administrator troubleshooting. It will never include API keys, login tokens, or raw CLI authentication output.

Legacy aliases remain accepted by `normalizeProtocolId`. Existing persisted values such as `openai-responses`, `openai-images`, `video-adapter`, and `audio-adapter` must pass provider loading, selection, route checking, and execution unchanged. A saved custom protocol may continue to inherit any supported runtime. Custom JSON remains a constrained profile with an ID, label, scope, inherited runtime, and allowed capability set; it cannot supply executable JavaScript, shell commands, arbitrary request parsers, or a new vendor protocol.

## 即梦 CLI Platform

### CLI Discovery and Isolation

Add a dedicated `jimeng-cli-service.js` owned by the server. It resolves a single trusted executable in this order:

1. The AI OS portable runtime's bundled official `dreamina` executable, when present and version-compatible.
2. An absolute executable path saved by a superadministrator in the AI OS configuration.
3. `AI_OS_JIMENG_BIN`, `JIMENG_BIN`, or `DREAMINA_BIN`.
4. A `dreamina` executable on the system `PATH`.

The portable build may include an official, version-pinned CLI runtime through its build manifest. This project does not copy DX OS binaries or share DX OS's runtime directory. If no compatible executable exists, the UI reports that exact state and allows the administrator to set a local CLI path. The service checks the CLI version before login or task submission and requires the minimum version supported by the implemented command contract.

CLI state lives under the AI OS data directory, for example `AI_OS_DATA_DIR/cli-home/jimeng`. The spawned process receives that directory through the official CLI's supported home/config environment variables. The application does not read or write account cookies, tokens, passwords, or QR payloads. It only asks the CLI for a boolean login state, account display information when the CLI exposes it, and credits when available.

All processes use `child_process.spawn(executable, args, { shell: false })` with validated paths, a fixed working directory, bounded output, a timeout, and no inherited user-controlled command arguments. Secrets and raw login output are redacted from logs and HTTP responses.

### Login State Machine

The CLI panel and HTTP API use one state machine:

`missing -> ready-signed-out -> login-running -> ready-signed-in`

It also supports `version-incompatible`, `login-failed`, and `runtime-error`. Login starts the official `dreamina login` flow. The UI renders the CLI's sanctioned browser or QR instruction and polls a status endpoint. The desktop host hands the authorization page to the operator's own browser through `host.openExternal` (HTTPS only); a page served to an ordinary browser keeps the visible authorization link. AI OS does not simulate a browser login or ask the user to enter an account password. The approval is confirmed by `dreamina login checklogin --poll=0`: a zero exit means the device flow completed and the token was stored, which is the authoritative signal because the client prints its confirmation in the machine's own language ("OAuth 登录成功。"). A pending approval keeps the attempt alive, a denied or expired device code ends it with a message, and an unexpected answer re-reads the stored session so an approval picked up by another poll cannot leave the panel waiting forever. A device flow left unapproved expires after ten minutes. Logout calls the official CLI logout command and rechecks state.

Every CLI command pays the client's own start-up cost, so the installed version is remembered per executable for a short window, a status snapshot is reused for a few seconds, and a model catalog is cached for twelve hours. A cold status read runs its version and credit probes together, and model discovery runs its help commands together. The catalog cache is dropped when the executable path or the reported client version changes. Starting a login only needs the remembered version probe: the credit probe is not on the path to the authorization URL, and switching accounts runs its `relogin` capability probe alongside the version check instead of after it.

Proposed administrator endpoints are:

| Method and path | Purpose |
| --- | --- |
| `GET /api/jimeng-cli/status` | Discovery, version, login state, and safe account/credit summary |
| `POST /api/jimeng-cli/path` | Validate and save an administrator-selected CLI path |
| `POST /api/jimeng-cli/login` | Start the official CLI login flow |
| `GET /api/jimeng-cli/login-status` | Read the active login attempt without exposing credentials |
| `POST /api/jimeng-cli/logout` | End the local CLI session |
| `POST /api/jimeng-cli/models` | Refresh CLI-supported models from its documented help or catalog command |

All endpoints require an authenticated superadministrator, just as provider configuration already does.

### Model Discovery and Execution

The service discovers available 即梦 models from supported `dreamina` help/catalog commands and retains a documented fallback model list when the CLI cannot expose a catalog. An image model is published as `jimeng-<version>` (`jimeng-5.0Pro`, `jimeng-3.0`) because the CLI's own bare version would otherwise read as an unrelated provider alias; the prefix is stripped again before `--model_version` is built. A video model keeps its Seedance name, which is already unambiguous. A provider row saved under the bare version is upgraded to the published name on save, with the previous name kept as a legacy id. The provider editor lets the administrator add discovered image and video models, with capabilities inferred from the selected 即梦 model family.

Reading the catalog costs one client start-up per generator command, so the version probe and those reads run together, and a catalog is remembered per installed client - including across host restarts - keyed on the size and timestamp of the client executable. Only an explicit refresh, an expired entry or a replaced client reads it from the CLI again. The editor's model filter is a compact 30px header field, so it resets the 40px height floor and weight that the legacy workbench applies to every input.

`media-protocol-adapters.js` gains a `jimeng-cli` adapter. It converts existing image and video requests into the validated `dreamina` argument forms, writes reference inputs to short-lived local files, executes the CLI, parses its structured result, and returns the project's existing image/video result shape. Long-running CLI submissions return or resume a task ID through the current media job manager rather than submitting a duplicate billable task after a timeout. Output files and URLs follow the same project media persistence rules as other providers.

The 即梦 adapter supports only commands proven by the installed supported CLI version: text-to-image, image-to-image where supported, text-to-video, image-to-video, multi-reference and first/last-frame video where the selected model supports them. Unsupported capability/model combinations fail before submission with an explicit compatibility message.

## UI Changes

The protocol center remains two tabs, `平台协议` and `模型协议`, but its list is compact and grouped. The details panel identifies the package type, supported capabilities, authentication method, and execution route. Internal runtime identifiers move into a small administrator diagnostic field rather than the title or primary list label.

The model service editor reacts to the selected platform protocol:

- HTTP platforms retain Base URL, network route, and API Key fields.
- 即梦 CLI replaces them with runtime path, version, login state, account/credit summary, and `登录即梦` / `退出登录` / `刷新模型` controls.
- A model's protocol menu contains only formats compatible with its platform and selected capabilities. Existing legacy selections remain selectable and clearly labeled.

The route checker recognizes `cli:jimeng`. It reports `CLI missing`, `version incompatible`, `not logged in`, or `unsupported model capability` before a paid generation request. A successful route check still means only that local configuration is usable; it does not submit a task or guarantee account credits.

## Error Handling

- Missing CLI: show the path resolution result and the one administrator action needed to configure an executable.
- Incompatible CLI: show installed and minimum supported versions; block login and generation.
- Signed out: show `登录即梦`; block generation before submission.
- Expired account session or insufficient credits: preserve CLI's safe user-facing message; mark the failure as non-retryable until the account state changes.
- CLI timeout after submission: store the submission/task ID when available and continue polling instead of retrying a possibly billable submit command.
- Unsupported input type or model feature: fail locally before a CLI process starts.

## Verification

Add focused checks without making real 即梦 network requests:

1. Registry and protocol-center tests prove that platform and model catalogs no longer duplicate internal runtimes, while legacy runtime IDs still resolve and execute as before.
2. Provider-store and HTTP API tests prove that `cli:jimeng` can be saved without Base URL/API key and that all CLI administration endpoints require superadministrator access.
3. A fake `dreamina` executable tests discovery, version validation, signed-out status, login transition, logout, model discovery, argument construction, task resumption, and redaction.
4. Protocol-engine and media adapter tests prove that media requests reach the 即梦 adapter only after compatible route selection.
5. Browser checks verify the two protocol tabs, readable operation names, absence of `视频适配器` and `音频适配器` in user-facing lists, the 即梦 login controls, and narrow-window layout without horizontal overflow.
6. Existing provider compatibility, protocol-center, media bridge, image, video, and audio checks run unchanged to prove route stability.

## Non-Goals

This change does not add arbitrary script execution through custom JSON, copy DX OS's packaged CLI binary, share DX OS account data, obtain or store a user password, or claim support for every current/future 即梦 command. A new 即梦 CLI command becomes available only after its request/response contract is implemented and tested.
