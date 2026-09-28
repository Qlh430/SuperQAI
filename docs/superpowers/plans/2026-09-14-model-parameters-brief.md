# Task brief: Model parameter controls

Work only on `model-parameter-controls.js`, `tools/check-model-parameter-controls.js`, and a report `artifacts/model-test/parameter-report.md`. Do not edit settings UI/CSS/index or backend. Parent integrates them.

Build UMD/CommonJS module exporting browser global `AiOsModelParameters`:

- `fieldsForModel(model)` -> descriptor array `{key,label,type,options?,min?,max?,step?}`.
- `markup(model)` -> default collapsed `<details class="settings-model-defaults"><summary>默认参数</summary>…</details>`. No JSON editor. Use existing `settings-model-parameters` grid class for fields. All inputs carry `data-model-param=key` and `data-param-original=the displayed string` (HTML-escaped). Fields have no form names.
- `read(row, model)` -> complete parameterOverrides object; start from model.metadata.parameterOverrides, preserve untouched fields exactly (type too), unknown keys, false/zero/nested objects. Read only rendered fields. When an edited field becomes empty remove only its key. Changed numeric values must be finite in descriptor min/max and integer where applicable. `validate(row,model)` throws Chinese actionable error for invalid edited fields. Do not mutate model. Selects preserve a legacy unknown value as "已保存：value" option.
- Support only known-safe fields: openai/openai-chat/openai-responses with llm.chat temperature and max tokens (max_tokens for openai/openai-chat, max_output_tokens for openai-responses); anthropic max_tokens; openai-images / openai with image-only capabilities size, quality, background; image-relay/grsai size and resolution only if actual module/protocol IDs verified locally. Gemini and unknown protocols may render no editable fields, explanatory default text. Choose conservative protocol-aware supported fields; do not expose incompatible LLM fields to image-only models. Include a generic hint that existing additional defaults are retained if unknown overrides present, no raw JSON.
- Prefer no fields to unsupported parameter guesses. Chinese labels such as 随机程度、回复长度上限、图片尺寸、图片质量、背景. Blank option is 使用平台默认.
- TDD mandatory: write/run tests failing before implementation. Tests must cover preserving old keys and unchanged unsupported value types, clearing/editing only one key, 0, invalid numbers, protocol fields, injection escaping, no JSON textarea.
- No network/paid calls/dependencies, no git operations. Use apply_patch. Shared dirty worktree must be preserved.
- Report RED/GREEN commands/output and file changes. Return compact status/report path.
