(function installFloraVisualPresets(root) {
  "use strict";

  const config = root.FloraVisualPresetConfig || { categories: [], presets: [] };
  const categories = Array.isArray(config.categories) ? config.categories : [];
  const presets = Array.isArray(config.presets) ? config.presets : [];
  const presetMap = new Map(presets.map((preset) => [preset.id, preset]));
  const aliases = new Map(presets.filter(preset => preset.libraryId).map(preset => [preset.libraryId, preset.id]));
  const emptyMultiChoices = {
    "LOOK-ACCESSORY": "LOOK-ACCESSORY-01",
    "FACE-MARK": "FACE-MARK-01",
  };
  const stateMap = new WeakMap();
  const managedBlock = /\n?\[AI OS 视觉预设\][\s\S]*?\[\/AI OS 视觉预设\]\n?/g;
  let openState = null;

  function isGenerator(node) {
    return node?.dataset?.floraKind === "generator";
  }

  function emptySelection() {
    return {
      characterDesign: {},
      stylePreset: "",
      filterPreset: "",
      functionPreset: "",
      cameraControl: {
        camera: "",
        lens: "",
        focalLength: "",
        aperture: "",
      },
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(value) {
    const next = emptySelection();
    const input = value && typeof value === "object" ? value : {};
    const character = input.characterDesign && typeof input.characterDesign === "object"
      ? input.characterDesign
      : {};
    const resolve = (value, group) => {
      if (typeof value !== "string") return "";
      const id = presetMap.has(value) ? value : aliases.get(value);
      return presetMap.get(id)?.group === group ? id : "";
    };
    (categoryById("characterDesign")?.groups || []).forEach(({ id: group, selectionMode }) => {
      if (selectionMode === "multi") {
        const values = Array.isArray(character[group]) ? character[group] : [];
        const valid = values.map(id => resolve(id, group)).filter(Boolean);
        const lastEmpty = valid.lastIndexOf(emptyMultiChoices[group]);
        const selected = [...new Set(lastEmpty < 0 ? valid : valid.slice(
          lastEmpty === valid.length - 1 ? lastEmpty : lastEmpty + 1,
        ))];
        if (selected.length) next.characterDesign[group] = selected;
        return;
      }
      const id = resolve(character[group], group);
      if (id) next.characterDesign[group] = id;
    });
    ["stylePreset", "filterPreset", "functionPreset"].forEach((key) => {
      next[key] = resolve(input[key], key);
    });
    // Older canvases could save both. Keep the style that previously reached the generator.
    if (next.stylePreset) delete next.characterDesign["STYLE-RENDER"];
    const camera = input.cameraControl && typeof input.cameraControl === "object"
      ? input.cameraControl
      : {};
    (categoryById("cameraControl")?.tabs || []).forEach(({ id: key }) => {
      next.cameraControl[key] = resolve(camera[key], key);
    });
    return next;
  }

  function read(node) {
    if (!isGenerator(node)) return emptySelection();
    try {
      return normalize(JSON.parse(node.dataset.floraVisualPresets || "{}"));
    } catch {
      return emptySelection();
    }
  }

  function emitChange(node, value) {
    const view = node?.ownerDocument?.defaultView || root;
    const EventCtor = view?.CustomEvent || root.CustomEvent;
    if (typeof EventCtor !== "function" || typeof node?.dispatchEvent !== "function") return;
    node.dispatchEvent(new EventCtor("flora-visual-presets-change", {
      bubbles: true,
      detail: { node, presets: clone(value) },
    }));
  }

  function write(node, value) {
    if (!isGenerator(node)) return emptySelection();
    const next = normalize(value);
    const serialized = JSON.stringify(next);
    if (node.dataset.floraVisualPresets !== serialized) {
      node.dataset.floraVisualPresets = serialized;
      emitChange(node, next);
    }
    return next;
  }

  function serialize(node) {
    if (!isGenerator(node)) return {};
    const value = read(node);
    const hasSelection = Object.values(value.characterDesign).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value))
      || Boolean(value.stylePreset)
      || Boolean(value.filterPreset)
      || Boolean(value.functionPreset)
      || Object.values(value.cameraControl).some(Boolean);
    return hasSelection ? value : {};
  }

  function hydrate(node, value) {
    if (!isGenerator(node)) return emptySelection();
    const next = normalize(value);
    node.dataset.floraVisualPresets = JSON.stringify(next);
    return next;
  }

  function selectedIds(value) {
    return [
      ...Object.values(value.characterDesign),
      value.stylePreset,
      value.filterPreset,
      value.functionPreset,
      ...Object.values(value.cameraControl),
    ].flatMap(value => Array.isArray(value) ? value : [value]).filter(Boolean);
  }

  function selectedPresets(value) {
    return selectedIds(value).map((id) => presetMap.get(id)).filter(Boolean);
  }

  function requiresImageReference(node) {
    return isGenerator(node) && selectedPresets(read(node)).some(preset => preset.requiresReference === true);
  }

  function buildNegativePrompt(node) {
    return [...new Set(selectedPresets(read(node)).map(preset => preset.runtimeNegativePrompt).filter(Boolean))].join("；");
  }

  function buildPrompt(node, basePrompt = "") {
    if (!isGenerator(node)) return String(basePrompt || "").trim();
    const base = String(basePrompt || "").replace(managedBlock, "").trim();
    const effects = selectedPresets(read(node)).map(preset => preset.runtimeEffectPrompt).filter(Boolean);
    return [base, effects.join("\n")].filter(Boolean).join("\n\n");
  }

  function resolveThumbnail(value) {
    if (!value) return "";
    const preview = config.previews?.[value];
    if (preview) return preview;
    // Local slots are embedded at build time. An absent slot uses a text card.
    if (value.startsWith("asset:")) return "";
    return /^(?:https?:|data:image\/|\/)/.test(value) ? value : "";
  }

  function categoryById(id) {
    return categories.find((category) => category.id === id) || null;
  }

  function itemsFor(categoryId, groupId) {
    return presets
      .filter(preset => preset.group === (groupId || categoryId) && !preset.hiddenFromPicker)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  function pickerGroups(category) {
    if (category.tabs) return category.tabs;
    if (category.groups) return category.groups;
    const tags = [...new Set(itemsFor(category.id, category.id)
      .map((preset) => preset.tags?.[0])
      .filter(Boolean))];
    return tags.map((tag) => ({ id: tag, label: tag }));
  }

  function pickerSections(category, tabId) {
    if (category.tabs) {
      const tab = category.tabs.find(item => item.id === tabId);
      if (!tab) return [];
      if (Array.isArray(tab.groups)) {
        return tab.groups.map(value => {
          const group = typeof value === "string"
            ? category.groups?.find(item => item.id === value) || { id: value }
            : value;
          return {
            id: group.id,
            label: group.label || "",
            items: itemsFor(category.id, group.id),
          };
        });
      }
      const tags = tab.presetTags || [tab.id];
      return [{
        id: tab.id,
        label: "",
        items: presets.filter(preset => preset.group === category.id
          && tags.some(tag => (preset.tags || []).includes(tag)))
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
      }];
    }
    if (category.groups) {
      return category.groups.map(group => ({
        id: group.id,
        label: group.label || "",
        items: itemsFor(category.id, group.id),
      }));
    }
    const groups = pickerGroups(category);
    return groups.map(group => ({
      id: group.id,
      label: group.label || "",
      items: itemsFor(category.id, category.id).filter(preset => preset.tags?.[0] === group.id),
    }));
  }

  function categorySelection(value, categoryId, groupId) {
    if (categoryId === "characterDesign") {
      const selection = value.characterDesign[groupId];
      return Array.isArray(selection) ? selection : selection || "";
    }
    if (categoryId === "cameraControl") return value.cameraControl[groupId] || "";
    return value[categoryId] || "";
  }

  function toggleCategorySelection(value, categoryId, groupId, presetId) {
    const selection = categorySelection(value, categoryId, groupId);
    if (selectionHas(selection, presetId)) return clearCategorySelection(value, categoryId, groupId, presetId);

    const next = clone(value);
    if (categoryId === "characterDesign") {
      const group = categoryById(categoryId)?.groups?.find(item => item.id === groupId);
      if (group?.selectionMode === "multi") {
        const selected = Array.isArray(selection) ? selection : [];
        const empty = emptyMultiChoices[groupId];
        next.characterDesign[groupId] = presetId === empty ? [presetId] : [...selected.filter(id => id !== empty), presetId];
      } else {
        next.characterDesign[groupId] = presetId;
        if (groupId === "STYLE-RENDER") next.stylePreset = "";
      }
    } else if (categoryId === "cameraControl") {
      next.cameraControl[groupId] = presetId;
    } else {
      next[categoryId] = presetId;
      if (categoryId === "stylePreset") delete next.characterDesign["STYLE-RENDER"];
    }
    return next;
  }

  function clearCategorySelection(value, categoryId, groupId, presetId) {
    const next = clone(value);
    if (categoryId === "characterDesign") {
      const selection = next.characterDesign[groupId];
      if (Array.isArray(selection)) {
        next.characterDesign[groupId] = selection.filter(id => id !== presetId);
        if (!next.characterDesign[groupId].length) delete next.characterDesign[groupId];
      } else if (selection === presetId) delete next.characterDesign[groupId];
    } else if (categoryId === "cameraControl") {
      if (next.cameraControl[groupId] === presetId) next.cameraControl[groupId] = "";
    } else if (next[categoryId] === presetId) next[categoryId] = "";
    return next;
  }

  function selectionHas(selection, id) {
    return Array.isArray(selection) ? selection.includes(id) : selection === id;
  }

  function createThumbnail(document, preset) {
    if (Array.isArray(preset.paletteColors) && preset.paletteColors.length) {
      const palette = document.createElement("span");
      palette.className = "flora-visual-presets-palette";
      palette.setAttribute("aria-label", `配色色板：${preset.paletteColors.join(" ")}`);
      preset.paletteColors.forEach(color => {
        const swatch = document.createElement("span");
        swatch.className = "flora-visual-presets-palette-swatch";
        swatch.style.backgroundColor = color;
        swatch.title = color;
        palette.append(swatch);
      });
      return palette;
    }
    const thumbnail = resolveThumbnail(preset.thumbnail);
    if (!thumbnail) {
      const placeholder = document.createElement("span");
      placeholder.className = "flora-visual-presets-placeholder";
      placeholder.textContent = "预览待补";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.title = "预览图待补充";
      return placeholder;
    }
    const image = document.createElement("img");
    image.src = thumbnail;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.replaceWith(Object.assign(document.createElement("span"), {
        className: "flora-visual-presets-placeholder",
        textContent: "预览暂不可用",
        title: "预览图暂不可用",
      }));
    }, { once: true });
    return image;
  }

  function cameraPreviewPlaceholder(document, label, title = label) {
    const placeholder = document.createElement("span");
    placeholder.className = "flora-visual-presets-placeholder";
    placeholder.textContent = label;
    placeholder.title = title;
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }

  function setOptionSelected(button, selected) {
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }

  function createOption(document, state, categoryId, groupId, preset) {
    const selected = selectionHas(categorySelection(state.draft || state.value, categoryId, groupId), preset.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "flora-visual-presets-card";
    if (["stylePreset", "filterPreset", "functionPreset"].includes(categoryId)) {
      button.classList.add("flora-visual-presets-wide-card", `is-${categoryId}`);
    }
    setOptionSelected(button, selected);
    button.dataset.presetId = preset.id;
    button.dataset.presetCategory = categoryId;
    button.dataset.presetGroup = groupId || "";
    button.title = preset.description || preset.name;
    button.append(createThumbnail(document, preset));
    const name = document.createElement("span");
    name.className = "flora-visual-presets-card-name";
    name.textContent = preset.name;
    button.append(name);
    return button;
  }

  function renderCameraPreview(state) {
    if (state.activeCategory !== "cameraControl") return;
    const category = categoryById(state.activeCategory);
    const section = pickerSections(category, state.activeTab).find(item => item.items.length);
    const selectedId = categorySelection(state.draft || state.value, state.activeCategory, state.activeTab);
    const previewPreset = presetMap.get(selectedId)
      || section?.items.find(item => resolveThumbnail(item.previewSource) || resolveThumbnail(item.thumbnail))
      || section?.items[0];
    state.cameraPreview.hidden = !previewPreset;
    if (!previewPreset) {
      state.previewRequest = null;
      return;
    }
    if (state.previewRequest?.id === previewPreset.id) return;
    const request = { id: previewPreset.id };
    state.previewRequest = request;
    const document = state.host.ownerDocument;
    let preview = state.cameraPreview.firstElementChild;
    if (!preview) {
      preview = document.createElement("div");
      preview.className = "flora-visual-presets-camera-preview";
      preview.append(cameraPreviewPlaceholder(document, "高清预览加载中"), document.createElement("span"));
      state.cameraPreview.append(preview);
    }
    const show = content => {
      if (state.previewRequest !== request) return;
      preview.firstElementChild.replaceWith(content);
      preview.lastElementChild.textContent = previewPreset.name;
      preview.setAttribute("aria-busy", "false");
    };
    const source = resolveThumbnail(previewPreset.previewSource);
    if (!source) {
      show(cameraPreviewPlaceholder(document, "高清预览待补", "高清预览图待补充"));
      return;
    }
    // Keep the last decoded frame and its caption visible until the latest image is ready.
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.dataset.previewQuality = "original";
    preview.setAttribute("aria-busy", "true");
    image.src = source;
    image.decode().then(() => show(image), () => {
      show(cameraPreviewPlaceholder(document, "高清预览加载失败"));
    });
  }

  function presetsForCategory(value, categoryId) {
    if (categoryId === "characterDesign") {
      return Object.values(value.characterDesign).flatMap(id => Array.isArray(id) ? id : [id])
        .map((id) => presetMap.get(id)).filter(Boolean);
    }
    if (categoryId === "cameraControl") {
      return Object.values(value.cameraControl).map((id) => presetMap.get(id)).filter(Boolean);
    }
    const id = value[categoryId];
    return id ? [presetMap.get(id)].filter(Boolean) : [];
  }

  function renderTags(document, state) {
    state.tags.replaceChildren();
    const categoryId = state.activeCategory || "";
    const value = state.draft || state.value;
    const selected = categoryId ? presetsForCategory(value, categoryId) : selectedPresets(value);
    selected.forEach((preset) => {
      const tag = document.createElement("span");
      tag.className = "flora-visual-presets-tag";
      tag.dataset.presetTag = preset.id;
      tag.title = preset.name;
      const label = document.createElement("span");
      label.className = "flora-visual-presets-tag-label";
      label.textContent = preset.name;
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "flora-visual-presets-tag-clear";
      clear.dataset.clearPreset = preset.id;
      clear.setAttribute("aria-label", `清除${preset.name}`);
      clear.title = `清除${preset.name}`;
      clear.textContent = "×";
      tag.append(label, clear);
      state.tags.append(tag);
    });
  }

  function renderEntryState(state) {
    state.entries.querySelectorAll("[data-preset-entry]").forEach((button) => {
      const categoryId = button.dataset.presetEntry;
      const category = categoryById(categoryId);
      const value = state.draft || state.value;
      const count = categoryId === "characterDesign"
        ? Object.values(value.characterDesign).reduce((total, selected) => total + (Array.isArray(selected) ? selected.length : selected ? 1 : 0), 0)
        : categoryId === "cameraControl"
          ? Object.values(value.cameraControl).filter(Boolean).length
          : value[categoryId] ? 1 : 0;
      button.classList.toggle("is-selected", count > 0);
      button.classList.toggle("has-selection", count > 0);
      button.classList.toggle("is-open", state.activeCategory === categoryId);
      button.setAttribute("aria-expanded", String(state.activeCategory === categoryId));
      button.setAttribute("aria-label", count ? `${category?.label || ""}，已选择${count}项` : category?.label || "");
    });
  }

  function renderOptions(state) {
    const document = state.host.ownerDocument;
    const category = categoryById(state.activeCategory);
    renderCameraPreview(state);
    if (state.cameraCards) {
      const id = categorySelection(state.draft || state.value, category.id, state.activeTab);
      for (const [presetId, button] of state.cameraCards) setOptionSelected(button, presetId === id);
      renderOptionSummary(state, document);
      return;
    }
    const scrollTop = state.body.scrollTop;
    const focusedPreset = document.activeElement?.dataset.presetId;
    state.body.replaceChildren();
    if (category.id === "cameraControl") state.cameraCards = new Map();
    const sections = pickerSections(category, state.activeTab);
    let count = 0;
    sections.forEach((sectionConfig) => {
      const items = sectionConfig.items.filter((preset) => {
        const query = state.query.trim().toLowerCase();
        return !query || `${preset.name} ${(preset.tags || []).join(" ")} ${preset.description || ""}`.toLowerCase().includes(query);
      });
      if (!items.length) return;
      count += items.length;
      const section = document.createElement("section");
      section.className = "flora-visual-presets-group";
      if (sectionConfig.label) {
        const heading = document.createElement("div");
        heading.className = "flora-visual-presets-group-label";
        heading.textContent = sectionConfig.label;
        section.append(heading);
      }
      const grid = document.createElement("div");
      grid.className = state.activeCategory === "cameraControl"
        ? "flora-visual-presets-list"
        : ["stylePreset", "filterPreset", "functionPreset"].includes(state.activeCategory)
          ? `flora-visual-presets-grid flora-visual-presets-wide-grid is-${state.activeCategory}`
          : "flora-visual-presets-grid";
      items.forEach(preset => {
        const button = createOption(document, state, category.id, sectionConfig.id, preset);
        state.cameraCards?.set(preset.id, button);
        grid.append(button);
      });
      section.append(grid);
      state.body.append(section);
    });
    if (!count) {
      const empty = document.createElement("div");
      empty.className = "flora-visual-presets-empty";
      empty.textContent = "没有匹配的预设";
      state.body.append(empty);
    }
    renderOptionSummary(state, document);
    state.body.scrollTop = scrollTop;
    if (focusedPreset) state.body.querySelector(`[data-preset-id="${focusedPreset}"]`)?.focus({ preventScroll: true });
  }

  function renderOptionSummary(state, document) {
    const selected = presetsForCategory(state.draft, state.activeCategory);
    state.summary.textContent = `已选 ${selected.length} 项`;
    renderTags(document, state);
  }

  function positionPicker(state) {
    if (!state.activeCategory || !state.picker.isConnected) return;
    const anchor = (state.anchor || state.entries).getBoundingClientRect();
    const desiredWidths = {
      stylePreset: 920,
      filterPreset: 820,
      functionPreset: 820,
      cameraControl: 580,
    };
    const desiredWidth = desiredWidths[state.activeCategory] || 760;
    const width = Math.min(desiredWidth, root.innerWidth - 24);
    state.picker.style.width = `${Math.max(240, width)}px`;
    state.picker.style.maxHeight = `${Math.min(760, Math.max(220, root.innerHeight - 24))}px`;
    const height = state.picker.getBoundingClientRect().height;
    const above = anchor.top - 12;
    const below = root.innerHeight - anchor.bottom - 12;
    const preferAbove = above >= height || below < height;
    const top = preferAbove ? anchor.top - height - 8 : anchor.bottom + 8;
    const left = anchor.left + anchor.width / 2 - width / 2;
    state.picker.style.left = `${Math.max(12, Math.min(left, root.innerWidth - width - 12))}px`;
    state.picker.style.top = `${Math.max(12, Math.min(top, root.innerHeight - height - 12))}px`;
  }

  function closePicker(state, commit = true) {
    if (!state.activeCategory) return;
    const categoryId = state.activeCategory;
    const returnFocus = state.picker.contains(state.host.ownerDocument.activeElement);
    const current = read(state.node);
    const next = normalize(state.draft);
    state.value = commit && JSON.stringify(current) !== JSON.stringify(next)
      ? write(state.node, next)
      : current;
    state.persisted = state.node.dataset.floraVisualPresets;
    state.activeCategory = "";
    state.draft = null;
    state.previewRequest = null;
    state.cameraPreview = null;
    state.tags.hidden = true;
    if (state.picker.matches(":popover-open")) state.picker.hidePopover();
    state.picker.hidden = true;
    if (openState === state) openState = null;
    renderTags(state.host.ownerDocument, state);
    renderEntryState(state);
    if (returnFocus) state.entries.querySelector(`[data-preset-entry="${categoryId}"]`)?.focus({ preventScroll: true });
  }

  function renderPicker(state) {
    const document = state.host.ownerDocument;
    const category = categoryById(state.activeCategory);
    const focusedTab = document.activeElement?.dataset.presetTab;
    state.picker.replaceChildren();
    state.picker.hidden = false;
    state.picker.dataset.category = category.id;
    state.picker.dataset.activeTab = state.activeTab || "";
    state.picker.setAttribute("aria-label", category.label);
    const header = document.createElement("div");
    header.className = "flora-visual-presets-picker-header";
    const title = document.createElement("strong");
    title.textContent = category.label;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "flora-visual-presets-picker-close";
    close.dataset.closePicker = "true";
    close.setAttribute("aria-label", "关闭预设选择");
    close.textContent = "×";
    close.title = "关闭";
    let search;
    if (state.activeCategory !== "cameraControl") {
      const searchWrap = document.createElement("label");
      searchWrap.className = "flora-visual-presets-search-wrap";
      searchWrap.setAttribute("aria-label", `搜索${category.label}`);
      const searchIcon = document.createElement("i");
      searchIcon.dataset.lucide = "search";
      searchIcon.setAttribute("aria-hidden", "true");
      searchWrap.append(searchIcon);
      search = document.createElement("input");
      search.type = "search";
      search.className = "flora-visual-presets-search";
      search.placeholder = "搜索预设";
      search.value = state.query;
      search.dataset.presetSearch = "true";
      search.setAttribute("aria-label", `搜索${category.label}`);
      searchWrap.append(search);
      header.append(title, searchWrap, close);
    } else header.append(title, close);
    state.picker.append(header);
    root.lucide?.createIcons?.();

    const groups = pickerGroups(category);
    if (category.id !== "cameraControl") {
      state.previewRequest = null;
      state.cameraPreview = null;
    }
    state.cameraPreview ||= document.createElement("div");
    state.cameraPreview.className = "flora-visual-presets-camera-preview-wrap";
    state.picker.append(state.cameraPreview);
    state.cameraPreview.hidden = state.activeCategory !== "cameraControl";
    if (category.tabs?.length > 1) {
      const tabs = document.createElement("div");
      tabs.className = state.activeCategory === "cameraControl"
        ? "flora-visual-presets-camera-tabs"
        : "flora-visual-presets-tabs";
      groups.forEach((tab) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "flora-visual-presets-tab";
        button.classList.toggle("is-selected", tab.id === state.activeTab);
        button.dataset.presetTab = tab.id;
        button.dataset.presetCategory = category.id;
        button.textContent = tab.label;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(tab.id === state.activeTab));
        tabs.append(button);
      });
      tabs.setAttribute("role", "tablist");
      state.picker.append(tabs);
    }
    state.body = document.createElement("div");
    state.cameraCards = null;
    state.body.className = "flora-visual-presets-picker-body";
    const footer = document.createElement("div");
    footer.className = "flora-visual-presets-picker-footer";
    state.tags.hidden = false;
    const selection = document.createElement("div");
    selection.className = "flora-visual-presets-selection";
    state.summary = document.createElement("span");
    state.summary.className = "flora-visual-presets-summary";
    selection.append(state.summary, state.tags);
    footer.append(selection);
    const actions = document.createElement("div");
    actions.className = "flora-visual-presets-picker-actions";
    [["reset", "重置"], ["cancel", "取消"], ["save", "保存"]].forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.presetAction = action;
      button.textContent = label;
      actions.append(button);
    });
    footer.append(actions);
    renderTags(document, state);
    state.picker.append(state.body, footer);
    renderOptions(state);
    if (!state.picker.matches(":popover-open")) state.picker.showPopover();
    positionPicker(state);
    const focus = focusedTab
      ? state.picker.querySelector(`[data-preset-tab="${focusedTab}"]`)
      : search || close;
    focus?.focus({ preventScroll: true });
  }

  function render(state) {
    renderTags(state.host.ownerDocument, state);
    renderEntryState(state);
    if (state.activeCategory) renderOptions(state);
  }

  function mount(node, host) {
    if (!isGenerator(node) || !host) return null;
    const document = host.ownerDocument;
    host.replaceChildren();
    const entries = document.createElement("div");
    entries.className = "flora-visual-presets-entries";
    const tags = document.createElement("div");
    tags.className = "flora-visual-presets-tags";
    tags.hidden = true;
    const picker = document.createElement("div");
    picker.className = "flora-visual-presets-picker";
    picker.setAttribute("popover", "manual");
    picker.setAttribute("role", "dialog");
    picker.hidden = true;
    host.append(entries, tags, picker);
    const state = {
      node,
      host,
      entries,
      tags,
      picker,
      value: read(node),
      persisted: node.dataset.floraVisualPresets,
      draft: null,
      activeCategory: "",
      activeTab: "",
      anchor: null,
      query: "",
    };
    stateMap.set(node, state);
    categories.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "flora-visual-presets-entry";
      button.dataset.presetEntry = category.id;
      const icon = document.createElement("i");
      const icons = {
        characterDesign: "user-round",
        stylePreset: "palette",
        filterPreset: "grid-2x2",
        functionPreset: "scan-eye",
        cameraControl: "aperture",
      };
      icon.dataset.lucide = icons[category.id] || category.icon || "sliders-horizontal";
      button.title = category.label;
      button.setAttribute("aria-label", category.label);
      button.setAttribute("aria-haspopup", "dialog");
      button.append(icon);
      entries.append(button);
    });
    const onClick = (event) => {
      const entry = event.target.closest("[data-preset-entry]");
      if (entry) {
        const categoryId = entry.dataset.presetEntry;
        if (openState === state && state.activeCategory === categoryId) {
          closePicker(state);
          return;
        }
        const switchingCategory = openState === state;
        if (openState && !switchingCategory) closePicker(openState);
        state.value = read(node);
        if (!switchingCategory) state.draft = clone(state.value);
        state.activeCategory = categoryId;
        state.activeTab = pickerGroups(categoryById(categoryId))[0]?.id || "";
        state.anchor = entry;
        state.query = "";
        openState = state;
        renderPicker(state);
        render(state);
        return;
      }
      if (event.target.closest("[data-close-picker]")) {
        closePicker(state);
        return;
      }
      const action = event.target.closest("[data-preset-action]")?.dataset.presetAction;
      if (action === "save" || action === "cancel") {
        closePicker(state, action === "save");
        return;
      }
      if (action === "reset") {
        const empty = emptySelection();
        state.draft[state.activeCategory] = empty[state.activeCategory];
        render(state);
        return;
      }
      const tab = event.target.closest("[data-preset-tab]");
      if (tab) {
        state.activeTab = tab.dataset.presetTab;
        state.query = "";
        renderEntryState(state);
        renderPicker(state);
        return;
      }
      const clear = event.target.closest("[data-clear-preset]");
      if (clear) {
        const id = clear.dataset.clearPreset;
        if (state.activeCategory) {
          const preset = presetMap.get(id);
          if (preset) {
            state.draft = clearCategorySelection(state.draft, state.activeCategory, preset.group, id);
            render(state);
          }
          return;
        }
        if (state.value.characterDesign && Object.values(state.value.characterDesign).some(value => selectionHas(value, id))) {
          const group = Object.keys(state.value.characterDesign).find((key) => selectionHas(state.value.characterDesign[key], id));
          if (group) state.value = clearCategorySelection(state.value, "characterDesign", group, id);
        }
        if (state.value.stylePreset === id) state.value.stylePreset = "";
        if (state.value.filterPreset === id) state.value.filterPreset = "";
        if (state.value.functionPreset === id) state.value.functionPreset = "";
        Object.keys(state.value.cameraControl).forEach((key) => {
          if (state.value.cameraControl[key] === id) state.value.cameraControl[key] = "";
        });
        state.value = write(node, state.value);
        render(state);
        return;
      }
      const option = event.target.closest("[data-preset-id]");
      if (!option) return;
      state.draft = toggleCategorySelection(state.draft, option.dataset.presetCategory, option.dataset.presetGroup, option.dataset.presetId);
      render(state);
    };
    const onInput = (event) => {
      if (!event.target.matches("[data-preset-search]")) return;
      state.query = event.target.value;
      state.body.scrollTop = 0;
      renderOptions(state);
    };
    const onOutside = event => {
      if (state.activeCategory && !host.contains(event.target)) closePicker(state);
    };
    const onKey = event => {
      if (event.key === "Escape" && state.activeCategory) {
        event.preventDefault();
        event.stopPropagation();
        closePicker(state);
      }
    };
    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("keydown", onKey);
    const stopCanvas = event => event.stopPropagation();
    ["pointerdown", "dblclick", "wheel"].forEach(type => picker.addEventListener(type, stopCanvas));
    const onResize = () => positionPicker(state);
    root.addEventListener("pointerdown", onOutside, true);
    root.addEventListener("resize", onResize);
    render(state);
    root.lucide?.createIcons?.();
    return () => {
      closePicker(state);
      host.removeEventListener("click", onClick);
      host.removeEventListener("input", onInput);
      host.removeEventListener("keydown", onKey);
      root.removeEventListener("pointerdown", onOutside, true);
      root.removeEventListener("resize", onResize);
      stateMap.delete(node);
      host.replaceChildren();
    };
  }

  function sync(node, host) {
    const state = stateMap.get(node);
    if (!state) return;
    if (state.persisted === node.dataset.floraVisualPresets) return;
    state.value = read(node);
    state.persisted = node.dataset.floraVisualPresets;
    if (state.activeCategory) state.draft = clone(state.value);
    if (host && state.host !== host) state.host = host;
    render(state);
  }

  root.FloraVisualPresets = Object.freeze({
    buildNegativePrompt,
    buildPrompt,
    close: node => { const state = stateMap.get(node); if (state) closePicker(state); },
    hydrate,
    mount,
    requiresImageReference,
    read,
    serialize,
    sync,
    write,
  });
})(typeof window !== "undefined" ? window : globalThis);
