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
  let slowTimer = 0;
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

  function finish(reason = "ready") {
    if (finished) return;
    if (reason === "ready" && isDevelopmentRefresh && !developmentRefreshReleased) {
      developmentRefreshReady = true;
      setStatus("正在恢复工作台", "组件已就绪，正在等待画布和操作状态恢复完成…");
      setProgress(98);
      return;
    }
    finished = true;
    if (slowTimer) window.clearTimeout(slowTimer);
    setProgress(100);
    if (reason === "failed") {
      gate.classList.add("has-error");
      setStatus("核心组件加载失败", "为避免进入不完整的工作台，请重新加载后再试。");
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
    if (criticalReady && workbenchReady) {
      finish("ready");
      return;
    }
    // A fully loaded plan is also safe to enter; this also keeps the overlay
    // compatible with an older loader that does not emit the critical event.
    if (modulesReady && workbenchReady) finish("ready");
  }

  window.addEventListener("ai-os-module-load-progress", (event) => {
    const completed = Math.max(0, Number(event.detail?.completed) || 0);
    const total = Math.max(completed, Number(event.detail?.total) || 0);
    moduleTotal = total;
    moduleCompleted = completed;
    const label = String(event.detail?.componentLabel || "应用组件");
    setStatus("正在加载工作台", `正在准备 ${label} · ${completed}/${total || "…"}`);
    setProgress(total > 0 ? 12 + (completed / total) * 78 : 36);
  });

  window.addEventListener("ai-os-critical-load-complete", (event) => {
    if (event.detail?.failed) {
      finish("failed");
      return;
    }
    criticalReady = true;
    setStatus("正在准备桌面", "核心组件已就绪，正在打开工作台…");
    setProgress(96);
    maybeFinish();
  });

  window.addEventListener("ai-os-module-load-complete", (event) => {
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
    workbenchReady = true;
    setProgress(Math.max(92, moduleTotal > 0 ? 12 + (moduleCompleted / moduleTotal) * 82 : 92));
    maybeFinish();
  });

  window.addEventListener("ai-os-module-load-failed", () => {
    gate.classList.add("has-error");
    finish("failed");
  });

  window.AiOsDevRefreshGate = Object.freeze({
    complete: releaseDevelopmentRefresh,
    isActive: () => isDevelopmentRefresh && !finished,
  });

  if (isDevelopmentRefresh) {
    gate.classList.add("is-development-refresh");
    setStatus("正在应用开发改动", "正在加载最新组件并恢复画布，完成后自动进入工作台…");
    setProgress(8);
  }
  continueButton?.addEventListener("click", () => window.location.reload());
  if (!isDevelopmentRefresh) {
    slowTimer = window.setTimeout(() => {
      if (finished) return;
      gate.classList.add("is-slow");
      setStatus("启动时间比平时更长", "核心组件仍在加载；完成前不会进入不完整的工作台。");
    }, 12_000);
  }
})();
