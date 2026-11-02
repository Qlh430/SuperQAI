(function initializeCanvasAgentUi() {
  const CanvasAgentCore = window.CanvasAgentCore;
  const CanvasAgentConversation = window.CanvasAgentConversation;
  const CanvasAgentCapabilities = window.CanvasAgentCapabilities;
  const CanvasAgentMarkdown = window.CanvasAgentMarkdown;
  const CanvasAgentSkillContract = window.CanvasAgentSkillContract;
  const CanvasAgentBroker = window.CanvasAgentBroker;
  const CanvasAgentMcpServer = window.CanvasAgentMcpServer;
  const CanvasAgentToolAdapters = window.CanvasAgentToolAdapters;
  const CanvasAgentCanvasApi = window.CanvasAgentCanvasApi;
  const SKILLS_API_URL = "/api/canvas-agent/skills";
  const TURN_API_URL = "/api/canvas-agent/turn";
  const CANCEL_API_URL = "/api/canvas-agent/cancel";
  const CONVERSATION_API_URL = "/api/canvas-agent/conversation";
  const PANEL_STORAGE_KEY = "canvas-agent-panel-open-v1";
  const PANEL_WIDTH_STORAGE_KEY = "canvas-agent-panel-width-v1";
  const DEFAULT_PANEL_WIDTH = 410;
  const MIN_PANEL_WIDTH = 320;
  const MAX_PANEL_WIDTH = 760;
  const MIN_CANVAS_WIDTH = 220;
  const RUNS_STORAGE_KEY = "canvas-agent-runs-v1";
  const MAX_SAVED_RUNS = 20;
  const MAX_AGENT_EVENT_LINE_CHARS = 256 * 1024;
  const AGENT_STAGE_ARIA_LABELS = Object.freeze({
    understanding: "Agent 正在回应",
    planning: "Agent 正在规划",
    executing: "Agent 正在准备画布操作",
    recovering: "Agent 响应较慢，正在恢复",
    resumed: "Agent 已恢复，正在回应",
  });
  const state = {
    skills: [],
    pickerSkills: [],
    activeSkillId: "",
    configured: false,
    agentSettings: null,
    catalogRevision: 0,
    currentRun: null,
    pendingApproval: null,
    pendingDesignBrief: null,
    pendingImageChoice: null,
    pendingResumeSkillId: "",
    nextPaidAllowances: null,
    abortController: null,
    runAbortController: null,
    broker: null,
    mcp: null,
    scope: null,
    creationIndex: 0,
    paidAttempts: new Set(),
    completedToolOutputs: new Map(),
    selectedNodeIds: new Set(),
    mentionedNodeIds: new Set(),
    excludedNodeIds: new Set(),
    mentionRange: null,
    activeBoardId: "",
    panelWidth: DEFAULT_PANEL_WIDTH,
    conversation: null,
    conversationsByBoard: new Map(),
    conversationLoadToken: 0,
    conversationSaveChain: Promise.resolve(),
    recoveryPrompt: "",
    recovery: null,
    recoveryGeneration: 0,
  };

  if (
    !CanvasAgentCore
    || !CanvasAgentConversation
    || !CanvasAgentCapabilities
    || !CanvasAgentSkillContract
    || !CanvasAgentBroker
    || !CanvasAgentMcpServer
    || !CanvasAgentToolAdapters
    || !CanvasAgentCanvasApi
    || !document.querySelector(".canvas-workspace")
  ) return;
  state.broker = CanvasAgentBroker.createBroker({
    getCurrentBoardId: () => CanvasAgentCanvasApi.getBoardId(),
    adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }),
  });
  markInterruptedRuns();
  ensureCanvasAgentMarkup();
  initializeCanvasAgentPanelResize();
  bindCanvasAgentEvents();
  setCanvasAgentOpen(localStorage.getItem(PANEL_STORAGE_KEY) === "true", false);
  loadCanvasAgentSkills();
  const activeBoard = window.getActiveCanvasBoardInfo?.();
  if (activeBoard?.id) void loadCanvasAgentConversation(activeBoard.id);

  function ensureCanvasAgentMarkup() {
    const workspace = document.querySelector(".canvas-workspace");
    const actions = workspace?.querySelector(".canvas-actions");
    if (!workspace || !actions || document.querySelector("#canvasAgentPanel")) return;

    const toggle = document.createElement("button");
    toggle.id = "canvasAgentToggle";
    toggle.className = "text-action canvas-agent-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", "canvasAgentPanel");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<i data-lucide="sparkles"></i><span>Agent</span>';
    actions.prepend(toggle);

    const panel = document.createElement("aside");
    panel.id = "canvasAgentPanel";
    panel.className = "canvas-agent-panel";
    panel.setAttribute("aria-label", "画布智能体");
    panel.innerHTML = `
      <div class="canvas-agent-resize-handle" id="canvasAgentResizeHandle" role="separator" aria-orientation="vertical" aria-label="调整 Agent 聊天框宽度" title="拖拽调整宽度，双击恢复默认" tabindex="0"></div>
      <header class="canvas-agent-header">
        <div class="canvas-agent-identity">
          <span class="canvas-agent-orb" aria-hidden="true"><i data-lucide="sparkles"></i></span>
          <span>
            <strong>画布 Agent</strong>
            <small>创作指挥台</small>
          </span>
        </div>
        <div class="canvas-agent-header-actions">
          <span class="canvas-agent-live-status" id="canvasAgentLiveStatus" data-tone="idle">
            <i aria-hidden="true"></i>
            <span>待命</span>
          </span>
          <button id="canvasAgentClose" type="button" title="收起" aria-label="收起 Agent"><i data-lucide="panel-right-close"></i></button>
        </div>
      </header>
      <section class="canvas-agent-messages" id="canvasAgentMessages" aria-live="polite">
        <div class="canvas-agent-welcome" id="canvasAgentWelcome">
          <span class="canvas-agent-welcome-orb"><i data-lucide="sparkles"></i></span>
          <p>今天想创作什么？</p>
          <small>描述目标，或从画布选取参考素材。</small>
        </div>
      </section>
      <section class="canvas-agent-approval" id="canvasAgentApproval" hidden>
        <div><strong>确认后继续执行</strong><span id="canvasAgentApprovalText">这一步包含需要确认的画布操作</span></div>
        <span class="canvas-agent-approval-actions">
          <button id="canvasAgentDecline" class="is-secondary" type="button">这步不执行</button>
          <button id="canvasAgentApprove" type="button">确认并继续</button>
        </span>
      </section>
      <form class="canvas-agent-form" id="canvasAgentForm">
        <section class="canvas-agent-popover is-skill" id="canvasAgentSkillPopover" hidden>
          <header><span>技能书</span><small id="canvasAgentSkillHint">正在加载…</small></header>
          <div class="canvas-agent-skills" id="canvasAgentSkills"></div>
        </section>
        <section class="canvas-agent-popover is-mention" id="canvasAgentMentionPopover" hidden>
          <header><span>引用画布节点</span><small>输入名称筛选</small></header>
          <div class="canvas-agent-mentions" id="canvasAgentMentions"></div>
        </section>
        <div class="canvas-agent-context" id="canvasAgentContext" hidden></div>
        <textarea id="canvasAgentPrompt" rows="3" placeholder="描述创意需求，或选择画布内容作为参考"></textarea>
        <div class="canvas-agent-form-footer">
          <div class="canvas-agent-composer-tools">
            <button id="canvasAgentAttach" type="button" title="添加图片" aria-label="添加图片"><i data-lucide="plus"></i></button>
            <button id="canvasAgentSkillBook" type="button" title="打开技能书" aria-label="打开技能书"><i data-lucide="book-open"></i></button>
            <span id="canvasAgentMode">自动</span>
            <input id="canvasAgentFileInput" type="file" accept="image/*" multiple hidden>
          </div>
          <div class="canvas-agent-run-actions">
            <span id="canvasAgentStatus">Agent 已就绪</span>
            <button id="canvasAgentStop" class="canvas-agent-stop" type="button" hidden>停止</button>
            <button id="canvasAgentSend" class="canvas-agent-send" type="submit" aria-label="发送"><i data-lucide="arrow-up"></i></button>
          </div>
        </div>
      </form>
    `;
    workspace.append(panel);
    renderCanvasAgentIcons(panel);
    syncCanvasAgentSelection();
  }

  function bindCanvasAgentEvents() {
    document.querySelector("#canvasAgentToggle")?.addEventListener("click", () => {
      setCanvasAgentOpen(!document.querySelector(".canvas-workspace")?.classList.contains("canvas-agent-open"));
    });
    const resizeHandle = document.querySelector("#canvasAgentResizeHandle");
    resizeHandle?.addEventListener("pointerdown", beginCanvasAgentPanelResize);
    resizeHandle?.addEventListener("keydown", handleCanvasAgentPanelResizeKeydown);
    resizeHandle?.addEventListener("dblclick", () => applyCanvasAgentPanelWidth(DEFAULT_PANEL_WIDTH, true));
    window.addEventListener("resize", () => applyCanvasAgentPanelWidth(state.panelWidth, false));
    document.querySelector("#canvasAgentClose")?.addEventListener("click", () => setCanvasAgentOpen(false));
    document.querySelector("#canvasAgentSkills")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-agent-skill]");
      if (button) {
        selectCanvasAgentSkill(button.dataset.agentSkill);
        closeCanvasAgentPopovers();
      }
    });
    document.querySelector("#canvasAgentSkillBook")?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleCanvasAgentPopover("skill");
    });
    document.querySelector("#canvasAgentAttach")?.addEventListener("click", () => {
      document.querySelector("#canvasAgentFileInput")?.click();
    });
    document.querySelector("#canvasAgentFileInput")?.addEventListener("change", async (event) => {
      await attachCanvasAgentFiles(event.currentTarget.files);
      event.currentTarget.value = "";
    });
    document.querySelector("#canvasAgentContext")?.addEventListener("click", handleCanvasAgentContextClick);
    document.querySelector("#canvasAgentMentions")?.addEventListener("click", handleCanvasAgentMentionClick);
    document.querySelector("#canvasAgentForm")?.addEventListener("submit", startCanvasAgentRun);
    const prompt = document.querySelector("#canvasAgentPrompt");
    prompt?.addEventListener("input", updateCanvasAgentMentionPopover);
    prompt?.addEventListener("click", updateCanvasAgentMentionPopover);
    prompt?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeCanvasAgentPopovers();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    });
    const form = document.querySelector("#canvasAgentForm");
    form?.addEventListener("dragover", handleCanvasAgentDragOver);
    form?.addEventListener("dragleave", handleCanvasAgentDragLeave);
    form?.addEventListener("drop", handleCanvasAgentDrop);
    form?.addEventListener("paste", handleCanvasAgentPaste);
    window.addEventListener("canvas:selectionchange", (event) => {
      syncCanvasAgentSelection(event.detail?.selectedIds);
    });
    window.addEventListener("canvas:board-changed", (event) => {
      void handleCanvasAgentBoardChanged(event.detail?.boardId);
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest("#canvasAgentSkillPopover, #canvasAgentMentionPopover, #canvasAgentSkillBook")) {
        closeCanvasAgentPopovers();
      }
    });
    document.querySelector("#canvasAgentStop")?.addEventListener("click", stopCanvasAgentRun);
    document.querySelector("#canvasAgentApprove")?.addEventListener("click", approveCanvasAgentTools);
    document.querySelector("#canvasAgentDecline")?.addEventListener("click", declineCanvasAgentTools);
    document.querySelector("#canvasAgentMessages")?.addEventListener("click", (event) => {
      const briefAction = event.target.closest(
        "[data-agent-brief-submit], [data-agent-brief-recommended], [data-agent-brief-cancel]",
      );
      if (briefAction) {
        if (briefAction.hasAttribute("data-agent-brief-cancel")) {
          cancelCanvasAgentDesignBrief();
        } else {
          submitCanvasAgentDesignBrief(briefAction.hasAttribute("data-agent-brief-recommended"));
        }
        return;
      }
      const imageChoice = event.target.closest("[data-agent-image-choice]");
      if (imageChoice) {
        chooseCanvasAgentImageAction(imageChoice.dataset.agentImageChoice);
        return;
      }
      if (event.target.closest("[data-agent-continue]")) continueCanvasAgentTask();
    });
  }

  function setCanvasAgentOpen(open, persist = true) {
    const workspace = document.querySelector(".canvas-workspace");
    const toggle = document.querySelector("#canvasAgentToggle");
    const panel = document.querySelector("#canvasAgentPanel");
    workspace?.classList.toggle("canvas-agent-open", Boolean(open));
    toggle?.setAttribute("aria-expanded", String(Boolean(open)));
    if (panel) {
      panel.inert = !open;
      panel.setAttribute("aria-hidden", String(!open));
    }
    if (persist) localStorage.setItem(PANEL_STORAGE_KEY, String(Boolean(open)));
    if (open) {
      void loadCanvasAgentSkills();
      requestAnimationFrame(() => window.renderCanvasConnections?.());
    }
  }

  function initializeCanvasAgentPanelResize() {
    const storedWidth = Number(localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
    applyCanvasAgentPanelWidth(Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : DEFAULT_PANEL_WIDTH, false);
  }

  function getCanvasAgentPanelWidthLimits() {
    const viewportWidth = Math.max(1, Number(window.innerWidth) || 1);
    const maxWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, viewportWidth - MIN_CANVAS_WIDTH));
    return { min: MIN_PANEL_WIDTH, max: maxWidth };
  }

  function clampCanvasAgentPanelWidth(value) {
    const { min, max } = getCanvasAgentPanelWidthLimits();
    const numericWidth = Number(value);
    const safeWidth = Number.isFinite(numericWidth) ? numericWidth : DEFAULT_PANEL_WIDTH;
    return Math.round(Math.min(max, Math.max(min, safeWidth)));
  }

  function applyCanvasAgentPanelWidth(value, persist = false) {
    const width = clampCanvasAgentPanelWidth(value);
    const workspace = document.querySelector(".canvas-workspace");
    const panel = document.querySelector("#canvasAgentPanel");
    const handle = document.querySelector("#canvasAgentResizeHandle");
    state.panelWidth = width;
    workspace?.style.setProperty("--agent-panel-width", `${width}px`);
    panel?.setAttribute("aria-valuenow", String(width));
    if (handle) {
      const { min, max } = getCanvasAgentPanelWidthLimits();
      handle.setAttribute("aria-valuemin", String(min));
      handle.setAttribute("aria-valuemax", String(max));
      handle.setAttribute("aria-valuenow", String(width));
    }
    if (persist) localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width));
    return width;
  }

  function beginCanvasAgentPanelResize(event) {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    const panel = document.querySelector("#canvasAgentPanel");
    const workspace = document.querySelector(".canvas-workspace");
    if (!handle || !panel || !workspace) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width || state.panelWidth;
    let nextWidth = state.panelWidth;
    let finished = false;
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch {}
    workspace.classList.add("is-resizing-canvas-agent");
    panel.classList.add("is-resizing");
    document.body.classList.add("canvas-agent-panel-resizing");

    const move = (moveEvent) => {
      nextWidth = applyCanvasAgentPanelWidth(startWidth + startX - moveEvent.clientX, false);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      try {
        handle.releasePointerCapture?.(event.pointerId);
      } catch {}
      workspace.classList.remove("is-resizing-canvas-agent");
      panel.classList.remove("is-resizing");
      document.body.classList.remove("canvas-agent-panel-resizing");
      applyCanvasAgentPanelWidth(nextWidth, true);
      requestAnimationFrame(() => window.renderCanvasConnections?.());
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function handleCanvasAgentPanelResizeKeydown(event) {
    const step = event.shiftKey ? 48 : 16;
    let nextWidth = state.panelWidth;
    if (event.key === "ArrowLeft") nextWidth += step;
    else if (event.key === "ArrowRight") nextWidth -= step;
    else if (event.key === "Home") nextWidth = MIN_PANEL_WIDTH;
    else if (event.key === "End") nextWidth = MAX_PANEL_WIDTH;
    else return;
    event.preventDefault();
    applyCanvasAgentPanelWidth(nextWidth, true);
    requestAnimationFrame(() => window.renderCanvasConnections?.());
  }

  async function handleCanvasAgentBoardChanged(boardId) {
    const nextBoardId = String(boardId || "");
    if (nextBoardId === state.activeBoardId) return;
    cancelCanvasAgentRecovery();
    state.broker.invalidate("board-changed");
    state.scope = null;
    state.runAbortController?.abort();
    state.runAbortController = null;
    if (state.currentRun?.status === "running") stopCanvasAgentRun();
    resetCanvasAgentRun({ keepMessages: true, clearContext: true });
    state.activeBoardId = nextBoardId;
    state.conversation = null;
    state.recoveryPrompt = "";
    if (!nextBoardId) {
      renderCanvasAgentConversation();
      return;
    }
    await loadCanvasAgentConversation(nextBoardId);
  }

  async function loadCanvasAgentConversation(boardId) {
    const normalizedBoardId = String(boardId || "");
    if (!normalizedBoardId) return;
    const token = ++state.conversationLoadToken;
    if (state.activeBoardId !== normalizedBoardId) {
    }
    state.activeBoardId = normalizedBoardId;
    const cached = state.conversationsByBoard.get(normalizedBoardId);
    if (cached) {
      state.conversation = cached;
      renderCanvasAgentConversation();
    }
    try {
      const response = await fetch(`${CONVERSATION_API_URL}?board_id=${encodeURIComponent(normalizedBoardId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "对话读取失败");
      if (token !== state.conversationLoadToken || state.activeBoardId !== normalizedBoardId) return;
      const loaded = CanvasAgentConversation.normalize(data, normalizedBoardId);
      const recovered = CanvasAgentConversation.markInterrupted(loaded);
      state.conversation = recovered;
      state.conversationsByBoard.set(normalizedBoardId, recovered);
      renderCanvasAgentConversation();
      if (JSON.stringify(loaded.items) !== JSON.stringify(recovered.items)) void saveCanvasAgentConversation(normalizedBoardId);
    } catch {
      if (token !== state.conversationLoadToken || state.activeBoardId !== normalizedBoardId) return;
      const fallback = cached || CanvasAgentConversation.create(normalizedBoardId);
      state.conversation = fallback;
      state.conversationsByBoard.set(normalizedBoardId, fallback);
      renderCanvasAgentConversation();
      setCanvasAgentStatus("对话暂未同步，仍可继续使用", "warn");
    }
  }

  function appendCanvasAgentConversationItem(item) {
    if (!state.activeBoardId || !state.conversation) return;
    state.conversation = CanvasAgentConversation.appendItems(state.conversation, [{
      id: item.id || `agent_item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      role: item.role,
      text: item.text,
      status: item.status || "completed",
      toolName: item.toolName || "",
      nodeId: item.nodeId || "",
      skillId: item.skillId || "",
      skillLabel: item.skillLabel || "",
      skillSource: item.skillSource || "",
      createdAt: item.createdAt || new Date().toISOString(),
    }]);
    state.conversationsByBoard.set(state.activeBoardId, state.conversation);
    void saveCanvasAgentConversation(state.activeBoardId);
  }

  function saveCanvasAgentConversation(boardId = state.activeBoardId) {
    const normalizedBoardId = String(boardId || "");
    if (!normalizedBoardId) return Promise.resolve();
    state.conversationSaveChain = state.conversationSaveChain.catch(() => {}).then(async () => {
      let conversation = state.conversationsByBoard.get(normalizedBoardId);
      if (!conversation) return;
      const send = async () => fetch(CONVERSATION_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board_id: normalizedBoardId,
          expected_revision: conversation.revision,
          conversation,
        }),
      });
      let response = await send();
      let data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.current) {
        const current = CanvasAgentConversation.normalize(data.current, normalizedBoardId);
        conversation = CanvasAgentConversation.appendItems(current, conversation.items);
        state.conversationsByBoard.set(normalizedBoardId, conversation);
        if (state.activeBoardId === normalizedBoardId) state.conversation = conversation;
        response = await send();
        data = await response.json().catch(() => ({}));
      }
      if (!response.ok) throw new Error(data.error || "对话保存失败");
      const saved = CanvasAgentConversation.normalize(data, normalizedBoardId);
      const latest = state.conversationsByBoard.get(normalizedBoardId) || saved;
      const merged = CanvasAgentConversation.appendItems(saved, latest.items);
      merged.revision = saved.revision;
      state.conversationsByBoard.set(normalizedBoardId, merged);
      if (state.activeBoardId === normalizedBoardId) state.conversation = merged;
    }).catch(() => {
      if (state.activeBoardId === normalizedBoardId) setCanvasAgentStatus("对话将在稍后继续同步", "warn");
    });
    return state.conversationSaveChain;
  }

  function renderCanvasAgentConversation() {
    const container = document.querySelector("#canvasAgentMessages");
    if (!container) return;
    container.innerHTML = "";
    const items = state.conversation?.items || [];
    const lastRecoverableIndex = items.reduce(
      (lastIndex, item, index) => item.status === "recoverable" ? index : lastIndex,
      -1,
    );
    if (!items.length) {
      container.innerHTML = `
        <div class="canvas-agent-welcome" id="canvasAgentWelcome">
          <span class="canvas-agent-welcome-orb"><i data-lucide="sparkles"></i></span>
          <p>今天想创作什么？</p>
          <small>描述目标，或从画布选取参考素材。</small>
        </div>`;
    } else {
      items.forEach((item, index) => {
        if (item.role === "tool") renderCanvasAgentStoredTool(item, container);
        else renderCanvasAgentMessage(item.role, item.text, {
          persist: false,
          recoverable: item.status === "recoverable" && index === lastRecoverableIndex,
          skillId: item.skillId,
          skillLabel: item.skillLabel,
          skillSource: item.skillSource,
        });
      });
    }
    renderCanvasAgentIcons(container);
    container.scrollTop = container.scrollHeight;
  }

  function renderCanvasAgentStoredTool(item, container = document.querySelector("#canvasAgentMessages")) {
    const status = item.status === "failed" ? "error" : item.status === "declined" ? "declined" : "success";
    const detail = item.nodeId
      ? `节点 ${formatCanvasAgentNodeId(item.nodeId)} · ${status === "declined" ? "已跳过" : "完成"}`
      : item.text || "已完成";
    const step = createCanvasAgentToolStep({
      status,
      title: formatCanvasAgentToolName(item.toolName) || "画布操作",
      detail,
      statusText: getCanvasAgentToolStatusText(status),
      icon: getCanvasAgentToolStatusIcon(status),
      toolName: item.toolName,
      fullDetail: item.nodeId ? `节点 ${item.nodeId}` : detail,
    });
    container?.append(step);
  }

  function removeCanvasAgentContinueActions() {
    document.querySelectorAll("#canvasAgentMessages [data-agent-continue]").forEach((button) => button.remove());
  }

  function continueCanvasAgentTask() {
    if (state.recovery?.exhausted) {
      const context = {
        ...state.recovery,
        token: ++state.recoveryGeneration,
        attempt: 0,
        exhausted: false,
        timer: null,
      };
      state.recovery = context;
      removeCanvasAgentContinueActions();
      void resumeCanvasAgentRecovery(context);
      return;
    }
    const input = document.querySelector("#canvasAgentPrompt");
    if (!input || state.currentRun?.status === "running") return;
    removeCanvasAgentContinueActions();
    input.value = state.recoveryPrompt || "继续完成刚才中断的任务。不要重复已经完成的画布操作，先检查当前画布状态。";
    input.form?.requestSubmit();
  }

  function toggleCanvasAgentPopover(type) {
    const skillPopover = document.querySelector("#canvasAgentSkillPopover");
    const mentionPopover = document.querySelector("#canvasAgentMentionPopover");
    if (type === "skill") {
      const open = skillPopover?.hidden !== false;
      if (skillPopover) skillPopover.hidden = !open;
      if (mentionPopover) mentionPopover.hidden = true;
      return;
    }
    if (skillPopover) skillPopover.hidden = true;
    if (mentionPopover) mentionPopover.hidden = type !== "mention";
  }

  function closeCanvasAgentPopovers() {
    const skillPopover = document.querySelector("#canvasAgentSkillPopover");
    const mentionPopover = document.querySelector("#canvasAgentMentionPopover");
    if (skillPopover) skillPopover.hidden = true;
    if (mentionPopover) mentionPopover.hidden = true;
    state.mentionRange = null;
  }

  // Lucide's bundled createIcons() rescans the whole document and replaces every
  // [data-lucide] element it finds. Canvas nodes render their own icons, so a
  // global pass that lands between a pointerdown and its mouseup swaps out the
  // element under the cursor and the browser then never dispatches click — the
  // node control silently swallows the first press. Convert only the Agent
  // panel's own placeholders.
  function renderCanvasAgentIcons(root = document.querySelector("#canvasAgentPanel")) {
    if (!root) return;
    const renderScoped = window.renderCanvasNodeIcons;
    if (typeof renderScoped === "function") {
      renderScoped(root);
      return;
    }
    window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  }

  function syncCanvasAgentSelection(selectedIds) {
    const nextIds = new Set((Array.isArray(selectedIds)
      ? selectedIds
      : getSelectedAgentNodes().map((node) => node.dataset.id))
      .map(String)
      .filter(Boolean));
    nextIds.forEach((id) => {
      if (!state.selectedNodeIds.has(id)) state.excludedNodeIds.delete(id);
    });
    state.selectedNodeIds = nextIds;
    renderCanvasAgentContext();
  }

  function getAgentContextNodes() {
    const ids = new Set([...state.selectedNodeIds, ...state.mentionedNodeIds]);
    return Array.from(document.querySelectorAll("#canvasPlane .canvas-node"))
      .filter((node) => ids.has(String(node.dataset.id || "")) && !state.excludedNodeIds.has(String(node.dataset.id || "")));
  }

  function getSelectedCanvasImageReferenceNodeIds(nodes = getAgentContextNodes()) {
    return Array.from(new Set((Array.isArray(nodes) ? nodes : [])
      .filter((node) => {
        const output = window.getCanvasNodeOutput?.(node);
        return output?.type === "image" && Boolean(output.url || output.savedUrl || output.src);
      })
      .map((node) => String(node.dataset.id || ""))
      .filter(Boolean)));
  }

  function normalizeCanvasAgentImageEditCall(call = {}) {
    if (!["create_image_node", "generate_image_to_gallery"].includes(String(call.name || ""))) return call;
    const selectedReferenceNodeIds = getSelectedCanvasImageReferenceNodeIds();
    if (!selectedReferenceNodeIds.length) return call;
    const requestedReferenceNodeIds = Array.isArray(call.arguments?.reference_node_ids)
      ? call.arguments.reference_node_ids.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    return {
      ...call,
      arguments: {
        ...(call.arguments || {}),
        reference_node_ids: Array.from(new Set([...selectedReferenceNodeIds, ...requestedReferenceNodeIds])),
      },
    };
  }

  function getAgentNodeReferences(nodes = getAgentContextNodes()) {
    return CanvasAgentCore.normalizeAgentReferences(nodes.map((node) => ({
      nodeId: String(node.dataset.id || ""),
      kind: getAgentNodeKind(node),
      output: window.getCanvasNodeOutput?.(node) || { type: getAgentNodeKind(node), name: getAgentNodeDisplayName(node) },
    })), 15);
  }

  function renderCanvasAgentContext() {
    const container = document.querySelector("#canvasAgentContext");
    if (!container) return;
    const skill = getActiveSkill();
    const references = getAgentNodeReferences();
    container.innerHTML = "";
    if (skill) container.append(createCanvasAgentContextChip({
      key: "skill",
      type: "skill",
      name: skill.label || skill.name,
      icon: skill.icon || "sparkles",
    }));
    references.forEach((reference) => container.append(createCanvasAgentContextChip(reference)));
    container.hidden = !skill && !references.length;
    const mode = document.querySelector("#canvasAgentMode");
    if (mode) mode.textContent = skill ? skill.label || skill.name : "自动";
    renderCanvasAgentIcons(container);
  }

  function createCanvasAgentContextChip(reference) {
    const chip = document.createElement("span");
    chip.className = `canvas-agent-context-chip is-${reference.type || "node"}`;
    chip.dataset.agentContextKey = reference.key;
    chip.dataset.agentNodeId = reference.nodeId || "";
    if (reference.type === "image" && reference.url) {
      const image = document.createElement("img");
      image.alt = "";
      window.imageResources?.observe(image, reference.url, { allowOriginalFallback: false });
      chip.append(image);
    } else {
      const icon = document.createElement("i");
      icon.dataset.lucide = reference.icon || getCanvasAgentReferenceIcon(reference.type);
      chip.append(icon);
    }
    const label = document.createElement("span");
    label.textContent = reference.name || "画布节点";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.removeAgentContext = reference.key;
    remove.setAttribute("aria-label", `移除 ${label.textContent}`);
    remove.innerHTML = '<i data-lucide="x"></i>';
    chip.append(label, remove);
    return chip;
  }

  function getCanvasAgentReferenceIcon(type) {
    return ({
      skill: "book-open",
      video: "film",
      audio: "audio-lines",
      text: "type",
      llm: "message-square-text",
      generator: "image-plus",
      "video-generator": "video",
    })[type] || "box";
  }

  function handleCanvasAgentContextClick(event) {
    const button = event.target.closest("[data-remove-agent-context]");
    if (!button) return;
    const chip = button.closest("[data-agent-context-key]");
    if (chip?.dataset.agentContextKey === "skill") {
      state.activeSkillId = "";
      renderCanvasAgentSkills();
      setCanvasAgentStatus("自动模式 · 可直接开始");
      renderCanvasAgentContext();
      return;
    }
    const nodeId = String(chip?.dataset.agentNodeId || "");
    if (nodeId) {
      state.excludedNodeIds.add(nodeId);
      state.mentionedNodeIds.delete(nodeId);
      renderCanvasAgentContext();
    }
  }

  function getAgentNodeDisplayName(node) {
    const output = window.getCanvasNodeOutput?.(node);
    if (output?.name) return String(output.name);
    if (output?.text) return String(output.text).slice(0, 32);
    const prompt = node.querySelector(".canvas-node-prompt, .canvas-llm-prompt, .canvas-h3-prompt")?.value?.trim();
    if (prompt) return prompt.slice(0, 32);
    return ({
      image: "图片节点",
      gallery: "图集",
      "grid-editor": "宫格编辑",
      text: "文字",
      video: "视频",
      audio: "音频",
      group: "图片组",
      loop: "循环节点",
    })[getAgentNodeKind(node)] || "画布节点";
  }

  function updateCanvasAgentMentionPopover() {
    const input = document.querySelector("#canvasAgentPrompt");
    if (!input) return;
    const cursor = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
    const prefix = input.value.slice(0, cursor);
    const match = prefix.match(/@([^\s@]{0,30})$/);
    if (!match) {
      const popover = document.querySelector("#canvasAgentMentionPopover");
      if (popover) popover.hidden = true;
      state.mentionRange = null;
      return;
    }
    state.mentionRange = { start: cursor - match[0].length, end: cursor };
    renderCanvasAgentMentions(match[1]);
    toggleCanvasAgentPopover("mention");
  }

  function renderCanvasAgentMentions(query) {
    const container = document.querySelector("#canvasAgentMentions");
    if (!container) return;
    const keyword = String(query || "").trim().toLowerCase();
    const nodes = Array.from(document.querySelectorAll("#canvasPlane .canvas-node"))
      .map((node, index) => ({ node, index, name: getAgentNodeDisplayName(node), kind: getAgentNodeKind(node) }))
      .filter((item) => !keyword || `${item.name} ${item.kind}`.toLowerCase().includes(keyword))
      .sort((left, right) => Number(right.node.classList.contains("is-selected")) - Number(left.node.classList.contains("is-selected")) || left.index - right.index)
      .slice(0, 8);
    container.innerHTML = "";
    nodes.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.agentMentionId = item.node.dataset.id;
      const output = window.getCanvasNodeOutput?.(item.node);
      if ((output?.type === "image" || output?.type === "grid-editor") && output.url) {
        const image = document.createElement("img");
        window.imageResources?.observe(image, output.url, { allowOriginalFallback: false });
        image.alt = "";
        button.append(image);
      } else {
        const icon = document.createElement("i");
        icon.dataset.lucide = getCanvasAgentReferenceIcon(output?.type || item.kind);
        button.append(icon);
      }
      const copy = document.createElement("span");
      copy.innerHTML = `<strong></strong><small></small>`;
      copy.querySelector("strong").textContent = item.name;
      copy.querySelector("small").textContent = item.kind;
      button.append(copy);
      container.append(button);
    });
    if (!nodes.length) {
      const empty = document.createElement("p");
      empty.textContent = "没有匹配的画布节点";
      container.append(empty);
    }
    renderCanvasAgentIcons(container);
  }

  function handleCanvasAgentMentionClick(event) {
    const button = event.target.closest("[data-agent-mention-id]");
    if (!button || !state.mentionRange) return;
    const nodeId = String(button.dataset.agentMentionId || "");
    const node = getAgentNodeById(nodeId);
    const input = document.querySelector("#canvasAgentPrompt");
    if (!node || !input) return;
    const name = getAgentNodeDisplayName(node).replace(/\s+/g, " ").trim();
    input.setRangeText(`@${name} `, state.mentionRange.start, state.mentionRange.end, "end");
    state.mentionedNodeIds.add(nodeId);
    state.excludedNodeIds.delete(nodeId);
    closeCanvasAgentPopovers();
    renderCanvasAgentContext();
    input.focus();
  }

  function getAgentNodeById(id) {
    const nodeId = String(id || "");
    return Array.from(document.querySelectorAll("#canvasPlane .canvas-node"))
      .find((node) => String(node.dataset.id || "") === nodeId) || null;
  }

  function handleCanvasAgentDragOver(event) {
    if (!Array.from(event.dataTransfer?.items || []).some((item) => item.type.startsWith("image/"))) return;
    event.preventDefault();
    event.currentTarget.classList.add("is-drag-over");
  }

  function handleCanvasAgentDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    event.currentTarget.classList.remove("is-drag-over");
  }

  async function handleCanvasAgentDrop(event) {
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    event.currentTarget.classList.remove("is-drag-over");
    await attachCanvasAgentFiles(files);
  }

  async function handleCanvasAgentPaste(event) {
    const files = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    event.preventDefault();
    await attachCanvasAgentFiles(files);
  }

  async function attachCanvasAgentFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file?.type?.startsWith("image/"));
    if (!files.length) return;
    setCanvasAgentStatus(`正在添加 ${files.length} 张图片…`);
    try {
      const origin = window.getCanvasViewportCenterPoint?.() || { x: 240, y: 180 };
      const created = [];
      for (const [index, file] of files.entries()) {
        const url = await window.uploadCanvasImageFile(file);
        const node = window.addCanvasImage(url, file.name || `参考图 ${index + 1}`, {
          x: origin.x + index * 34,
          y: origin.y + index * 34,
        });
        if (node?.dataset?.id) {
          state.mentionedNodeIds.add(String(node.dataset.id));
          state.excludedNodeIds.delete(String(node.dataset.id));
          created.push(node);
        }
      }
      if (created.length) window.selectCanvasNode?.(created.at(-1));
      renderCanvasAgentContext();
      setCanvasAgentStatus(`已添加 ${created.length} 张参考图`);
    } catch (error) {
      setCanvasAgentStatus(`图片添加失败：${error.message}`, "error");
    }
  }

  async function loadCanvasAgentSkills() {
    const revision = ++state.catalogRevision;
    try {
      const response = await fetch(SKILLS_API_URL);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `${response.status} ${response.statusText}`);
      if (revision !== state.catalogRevision) return;
      state.skills = Array.isArray(data.skills) ? data.skills : [];
      state.pickerSkills = Array.isArray(data.pickerSkills)
        ? data.pickerSkills
        : state.skills.filter((skill) => skill.origin === "custom");
      state.agentSettings = data.agentSettings || null;
      state.configured = Boolean(data.configured);
      document.querySelector("#canvasAgentSkillHint").textContent = state.pickerSkills.length
        ? `${state.pickerSkills.length} 个已安装 Skill`
        : "暂无已安装 Skill";
      renderCanvasAgentSkills();
      renderCanvasAgentContext();
      renderCanvasAgentModelStatus();
    } catch (error) {
      if (revision !== state.catalogRevision) return;
      state.skills = [];
      state.pickerSkills = [];
      setCanvasAgentStatus(`专业流程暂不可用：${error.message}`, "warn");
      document.querySelector("#canvasAgentSkillHint").textContent = "加载失败";
    }
  }

  function renderCanvasAgentModelStatus() {
    if (["running", "recovering"].includes(state.currentRun?.status)) return;
    if (!state.configured) {
      setCanvasAgentStatus("请在 API 设置中添加多模态 Agent 模型", "warn");
    } else if (!state.agentSettings?.configured) {
      setCanvasAgentStatus("请在 Agent 设置中选择主模型", "warn");
    } else if (state.agentSettings.unavailableCount) {
      setCanvasAgentStatus("部分 Agent 模型不可用，请检查设置", "warn");
    } else {
      setCanvasAgentStatus(`主模型已就绪 · ${state.agentSettings.candidateCount || 0} 个候选`);
    }
  }

  function renderCanvasAgentSkills() {
    const container = document.querySelector("#canvasAgentSkills");
    if (!container) return;
    container.innerHTML = "";
    const pickerSkills = Array.isArray(state.pickerSkills) ? state.pickerSkills : [];
    if (!pickerSkills.length) {
      const empty = document.createElement("p");
      empty.className = "canvas-agent-skill-empty";
      empty.textContent = "系统 Skill 会按需求自动匹配，不需要手动挑。自己安装的功能 Skill 放进软件数据目录的 skills 文件夹后就会出现在这里。";
      container.append(empty);
      return;
    }
    const groups = [];
    const groupsById = new Map();
    pickerSkills.forEach((skill) => {
      const groupId = skill.packageId || "custom:standalone";
      let group = groupsById.get(groupId);
      if (!group) {
        group = {
          id: groupId,
          label: skill.packageLabel || "独立功能 Skill",
          standalone: Boolean(skill.standalone),
          skills: [],
        };
        groupsById.set(groupId, group);
        groups.push(group);
      }
      group.skills.push(skill);
    });
    groups.sort((left, right) => (
      Number(left.standalone) - Number(right.standalone)
      || left.label.localeCompare(right.label, "zh-CN")
    ));
    groups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "canvas-agent-skill-group";
      section.dataset.agentSkillGroup = group.id;
      const heading = document.createElement("header");
      heading.className = "canvas-agent-skill-group-heading";
      const title = document.createElement("strong");
      title.textContent = group.label;
      const count = document.createElement("small");
      count.textContent = `${group.skills.length} 个 Skill`;
      heading.append(title, count);
      const list = document.createElement("div");
      list.className = "canvas-agent-skill-group-list";
      group.skills.forEach((skill) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "canvas-agent-skill";
        button.dataset.agentSkill = skill.id;
        button.classList.toggle("active", skill.id === state.activeSkillId);
        const icon = document.createElement("span");
        icon.className = "canvas-agent-skill-icon";
        const iconNode = document.createElement("i");
        iconNode.dataset.lucide = skill.icon || "sparkles";
        icon.append(iconNode);
        const copy = document.createElement("span");
        const skillTitle = document.createElement("strong");
        skillTitle.textContent = skill.label || skill.name;
        const description = document.createElement("small");
        description.textContent = skill.description;
        copy.append(skillTitle, description);
        if (skill.required_selection === "image") {
          const badge = document.createElement("b");
          badge.textContent = "需选图";
          copy.append(badge);
        }
        button.append(icon, copy);
        list.append(button);
      });
      section.append(heading, list);
      container.append(section);
    });
    // 技能书只列用户自己安装的功能 Skill；系统 Skill 由路由按需求自动匹配，
    // 这里补一句说明，避免用户以为系统能力被删掉了。
    const note = document.createElement("p");
    note.className = "canvas-agent-skill-empty";
    note.textContent = "系统 Skill 会按你的需求自动匹配，不需要在这里选。";
    container.append(note);
    renderCanvasAgentIcons(container);
  }

  function selectCanvasAgentSkill(skillId) {
    if (!state.skills.some((skill) => skill.id === skillId)) return;
    state.activeSkillId = state.activeSkillId === skillId ? "" : skillId;
    renderCanvasAgentSkills();
    const skill = getActiveSkill();
    setCanvasAgentStatus(skill ? `${skill.label} · 专业流程已启用` : "自动模式 · 可直接开始");
    renderCanvasAgentContext();
  }

  function getActiveSkill() {
    return state.skills.find((skill) => skill.id === state.activeSkillId) || null;
  }

  function createCanvasAgentSkillContract(skill, options = {}) {
    if (!skill || typeof CanvasAgentSkillContract?.createContract !== "function") return null;
    return CanvasAgentSkillContract.createContract(skill, {
      prompt: String(options.prompt || state.currentRun?.prompt || ""),
      manualActivated: options.manualActivated !== false,
    });
  }

  function restoreCanvasAgentSkillContract(value) {
    if (!value || typeof value !== "object") return null;
    return {
      ...value,
      references: Array.isArray(value.references) ? [...value.references] : [],
      requiredReferences: Array.isArray(value.requiredReferences) ? [...value.requiredReferences] : [],
      readReferences: Array.isArray(value.readReferences) ? [...value.readReferences] : [],
      deliverable: value.deliverable && typeof value.deliverable === "object"
        ? {
            ...value.deliverable,
            toolNames: Array.isArray(value.deliverable.toolNames) ? [...value.deliverable.toolNames] : [],
            requiredReferences: Array.isArray(value.deliverable.requiredReferences)
              ? [...value.deliverable.requiredReferences]
              : [],
            rules: Array.isArray(value.deliverable.rules) ? [...value.deliverable.rules] : [],
          }
        : null,
      lastViolation: value.lastViolation && typeof value.lastViolation === "object"
        ? { ...value.lastViolation }
        : null,
    };
  }

  function getCanvasAgentSkillRequiredReferences(contract = state.currentRun?.skillContract) {
    const configured = Array.isArray(contract?.requiredReferences) ? contract.requiredReferences : [];
    const fallback = String(contract?.deliverable?.requiredReference || "").trim();
    return Array.from(new Set([
      ...configured.map((item) => String(item || "").trim()).filter(Boolean),
      ...(fallback ? [fallback] : []),
    ]));
  }

  function applyCanvasAgentNamedSkill(skillId, options = {}) {
    const run = state.currentRun;
    const skill = state.skills.find((item) => item.id === String(skillId || ""));
    if (!run || !skill) return null;
    if (run.skillContract?.skillId === skill.id && run.skillContract?.stage === CanvasAgentSkillContract.classifySkillStage(skill, run.prompt)) {
      return run.skillContract;
    }
    run.skillContract = createCanvasAgentSkillContract(skill, {
      prompt: run.prompt,
      manualActivated: options.manualActivated === true,
    });
    return run.skillContract;
  }

  async function startCanvasAgentRun(event, options = {}) {
    event?.preventDefault?.();
    const recovery = options.recovery || null;
    if (!recovery && state.currentRun?.status === "running") return;
    if (!recovery) cancelCanvasAgentRecovery();
    if (recovery && (state.recovery !== recovery || recovery.token !== state.recoveryGeneration)) return;
    const resumeSkill = !recovery
      ? state.skills.find((item) => item.id === state.pendingResumeSkillId) || null
      : null;
    const skill = recovery
      ? state.skills.find((item) => item.id === recovery.skillId) || null
      : resumeSkill || getActiveSkill();
    const input = document.querySelector("#canvasAgentPrompt");
    const prompt = String(recovery?.prompt || input?.value || "").trim();
    if (!prompt) {
      setCanvasAgentStatus("请描述你希望完成的任务", "warn");
      input?.focus();
      return;
    }

    const board = window.ensureCanvasBoardIdentity?.() || window.getActiveCanvasBoardInfo?.();
    const boardId = String(board?.id || "");
    if (!boardId) {
      setCanvasAgentStatus("当前画布还未准备好", "warn");
      return;
    }
    if (recovery && boardId !== recovery.boardId) return;
    if (state.activeBoardId !== boardId || !state.conversation) await loadCanvasAgentConversation(boardId);
    const conversationContext = CanvasAgentConversation.buildTranscript(state.conversation);
    const selectedNodes = getAgentContextNodes();

    const trustedPaidAllowances = recovery?.paidAllowances || state.nextPaidAllowances;
    const selectedImageEditAllowance = !recovery && CanvasAgentCore.getSelectedImageEditGenerationAllowance(
      prompt,
      getSelectedCanvasImageReferenceNodeIds(selectedNodes).length > 0,
    );
    const initialPaidAllowances = selectedImageEditAllowance
      ? { generate_image_to_gallery: selectedImageEditAllowance }
      : trustedPaidAllowances;
    if (!recovery) state.nextPaidAllowances = null;
    resetCanvasAgentRun({
      keepMessages: true,
      keepRecovery: Boolean(recovery),
      keepResumeSkill: Boolean(resumeSkill),
    });
    state.currentRun = CanvasAgentCore.createRunState({
      id: `canvas_agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      skillId: skill?.id || "",
      maxSteps: skill?.execution?.limits?.maxRounds,
      maxToolCalls: skill?.execution?.limits?.maxToolCalls,
      ...(initialPaidAllowances ? { paidAllowances: initialPaidAllowances } : {}),
    });
    state.pendingResumeSkillId = "";
    state.currentRun.boardId = boardId;
    state.currentRun.conversationContext = conversationContext;
    state.currentRun.activeSkillId = "";
    state.currentRun.skillContract = recovery?.skillContract
      ? restoreCanvasAgentSkillContract(recovery.skillContract)
      : createCanvasAgentSkillContract(skill, { prompt });
    state.currentRun.recoveryAttempt = Number(recovery?.attempt || 0);
    state.currentRun.recoveryToken = Number(recovery?.token || 0);
    state.runAbortController = new AbortController();
    state.scope = state.broker.beginRun({
      boardId,
      runId: state.currentRun.id,
      abortSignal: state.runAbortController.signal,
    });
    state.creationIndex = 0;
    state.paidAttempts.clear();
    const runId = state.currentRun.id;
    if (!recovery) {
      input.value = "";
      addCanvasAgentMessage("user", prompt, {
        skillId: skill?.id || "",
        skillLabel: skill?.label || "",
        skillSource: skill ? "manual" : "",
      });
    }
    setCanvasAgentBusy(true);
    if (recovery) setCanvasAgentStatus(`网络波动，正在自动恢复 ${recovery.attempt}/3`, "warn");
    persistCanvasAgentRun();

    try {
      if (!recovery && await tryCanvasAgentDirectSelectedImageEdit(runId)) return;
    } catch (error) {
      handleCanvasAgentFailure(error, runId);
      return;
    }

    let turn;
    try {
      const rawBoard = window.serializeCanvasBoard();
      const selectedIds = selectedNodes.map((node) => node.dataset.id);
      const canvas = CanvasAgentCore.summarizeCanvasBoard(rawBoard, selectedIds);
      const visionImages = await collectCanvasAgentVisionImages(selectedNodes);
      turn = await requestCanvasAgentTurn({
        skill_mode: skill ? "manual" : "auto",
        skill_id: skill?.id || "",
        prompt: recovery ? buildCanvasAgentRecoveryInstruction(prompt) : prompt,
        ...(recovery ? {
          recovery_original_prompt: prompt,
          recovery_attempt: recovery.attempt,
        } : {}),
        canvas,
        vision_images: visionImages,
        board_id: boardId,
        conversation_context: conversationContext,
        step: 0,
      }, runId);
    } catch (error) {
      try {
        if (!recovery && await tryCanvasAgentDirectImageFallback(error, runId)) return;
      } catch (fallbackError) {
        handleCanvasAgentFailure(fallbackError, runId);
        return;
      }
      handleCanvasAgentFailure(error, runId);
      return;
    }

    try {
      await handleCanvasAgentTurn(turn, runId);
    } catch (error) {
      try {
        if (await tryCanvasAgentDirectImageFallback(error, runId)) return;
      } catch (fallbackError) {
        handleCanvasAgentFailure(fallbackError, runId);
        return;
      }
      handleCanvasAgentFailure(error, runId);
    }
  }

  async function tryCanvasAgentDirectSelectedImageEdit(runId = state.currentRun?.id) {
    if (!isCanvasAgentRunActive(runId)) return false;
    const referenceNodeIds = getSelectedCanvasImageReferenceNodeIds();
    if (!CanvasAgentCore.getSelectedImageEditGenerationAllowance(state.currentRun?.prompt, referenceNodeIds.length > 0)) return false;
    await executeCanvasAgentDirectImageGeneration({
      prompt: state.currentRun.prompt,
      referenceNodeIds,
      message: "已把选中的画布图片作为编辑源，正在创建编辑节点并生成图片。",
    }, runId);
    return true;
  }

  async function executeCanvasAgentDirectImageGeneration({ prompt, referenceNodeIds = [], message }, runId = state.currentRun?.id) {
    await handleCanvasAgentTurn({
      response_id: "",
      message: String(message || "正在按你的明确生图要求创建节点、生成图片并加入图集。"),
      tool_calls: [{
        call_id: `direct_image_${runId}`,
        name: "generate_image_to_gallery",
        arguments: {
          prompt: String(prompt || "").trim(),
          model: null,
          size: null,
          resolution: null,
          reference_node_ids: Array.from(new Set((Array.isArray(referenceNodeIds) ? referenceNodeIds : []).map(String).filter(Boolean))),
          title: null,
        },
      }],
    }, runId, { terminalToolRun: true });
  }

  async function tryCanvasAgentDirectImageFallback(error, runId = state.currentRun?.id) {
    if (!isCanvasAgentRunActive(runId) || error?.name === "AbortError") return false;
    const run = state.currentRun;
    if (
      !run
      || run.imageGenerated
      || run.forcedImageGeneration
      || Number(run.paidAllowances?.generate_image_to_gallery || 0) < 1
    ) return false;
    const board = window.ensureCanvasBoardIdentity?.() || window.getActiveCanvasBoardInfo?.();
    if (String(board?.id || "") !== String(state.currentRun?.boardId || "")) return false;
    const selectedIds = getAgentContextNodes().map((node) => node.dataset.id);
    const canvas = CanvasAgentCore.summarizeCanvasBoard(window.serializeCanvasBoard(), selectedIds);
    const selectedImageReferenceNodeIds = getSelectedCanvasImageReferenceNodeIds();
    const intent = CanvasAgentCore.parseDirectImageFallbackIntent(state.currentRun?.prompt, canvas, {
      allowNewWithReusableGenerator: true,
    })
      || (CanvasAgentCore.getSelectedImageEditGenerationAllowance(state.currentRun?.prompt, selectedImageReferenceNodeIds.length > 0)
        ? { prompt: String(state.currentRun?.prompt || "").trim() }
        : null);
    if (!intent) return false;
    removeCanvasAgentWaiting(runId);
    addCanvasAgentMessage("notice", "Agent 文字线路暂时不可用，已切换为画布本地执行通道。", { transient: true });
    await executeCanvasAgentDirectImageGeneration({
      prompt: intent.prompt,
      referenceNodeIds: selectedImageReferenceNodeIds,
    }, runId);
    return true;
  }

  function isCanvasAgentRunActive(runId) {
    return Boolean(runId && state.currentRun?.id === runId && state.currentRun.status === "running");
  }

  function createCanvasAgentAbortError() {
    const error = new Error("Agent run is no longer active.");
    error.name = "AbortError";
    return error;
  }

  async function requestCanvasAgentTurn(payload, runId = state.currentRun?.id) {
    if (!isCanvasAgentRunActive(runId)) throw createCanvasAgentAbortError();
    showCanvasAgentWaiting(runId);
    setCanvasAgentStatus("");
    const controller = new AbortController();
    state.abortController = controller;
    try {
      const response = await fetch(TURN_API_URL, {
        method: "POST",
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...payload, run_id: runId }),
        signal: controller.signal,
      });
      if (!isCanvasAgentRunActive(runId)) throw createCanvasAgentAbortError();
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("application/x-ndjson")) {
        const data = await response.json().catch(() => ({}));
        if (!isCanvasAgentRunActive(runId)) throw createCanvasAgentAbortError();
        if (!response.ok) {
          const error = new Error(data.error?.message || data.error || data.message || `${response.status} ${response.statusText}`);
          error.recoverable = Boolean(data.recoverable) || response.status >= 500;
          throw error;
        }
        return data;
      }
      return await readCanvasAgentEventStream(response, runId);
    } finally {
      if (state.abortController === controller) state.abortController = null;
    }
  }

  async function readCanvasAgentEventStream(response, runId) {
    if (!response.body?.getReader) throw new Error("Agent 响应流不可用，请重试。");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let turn = null;
    let streamFinished = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (!isCanvasAgentRunActive(runId)) throw createCanvasAgentAbortError();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        if (buffer.length > MAX_AGENT_EVENT_LINE_CHARS) throw new Error("Agent 单条响应过大，已停止处理。");
        const lines = buffer.split(/\r?\n/);
        buffer = done ? "" : lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.length > MAX_AGENT_EVENT_LINE_CHARS) throw new Error("Agent 单条响应过大，已停止处理。");
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            throw new Error("Agent 返回了无法识别的响应。");
          }
          if (event.type === "status") scheduleCanvasAgentStage(event.stage, runId);
          if (event.type === "turn") {
            turn = event.turn;
            removeCanvasAgentWaiting(runId);
            await reader.cancel().catch(() => {});
            streamFinished = true;
            return turn;
          }
          if (event.type === "error") {
            const error = new Error(String(event.error || "Agent 服务暂时不可用。"));
            error.recoverable = Boolean(event.recoverable);
            throw error;
          }
        }
        if (done) {
          streamFinished = true;
          break;
        }
      }
    } finally {
      if (!streamFinished) await reader.cancel().catch(() => {});
      reader.releaseLock?.();
    }
    if (!turn) throw new Error("Agent 响应提前结束，请重试。");
    return turn;
  }

  function scheduleCanvasAgentStage(stage, runId = state.currentRun?.id) {
    const label = AGENT_STAGE_ARIA_LABELS[stage];
    if (!label || !isCanvasAgentRunActive(runId)) return;
    const waiting = document.querySelector("#canvasAgentMessages .canvas-agent-waiting");
    if (waiting?.dataset.runId !== runId) return;
    waiting?.setAttribute("aria-label", label);
    const accessibleLabel = waiting?.querySelector(".canvas-agent-sr-only");
    if (accessibleLabel) accessibleLabel.textContent = label;
  }

  async function handleCanvasAgentTurn(turn, runId = state.currentRun?.id, options = {}) {
    if (!isCanvasAgentRunActive(runId)) return;
    removeCanvasAgentWaiting(runId);
    state.currentRun = CanvasAgentCore.advanceRunState(state.currentRun, {
      responseId: turn.response_id,
      message: turn.message,
      toolCalls: turn.tool_calls,
    });
    if (turn.message) addCanvasAgentMessage("assistant", turn.message);
    applyCanvasAgentAutoSkill(turn);
    const calls = Array.isArray(turn.tool_calls) ? turn.tool_calls : [];
    if (!calls.length) {
      if (await tryCanvasAgentEnsureImageGeneration(runId, turn.message)) return;
      if (await tryContinueCanvasAgentForSkillViolation(turn.message, runId)) return;
      finishCanvasAgentRun("completed", "任务完成", runId);
      return;
    }
    if (state.currentRun.step >= state.currentRun.maxSteps) {
      throw new Error(`已达到 ${state.currentRun.maxSteps} 回合上限，已停止继续调用工具。`);
    }
    const discussionOnly = calls.some((call) => CanvasAgentCore.shouldBlockCanvasToolForDiscussion(
      state.currentRun.imageGenerationIntent,
      call.name,
    ));
    if (discussionOnly) {
      const discussionOutputs = calls.map((call) => {
        const output = {
          ok: false,
          tool: call.name,
          code: "discussion_only",
          error: "本轮只讨论提示词和参数，未执行图片生成。",
        };
        const step = addCanvasAgentToolStep(call);
        updateCanvasAgentToolStep(step, "declined", "讨论模式 · 未执行");
        rememberCompletedCanvasAgentToolCall(call, output, runId);
        persistCanvasAgentToolResult(call, output, runId);
        return { call_id: call.call_id, output };
      });
      addCanvasAgentMessage("notice", "已保持讨论状态，没有执行图片生成。", { transient: true });
      await continueCanvasAgentWithToolOutputs(discussionOutputs, turn.response_id, runId);
      return;
    }
    const terminalToolRun = Boolean(options.terminalToolRun)
      || CanvasAgentCore.shouldUseTerminalToolRun(state.currentRun.prompt, calls);
    const uncompletedCalls = calls.filter((call) => getCompletedCanvasAgentToolCall(call, runId).state === "missing");
    const approvalPlan = CanvasAgentCore.buildApprovalPlan(uncompletedCalls, {
      paidAllowances: state.currentRun.paidAllowances,
    });
    state.currentRun = CanvasAgentCore.consumePaidAllowances(state.currentRun, approvalPlan.authorizedCalls);
    persistCanvasAgentRun();
    if (approvalPlan.requiresApproval) {
      const riskyCallIds = new Set(approvalPlan.calls.map((call) => String(call.call_id || "")));
      const safeCalls = calls.filter((call) => !riskyCallIds.has(String(call.call_id || "")));
      const safeOutputs = await executeCanvasAgentCallBatch(safeCalls, runId);
      if (!isCanvasAgentRunActive(runId)) return;
      state.pendingApproval = {
        calls: approvalPlan.calls,
        responseId: turn.response_id,
        safeOutputs,
        boardId: state.currentRun.boardId,
        runId,
        callIds: approvalPlan.calls.map((call) => String(call.call_id || "")),
        terminalToolRun,
      };
      showCanvasAgentApproval(approvalPlan);
      persistCanvasAgentRun();
      return;
    }
    if (terminalToolRun) {
      await executeCanvasAgentTerminalToolRun(calls, runId);
      return;
    }
    await executeCanvasAgentToolsAndContinue(calls, turn.response_id, runId);
  }

  function showCanvasAgentApproval(plan) {
    const approval = document.querySelector("#canvasAgentApproval");
    document.querySelector("#canvasAgentApprovalText").textContent = plan.summary;
    approval.hidden = false;
    setCanvasAgentStatus("等待确认", "warn");
    addCanvasAgentMessage("notice", `${plan.summary}。确认仅对这一步生效。`, { transient: true });
  }

  async function approveCanvasAgentTools() {
    if (!state.currentRun || !state.pendingApproval) return;
    const runId = state.currentRun.id;
    const pending = state.pendingApproval;
    const currentBoardId = String(CanvasAgentCanvasApi.getBoardId() || "");
    const callIdsAreValid = pending.callIds.length === pending.calls.length
      && pending.callIds.every((callId, index) => callId && callId === String(pending.calls[index]?.call_id || ""));
    if (
      pending.runId !== runId
      || pending.boardId !== currentBoardId
      || !callIdsAreValid
      || !state.broker.isActive(state.scope)
    ) {
      state.pendingApproval = null;
      document.querySelector("#canvasAgentApproval").hidden = true;
      handleCanvasAgentFailure(new Error("当前画布已改变，旧任务已安全停止。"), runId);
      return;
    }
    state.pendingApproval = null;
    document.querySelector("#canvasAgentApproval").hidden = true;
    setCanvasAgentStatus("已确认，继续执行");
    persistCanvasAgentRun();
    try {
      if (pending.terminalToolRun) {
        await executeCanvasAgentTerminalToolRun(pending.calls, runId, pending.safeOutputs);
        return;
      }
      await executeCanvasAgentToolsAndContinue(pending.calls, pending.responseId, runId, pending.safeOutputs);
    } catch (error) {
      handleCanvasAgentFailure(error, runId);
    }
  }

  async function declineCanvasAgentTools() {
    if (!state.currentRun || !state.pendingApproval) return;
    const runId = state.currentRun.id;
    const pending = state.pendingApproval;
    const currentBoardId = String(CanvasAgentCanvasApi.getBoardId() || "");
    const callIdsAreValid = pending.callIds.length === pending.calls.length
      && pending.callIds.every((callId, index) => callId && callId === String(pending.calls[index]?.call_id || ""));
    if (
      pending.runId !== runId
      || pending.boardId !== currentBoardId
      || !callIdsAreValid
      || !state.broker.isActive(state.scope)
    ) {
      state.pendingApproval = null;
      document.querySelector("#canvasAgentApproval").hidden = true;
      handleCanvasAgentFailure(new Error("当前画布已改变，旧任务已安全停止。"), runId);
      return;
    }
    state.pendingApproval = null;
    document.querySelector("#canvasAgentApproval").hidden = true;
    const declinedOutputs = pending.calls.map((call) => {
      const output = {
        ok: false,
        tool: call.name,
        code: "user_declined",
        error: "用户未确认，这一步未执行。",
      };
      const step = addCanvasAgentToolStep(call);
      updateCanvasAgentToolStep(step, "declined", "已按你的选择跳过");
      rememberCompletedCanvasAgentToolCall(call, output, runId);
      persistCanvasAgentToolResult(call, output, runId);
      return { call_id: call.call_id, output };
    });
    addCanvasAgentMessage("notice", "已按你的选择跳过这一步，Agent 会据此调整或结束任务。", { transient: true });
    setCanvasAgentStatus("已跳过，正在继续");
    persistCanvasAgentRun();
    try {
      if (pending.terminalToolRun) {
        finishCanvasAgentRun("completed", "已取消生成", runId);
        return;
      }
      await continueCanvasAgentWithToolOutputs(
        [...(Array.isArray(pending.safeOutputs) ? pending.safeOutputs : []), ...declinedOutputs],
        pending.responseId,
        runId,
      );
    } catch (error) {
      handleCanvasAgentFailure(error, runId);
    }
  }

  async function executeCanvasAgentCallBatch(calls, runId = state.currentRun?.id) {
    const outputs = [];
    for (const requestedCall of calls) {
      const call = normalizeCanvasAgentImageEditCall(requestedCall);
      if (!isCanvasAgentRunActive(runId)) return;
      // 激活 Skill 只是内部路由动作，用户要看的是「已启用专业流程」这句中文提示，
      // 不需要为总闸门本身显示一条工具步骤。
      const isSkillGate = call.name === "activate_canvas_skill";
      const isCachedSkillReference = call.name === "read_skill_reference"
        && Boolean(CanvasAgentCanvasApi.hasCachedSkillReference?.(call.arguments, { scope: state.scope }));
      const step = isSkillGate || isCachedSkillReference ? null : addCanvasAgentToolStep(call);
      let output;
      try {
        const completedCall = getCompletedCanvasAgentToolCall(call, runId);
        if (completedCall.state === "conflict") {
          output = {
            ok: false,
            tool: call.name,
            code: "call_id_conflict",
            error: "同一个工具调用标识不能用于不同的操作。",
          };
          updateCanvasAgentToolStep(step, "error", output.error);
          if (!isSkillGate && !isCachedSkillReference) persistCanvasAgentToolResult(call, output, runId);
          outputs.push({ call_id: call.call_id, output });
          continue;
        }
        if (completedCall.state === "completed") {
          output = completedCall.output;
          updateCanvasAgentToolStep(step, output.ok ? "success" : "error", output.ok ? "已完成" : output.error);
          if (!isSkillGate && !isCachedSkillReference) persistCanvasAgentToolResult(call, output, runId);
          recordCanvasAgentRunToolResult(call, output, runId);
          outputs.push({ call_id: call.call_id, output });
          continue;
        }
        const skillGate = typeof CanvasAgentSkillContract.inspectToolCall === "function"
          ? CanvasAgentSkillContract.inspectToolCall(state.currentRun?.skillContract, call)
          : { contract: state.currentRun?.skillContract, violation: null };
        if (skillGate.violation) {
          const violation = {
            ...skillGate.violation,
            requiredReferences: Array.isArray(skillGate.violation.requiredReferences)
              ? skillGate.violation.requiredReferences
              : getCanvasAgentSkillRequiredReferences(),
          };
          output = CanvasAgentSkillContract.buildToolViolationOutput({
            ok: false,
            tool: call.name,
            code: violation.code,
            error: violation.message,
          }, violation, { blocked: true });
          addCanvasAgentMessage("notice", "Skill 执行前检查未通过，本次没有写入画布节点。", { transient: true });
          updateCanvasAgentToolStep(step, "error", violation.message);
          rememberCompletedCanvasAgentToolCall(call, output, runId);
          if (!isSkillGate && !isCachedSkillReference) persistCanvasAgentToolResult(call, output, runId);
          outputs.push({ call_id: call.call_id, output });
          continue;
        }
        const paidKey = getPaidToolAttemptKey(call);
        if (paidKey && state.paidAttempts.has(paidKey)) {
          throw new Error("同一节点在本次运行中已执行过；为避免重复扣费，请开始新任务后手动重试。");
        }
        if (paidKey) state.paidAttempts.add(paidKey);
        ensureCanvasAgentMcpSession();
        const mcpResult = await state.mcp.callTool(call);
        output = mcpResult?.structuredContent && typeof mcpResult.structuredContent === "object"
          ? mcpResult.structuredContent
          : {
              ok: mcpResult?.isError !== true,
              tool: call.name,
              error: mcpResult?.isError ? "画布操作没有完成。" : undefined,
            };
        if (!isCanvasAgentRunActive(runId)) return;
        output = applyCanvasAgentSkillActivation(output);
        output = applyCanvasAgentSkillContractGuard(call, output, runId);
        if (isSkillGate && output.ok !== false && output.activated_skill_label) {
          addCanvasAgentMessage("notice", `已启用专业流程：${output.activated_skill_label}`, { transient: true });
        }
        updateCanvasAgentToolStep(step, output.ok ? "success" : "error", output.ok ? "完成" : output.error);
      } catch (error) {
        if (!isCanvasAgentRunActive(runId)) return;
        output = { ok: false, tool: call.name, error: error.message };
        updateCanvasAgentToolStep(step, "error", error.message);
      }
      if (!isCanvasAgentRunActive(runId)) return;
      const cacheHit = isCachedSkillReference || output?.cached === true;
      recordCanvasAgentRunToolResult(call, output, runId);
      rememberCompletedCanvasAgentToolCall(call, output, runId);
      if (!isSkillGate && !cacheHit) persistCanvasAgentToolResult(call, output, runId);
      outputs.push({ call_id: call.call_id, output });
    }
    return outputs;
  }

  function recordCanvasAgentRunToolResult(call, output, runId) {
    const run = state.currentRun;
    if (!run || run.id !== runId || !output || typeof output !== "object") return;
    const name = String(call?.name || "");
    const succeeded = output.ok !== false;
    if (run.skillContract) {
      run.skillContract = CanvasAgentSkillContract.recordToolResult(run.skillContract, call, output);
    }
    if (succeeded
      && ["generate_image_to_gallery", "run_canvas_node"].includes(name)
      && (Number(output.image_count || 0) > 0 || output.gallery_node_id)) {
      run.imageGenerated = true;
    }
    if (succeeded && name.startsWith("create_")) {
      const nodeId = String(output.node_id || "").trim();
      if (nodeId) {
        const created = Array.isArray(run.agentCreatedNodeIds) ? run.agentCreatedNodeIds : [];
        if (!created.includes(nodeId)) run.agentCreatedNodeIds = [...created, nodeId];
      }
    }
    run.updatedAt = Date.now();
  }

  function shouldEnsureCanvasAgentImageGeneration(run) {
    if (!run) return false;
    if (run.imageGenerated || run.forcedImageGeneration) return false;
    if (!Array.isArray(run.agentCreatedNodeIds) || !run.agentCreatedNodeIds.length) return false;
    return CanvasAgentCore.getDirectImageGenerationAllowance(run.prompt) > 0;
  }

  async function tryCanvasAgentEnsureImageGeneration(runId = state.currentRun?.id, lastMessage = "") {
    const run = state.currentRun;
    if (!run || run.id !== runId || !shouldEnsureCanvasAgentImageGeneration(run)) return false;
    if (/[?？]\s*$/.test(String(lastMessage || "").trim())) return false;
    const generatorIds = CanvasAgentCanvasApi.getCanvasImageGeneratorNodeIds?.(run.agentCreatedNodeIds) || [];
    if (!generatorIds.length) return false;
    const nodeId = generatorIds[generatorIds.length - 1];
    run.status = "running";
    run.forcedImageGeneration = true;
    run.paidAllowances = { ...(run.paidAllowances || {}), run_canvas_node: 1 };
    persistCanvasAgentRun();
    addCanvasAgentMessage("notice", "这次只建好了节点，没有真正出图；已按节点上的提示词自动补一次生成。", { transient: true });
    try {
      await executeCanvasAgentTerminalToolRun([{
        call_id: `ensure_image_${runId}`,
        name: "run_canvas_node",
        arguments: { node_id: nodeId },
      }], runId);
    } catch (error) {
      handleCanvasAgentFailure(error, runId);
    }
    return true;
  }

  function ensureCanvasAgentMcpSession() {
    if (state.mcp) return state.mcp;
    state.mcp = CanvasAgentMcpServer.createCanvasMcpSession({
      broker: state.broker,
      getScope: () => state.scope,
      getRunContext: () => ({
        boardId: state.currentRun?.boardId || "",
        runId: state.currentRun?.id || "",
      }),
      getCapabilityIds: getCanvasAgentAllowedCapabilityIds,
    });
    return state.mcp;
  }

  function getCanvasAgentAllowedCapabilityIds() {
    const skillId = String(state.currentRun?.activeSkillId || state.currentRun?.skillId || "");
    const skill = state.skills.find((item) => item.id === skillId);
    if (Array.isArray(skill?.capabilities) && skill.capabilities.length) return [...skill.capabilities];
    return CanvasAgentCapabilities.CAPABILITY_REGISTRY.map((item) => item.id);
  }

  function disposeCanvasAgentMcpSession() {
    const session = state.mcp;
    state.mcp = null;
    session?.close();
  }

  function applyCanvasAgentSkillActivation(output) {
    const requestedSkillId = String(output?.activated_skill_id || "").trim();
    if (!requestedSkillId || output?.ok === false) return output;
    const skill = state.skills.find((item) => item.id === requestedSkillId);
    if (!skill) {
      return { ...output, ok: false, code: "unknown_skill", error: "请求的专业流程当前不可用。" };
    }
    const manualRun = state.currentRun?.skillId === requestedSkillId
      && state.currentRun?.skillContract?.manual === true;
    if (skill.execution?.exposure === "manual" && !manualRun) {
      return {
        ...output,
        ok: false,
        code: "manual_skill_required",
        error: "这个功能 Skill 只能由用户在技能书中手动选择。",
      };
    }
    const lockedSkillId = String(state.currentRun?.activeSkillId || state.currentRun?.skillId || "");
    if (lockedSkillId && lockedSkillId !== requestedSkillId) {
      return { ...output, ok: false, code: "skill_conflict", error: "本次任务已经启用另一个专业流程。" };
    }
    state.currentRun.activeSkillId = requestedSkillId;
    applyCanvasAgentNamedSkill(requestedSkillId, { manualActivated: false });
    // 模型改成别的流程时，预加载结果失效；激活的就是预加载的那一个则保留，避免重复提示。
    if (state.currentRun.autoSkillId && state.currentRun.autoSkillId !== requestedSkillId) {
      state.currentRun.autoSkillId = "";
    }
    return { ...output, activated_skill_id: requestedSkillId, activated_skill_label: skill.label };
  }

  /**
   * 服务端按触发词预加载了某个系统 Skill 时，在对话里说明一句。
   * 只在流程真正变化时提示，避免每一轮都重复刷屏。
   */
  function applyCanvasAgentAutoSkill(turn) {
    const autoSkillId = String(turn?.auto_skill_id || "").trim();
    if (!autoSkillId || autoSkillId === state.currentRun?.autoSkillId) return;
    state.currentRun.autoSkillId = autoSkillId;
    applyCanvasAgentNamedSkill(autoSkillId, { manualActivated: false });
    persistCanvasAgentRun();
    addCanvasAgentMessage("notice", `已匹配专业流程：${String(turn?.auto_skill_label || autoSkillId)}`, { transient: true });
  }

  async function executeCanvasAgentToolsAndContinue(calls, responseId, runId = state.currentRun?.id, previousOutputs = []) {
    const batchOutputs = await executeCanvasAgentCallBatch(calls, runId);
    if (!isCanvasAgentRunActive(runId) || !batchOutputs) return;
    const outputs = [...(Array.isArray(previousOutputs) ? previousOutputs : []), ...batchOutputs];
    const designBrief = outputs
      .map((item) => item?.output)
      .find((output) => output?.ok && output?.decision_required && output?.kind === "design_brief");
    if (designBrief) {
      showCanvasAgentDesignBrief(designBrief, runId);
      finishCanvasAgentRun("waiting-brief", "等待确认需求", runId);
      return;
    }
    const imageChoice = outputs.map((item) => item?.output).find((output) => output?.ok && output?.decision_required);
    if (imageChoice) {
      showCanvasAgentImageChoice(imageChoice, runId);
      finishCanvasAgentRun("waiting-choice", "等待选择", runId);
      return;
    }
    await continueCanvasAgentWithToolOutputs(outputs, responseId, runId);
  }

  async function executeCanvasAgentTerminalToolRun(calls, runId = state.currentRun?.id, previousOutputs = []) {
    const batchOutputs = await executeCanvasAgentCallBatch(calls, runId);
    if (!isCanvasAgentRunActive(runId) || !batchOutputs) return;
    const outputs = [...(Array.isArray(previousOutputs) ? previousOutputs : []), ...batchOutputs];
    const failure = outputs.find((item) => item?.output?.ok === false)?.output;
    if (failure) {
      const error = new Error(failure.error || "图片生成没有完成。");
      error.code = failure.code || "tool_failed";
      error.recoverable = /failed to fetch|networkerror|load failed|timeout|timed out|服务暂时不可用/i.test(error.message);
      throw error;
    }
    const call = (Array.isArray(calls) ? calls : [])[0] || {};
    const result = outputs.find((item) => item?.call_id === call.call_id)?.output || outputs[0]?.output || {};
    const imageCompleted = ["generate_image_to_gallery", "run_canvas_node"].includes(String(call.name || ""))
      && (Number(result.image_count || 0) > 0 || result.gallery_node_id);
    const title = CanvasAgentCapabilities.getCapabilityByToolName(call.name)?.tool?.title || "画布操作";
    const parameterAdjustmentMessage = String(result.parameter_adjustment?.message || "").trim();
    const completedMessage = imageCompleted
      ? "图片已生成并加入画布图集。你可以继续让我调整或延展。"
      : `${title}已完成。`;
    addCanvasAgentMessage("assistant", imageCompleted
      ? [parameterAdjustmentMessage, completedMessage].filter(Boolean).join("\n\n")
      : completedMessage);
    finishCanvasAgentRun("completed", "任务完成", runId);
  }

  function showCanvasAgentDesignBrief(output, runId = state.currentRun?.id) {
    if (!isCanvasAgentRunActive(runId)) return;
    const boardId = String(state.currentRun?.boardId || "");
    const currentBoardId = String(CanvasAgentCanvasApi.getBoardId() || "");
    if (!boardId || boardId !== currentBoardId) return;
    const questions = (Array.isArray(output?.questions) ? output.questions : []).slice(0, 5).map((item) => ({
      id: String(item?.id || "").trim(),
      label: String(item?.label || "").trim(),
      kind: item?.kind === "text" ? "text" : "single",
      options: (Array.isArray(item?.options) ? item.options : []).map((option) => String(option || "").trim()).filter(Boolean).slice(0, 8),
      required: item?.required !== false,
      recommended: String(item?.recommended || "").trim(),
    })).filter((item) => item.id && item.label);
    state.pendingDesignBrief = {
      boardId,
      runId: String(runId || ""),
      workflow: String(output?.workflow || "poster"),
      skillId: String(output?.skill_id || "poster-design"),
      posterType: String(output?.poster_type || ""),
      posterTypeLabel: String(output?.poster_type_label || ""),
      knownContext: String(output?.known_context || "").trim(),
      summary: String(output?.summary || "").trim(),
      questions,
    };
    document.querySelector(".canvas-agent-brief")?.remove();
    const container = document.querySelector("#canvasAgentMessages");
    const card = document.createElement("article");
    card.className = "canvas-agent-brief";
    card.dataset.runId = String(runId || "");
    card.setAttribute("aria-label", "设计需求确认");

    const kicker = document.createElement("span");
    kicker.className = "canvas-agent-brief-kicker";
    kicker.textContent = "设计需求确认";
    const heading = document.createElement("strong");
    heading.textContent = state.pendingDesignBrief.posterTypeLabel
      ? `先确认${state.pendingDesignBrief.posterTypeLabel}的关键方向`
      : "先确认这张海报要解决什么问题";
    const lead = document.createElement("p");
    lead.textContent = questions.length
      ? "只问会影响结果的关键条件。确认前不会创建节点，也不会开始生成。"
      : "信息已经足够。请确认下面的设计摘要，确认前不会创建节点或开始生成。";
    card.append(kicker, heading, lead);

    if (state.pendingDesignBrief.summary) {
      const summary = document.createElement("div");
      summary.className = "canvas-agent-brief-summary";
      const summaryLabel = document.createElement("b");
      summaryLabel.textContent = "方案摘要";
      const summaryText = document.createElement("p");
      summaryText.textContent = state.pendingDesignBrief.summary;
      summary.append(summaryLabel, summaryText);
      card.append(summary);
    }

    if (state.pendingDesignBrief.knownContext) {
      const details = document.createElement("details");
      details.className = "canvas-agent-brief-known";
      const summary = document.createElement("summary");
      summary.textContent = "已确认的信息";
      const content = document.createElement("p");
      content.textContent = state.pendingDesignBrief.knownContext;
      details.append(summary, content);
      card.append(details);
    }

    if (questions.length) {
      const fields = document.createElement("div");
      fields.className = "canvas-agent-brief-fields";
      questions.forEach((question) => {
        const field = document.createElement("label");
        field.className = "canvas-agent-brief-field";
        field.htmlFor = `canvasAgentBrief_${question.id}`;
        const title = document.createElement("span");
        title.textContent = question.label;
        if (question.required) {
          const required = document.createElement("em");
          required.textContent = "必填";
          title.append(required);
        }
        field.append(title);
        let control;
        if (question.kind === "single") {
          control = document.createElement("select");
          const placeholder = document.createElement("option");
          placeholder.value = "";
          placeholder.textContent = "请选择";
          control.append(placeholder);
          const options = [...question.options];
          if (question.recommended && !options.includes(question.recommended)) options.push(question.recommended);
          options.forEach((option) => {
            const item = document.createElement("option");
            item.value = option;
            item.textContent = option === question.recommended ? `建议：${option}` : option;
            control.append(item);
          });
        } else {
          control = document.createElement("input");
          control.type = "text";
          control.placeholder = question.recommended ? `建议：${question.recommended}` : "输入你的要求";
        }
        control.id = `canvasAgentBrief_${question.id}`;
        control.dataset.agentBriefQuestion = question.id;
        if (question.required) control.required = true;
        field.append(control);
        if (question.recommended && question.kind !== "single") {
          const hint = document.createElement("small");
          hint.textContent = `专业建议：${question.recommended}`;
          field.append(hint);
        }
        fields.append(field);
      });
      card.append(fields);
    }

    const actions = document.createElement("div");
    actions.className = "canvas-agent-brief-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "is-secondary";
    cancel.dataset.agentBriefCancel = "";
    cancel.textContent = "取消";
    actions.append(cancel);
    if (questions.some((question) => question.recommended)) {
      const recommended = document.createElement("button");
      recommended.type = "button";
      recommended.className = "is-secondary";
      recommended.dataset.agentBriefRecommended = "";
      recommended.textContent = "按建议补全并继续";
      actions.append(recommended);
    }
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "is-primary";
    submit.dataset.agentBriefSubmit = "";
    submit.textContent = questions.length ? "确认并开始设计" : "确认方案并开始设计";
    actions.append(submit);
    card.append(actions);
    container?.append(card);
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }

  function submitCanvasAgentDesignBrief(useRecommended = false) {
    const pending = state.pendingDesignBrief;
    if (!pending) return;
    const currentBoardId = String(CanvasAgentCanvasApi.getBoardId() || "");
    if (!currentBoardId || pending.boardId !== currentBoardId) {
      state.pendingDesignBrief = null;
      document.querySelector(".canvas-agent-brief")?.remove();
      setCanvasAgentStatus("画布已切换，请重新发起需求", "warn");
      return;
    }
    const card = document.querySelector(".canvas-agent-brief");
    if (!card) {
      state.pendingDesignBrief = null;
      return;
    }
    const controls = new Map(
      Array.from(card.querySelectorAll("[data-agent-brief-question]"))
        .map((control) => [String(control.dataset.agentBriefQuestion || ""), control]),
    );
    const answers = [];
    const missing = [];
    pending.questions.forEach((question) => {
      const control = controls.get(question.id);
      let value = String(control?.value || "").trim();
      if (!value && useRecommended) value = question.recommended;
      control?.classList?.toggle("is-invalid", Boolean(question.required && !value));
      if (!value) {
        if (question.required) missing.push(question.label);
        return;
      }
      answers.push({ id: question.id, label: question.label, value: value.slice(0, 500) });
    });
    if (missing.length) {
      setCanvasAgentStatus(`请先补充：${missing.join("、")}`, "warn");
      controls.get(pending.questions.find((question) => question.required && !String(controls.get(question.id)?.value || "").trim())?.id)?.focus();
      return;
    }
    const prompt = buildConfirmedCanvasAgentPosterBrief(pending, answers, useRecommended);
    state.pendingDesignBrief = null;
    state.pendingResumeSkillId = pending.skillId || "poster-design";
    card.remove();
    addCanvasAgentMessage("notice", "需求已确认，继续按海报设计流程制作。", { transient: true });
    const input = document.querySelector("#canvasAgentPrompt");
    if (!input) return;
    input.value = prompt;
    input.form?.requestSubmit();
  }

  function buildConfirmedCanvasAgentPosterBrief(pending, answers, useRecommended = false) {
    const lines = [
      "已确认海报设计需求。请继续使用 poster-design 流程完成这张海报。",
    ];
    if (pending.posterTypeLabel) lines.push(`- 海报类型：${pending.posterTypeLabel}`);
    answers.forEach((answer) => lines.push(`- ${answer.label}：${answer.value}`));
    if (pending.knownContext) lines.push(`- 已确认背景：${pending.knownContext}`);
    lines.push(
      useRecommended
        ? "- 用户允许对未填写项按专业建议补全；品牌、价格、日期、条款、二维码和合作方仍不得虚构。"
        : "- 用户已确认以上信息；不得自行增加品牌、价格、日期、条款、二维码或合作方。",
      "请先读取海报设计需要的专业参考文档，整理最终 brief，创建海报 Brief 文字节点、主视觉图片节点和“海报方案”图集。主视觉要预留文字安全区，长文字交给文字节点；付费生成继续按现有确认规则执行。",
    );
    return lines.join("\n");
  }

  function cancelCanvasAgentDesignBrief() {
    const pending = state.pendingDesignBrief;
    if (!pending) return;
    state.pendingDesignBrief = null;
    document.querySelector(".canvas-agent-brief")?.remove();
    addCanvasAgentMessage("notice", "已取消这次设计需求确认，没有创建节点。", { transient: true });
    finishCanvasAgentRun("completed", "已取消需求确认", pending.runId);
  }

  function showCanvasAgentImageChoice(output, runId = state.currentRun?.id) {
    if (!isCanvasAgentRunActive(runId)) return;
    const nodeId = String(output.node_id || "");
    state.pendingImageChoice = {
      boardId: String(state.currentRun?.boardId || ""),
      nodeId,
      currentPrompt: String(output.current_prompt || "").trim(),
      suggestedPrompt: String(output.suggested_prompt || "").trim(),
    };
    addCanvasAgentMessage("assistant", `我找到了相关的生图节点 ${nodeId}，已经定位并高亮。先选择如何处理，我不会在你选择前开始生成。`);
    const container = document.querySelector("#canvasAgentMessages");
    const card = document.createElement("article");
    card.className = "canvas-agent-image-choice";
    card.dataset.nodeId = nodeId;
    const heading = document.createElement("strong");
    heading.textContent = "这个节点怎么处理？";
    const current = document.createElement("p");
    current.textContent = state.pendingImageChoice.currentPrompt
      ? `当前提示词：${state.pendingImageChoice.currentPrompt}`
      : "当前节点还没有提示词";
    const suggested = document.createElement("p");
    suggested.className = "is-suggested";
    suggested.textContent = state.pendingImageChoice.suggestedPrompt
      ? `本次需求：${state.pendingImageChoice.suggestedPrompt}`
      : "本次需求将沿用当前对话";
    const actions = document.createElement("div");
    actions.className = "canvas-agent-image-choice-actions";
    [
      ["update", "修改后生成", "替换为本次需求"],
      ["new", "新建并生成", "保留当前节点"],
    ].forEach(([value, label, detail], index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.agentImageChoice = value;
      if (index === 0) button.className = "is-primary";
      const title = document.createElement("b");
      title.textContent = label;
      const description = document.createElement("small");
      description.textContent = detail;
      button.append(title, description);
      actions.append(button);
    });
    card.append(heading, current, suggested, actions);
    container?.append(card);
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }

  function chooseCanvasAgentImageAction(choice) {
    const pending = state.pendingImageChoice;
    if (!pending) return;
    const currentBoardId = String(CanvasAgentCanvasApi.getBoardId() || "");
    if (!currentBoardId || pending.boardId !== currentBoardId) {
      state.pendingImageChoice = null;
      document.querySelector(".canvas-agent-image-choice")?.remove();
      setCanvasAgentStatus("画布已切换，请重新发起需求", "warn");
      return;
    }
    const suggested = pending.suggestedPrompt || pending.currentPrompt;
    const prompts = {
      update: `把当前画布图片生成节点 ${pending.nodeId} 的提示词修改为“${suggested}”，然后直接执行这个节点生成一张图片。`,
      new: `保留当前画布节点 ${pending.nodeId} 不变，新建图片生成节点，提示词使用“${suggested}”，并直接生成一张图片加入图集。`,
    };
    const prompt = prompts[String(choice || "")];
    if (!prompt) return;
    state.nextPaidAllowances = choice === "new"
      ? { generate_image_to_gallery: 1 }
      : { run_canvas_node: 1 };
    state.pendingImageChoice = null;
    document.querySelector(".canvas-agent-image-choice")?.remove();
    const input = document.querySelector("#canvasAgentPrompt");
    if (!input) return;
    input.value = prompt;
    input.form?.requestSubmit();
  }

  async function continueCanvasAgentWithToolOutputs(outputs, responseId, runId = state.currentRun?.id) {
    if (!isCanvasAgentRunActive(runId)) return;
    state.currentRun.pendingToolCalls = [];
    persistCanvasAgentRun();
    const turn = await requestCanvasAgentTurn({
      skill_mode: state.currentRun.skillId ? "manual" : "auto",
      skill_id: state.currentRun.skillId,
      active_skill_id: state.currentRun.activeSkillId,
      board_id: state.currentRun.boardId,
      conversation_context: state.currentRun.conversationContext,
      previous_response_id: responseId || state.currentRun.previousResponseId,
      tool_outputs: outputs,
      step: state.currentRun.step,
    }, runId);
    await handleCanvasAgentTurn(turn, runId);
  }

  function applyCanvasAgentSkillContractGuard(call, output, runId = state.currentRun?.id) {
    const run = state.currentRun;
    if (!run || run.id !== runId || !run.skillContract || !output || output.ok === false) return output;
    const inspected = CanvasAgentSkillContract.inspectToolResult(run.skillContract, call, output);
    run.skillContract = inspected.contract;
    if (!inspected.violation) return output;
    addCanvasAgentMessage("notice", "Skill 交付还不完整，Agent 正在按规则补齐缺项。", { transient: true });
    return CanvasAgentSkillContract.buildToolViolationOutput(output, {
      ...inspected.violation,
      requiredReferences: getCanvasAgentSkillRequiredReferences(run.skillContract),
    });
  }

  async function tryContinueCanvasAgentForSkillViolation(message, runId = state.currentRun?.id) {
    const run = state.currentRun;
    if (
      !run
      || run.id !== runId
      || !run.skillContract
      || (!run.skillContract.deliverable && !run.skillContract.requiresReferenceBeforeTextDeliverable)
    ) return false;
    const violation = CanvasAgentSkillContract.inspectCompletion(run.skillContract, message);
    if (violation.ok) return false;
    if (!CanvasAgentSkillContract.canRetry(run.skillContract)) {
      addCanvasAgentMessage(
        "error",
        `未按“${run.skillContract.skillLabel || run.skillContract.skillId}”完整交付，已保留当前内容，但没有标记为完成。缺少：${violation.missing.join("、")}。`,
      );
      finishCanvasAgentRun("needs-revision", "Skill 交付不完整，需继续补充", runId);
      return true;
    }
    run.skillContract = CanvasAgentSkillContract.markCorrectionAttempt(run.skillContract);
    run.status = "running";
    persistCanvasAgentRun();
    addCanvasAgentMessage("notice", "检测到 Skill 规定交付物缺失，正在自动退回补齐。", { transient: true });
    const instruction = CanvasAgentSkillContract.buildCorrectionInstruction({
      ...violation,
      requiredReferences: getCanvasAgentSkillRequiredReferences(run.skillContract),
    }, message);
    try {
      const turn = await requestCanvasAgentTurn({
        skill_mode: run.skillId ? "manual" : "auto",
        skill_id: run.skillId,
        active_skill_id: run.activeSkillId,
        board_id: run.boardId,
        prompt: instruction,
        conversation_context: run.conversationContext,
        step: run.step,
        skill_contract_retry: true,
      }, runId);
      await handleCanvasAgentTurn(turn, runId);
    } catch (error) {
      handleCanvasAgentFailure(error, runId);
    }
    return true;
  }

  function getCanvasAgentToolExecutionKey(call, runId = state.currentRun?.id) {
    return `${runId || "run"}:${String(call?.call_id || "missing-call-id")}`;
  }

  function getCanvasAgentToolCallFingerprint(call) {
    return `${String(call?.name || "")}\n${stableSerializeCanvasAgentValue(call?.arguments || {})}`;
  }

  function stableSerializeCanvasAgentValue(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerializeCanvasAgentValue).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerializeCanvasAgentValue(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function getCompletedCanvasAgentToolCall(call, runId = state.currentRun?.id) {
    const entry = state.completedToolOutputs.get(getCanvasAgentToolExecutionKey(call, runId));
    const fingerprint = getCanvasAgentToolCallFingerprint(call);
    if (!entry) {
      const recoveredOutput = state.recovery?.completedToolOutputs instanceof Map
        ? state.recovery.completedToolOutputs.get(fingerprint)
        : null;
      return recoveredOutput
        ? { state: "completed", output: recoveredOutput, recovered: true }
        : { state: "missing", output: null };
    }
    if (entry.fingerprint !== fingerprint) {
      return { state: "conflict", output: null };
    }
    return { state: "completed", output: entry.output };
  }

  function rememberCompletedCanvasAgentToolCall(call, output, runId = state.currentRun?.id) {
    const fingerprint = getCanvasAgentToolCallFingerprint(call);
    state.completedToolOutputs.set(getCanvasAgentToolExecutionKey(call, runId), {
      fingerprint,
      output,
    });
    if (output?.ok && state.recovery?.completedToolOutputs instanceof Map) {
      state.recovery.completedToolOutputs.set(fingerprint, output);
    }
  }

  function getPaidToolAttemptKey(call) {
    if (CanvasAgentCapabilities.getRisk(call.name, call.arguments || {}) !== "paid") return "";
    const target = call.arguments?.node_id || call.arguments?.node_ids?.join(",") || "unknown";
    return `${call.name}:${String(target)}`;
  }

  function createAgentTextNode(args) {
    const point = resolveAgentNodePoint(args);
    const node = callCanvasFunction("addCanvasText", point, {
      text: String(args.content || ""),
      name: String(args.title || "文字"),
      focus: false,
    });
    return createdNodeResult("create_text_node", node);
  }

  function createAgentImageNode(args) {
    const point = resolveAgentNodePoint(args);
    const node = callCanvasFunction("addCanvasImagePlaceholder", point);
    const prompt = node.querySelector(".canvas-node-prompt");
    prompt.value = String(args.prompt || "");
    prompt.dispatchEvent(new Event("input", { bubbles: true }));
    const model = node.querySelector(".canvas-node-model");
    if (args.model) {
      window.fillCanvasNodeModelSelect?.(model, String(args.model));
      model.value = String(args.model);
      model.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const activeModel = model?.value || document.querySelector("#imageModel")?.value || "";
    const size = node.querySelector(".canvas-node-size");
    if (args.size && size) {
      window.fillCanvasNodeSizeSelect?.(size, String(args.size), activeModel);
      size.value = String(args.size);
      node.dataset.canvasSize = size.value || String(args.size);
      size.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const resolution = node.querySelector(".canvas-node-resolution");
    if (args.resolution && resolution) {
      window.fillCanvasNodeResolutionSelect?.(resolution, String(args.resolution), activeModel, size?.value || "auto");
      resolution.value = String(args.resolution);
      node.dataset.canvasResolution = resolution.value || String(args.resolution);
      resolution.dispatchEvent(new Event("change", { bubbles: true }));
    }
    connectReferenceNodes(args.reference_node_ids, node.dataset.id);
    window.updateCanvasNodeRefs?.(node);
    window.scheduleCanvasSave?.();
    return createdNodeResult("create_image_node", node);
  }

  function createAgentGalleryNode(args) {
    const node = callCanvasFunction("addCanvasGallery", resolveAgentNodePoint(args));
    const title = String(args.title || "生成图集");
    window.renderCanvasGalleryNode?.(node, { images: [], title });
    window.scheduleCanvasSave?.();
    return createdNodeResult("create_gallery_node", node);
  }

  function createAgentVideoNode(args) {
    const node = callCanvasFunction("addCanvasMinimaxH3Node", resolveAgentNodePoint(args), {
      prompt: String(args.prompt || ""),
      aspectRatio: String(args.aspect_ratio || "16:9"),
      duration: Number(args.duration || 8),
    });
    connectReferenceNodes(args.reference_node_ids, node.dataset.id);
    window.renderCanvasMinimaxH3References?.(node);
    window.scheduleCanvasSave?.();
    return createdNodeResult("create_video_node", node);
  }

  function updateAgentCanvasNode(args) {
    const node = requireAgentNode(args.node_id);
    if (args.content !== null && args.content !== undefined && node.classList.contains("canvas-node-text")) {
      const text = node.querySelector(".canvas-text");
      if (text) {
        if (typeof window.setCanvasTextValue === "function") {
          window.setCanvasTextValue(node, String(args.content));
        } else {
          const source = String(args.content);
          text.dataset.markdownSource = source;
          text.textContent = source;
        }
      }
    }
    const prompt = node.querySelector(".canvas-node-prompt, .canvas-llm-prompt, .canvas-h3-prompt");
    if (args.prompt !== null && args.prompt !== undefined && prompt) {
      prompt.value = String(args.prompt);
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (args.title !== null && args.title !== undefined && node.classList.contains("canvas-node-gallery")) {
      const images = window.getCanvasGalleryImages?.(node) || [];
      window.renderCanvasGalleryNode?.(node, { images, title: String(args.title), activeImageId: node.dataset.galleryActiveImageId || "" });
    }
    const model = node.querySelector(".canvas-node-model, .canvas-llm-model");
    if (args.model !== null && args.model !== undefined && model) {
      if (node.classList.contains("canvas-node-image")) window.fillCanvasNodeModelSelect?.(model, String(args.model));
      model.value = String(args.model);
      model.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const size = node.querySelector(".canvas-node-size");
    if (args.size !== null && args.size !== undefined && size) {
      window.fillCanvasNodeSizeSelect?.(size, String(args.size), model?.value || "");
      size.value = String(args.size);
      node.dataset.canvasSize = size.value || String(args.size);
      size.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const resolution = node.querySelector(".canvas-node-resolution");
    if (args.resolution !== null && args.resolution !== undefined && resolution) {
      window.fillCanvasNodeResolutionSelect?.(resolution, String(args.resolution), model?.value || "", size?.value || "auto");
      resolution.value = String(args.resolution);
      resolution.dispatchEvent(new Event("change", { bubbles: true }));
    }
    window.scheduleCanvasSave?.();
    return { ok: true, tool: "update_node", node_id: node.dataset.id, kind: getAgentNodeKind(node) };
  }

  function connectAgentCanvasNodes(args) {
    const from = requireAgentNode(args.from_id);
    const to = requireAgentNode(args.to_id);
    callCanvasFunction("connectCanvasNodes", from.dataset.id, to.dataset.id, args.to_port || "input");
    return { ok: true, tool: "connect_nodes", from_id: from.dataset.id, to_id: to.dataset.id, to_port: args.to_port || "input" };
  }

  function arrangeAgentCanvasNodes(args) {
    const nodes = (Array.isArray(args.node_ids) ? args.node_ids : []).map(requireAgentNode);
    if (!nodes.length) throw new Error("排列工具至少需要一个节点。");
    const direction = ["row", "column", "grid"].includes(args.direction) ? args.direction : "row";
    const gap = Math.max(24, Math.min(800, Number(args.gap) || 80));
    const fallback = getAgentArrangementOrigin(nodes);
    const startX = CanvasAgentCore.isFiniteCoordinate(args.start_x) ? Number(args.start_x) : fallback.x;
    const startY = CanvasAgentCore.isFiniteCoordinate(args.start_y) ? Number(args.start_y) : fallback.y;
    const offsets = CanvasAgentCore.planArrangementOffsets(nodes.map((node) => ({
      width: node.offsetWidth || Number(node.dataset.width || 320),
      height: node.offsetHeight || Number(node.dataset.height || 260),
    })), direction, gap);
    nodes.forEach((node, index) => {
      callCanvasFunction("setCanvasNodePoint", node, {
        x: startX + offsets[index].x,
        y: startY + offsets[index].y,
      });
      window.updateCanvasNodePosition?.(node);
    });
    window.renderCanvasConnections?.();
    window.scheduleCanvasSave?.();
    return { ok: true, tool: "arrange_nodes", node_ids: nodes.map((node) => node.dataset.id), direction };
  }

  async function runAgentCanvasNode(args) {
    const node = requireAgentNode(args.node_id);
    if (node.classList.contains("canvas-node-image")) await callCanvasFunction("runCanvasImageEdit", node, { autoFailover: true });
    else if (node.classList.contains("canvas-node-llm")) await callCanvasFunction("runCanvasLlmNode", node);
    else if (node.classList.contains("canvas-node-comfy")) await callCanvasFunction("runCanvasComfyNode", node);
    else if (node.classList.contains("canvas-node-minimax-h3")) await callCanvasFunction("runCanvasMinimaxH3Node", node);
    else throw new Error(`节点 ${node.dataset.id} 不支持执行。`);

    const status = getAgentNodeStatus(node);
    if (/^(失败|请)|失败[:：]|错误[:：]/.test(status)) {
      return { ok: false, tool: "run_canvas_node", node_id: node.dataset.id, error: status };
    }
    const output = window.getCanvasNodeOutput?.(node);
    return {
      ok: true,
      tool: "run_canvas_node",
      node_id: node.dataset.id,
      status: status || "执行完成",
      output: sanitizeAgentToolOutput(output),
    };
  }

  function createdNodeResult(tool, node) {
    if (!node?.dataset?.id) throw new Error(`${tool} did not create a canvas node.`);
    state.creationIndex += 1;
    return { ok: true, tool, node_id: node.dataset.id, kind: getAgentNodeKind(node) };
  }

  function resolveAgentNodePoint(args) {
    if (CanvasAgentCore.isFiniteCoordinate(args.x) && CanvasAgentCore.isFiniteCoordinate(args.y)) {
      return { x: Number(args.x), y: Number(args.y) };
    }
    const selected = getSelectedAgentNodes();
    const anchor = selected[0];
    const origin = anchor
      ? { x: Number(anchor.dataset.x || 120) + (anchor.offsetWidth || 320) + 90, y: Number(anchor.dataset.y || 120) }
      : window.getCanvasViewportCenterPoint?.() || { x: 240, y: 180 };
    return {
      x: origin.x + (state.creationIndex % 3) * 48,
      y: origin.y + Math.floor(state.creationIndex / 3) * 48,
    };
  }

  function getAgentArrangementOrigin(nodes) {
    const x = Math.min(...nodes.map((node) => Number(node.dataset.x || 0)));
    const y = Math.min(...nodes.map((node) => Number(node.dataset.y || 0)));
    return { x: Number.isFinite(x) ? x : 160, y: Number.isFinite(y) ? y : 160 };
  }

  function connectReferenceNodes(ids, targetId) {
    (Array.isArray(ids) ? ids : []).forEach((id) => {
      const source = requireAgentNode(id);
      callCanvasFunction("connectCanvasNodes", source.dataset.id, targetId, "input");
    });
  }

  function callCanvasFunction(name, ...args) {
    const fn = window[name];
    if (typeof fn !== "function") throw new Error(`画布函数 ${name} 当前不可用。`);
    return fn(...args);
  }

  function requireAgentNode(id) {
    const requested = String(id || "");
    const node = Array.from(document.querySelectorAll("#canvasPlane .canvas-node"))
      .find((item) => item.dataset.id === requested);
    if (!node) throw new Error(`找不到画布节点 ${requested || "(empty)"}。`);
    return node;
  }

  function getSelectedAgentNodes() {
    return Array.from(document.querySelectorAll("#canvasPlane .canvas-node.is-selected"));
  }

  function getAgentNodeKind(node) {
    return window.getCanvasNodeKind?.(node) || Array.from(node.classList).find((name) => name.startsWith("canvas-node-") && name !== "canvas-node-frameless")?.replace("canvas-node-", "") || "unknown";
  }

  function getAgentNodeStatus(node) {
    return String(node.querySelector(".canvas-h3-status, .canvas-node-status")?.textContent || "").trim();
  }

  function sanitizeAgentToolOutput(output) {
    if (!output || typeof output !== "object") return null;
    return {
      type: String(output.type || ""),
      name: String(output.name || ""),
      url: String(output.url || "").startsWith("data:") ? "[inline-image]" : String(output.url || ""),
    };
  }

  async function collectCanvasAgentVisionImages(nodes) {
    if (getSelectedCanvasImageReferenceNodeIds(nodes).length) return [];
    const sources = getAgentNodeReferences(nodes)
      .filter((reference) => reference.type === "image" && reference.url)
      .slice(0, 3);
    const images = [];
    for (const source of sources) {
      try {
        images.push(await compressCanvasAgentImage(source.url));
      } catch {
        // The structured node context is still usable when a cross-origin preview cannot be encoded.
      }
    }
    return images;
  }

  function compressCanvasAgentImage(src, maxSide = 1024, quality = 0.78) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          const width = image.naturalWidth || image.width;
          const height = image.naturalHeight || image.height;
          const scale = Math.min(1, maxSide / Math.max(width, height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("选中图片压缩失败"));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("选中图片压缩失败"));
            reader.readAsDataURL(blob);
          }, "image/jpeg", quality);
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error("选中图片无法读取"));
      image.src = src;
    });
  }

  function addCanvasAgentMessage(role, text, options = {}) {
    const message = renderCanvasAgentMessage(role, text, options);
    if (options.persist !== false && !options.transient) {
      appendCanvasAgentConversationItem({
        id: options.id,
        role,
        text: String(text || ""),
        status: options.recoverable ? "recoverable" : options.status || (role === "error" ? "failed" : "completed"),
        skillId: options.skillId,
        skillLabel: options.skillLabel,
        skillSource: options.skillSource,
      });
    }
    return message;
  }

  function renderCanvasAgentMessage(role, text, options = {}) {
    const container = document.querySelector("#canvasAgentMessages");
    container?.querySelector("#canvasAgentWelcome")?.remove();
    const message = document.createElement("article");
    message.className = `canvas-agent-message is-${role}${options.transient ? " is-transient" : ""}`;
    if (role === "user") {
      message.setAttribute(
        "aria-label",
        options.skillLabel ? `用户消息，已加载专业流程 ${String(options.skillLabel)}` : "用户消息",
      );
      if (options.skillId) message.dataset.agentSkillId = String(options.skillId);
    }
    const label = document.createElement("strong");
    label.className = "canvas-agent-message-label";
    label.textContent = role === "assistant" ? "Agent" : "提示";
    if (role !== "user") message.append(label);
    if (role === "user" && options.skillLabel) {
      const skill = document.createElement("div");
      skill.className = "canvas-agent-message-skill";
      if (options.skillSource) skill.dataset.skillSource = String(options.skillSource);
      const icon = document.createElement("i");
      icon.dataset.lucide = "sparkles";
      const prefix = document.createElement("span");
      prefix.textContent = "已加载专业流程";
      const name = document.createElement("strong");
      name.textContent = String(options.skillLabel);
      skill.append(icon, prefix, name);
      message.append(skill);
    }
    const rendersMarkdown = role === "assistant" || role === "user";
    const content = document.createElement(rendersMarkdown ? "div" : "p");
    const rawText = String(text || "");
    if (rendersMarkdown && typeof CanvasAgentMarkdown?.renderMarkdown === "function") {
      content.className = "canvas-agent-markdown";
      content.innerHTML = CanvasAgentMarkdown.renderMarkdown(rawText);
    } else {
      content.textContent = rawText;
    }
    message.append(content);
    if (options.recoverable) {
      removeCanvasAgentContinueActions();
      const action = document.createElement("button");
      action.type = "button";
      action.dataset.agentContinue = "true";
      action.className = "canvas-agent-continue";
      action.textContent = "重新尝试";
      message.append(action);
    }
    container?.append(message);
    renderCanvasAgentIcons(message);
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    return message;
  }

  function showCanvasAgentWaiting(runId = state.currentRun?.id) {
    const container = document.querySelector("#canvasAgentMessages");
    const existing = container?.querySelector(".canvas-agent-waiting");
    const normalizedRunId = String(runId || "");
    if (!normalizedRunId) return null;
    if (existing?.dataset.runId === normalizedRunId) return existing;
    existing?.remove();
    container?.querySelector("#canvasAgentWelcome")?.remove();
    const waiting = document.createElement("article");
    waiting.className = "canvas-agent-waiting";
    waiting.setAttribute("data-run-id", normalizedRunId);
    waiting.setAttribute("role", "status");
    waiting.setAttribute("aria-label", "Agent 正在回应");
    waiting.innerHTML = `
      <span class="canvas-agent-waiting-bars" aria-hidden="true">
        <i class="canvas-agent-waiting-bar"></i>
        <i class="canvas-agent-waiting-bar"></i>
        <i class="canvas-agent-waiting-bar"></i>
        <i class="canvas-agent-waiting-bar"></i>
      </span>
      <span class="canvas-agent-sr-only">Agent 正在回应</span>`;
    container?.append(waiting);
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    return waiting;
  }

  function removeCanvasAgentWaiting(runId = "") {
    const waiting = document.querySelector("#canvasAgentMessages .canvas-agent-waiting");
    if (!waiting || (runId && waiting.dataset.runId !== String(runId))) return;
    waiting.remove();
  }

  function addCanvasAgentToolStep(call) {
    const container = document.querySelector("#canvasAgentMessages");
    const step = createCanvasAgentToolStep({
      status: "running",
      title: formatCanvasAgentToolName(call.name),
      detail: getCanvasAgentToolDetail(call),
      statusText: getCanvasAgentToolStatusText("running"),
      icon: getCanvasAgentToolStatusIcon("running"),
      toolName: call.name,
    });
    container?.append(step);
    renderCanvasAgentIcons(step);
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    return step;
  }

  function createCanvasAgentToolStep({
    status,
    title: titleText,
    detail: detailText,
    statusText,
    icon: iconName,
    toolName = "",
    fullDetail = "",
  }) {
    const step = document.createElement("article");
    step.className = `canvas-agent-tool-step is-${status}`;
    step.dataset.toolName = String(toolName || "");
    const icon = document.createElement("span");
    icon.className = "canvas-agent-tool-icon";
    icon.innerHTML = `<i data-lucide="${iconName}"></i>`;
    const copy = document.createElement("span");
    copy.className = "canvas-agent-tool-copy";
    const title = document.createElement("strong");
    title.textContent = titleText;
    const detail = document.createElement("small");
    detail.className = "canvas-agent-tool-detail";
    detail.textContent = detailText;
    if (fullDetail) detail.title = fullDetail;
    copy.append(title, detail);
    const statusLabel = document.createElement("small");
    statusLabel.className = "canvas-agent-tool-status";
    statusLabel.textContent = statusText;
    step.append(icon, copy, statusLabel);
    return step;
  }

  function updateCanvasAgentToolStep(step, status, detail) {
    if (!step) return;
    step.classList.remove("is-running", "is-success", "is-error", "is-declined");
    step.classList.add(`is-${status}`);
    const icon = getCanvasAgentToolStatusIcon(status);
    step.querySelector(".canvas-agent-tool-icon").innerHTML = `<i data-lucide="${icon}"></i>`;
    const statusLabel = step.querySelector(".canvas-agent-tool-status");
    if (statusLabel) statusLabel.textContent = getCanvasAgentToolStatusText(status);
    const detailLabel = step.querySelector(".canvas-agent-tool-detail");
    if (detail && detailLabel) {
      detailLabel.textContent = String(detail);
      detailLabel.title = String(detail);
    }
    renderCanvasAgentIcons(step);
  }

  function getCanvasAgentToolStatusIcon(status) {
    if (status === "success") return "check";
    if (status === "declined") return "minus";
    if (status === "error") return "triangle-alert";
    return "loader-circle";
  }

  function getCanvasAgentToolStatusText(status) {
    return ({
      running: "执行中",
      success: "完成",
      error: "失败",
      declined: "已跳过",
    })[status] || "处理中";
  }

  function persistCanvasAgentToolResult(call, output, runId) {
    const nodeId = String(output?.node_id || call?.arguments?.node_id || "");
    const declined = ["user_declined", "discussion_only"].includes(output?.code);
    appendCanvasAgentConversationItem({
      id: `tool_${String(runId || "run")}_${String(call?.call_id || call?.name || "call")}`,
      role: "tool",
      text: output?.ok
        ? (nodeId ? `节点 ${nodeId} · 完成` : "完成")
        : output?.code === "discussion_only"
          ? "讨论模式 · 未执行图片生成"
          : declined
            ? "已按用户选择跳过"
            : getCanvasAgentUserFacingToolError(output?.error),
      status: output?.ok ? "completed" : declined ? "declined" : "failed",
      toolName: String(call?.name || output?.tool || ""),
      nodeId,
    });
  }

  function formatCanvasAgentToolName(name) {
    return ({
      create_text_node: "创建文字节点",
      create_image_node: "创建图片节点",
      generate_image_to_gallery: "生成图片并创建图集",
      request_image_node_choice: "定位相关生图节点",
      request_design_brief: "确认设计需求",
      focus_canvas_nodes: "定位画布节点",
      organize_canvas_nodes: "整理画布节点",
      crop_canvas_image: "裁切图片",
      open_canvas_mask_editor: "打开遮罩编辑器",
      create_gallery_node: "创建图集",
      create_video_node: "创建视频节点",
      update_node: "更新节点",
      connect_nodes: "连接节点",
      arrange_nodes: "排列节点",
      run_canvas_node: "执行生成节点",
    })[name] || name;
  }

  function getCanvasAgentToolDetail(call) {
    const args = call.arguments || {};
    if (args.node_id) return `节点 ${formatCanvasAgentNodeId(args.node_id)}`;
    if (args.title) return String(args.title);
    if (args.prompt) return String(args.prompt).slice(0, 72);
    if (Array.isArray(args.node_ids)) return `${args.node_ids.length} 个节点`;
    return "准备执行";
  }

  function formatCanvasAgentNodeId(value) {
    const nodeId = String(value || "");
    if (nodeId.length <= 14) return nodeId;
    return `${nodeId.slice(0, 8)}...${nodeId.slice(-4)}`;
  }

  function setCanvasAgentBusy(busy) {
    const send = document.querySelector("#canvasAgentSend");
    const stop = document.querySelector("#canvasAgentStop");
    if (send) send.disabled = Boolean(busy);
    if (stop) stop.hidden = !busy;
    document.querySelector("#canvasAgentPanel")?.classList.toggle("is-running", Boolean(busy));
    if (busy) {
      setCanvasAgentStatus("");
      showCanvasAgentWaiting();
    } else {
      removeCanvasAgentWaiting();
    }
  }

  function setCanvasAgentStatus(message, tone = "") {
    const status = document.querySelector("#canvasAgentStatus");
    if (status) {
      status.textContent = message;
      status.dataset.tone = tone;
    }
    const liveStatus = document.querySelector("#canvasAgentLiveStatus");
    const liveText = liveStatus?.querySelector("span");
    const busy = document.querySelector("#canvasAgentPanel")?.classList.contains("is-running");
    const liveMessage = busy
      ? (/恢复/.test(message) ? "恢复中" : "工作中")
      : tone === "warn"
        ? "需处理"
        : tone === "error"
          ? "异常"
          : message || "待命";
    if (liveText) liveText.textContent = liveMessage;
    if (liveStatus) liveStatus.title = message || liveMessage;
    if (liveStatus) liveStatus.dataset.tone = tone || (busy ? "active" : "idle");
  }

  function cancelCanvasAgentServerRun(runId) {
    if (!runId) return;
    void fetch(CANCEL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId }),
      keepalive: true,
    }).catch(() => {});
  }

  function buildCanvasAgentRecoveryInstruction(prompt) {
    return `继续完成刚才中断的任务。原始目标：${String(prompt || "").slice(0, 6000)}\n先检查当前画布和对话里的已完成工具结果，不要重复创建节点或重复提交已经尝试过的付费生成。`;
  }

  function getCanvasAgentRecoveryCategory(error) {
    const raw = String(error?.message || error || "").toLowerCase();
    if (error?.name === "AbortError") return "cancelled";
    if (/api\s*key|unauthori[sz]ed|forbidden|鉴权|无权限/.test(raw)) return "auth";
    if (/balance|quota|credit|billing|余额|欠费/.test(raw)) return "balance";
    if (/没有已配置且支持当前任务|requires a current board|当前画布已改变|专业流程当前不可用/.test(raw)) return "task";
    if (isCanvasAgentProtocolStateError(error)) return "protocol";
    if (/timeout|timed out|超时/.test(raw)) return "timeout";
    if (/rate.?limit|too many requests|限流|繁忙/.test(raw)) return "rate-limit";
    if (/failed to fetch|networkerror|load failed|fetch failed|network error|socket|dns|tls/.test(raw)) return "network";
    if (Boolean(error?.recoverable) || /服务暂时不可用|所有可用服务|响应提前结束/.test(raw)) return "unavailable";
    return String(error?.category || "request").toLowerCase();
  }

  function cancelCanvasAgentRecovery() {
    if (state.recovery?.timer) clearTimeout(state.recovery.timer);
    state.recovery = null;
    state.recoveryGeneration += 1;
  }

  function scheduleCanvasAgentRecovery(error, runId = state.currentRun?.id) {
    if (!state.currentRun || state.currentRun.id !== runId) return false;
    const boardId = String(state.currentRun.boardId || "");
    const currentBoardId = String(CanvasAgentCanvasApi.getBoardId() || "");
    const prior = state.recovery && state.recovery.boardId === boardId ? state.recovery : null;
    const attempt = Number(prior?.attempt || 0);
    const token = prior?.token || ++state.recoveryGeneration;
    const category = getCanvasAgentRecoveryCategory(error);
    if (!CanvasAgentCore.shouldAutoRecoverCanvasAgent({
      category,
      attempt,
      boardMatches: Boolean(boardId && boardId === currentBoardId),
      tokenMatches: !prior || prior.token === state.recoveryGeneration,
    })) return false;

    const nextAttempt = attempt + 1;
    const paidAttempted = Boolean(prior?.paidAttempted || state.paidAttempts.size);
    const completedToolOutputs = prior?.completedToolOutputs instanceof Map
      ? new Map(prior.completedToolOutputs)
      : new Map();
    state.completedToolOutputs.forEach((entry) => {
      if (entry?.output?.ok && entry.fingerprint) completedToolOutputs.set(entry.fingerprint, entry.output);
    });
    const context = {
      token,
      boardId,
      prompt: String(prior?.prompt || state.currentRun.prompt || ""),
      skillId: String(prior?.skillId || state.currentRun.skillId || ""),
      skillContract: restoreCanvasAgentSkillContract(
        prior?.skillContract || state.currentRun.skillContract,
      ),
      attempt: nextAttempt,
      paidAttempted,
      paidAllowances: CanvasAgentCore.getCanvasAgentRecoveryPaidAllowances(
        prior?.paidAllowances || state.currentRun.paidAllowances || {},
        paidAttempted,
      ),
      completedToolOutputs,
      exhausted: false,
      timer: null,
    };
    const delay = CanvasAgentCore.getCanvasAgentRecoveryDelay(nextAttempt);
    state.recovery = context;
    state.currentRun.status = "recovering";
    state.currentRun.updatedAt = Date.now();
    state.pendingApproval = null;
    state.abortController?.abort();
    state.runAbortController?.abort();
    state.runAbortController = null;
    disposeCanvasAgentMcpSession();
    state.broker.invalidate("recovering");
    state.scope = null;
    document.querySelector("#canvasAgentApproval").hidden = true;
    setCanvasAgentBusy(true);
    setCanvasAgentStatus(`网络波动，正在自动恢复 ${nextAttempt}/3`, "warn");
    persistCanvasAgentRun();
    context.timer = setTimeout(() => {
      context.timer = null;
      void resumeCanvasAgentRecovery(context);
    }, delay);
    return true;
  }

  async function resumeCanvasAgentRecovery(context) {
    const boardId = String(CanvasAgentCanvasApi.getBoardId() || "");
    if (state.recovery !== context || context.token !== state.recoveryGeneration || boardId !== context.boardId) return;
    await startCanvasAgentRun(null, { recovery: context });
  }

  function stopCanvasAgentRun() {
    if (!state.currentRun || !["running", "recovering"].includes(state.currentRun.status)) return;
    const runId = state.currentRun.id;
    cancelCanvasAgentRecovery();
    state.currentRun.status = "stopped";
    state.currentRun.updatedAt = Date.now();
    state.pendingApproval = null;
    state.abortController?.abort();
    state.runAbortController?.abort();
    state.runAbortController = null;
    disposeCanvasAgentMcpSession();
    state.broker.invalidate("stopped");
    state.scope = null;
    cancelCanvasAgentServerRun(runId);
    document.querySelector("#canvasAgentApproval").hidden = true;
    addCanvasAgentMessage("notice", "任务已停止；已经提交给外部生成平台的任务可能仍会继续。", { transient: true });
    setCanvasAgentBusy(false);
    setCanvasAgentStatus("已停止");
    persistCanvasAgentRun();
  }

  function finishCanvasAgentRun(status, message, runId = state.currentRun?.id, options = {}) {
    if (!state.currentRun || (runId && state.currentRun.id !== runId)) return;
    if (!options.keepRecovery) cancelCanvasAgentRecovery();
    state.currentRun.status = status;
    state.currentRun.updatedAt = Date.now();
    state.pendingApproval = null;
    state.runAbortController?.abort();
    state.runAbortController = null;
    disposeCanvasAgentMcpSession();
    state.broker.invalidate(status);
    state.scope = null;
    document.querySelector("#canvasAgentApproval").hidden = true;
    setCanvasAgentBusy(false);
    setCanvasAgentStatus(message);
    persistCanvasAgentRun();
  }

  function handleCanvasAgentFailure(error, runId = state.currentRun?.id) {
    if (!state.currentRun || (runId && state.currentRun.id !== runId)) return;
    if (error?.name === "AbortError" || state.currentRun.status === "stopped") {
      removeCanvasAgentWaiting(runId);
      return;
    }
    if (scheduleCanvasAgentRecovery(error, runId)) return;
    const recoverable = isCanvasAgentRecoverableError(error);
    const message = getCanvasAgentUserFacingError(error);
    state.recoveryPrompt = "继续完成刚才中断的任务。不要重复已经完成的画布操作，先检查当前画布状态。";
    if (recoverable && state.recovery) state.recovery.exhausted = true;
    addCanvasAgentMessage(recoverable ? "notice" : "error", message, { recoverable });
    finishCanvasAgentRun(
      recoverable ? "recoverable" : "failed",
      recoverable ? "网络仍不可用，任务和画布已保留" : "本次未完成",
      runId,
      { keepRecovery: recoverable && Boolean(state.recovery) },
    );
  }

  function isCanvasAgentRecoverableError(error) {
    if (isCanvasAgentThinkingReplayError(error)) return false;
    if (Boolean(error?.recoverable) || isCanvasAgentProtocolStateError(error)) return true;
    return /failed to fetch|networkerror|load failed|fetch failed|network error|timeout|timed out|服务暂时不可用|所有可用服务|没有已配置且支持当前任务的 Agent 服务|响应提前结束/i
      .test(String(error?.message || error || ""));
  }

  function isCanvasAgentProtocolStateError(error) {
    return /no tool call found|function call output|previous_response_id|unknown response|response[^\n]*not found|call_id|traceid/i
      .test(String(error?.message || error || ""));
  }

  function isCanvasAgentThinkingReplayError(error) {
    return /reasoning_content|thinking mode/i.test(String(error?.message || error || ""));
  }

  function getCanvasAgentUserFacingError(error) {
    const raw = String(error?.message || error || "").trim();
    if (isCanvasAgentThinkingReplayError(error)) {
      return "当前模型没有接受上一轮的思考状态，任务和画布均已保留。请切换到兼容模型后继续，或新开一个任务。";
    }
    if (isCanvasAgentProtocolStateError(error)) {
      return "Agent 线路连续中断，后台恢复仍未成功；已完成的画布操作均已保留，可以重新尝试。";
    }
    if (/api\s*key|未配置|unauthori[sz]ed|forbidden|鉴权|无权限/i.test(raw)) {
      return "Agent 服务尚未配置好，请先检查 API 接入设置。当前画布和对话已保留。";
    }
    if (/balance|quota|credit|billing|余额|欠费/i.test(raw)) {
      return "当前服务额度不足，任务没有丢失；补充额度后可以继续。";
    }
    if (error?.recoverable || /timeout|timed out|network|fetch failed|服务暂时不可用|所有可用服务/i.test(raw)) {
      return "Agent 线路连续超时，后台恢复仍未成功；当前任务和画布均已保留，可以重新尝试。";
    }
    if (/^[\s\S]{1,160}$/.test(raw) && /[\u3400-\u9fff]/u.test(raw) && !/https?:\/\/|\b(?:http|trace|call_id|status)\b/i.test(raw)) {
      return raw;
    }
    return "这一步没有完成，但画布和对话都已保留。请调整要求后继续。";
  }

  function getCanvasAgentUserFacingToolError(error) {
    const raw = String(error || "").trim();
    if (raw && raw.length <= 120 && /[\u3400-\u9fff]/u.test(raw) && !/trace|call_id|https?:\/\//i.test(raw)) return raw;
    return "节点执行未完成，可检查节点设置后继续。";
  }

  function resetCanvasAgentRun(options = {}) {
    if (!options.keepRecovery) cancelCanvasAgentRecovery();
    if (state.currentRun?.status === "running") stopCanvasAgentRun();
    state.runAbortController?.abort();
    state.runAbortController = null;
    disposeCanvasAgentMcpSession();
    state.broker.invalidate("reset");
    state.scope = null;
    state.currentRun = null;
    state.pendingApproval = null;
    state.pendingDesignBrief = null;
    state.pendingImageChoice = null;
    if (!options.keepResumeSkill) state.pendingResumeSkillId = "";
    state.nextPaidAllowances = null;
    state.creationIndex = 0;
    state.paidAttempts.clear();
    state.completedToolOutputs.clear();
    if (options.clearContext) {
      state.mentionedNodeIds.clear();
      state.excludedNodeIds.clear();
    }
    document.querySelector("#canvasAgentApproval").hidden = true;
    document.querySelector(".canvas-agent-brief")?.remove();
    document.querySelector(".canvas-agent-image-choice")?.remove();
    setCanvasAgentBusy(false);
    const skill = getActiveSkill();
    renderCanvasAgentContext();
    setCanvasAgentStatus(skill ? `${skill.label} · 已就绪` : "自动模式 · 可直接开始");
  }

  function readSavedRuns() {
    try {
      const runs = JSON.parse(localStorage.getItem(RUNS_STORAGE_KEY) || "[]");
      return Array.isArray(runs) ? runs : [];
    } catch {
      return [];
    }
  }

  function markInterruptedRuns() {
    const runs = readSavedRuns();
    let changed = false;
    runs.forEach((run) => {
      if (run.status === "running") {
        run.status = "interrupted";
        run.updatedAt = Date.now();
        changed = true;
      }
    });
    if (changed) localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_SAVED_RUNS)));
  }

  function persistCanvasAgentRun() {
    if (!state.currentRun) return;
    const runs = readSavedRuns().filter((run) => run.id !== state.currentRun.id);
    runs.unshift({
      id: state.currentRun.id,
      prompt: state.currentRun.prompt,
      skillId: state.currentRun.skillId,
      activeSkillId: state.currentRun.activeSkillId || "",
      skillContract: restoreCanvasAgentSkillContract(state.currentRun.skillContract),
      paidAllowances: { ...(state.currentRun.paidAllowances || {}) },
      status: state.currentRun.status,
      step: state.currentRun.step,
      createdAt: state.currentRun.createdAt,
      updatedAt: state.currentRun.updatedAt,
      lastMessage: state.currentRun.events?.filter((event) => event.type === "assistant").at(-1)?.text || "",
    });
    localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_SAVED_RUNS)));
  }
})();
