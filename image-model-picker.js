(function exposeImageModelPicker(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ImageModelPicker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createImageModelPickerModule() {
  "use strict";

  const HEALTH = Object.freeze({
    online: { label: "正常", rank: 0, tone: "healthy" },
    reachable: { label: "可连接", rank: 0, tone: "healthy" },
    slow: { label: "较慢", rank: 1, tone: "warning" },
    unknown: { label: "未检测", rank: 2, tone: "neutral" },
    unstable: { label: "不稳定", rank: 3, tone: "warning" },
    degraded: { label: "服务降级", rank: 3, tone: "warning" },
    "circuit-open": { label: "暂时停用", rank: 4, tone: "danger" },
    circuit_open: { label: "暂时停用", rank: 4, tone: "danger" },
    offline: { label: "离线", rank: 5, tone: "danger" },
    "connection-error": { label: "连接失败", rank: 5, tone: "danger" },
    "account-limited": { label: "账号受限", rank: 5, tone: "danger" },
    "auth-error": { label: "认证失败", rank: 5, tone: "danger" },
    "balance-error": { label: "余额不足", rank: 5, tone: "danger" },
    disabled: { label: "已停用", rank: 6, tone: "danger" },
  });

  function unique(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
  }

  function healthFor(value) {
    const state = String(value || "unknown").trim().toLowerCase();
    return { state, ...(HEALTH[state] || HEALTH.unknown) };
  }

  function primaryName(model) {
    if (model?.modelId) return String(model.modelId).trim();
    const providerName = String(model?.providerName || "").trim();
    const displayName = String(model?.displayName || model?.name || model?.modelId || model?.id || "").trim();
    const suffix = providerName ? ` · ${providerName}` : "";
    return suffix && displayName.endsWith(suffix)
      ? displayName.slice(0, -suffix.length).trim()
      : displayName;
  }

  function resolveModelId(models, value) {
    const id = String(value || "");
    const entries = Array.isArray(models) ? models : [];
    if (entries.some(model => model.id === id)) return id;
    return entries.find(model => Array.isArray(model.legacyIds) && model.legacyIds.includes(id))?.id || id;
  }

  function resolutionBadge(values) {
    const labels = unique(values).map((value) => {
      const normalized = String(value).trim().toUpperCase().replace(/K$/, "");
      return normalized === "512" ? "512" : `${normalized}K`;
    });
    return labels.length ? labels.join("/") : "";
  }

  function normalizeCatalog(models) {
    return (Array.isArray(models) ? models : []).flatMap((model, index) => {
      const capabilities = unique(model?.capabilities);
      if (!capabilities.some((value) => value === "image.generate" || value === "generation")) return [];
      const id = String(model?.id || "").trim();
      if (!id) return [];
      const providerName = String(model?.providerName || "未命名 API").trim() || "未命名 API";
      const health = healthFor(model?.state);
      const badges = [
        "文生图",
        capabilities.some((value) => value === "image.edit" || value === "edit") ? "图片编辑" : "",
        resolutionBadge(model?.resolutions),
      ].filter(Boolean);
      return [{
        ...model,
        id,
        modelId: String(model?.modelId || id).trim(),
        providerId: String(model?.providerId || "").trim(),
        providerName,
        primaryName: primaryName(model),
        capabilities,
        resolutions: unique(model?.resolutions),
        badges,
        health,
        providerSortOrder: Number.isFinite(Number(model?.providerSortOrder)) ? Number(model.providerSortOrder) : index,
        modelSortOrder: Number.isFinite(Number(model?.modelSortOrder)) ? Number(model.modelSortOrder) : index,
      }];
    });
  }

  function compareModels(left, right) {
    return left.health.rank - right.health.rank
      || left.providerSortOrder - right.providerSortOrder
      || left.modelSortOrder - right.modelSortOrder
      || left.primaryName.localeCompare(right.primaryName, "zh-CN");
  }

  function groupModels(models) {
    const groups = new Map();
    for (const model of [...(Array.isArray(models) ? models : [])].sort(compareModels)) {
      const key = model.providerId || model.providerName;
      const group = groups.get(key) || {
        providerId: model.providerId,
        providerName: model.providerName,
        rank: model.health.rank,
        providerSortOrder: model.providerSortOrder,
        models: [],
      };
      group.rank = Math.min(group.rank, model.health.rank);
      group.models.push(model);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.rank - right.rank
      || left.providerSortOrder - right.providerSortOrder
      || left.providerName.localeCompare(right.providerName, "zh-CN"));
  }

  function filterModels(models, query) {
    const tokens = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [...(Array.isArray(models) ? models : [])];
    return (Array.isArray(models) ? models : []).filter((model) => {
      const haystack = [model.primaryName, model.displayName, model.modelId, model.providerName, ...model.badges]
        .join(" ").toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }

  function preferenceKey(scope) {
    const safeScope = String(scope || "anonymous").trim().replace(/[^a-z0-9_-]/gi, "_") || "anonymous";
    return `ai-image-model-picker:${safeScope}`;
  }

  function readPreferences(storage, scope, models = []) {
    try {
      const parsed = JSON.parse(storage?.getItem?.(preferenceKey(scope)) || "{}");
      return {
        favorites: unique(unique(parsed?.favorites).map(id => resolveModelId(models, id))),
        recent: unique(unique(parsed?.recent).map(id => resolveModelId(models, id))).slice(0, 5),
      };
    } catch {
      return { favorites: [], recent: [] };
    }
  }

  function writePreferences(storage, scope, preferences) {
    const normalized = {
      favorites: unique(preferences?.favorites),
      recent: unique(preferences?.recent).slice(0, 5),
    };
    try { storage?.setItem?.(preferenceKey(scope), JSON.stringify(normalized)); } catch {}
    return normalized;
  }

  function toggleFavorite(storage, scope, id, models = []) {
    const current = readPreferences(storage, scope, models);
    const target = resolveModelId(models, id);
    current.favorites = current.favorites.includes(target)
      ? current.favorites.filter((value) => value !== target)
      : [...current.favorites, target];
    return writePreferences(storage, scope, current).favorites;
  }

  function recordRecent(storage, scope, id, models = []) {
    const current = readPreferences(storage, scope, models);
    const target = resolveModelId(models, id);
    current.recent = [target, ...current.recent.filter((value) => value !== target)].filter(Boolean).slice(0, 5);
    return writePreferences(storage, scope, current).recent;
  }

  function modelsForFilter(models, filter, preferences = {}) {
    const source = Array.isArray(models) ? models : [];
    const byId = new Map(source.map((model) => [model.id, model]));
    if (filter === "favorites" || filter === "recent") return unique(
      unique(preferences[filter]).map(id => resolveModelId(source, id)),
    ).map(id => byId.get(id)).filter(Boolean);
    if (filter === "recommended") return [...source].sort(compareModels).slice(0, 6);
    return source;
  }

  function getModelPresentation(model) {
    if (!model) return { primaryText: "自动选择", secondaryText: "推荐当前可用的图片模型", badges: [], health: healthFor("online") };
    const hasSuccessRate = model.successRate !== null
      && model.successRate !== undefined
      && model.successRate !== ""
      && Number.isFinite(Number(model.successRate));
    const details = [
      model.providerName,
      hasSuccessRate ? `${Number(model.successRate)}%` : "",
      Number(model.latencyMs) > 0 ? `${Math.round(Number(model.latencyMs))} ms` : "",
    ].filter(Boolean);
    return {
      primaryText: model.primaryName,
      secondaryText: details.join(" · "),
      badges: [...model.badges],
      health: model.health,
    };
  }

  function createElement(document, tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createSelectPicker(options = {}) {
    const select = options.select;
    const document = options.document || select?.ownerDocument;
    if (!select || !document) throw new TypeError("Image model picker requires a select element.");
    const storage = options.storage || document.defaultView?.localStorage;
    const scope = () => String(options.getScope?.() || "anonymous");
    const mount = options.mount || createElement(document, "div");
    const variant = options.variant === "canvas" ? "canvas" : "workspace";
    mount.classList.add("image-model-picker", `is-${variant}`);
    mount.addEventListener("pointerdown", (event) => event.stopPropagation());
    mount.addEventListener("click", (event) => event.stopPropagation());
    if (!options.mount) select.parentNode?.insertBefore(mount, select);
    select.classList.add("image-model-source");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    const clippingSurface = select.closest?.("#imageForm, .canvas-node") || null;

    const trigger = createElement(document, "button", "image-model-picker-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    const triggerStatus = createElement(document, "i", "image-model-health-dot");
    const triggerCopy = createElement(document, "span", "image-model-trigger-copy");
    const triggerTitle = createElement(document, "strong");
    const triggerMeta = createElement(document, "small");
    const triggerChevron = createElement(document, "b", "image-model-trigger-chevron", "⌄");
    triggerCopy.append(triggerTitle, triggerMeta);
    trigger.append(triggerStatus, triggerCopy, triggerChevron);

    const popover = createElement(document, "div", "image-model-picker-popover");
    popover.hidden = true;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "选择图片模型");
    const toolbar = createElement(document, "div", "image-model-picker-toolbar");
    const searchWrap = createElement(document, "label", "image-model-picker-search");
    const searchIcon = createElement(document, "span", "", "⌕");
    const search = createElement(document, "input");
    search.type = "search";
    search.placeholder = "搜索模型或 API 站点";
    search.autocomplete = "off";
    const close = createElement(document, "button", "image-model-picker-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭模型选择器");
    searchWrap.append(searchIcon, search);
    toolbar.append(searchWrap, close);

    const filters = createElement(document, "div", "image-model-picker-filters");
    const filterLabels = { recommended: "推荐", recent: "最近", favorites: "收藏", all: "全部" };
    Object.entries(filterLabels).forEach(([value, label]) => {
      const button = createElement(document, "button", value === "recommended" ? "active" : "", label);
      button.type = "button";
      button.dataset.modelFilter = value;
      filters.append(button);
    });
    const list = createElement(document, "div", "image-model-picker-list");
    list.setAttribute("role", "listbox");
    const footer = createElement(document, "footer", "image-model-picker-footer");
    const summary = createElement(document, "span", "", "按站点分组显示");
    const manage = createElement(document, "button", "", "API 设置");
    manage.type = "button";
    footer.append(summary, manage);
    popover.append(toolbar, filters, list, footer);
    mount.append(trigger);
    document.body.append(popover);
    popover.addEventListener("pointerdown", (event) => event.stopPropagation());
    popover.addEventListener("click", (event) => event.stopPropagation());
    select.classList.add("is-picker-enhanced");

    let models = [];
    let activeFilter = "recommended";
    const collapsed = new Set();

    function preferences() {
      return readPreferences(storage, scope(), models);
    }

    function selectedModel() {
      return models.find((model) => model.id === select.value) || models[0] || null;
    }

    function isAutomatic() {
      return select.dataset.modelSelection === "auto";
    }

    function renderTrigger() {
      const model = selectedModel();
      const presentation = isAutomatic()
        ? getModelPresentation(null)
        : getModelPresentation(model);
      triggerTitle.textContent = presentation.primaryText;
      triggerMeta.textContent = isAutomatic()
        ? `${model?.providerName || ""}${model ? " · 当前推荐" : ""}`
        : presentation.secondaryText || presentation.badges.join(" · ");
      triggerStatus.dataset.state = isAutomatic() ? "auto" : presentation.health.tone;
      trigger.title = `${triggerTitle.textContent}${triggerMeta.textContent ? ` · ${triggerMeta.textContent}` : ""}`;
    }

    function choose(selectionId) {
      if (selectionId === "__auto__") {
        const recommended = [...models].sort(compareModels)[0] || null;
        if (recommended) select.value = recommended.id;
        select.dataset.modelSelection = "auto";
      } else {
        select.value = selectionId;
        select.dataset.modelSelection = "exact";
        recordRecent(storage, scope(), selectionId, models);
      }
      const EventConstructor = document.defaultView?.Event || globalThis.Event;
      select.dispatchEvent(new EventConstructor("change", { bubbles: true }));
      renderTrigger();
      closePopover();
      options.onSelect?.({ mode: isAutomatic() ? "auto" : "exact", model: selectedModel() });
    }

    function createModelRow(model) {
      const row = createElement(document, "div", "image-model-picker-row");
      row.dataset.modelId = model.id;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(!isAutomatic() && select.value === model.id));
      const chooseButton = createElement(document, "button", "image-model-picker-choice");
      chooseButton.type = "button";
      const status = createElement(document, "i", "image-model-health-dot");
      status.dataset.state = model.health.tone;
      const copy = createElement(document, "span");
      const title = createElement(document, "strong", "", model.primaryName);
      const detail = createElement(document, "small", "", [model.badges.join(" · "), model.health.label].filter(Boolean).join(" · "));
      copy.append(title, detail);
      chooseButton.append(status, copy);
      chooseButton.addEventListener("click", () => choose(model.id));
      const favorite = createElement(document, "button", "image-model-favorite", preferences().favorites.includes(model.id) ? "★" : "☆");
      favorite.type = "button";
      favorite.setAttribute("aria-label", "收藏模型");
      favorite.setAttribute("aria-pressed", String(preferences().favorites.includes(model.id)));
      favorite.addEventListener("click", () => {
        toggleFavorite(storage, scope(), model.id, models);
        renderList();
      });
      row.append(chooseButton, favorite);
      return row;
    }

    function createAutoRow() {
      const recommended = [...models].sort(compareModels)[0] || null;
      const row = createElement(document, "button", "image-model-picker-auto");
      row.type = "button";
      row.dataset.modelId = "__auto__";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(isAutomatic()));
      const mark = createElement(document, "span", "", "✨");
      const copy = createElement(document, "span");
      copy.append(
        createElement(document, "strong", "", "自动选择（推荐）"),
        createElement(document, "small", "", recommended ? `当前推荐 ${recommended.primaryName} · ${recommended.providerName}` : "按健康状态自动选择"),
      );
      row.append(mark, copy);
      row.addEventListener("click", () => choose("__auto__"));
      return row;
    }

    function renderList() {
      list.replaceChildren();
      const prefs = preferences();
      const queried = filterModels(modelsForFilter(models, activeFilter, prefs), search.value);
      if (!search.value.trim() && ["recommended", "all"].includes(activeFilter)) list.append(createAutoRow());
      const groups = groupModels(queried);
      for (const group of groups) {
        const section = createElement(document, "section", "image-model-provider-group");
        section.dataset.providerId = group.providerId;
        const groupButton = createElement(document, "button", "image-model-provider-heading");
        groupButton.type = "button";
        groupButton.setAttribute("aria-expanded", String(!collapsed.has(group.providerId)));
        const name = createElement(document, "strong", "", group.providerName);
        const count = createElement(document, "span", "", `${group.models.length} 个模型`);
        const chevron = createElement(document, "b", "", collapsed.has(group.providerId) ? "›" : "⌄");
        groupButton.append(name, count, chevron);
        const rows = createElement(document, "div", "image-model-provider-models");
        rows.hidden = collapsed.has(group.providerId);
        group.models.forEach((model) => rows.append(createModelRow(model)));
        groupButton.addEventListener("click", () => {
          if (collapsed.has(group.providerId)) collapsed.delete(group.providerId);
          else collapsed.add(group.providerId);
          renderList();
        });
        section.append(groupButton, rows);
        list.append(section);
      }
      if (!groups.length && !(models.length && !search.value.trim() && ["recommended", "all"].includes(activeFilter))) {
        const empty = createElement(document, "div", "image-model-picker-empty");
        empty.append(
          createElement(document, "strong", "", activeFilter === "favorites" ? "还没有收藏模型" : "没有匹配的模型"),
          createElement(document, "span", "", "可切换筛选或搜索 API 站点名称"),
        );
        list.append(empty);
      }
      summary.textContent = `${queried.length} 个模型 · ${groups.length} 个站点`;
    }

    function positionPopover() {
      if (popover.hidden) return;
      const view = document.defaultView;
      const physicalViewportWidth = Math.max(240, Number(view?.innerWidth || 1280));
      const physicalViewportHeight = Math.max(280, Number(view?.innerHeight || 800));
      const requestedScale = Number(document.documentElement?.dataset?.uiScale || 1);
      const systemScale = [0.75, 1, 1.25, 1.5, 1.75].includes(requestedScale) ? requestedScale : 1;
      const viewportWidth = physicalViewportWidth / systemScale;
      const viewportHeight = physicalViewportHeight / systemScale;
      const physicalTriggerRect = trigger.getBoundingClientRect();
      const triggerRect = {
        top: physicalTriggerRect.top / systemScale,
        right: physicalTriggerRect.right / systemScale,
        bottom: physicalTriggerRect.bottom / systemScale,
        left: physicalTriggerRect.left / systemScale,
      };
      const compact = viewportWidth <= 760 || viewportHeight <= 760;
      popover.style.position = "fixed";
      popover.style.transform = `scale(${systemScale})`;
      popover.style.transformOrigin = "top left";
      popover.style.right = "auto";
      popover.style.bottom = "auto";
      if (compact) {
        const sideInset = Math.min(12, Math.max(6, viewportWidth * 0.025));
        const topGuard = Math.min(86, Math.max(12, viewportHeight * 0.18));
        const bottomGuard = Math.min(92, Math.max(12, viewportHeight * 0.18));
        const width = Math.max(160, viewportWidth - (sideInset * 2));
        const height = Math.max(150, viewportHeight - topGuard - bottomGuard);
        popover.style.top = `${topGuard * systemScale}px`;
        popover.style.left = `${sideInset * systemScale}px`;
        popover.style.width = `${width}px`;
        popover.style.height = `${height}px`;
        popover.style.maxHeight = "none";
        return;
      }
      const width = Math.min(440, viewportWidth - 32);
      const left = Math.max(16, Math.min(triggerRect.left, viewportWidth - width - 16));
      const dockGuard = 96;
      const availableBelow = viewportHeight - triggerRect.bottom - dockGuard - 10;
      const openBelow = availableBelow >= 300;
      const logicalTop = openBelow
        ? triggerRect.bottom + 8
        : Math.max(16, triggerRect.top - Math.max(240, Math.min(560, triggerRect.top - 24)) - 8);
      popover.style.top = `${logicalTop * systemScale}px`;
      popover.style.left = `${left * systemScale}px`;
      popover.style.width = `${width}px`;
      popover.style.height = "auto";
      popover.style.maxHeight = `${Math.max(240, Math.min(560, openBelow ? availableBelow : triggerRect.top - 24))}px`;
    }

    function openPopover() {
      popover.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      mount.classList.add("is-open");
      clippingSurface?.classList.add("is-model-picker-open");
      renderList();
      positionPopover();
      requestAnimationFrame(() => search.focus());
    }

    function closePopover() {
      popover.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      mount.classList.remove("is-open");
      clippingSurface?.classList.remove("is-model-picker-open");
    }

    trigger.addEventListener("click", () => popover.hidden ? openPopover() : closePopover());
    close.addEventListener("click", closePopover);
    search.addEventListener("input", renderList);
    filters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-model-filter]");
      if (!button) return;
      activeFilter = button.dataset.modelFilter;
      filters.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
      renderList();
    });
    manage.addEventListener("click", () => {
      closePopover();
      options.onManage?.();
    });
    const handleDocumentPointerDown = (event) => {
      if (!popover.hidden && !mount.contains(event.target) && !popover.contains(event.target)) closePopover();
    };
    const handleDocumentKeyDown = (event) => {
      if (event.key === "Escape" && !popover.hidden) {
        closePopover();
        trigger.focus();
      }
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    document.defaultView?.addEventListener("resize", positionPopover);
    document.defaultView?.addEventListener("ai-os-preferences-applied", positionPopover);
    document.addEventListener("scroll", positionPopover, true);

    function setModels(nextModels) {
      models = normalizeCatalog(nextModels);
      if (!models.some((model) => model.id === select.value) && models[0]) select.value = models[0].id;
      renderTrigger();
      if (!popover.hidden) renderList();
    }

    function refresh() {
      renderTrigger();
      if (!popover.hidden) renderList();
    }

    function destroy() {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      document.defaultView?.removeEventListener("resize", positionPopover);
      document.defaultView?.removeEventListener("ai-os-preferences-applied", positionPopover);
      document.removeEventListener("scroll", positionPopover, true);
      popover.remove();
      mount.remove();
      select.classList.remove("is-picker-enhanced");
      select.removeAttribute("aria-hidden");
      select.removeAttribute("tabindex");
      clippingSurface?.classList.remove("is-model-picker-open");
    }

    setModels(options.models || []);
    return Object.freeze({ setModels, refresh, open: openPopover, close: closePopover, choose, destroy, mount });
  }

  return Object.freeze({
    resolveModelId,
    normalizeCatalog,
    groupModels,
    filterModels,
    readPreferences,
    toggleFavorite,
    recordRecent,
    modelsForFilter,
    getModelPresentation,
    createSelectPicker,
  });
});
