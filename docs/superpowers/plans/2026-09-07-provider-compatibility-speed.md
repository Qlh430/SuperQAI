# Provider Compatibility and Speed Implementation Plan

**Goal:** Make newly added supported APIs choose correct model protocols and capabilities, preserve administrator choices, and avoid waiting on a broken network route before using a working one.

**Architecture:** Follow DX OS's separation of site configuration and model execution. Add one shared backend inference rule set for saving, discovery, manual model addition and execution defaults. Retain encrypted SQLite storage and persisted image tasks. Align verified request contracts without copying DX OS's unrelated dependencies or replacing credentials.

User authorization: user asked to align with DX OS wherever it is more stable/compatible, prioritizing reliable and fast APIs, and said “继续” after the proposed comparison and implementation approach. Execute directly, preserving existing changes and .git.

- [x] Inspect both applications' configuration, request and network code. Confirm current manual/synced models all default to llm.chat; UI reads wrong verification response field; model-name-only inference selects native APIs on relay sites.
- [x] Add failing configuration contract tests: mixed discovered models, provider-aware Gemini/Claude, explicit overrides, image protocol conversion, full endpoint normalization, blank secret trimming/preservation.
- [x] Implement provider-model-rules.js and use it in registry/store/API. UI applies inference for new models, preserves existing settings on sync, applies selectedProtocol from verification, and exposes network mode.
- [x] In parallel: route_latency agent independently tests/fixes idempotent discovery latency and route memory. Never race paid POSTs.
- [x] In parallel: dx_contract_audit agent compares actual media protocols, then implements confirmed contract differences and regression tests within assigned files; main agent reviews and integrates.
- [x] Verify with a browser using an isolated server and fake upstream. Add/sync/save/test/reload API, retain manual model configuration, preserve secrets and network settings.
- [x] Run provider/APIMart/image regressions, measure real read-only endpoint latency, check scope and restart the verified idle local AI OS instance. Report precise compatibility scope and evidence.

The configured base URL remains the destination. We do not guess alternative credential destinations or swap accounts. Existing task IDs must survive retries and restarts. Large upstream generation queues cannot be made faster by lowering timeouts.

Evidence: `artifacts/provider-compatibility/对照与验证.md`, real read-only discovery 1978 / 745 / 774 ms, final browser smoke and 29 new contract/latency cases passed, runtime healthy after restart.
