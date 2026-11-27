(function initializeStartupOverlay() {
  "use strict";

  const gate = document.querySelector("#aiOsStartupGate");
  if (!gate) return;

  const status = gate.querySelector("#aiOsStartupStatus");
  const detail = gate.querySelector("#aiOsStartupDetail");
  const progress = gate.querySelector("#aiOsStartupProgress");
  const continueButton = gate.querySelector("#aiOsStartupContinue");
  const DEV_REFRESH_KEY = "__ai_os_dev_reload_refresh_v1";
  let moduleTotal = 0;
  let moduleCompleted = 0;
  let modulesReady = false;
  let criticalReady = false;
  let workbenchReady = false;
  let finished = false;
  const failures = new Map();
  let slowTimer = 0;
  let surfacePollTimer = 0;
  const isDevelopmentRefresh = (() => {
    try {
      const timestamp = Number(sessionStorage.getItem(DEV_REFRESH_KEY) || localStorage.getItem(DEV_REFRESH_KEY));
      sessionStorage.removeItem(DEV_REFRESH_KEY);
      localStorage.removeItem(DEV_REFRESH_KEY);
      return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp < 60_000;
    } catch {
      return false;
    }
  })();
  let developmentRefreshReady = false;
  let developmentRefreshReleased = !isDevelopmentRefresh;

  function setStatus(message, description = "") {
    if (status) status.textContent = message;
    if (detail) detail.textContent = description;
  }

  function setProgress(value) {
    if (!progress) return;
    const percent = Math.max(4, Math.min(100, Math.round(value)));
    progress.style.width = `${percent}%`;
  }

  function hasWorkbenchSurface() {
    const frame = document.querySelector("#aiOsNeonFrame");
    // Creating the iframe is not evidence that its React application rendered.
    // The host and frame are same-origin; a busy/error view also counts as a
    // rendered, actionable surface, while an empty #root does not.
    try {
      return Boolean(frame?.contentDocument?.querySelector("#root")?.childElementCount);
    } catch {
      return false;
    }
  }

  function needsWorkbenchSurface() {
    return Boolean(document.querySelector("#aiOsNeonFrame") || window.AiOsDesktop?.getSession?.()?.user);
  }

  function failureDescription(eventDetail = {}) {
    const report = eventDetail.error?.report;
    for (const item of [...(eventDetail.failures || report?.failures || []), ...(eventDetail.skipped || report?.skipped || [])]) {
      failures.set(item.src || item.componentId, item);
    }
    const required = [...failures.values()].filter(item => item.critical || item.required !== false);
    const names = required.slice(0, 3).map(item => `${item.componentLabel || item.componentId || "组件"}${item.src ? `（${item.src}）` : ""}`);
    return names.length
      ? `未能加载：${names.join("、")}。请重新加载后重试。`
      : "工作台组件未能加载完成，请重新加载后重试。";
  }

  function finish(reason = "ready", description = "") {
    if (finished) return;
    if (reason === "ready" && isDevelopmentRefresh && !developmentRefreshReleased) {
      developmentRefreshReady = true;
      setStatus("正在恢复工作台", "组件已就绪，正在等待画布和操作状态恢复完成…");
      setProgress(98);
      return;
    }
    finished = true;
    if (slowTimer) window.clearTimeout(slowTimer);
    if (surfacePollTimer) window.clearInterval(surfacePollTimer);
    setProgress(100);
    if (reason === "failed") {
      gate.classList.add("has-error");
      setStatus("工作台组件加载失败", description || failureDescription());
      if (continueButton) {
        continueButton.hidden = false;
        continueButton.textContent = "重新加载";
      }
      return;
    }
    if (reason === "slow") {
      setStatus("工作台仍在准备", "核心组件完成前不会进入不完整的工作台。");
    } else {
      setStatus("准备完成", "正在打开工作台…");
    }
    window.setTimeout(() => {
      gate.classList.add("is-complete");
      window.setTimeout(() => {
        gate.hidden = true;
        gate.setAttribute("aria-busy", "false");
      }, 220);
    }, reason === "ready" ? 60 : 0);
  }

  function releaseDevelopmentRefresh() {
    if (!isDevelopmentRefresh || developmentRefreshReleased) return;
    developmentRefreshReleased = true;
    if (developmentRefreshReady) finish("ready");
  }

  function maybeFinish() {
    if (finished || (needsWorkbenchSurface() && !hasWorkbenchSurface())) return;
    if (criticalReady && workbenchReady) {
      finish("ready");
      return;
    }
    // A fully loaded plan is also safe to enter; this also keeps the overlay
    // compatible with an older loader that does not emit the critical event.
    if (modulesReady && workbenchReady) finish("ready");
  }

  window.addEventListener("ai-os-module-load-progress", (event) => {
    if (finished) return;
    const completed = Math.max(0, Number(event.detail?.completed) || 0);
    const total = Math.max(completed, Number(event.detail?.total) || 0);
    moduleTotal = total;
    moduleCompleted = completed;
    const label = String(event.detail?.componentLabel || "应用组件");
    setStatus("正在加载工作台", `正在准备 ${label} · ${completed}/${total || "…"}`);
    setProgress(total > 0 ? 12 + (completed / total) * 78 : 36);
  });

  window.addEventListener("ai-os-critical-load-complete", (event) => {
    if (finished) return;
    if (event.detail?.failed) {
      finish("failed", failureDescription(event.detail));
      return;
    }
    criticalReady = true;
    setStatus("正在准备桌面", "核心组件已就绪，正在打开工作台…");
    setProgress(96);
    maybeFinish();
  });

  window.addEventListener("ai-os-module-load-complete", (event) => {
    if (finished) return;
    modulesReady = true;
    if (event.detail?.degraded) {
      gate.classList.add("is-degraded");
      setStatus("正在准备桌面", "部分可选组件已隔离，其余功能继续启动…");
    } else {
      setStatus("正在准备桌面", "组件已就绪，正在整理图标与应用状态…");
    }
    setProgress(94);
    maybeFinish();
  });

  window.addEventListener("ai-os-legacy-workbench-ready", () => {
    if (finished) return;
    workbenchReady = true;
    setProgress(Math.max(92, moduleTotal > 0 ? 12 + (moduleCompleted / moduleTotal) * 82 : 92));
    maybeFinish();
  });

  window.addEventListener("ai-os-component-load-failed", (event) => {
    const item = event.detail;
    if (item) failures.set(item.src || item.componentId, item);
  });

  window.addEventListener("ai-os-module-load-failed", (event) => {
    finish("failed", failureDescription(event.detail));
  });

  window.AiOsDevRefreshGate = Object.freeze({
    complete: releaseDevelopmentRefresh,
    isActive: () => isDevelopmentRefresh && !finished,
  });

  // React can mount after the shell's readiness event. Poll its actual root,
  // without bypassing critical failures or the development restoration gate.
  surfacePollTimer = window.setInterval(() => {
    if (finished) return;
    if (hasWorkbenchSurface()) {
      workbenchReady = true;
      maybeFinish();
    }
  }, 500);

  if (isDevelopmentRefresh) {
    gate.classList.add("is-development-refresh");
    setStatus("正在应用开发改动", "正在加载最新组件并恢复画布，完成后自动进入工作台…");
    setProgress(8);
  }
  continueButton?.addEventListener("click", () => {
    window.location.reload();
  });
  if (!isDevelopmentRefresh) {
    slowTimer = window.setTimeout(() => {
      if (finished) return;
      maybeFinish();
      if (finished) return;
      gate.classList.add("is-slow");
      setStatus("启动时间比平时更长", needsWorkbenchSurface() && !hasWorkbenchSurface()
        ? "工作台页面尚未显示，仍在等待界面加载。可重新加载后重试。"
        : "组件仍在加载。可等待完成，或重新加载后重试。");
      if (continueButton) {
        continueButton.hidden = false;
        continueButton.textContent = "重新加载";
      }
    }, 12_000);
  }
})();
