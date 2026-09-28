# Canvas Agent User Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the high-saturation user bubble with an accessible neutral bubble, remove the visible “你” label, and verify both dark and light themes.

**Architecture:** Keep the existing message data and conversation renderer, but make user-role markup omit the visible `<strong>` label while retaining an accessible label on the article. Define theme-specific user bubble tokens in `canvas-agent.css`; no new runtime animation or canvas event work is introduced.

**Tech Stack:** Vanilla JavaScript, CSS custom properties/selectors, Node assertion checks, Playwright with Chrome.

## Global Constraints

- User messages stay right aligned and Agent messages stay left aligned.
- Do not use the application accent color as the user-message background.
- Dark and light themes require separate readable neutral surfaces.
- Do not change conversation persistence, tool execution, waiting feedback, or canvas interaction logic.
- Do not commit or stage because the shared worktree contains unrelated user changes.

---

### Task 1: User-message semantic markup

**Files:**
- Modify: `canvas-agent-ui.js:1399`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Consumes: `renderCanvasAgentMessage(role, text, options)`.
- Produces: user articles with `aria-label="用户消息"` and no visible role `<strong>`.

- [x] Add static assertions that user messages set an accessible label and only non-user roles append the visible label.
- [x] Run `node tools/check-canvas-agent-ui.js`; expect failure because the user label is still visible.
- [x] Change the renderer so `message.append(label)` happens only when `role !== "user"`, while user messages set `aria-label`.
- [x] Re-run the focused static check; expect exit code 0.

### Task 2: Theme-aware neutral visual treatment

**Files:**
- Modify: `canvas-agent.css:279`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Consumes: `.canvas-agent-message.is-user` and `:root[data-theme="dark"]`.
- Produces: restrained light and dark neutral bubble surfaces independent of `--accent`.

- [x] Add CSS assertions for neutral base styles, a dark-theme override, a readable text color, a subtle border, and the absence of `background: var(--accent...)` in the user rule.
- [x] Run the focused static check; expect failure because the current user rule still uses `var(--accent)`.
- [x] Add `width: fit-content`, an `88px` minimum inline width, `max-width: 82%`, neutral background/text/border/shadow, and `border-radius: 14px 14px 5px 14px`.
- [x] Add a dark-theme override with graphite surface and soft-gray text.
- [x] Re-run the focused static check; expect exit code 0.

### Task 3: Browser visual and layout regression

**Files:**
- Modify: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Consumes: the rendered user message in both explicit theme modes.
- Produces: browser assertions for no visible label, neutral computed colors, adequate short-message width, and preserved right alignment.

- [x] Extend the browser check to inspect dark-theme and light-theme computed styles and save separate screenshots.
- [x] Run the browser check against `http://127.0.0.1:3000`; expect failure at the original `64px` short-message width.
- [x] Confirm the implemented markup and CSS satisfy both theme assertions without changing waiting-message positioning.
- [x] Re-run the browser check; expect exit code 0 and no browser console errors.

### Task 4: Full verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: fresh verification evidence for the final handoff.

- [x] Run `node --check canvas-agent-ui.js` and `node --check script.js`.
- [x] Run `node tools/check-canvas-agent-ui.js`.
- [x] Run the Playwright Agent browser check against the local preview.
- [x] Run `npm run check` and confirm exit code 0.
- [x] Inspect the final relevant lines to ensure user bubbles do not reference `--accent` and the visible “你” label is absent.
