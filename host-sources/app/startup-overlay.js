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
    // The legacy shell and Neon iframe are mounted before every optional
    // component finishes. If both are already present, keeping the gate up
    // only traps the user behind a stale readiness event.
    return Boolean(
      document.querySelector("#aiOsDesktopHomeApps")?.children.length
      && document.querySelector("#aiOsNeonFrame, [data-neon-workbench]")
    );
  }

  function releaseIfWorkbenchSurfaceReady() {
    if (!hasWorkbenchSurface()) return false;
    forceRelease("工作台已加载，正在进入…");
    return true;
  }

  function forceRelease(message = "准备完成") {
    // A failed module phase can still leave the desktop surface mounted. In
    // that case the visible recovery button is the explicit user decision to
    // continue, so it must be allowed to release the error gate.
    if (finished && !gate.classList.contains("has-error")) return;
    finished = true;
    if (slowTimer) window.clearTimeout(slowTimer);
    if (surfacePollTimer) window.clearInterval(surfacePollTimer);
    criticalReady = true;
    workbenchReady = true;
    gate.classList.remove("has-error");
    setStatus(message, "");
    setProgress(100);
    gate.classList.add("is-complete");
    window.setTimeout(() => {
      gate.hidden = true;
      gate.setAttribute("aria-busy", "false");
    }, 220);
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

  // Some older module plans can miss the final readiness event even though
  // both visible workbench surfaces are already mounted. Poll the concrete
  // DOM handoff so startup cannot remain behind a stale event gate.
  surfacePollTimer = window.setInterval(() => {
    if (finished) return;
    if (hasWorkbenchSurface()) forceRelease("正在进入工作台…");
  }, 500);

  if (isDevelopmentRefresh) {
    gate.classList.add("is-development-refresh");
    setStatus("正在应用开发改动", "正在加载最新组件并恢复画布，完成后自动进入工作台…");
    setProgress(8);
  }
  continueButton?.addEventListener("click", () => {
    // The button is shown only after the slow-start guard. Reloading here
    // restarts the same component queue and traps the user in a loop; let the
    // already mounted desktop surface open instead.
    forceRelease("正在进入工作台…");
  });
  if (!isDevelopmentRefresh) {
    slowTimer = window.setTimeout(() => {
      if (finished) return;
      if (releaseIfWorkbenchSurfaceReady()) return;
      gate.classList.add("is-slow");
      setStatus("启动时间比平时更长", "核心组件仍在加载；完成前不会进入不完整的工作台。");
    }, 12_000);
  }
})();
