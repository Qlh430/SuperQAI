# Canvas Agent Background Auto-Recovery Implementation Plan

> **For agentic workers:** Execute inline in the current workspace. Preserve all unrelated dirty-worktree changes and use test-driven development for every behavior change.

**Goal:** Remove first-failure “继续任务” friction, route Agent turns away from recently unhealthy providers, and recover transient all-route failures in the background without duplicate paid work or cross-board writes.

**Architecture:** Harden `canvas-agent-router.js` so user preferences are soft preferences gated by current route health. Add pure recovery-policy helpers to `canvas-agent-core.js`, then let `canvas-agent-ui.js` schedule a fresh internal continuation run with a generation token, board guard, bounded backoff, and paid-allowance safety. Keep existing server-side sequential failover as the first layer and use browser regressions to verify the second layer.

**Tech Stack:** Browser JavaScript, Node.js route/core assertions, existing SSE Agent transport, Playwright browser regression, portable-batch static verification.

## Global Constraints

- Touch only Canvas Agent routing/recovery, its Skill copy, tests, cache-busting references, and package test registration.
- Do not modify canvas zoom/rendering, image loading, connection geometry, persistence, manual generation controls, image-provider routing, or proxy policy.
- Preserve all existing workspace changes and do not package the portable build.
- Do not replay an ambiguous paid image request automatically.
- A recovery timer may run only while its original board and generation token are still current.

---

### Task 1: Health-Gated Agent Routing

**Files:**
- Modify: `canvas-agent-router.js`
- Test: `tools/check-canvas-agent-router.js`
- Test: `tools/check-canvas-agent-failover.js`

- [ ] Add failing tests proving a recently failing primary ranks behind a healthy route, a healthy primary still wins, protocol failures enter long isolation immediately, and an unhealthy pinned route is not reused.
- [ ] Add pure route-health classification and change ranking to health tier before soft preference/order/score.
- [ ] Export the health helper so `server.js` can refuse an unhealthy session pin.
- [ ] Keep endpoint diversity and adaptive attempt timeout unchanged.
- [ ] Run the focused router/failover tests.

### Task 2: Pure Background-Recovery Policy

**Files:**
- Modify: `canvas-agent-core.js`
- Test: `tools/check-canvas-agent-core.js`

- [ ] Add failing tests for recoverable categories, delays `1000/3000/8000`, three-attempt exhaustion, board/token guards, and paid-allowance carry rules.
- [ ] Implement small pure helpers returning recovery eligibility, delay, and safe inherited allowances.
- [ ] Keep authentication, balance, request/parameter, cancellation, user-choice, and approval states non-recoverable.
- [ ] Run the core test.

### Task 3: UI Auto-Recovery Lifecycle

**Files:**
- Modify: `canvas-agent-ui.js`
- Modify: `index.html`
- Test: `tools/check-canvas-agent-ui.js`
- Test: `tools/check-canvas-agent-ui-browser.js`
- Test: `tools/check-canvas-agent-browser.js`

- [ ] Change source/browser tests so the first recoverable failure shows a transient automatic-recovery status and no manual button.
- [ ] Add one recovery context and timer, invalidate it on stop, board switch, reset, or a new user run.
- [ ] Start a fresh hidden continuation run without adding a second user message or persisting the internal recovery instruction.
- [ ] Preserve unspent direct-generation allowance only when no paid tool was attempted; otherwise recover in inspection-only mode and require a new approval before any paid retry.
- [ ] After three failures render one “重新尝试” entry; keep the old click handler only for this exhausted state.
- [ ] Verify a partial safe-tool run does not visibly duplicate nodes in the mocked recovery scenario.

### Task 4: Skill Copy and Server Pin Safety

**Files:**
- Modify: `server.js`
- Modify: `skills/canvas-agent-core/SKILL.md`
- Test: `tools/check-canvas-agent-server.js`
- Test: `tools/check-canvas-agent-performance.js`

- [ ] Add a failing server assertion requiring pinned candidates to pass the route-health guard.
- [ ] Do not move an unhealthy pinned candidate to the front of a stateless continuation.
- [ ] Replace the obsolete three-choice Skill text with exactly “修改后生成 / 新建并生成”.
- [ ] Verify runtime files remain included by `build-portable.bat`.

### Task 5: Regression Verification

- [ ] Run syntax checks for `canvas-agent-core.js`, `canvas-agent-router.js`, `canvas-agent-ui.js`, and `server.js`.
- [ ] Run focused core/router/failover/UI/browser tests.
- [ ] Run `npm run check`.
- [ ] Run portable-package static checks without building an archive.
- [ ] Run `git diff --check` and inspect only the scoped diff.
