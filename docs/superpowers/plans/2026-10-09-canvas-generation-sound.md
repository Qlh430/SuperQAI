# 画布生成完成提示音 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在画布生成结果成功写入节点后播放一次低音量提示音，覆盖图片、文字、ComfyUI、API/H3 视频和音频生成。

**Architecture:** 在宿主桥接中增加无资源依赖的 `CanvasGenerationSound` 小服务，生成开始时唤醒 AudioContext，完成回调按任务键去重并播放。各现有生成成功回调只增加一行调用，生成组件通过既有 `onResult` 接口接入。

**Tech Stack:** 现有 CommonJS 浏览器桥接、Web Audio API、Playwright 回归、Vite build、deploy.mjs。

## Global Constraints

- 保持功能、交互和样式不变，不增加控件或网络请求。
- 仅成功写入结果时播放；失败、取消、超时和浏览器禁止播放时不影响原流程。
- 画布数据继续由宿主服务保存，不使用 localStorage。
- 不停止 3199；部署只通过 `neon-workbench/deploy.mjs`。

---

### Task 1: 回归与声音服务

**Files:**
- Modify: `neon-workbench/canvas-generation-sound-regression.cjs`
- Modify: `neon-workbench/design-sources/script-before-save-bridge.js`

- [ ] Write the failing browser regression for arm/play/dedup/failure-safe behavior.
- [ ] Run the regression and verify the new `CanvasGenerationSound` API is absent/fails.
- [ ] Add `arm(node)` and `playComplete(node, key)` using lazy AudioContext, two short oscillator tones, a per-key WeakMap/set, and catch all browser audio errors.
- [ ] Call `arm` at every canvas generation entry and `playComplete` at each existing success callback, including image job commit, text, ComfyUI, API video delivery/watch, H3 delivery and audio `onResult`.
- [ ] Run the regression and existing text/media generation regressions.

### Task 2: Build, deploy, and acceptance

**Files:**
- Modify: `neon-workbench/deploy.mjs`
- Create: `neon-workbench/design-audits/canvas-generation-sound-20261009.md`
- Modify: `PROJECT_CONTEXT.md`

- [ ] Update the runtime cache version for the changed bridge and regression resources.
- [ ] Run `npm run build`, then `node deploy.mjs`.
- [ ] Run deployed sound regression and `node acceptance.cjs` at 390, 768, 1440, and 1728 widths.
- [ ] Record simulated API, real-login boundary, current server PID, and no pageerror/overflow evidence.
