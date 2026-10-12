(function installMidjourneySettings(root) {
  'use strict';
  const states = new WeakMap();
  const parse = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
  const rules = () => root.MidjourneyParameterRules;
  const providerKey = model => String(model.providerId || model.providerName || model.providerHost || 'default');
  function family(model, catalog = []) {
    return catalog.filter(item => rules()?.isMidjourney(item) && providerKey(item) === providerKey(model));
  }
  function groupModels(catalog, selectedId) {
    const result = [], groups = new Map();
    for (const model of catalog) {
      if (!rules()?.isMidjourney(model)) { result.push(model); continue; }
      const key = providerKey(model);
      if (groups.has(key)) continue;
      const members = family(model, catalog);
      const representative = members.find(item => item.id === selectedId)
        || members.find(item => !rules().profile(item).fixedVersion) || model;
      groups.set(key, representative); result.push(representative);
    }
    return result;
  }
  function versionChoices(model, catalog = []) {
    if (!rules()?.isMidjourney(model)) return [];
    const members = family(model, catalog);
    const entries = (members.length ? members : [model]).slice().sort((left, right) => Number(right.id === model.id) - Number(left.id === model.id));
    const choices = [];
    for (const item of entries) {
      const profile = rules().profile(item);
      if (profile.unsupportedVersion) continue;
      if (profile.fixedVersion) {
        if (choices.some(choice => choice.version === profile.fixedVersion && choice.niji === Boolean(profile.fixedNiji) && choice.speed === profile.fixedSpeed)) continue;
        const label = profile.fixedNiji ? `Niji ${profile.fixedVersion}（动漫）` : `Midjourney V${profile.fixedVersion}`;
        const speedLabel = { fast: '快速', turbo: '极速', relax: '慢速' }[profile.fixedSpeed];
        choices.push({ key: `model:${item.id}`, label: label + (speedLabel ? ` · ${speedLabel}` : ''),
          version: profile.fixedVersion, niji: Boolean(profile.fixedNiji), speed: profile.fixedSpeed, modelId: item.id });
      } else for (const version of profile.versions || []) {
        if (choices.some(choice => choice.version === version.version && choice.niji === version.niji && !choice.speed)) continue;
        choices.push({ ...version, modelId: item.id });
      }
    }
    return choices;
  }
  function legacy(node) {
    const d = node.dataset;
    return { ...(d.canvasMidjourneyVersion ? { version: d.canvasMidjourneyVersion } : {}),
      ...(d.canvasMidjourneyMode ? { niji: d.canvasMidjourneyMode === 'niji' } : {}),
      ...(d.canvasMidjourneySpeed ? { speed: d.canvasMidjourneySpeed } : {}),
      ...(d.canvasMidjourneyQuality === 'hd' ? { hd: true } : {}),
      ...(d.canvasMidjourneyStyle === 'raw' ? { raw: true } : {}),
      ...(d.canvasMidjourneyStylize ? { stylize: Number(d.canvasMidjourneyStylize) } : {}) };
  }
  function persist(state) {
    const d = state.node.dataset, values = state.values;
    const json = JSON.stringify(values);
    if (d.canvasMidjourneyParameters !== json) d.canvasMidjourneyParameters = json;
    const compatibility = { canvasMidjourneyVersion: values.version || '', canvasMidjourneyMode: values.niji ? 'niji' : 'standard',
      canvasMidjourneySpeed: values.speed || '', canvasMidjourneyQuality: values.hd ? 'hd' : 'sd',
      canvasMidjourneyStyle: values.raw ? 'raw' : 'standard', canvasMidjourneyStylize: values.stylize ?? '' };
    for (const [key, value] of Object.entries(compatibility)) if (d[key] !== String(value)) d[key] = String(value);
  }
  function readControl(control, field) {
    if (control.value === '') return undefined;
    if (field.type === 'boolean') return control.value === 'true';
    if (field.type === 'number') return Number(control.value);
    return control.value;
  }
  function read(node) {
    const state = states.get(node);
    return state ? { ...state.values } : parse(node?.dataset?.canvasMidjourneyParameters);
  }
  function render(state, description, profile) {
    const container = state.container;
    const versions = profile.versions || [];
    const fields = description.fields || [];
    const signature = JSON.stringify([versions, fields]);
    let restoreFocus = null;
    if (container.dataset.signature !== signature) {
      restoreFocus = container.contains(document.activeElement) ? document.activeElement?.dataset.midjourneyField : null;
      container.replaceChildren(); container.dataset.signature = signature;
      if (versions.length) {
        const label = document.createElement('label'), title = document.createElement('span'), select = document.createElement('select');
        title.textContent = '模型版本'; select.dataset.midjourneyField = 'variant'; select.setAttribute('aria-label', '模型版本');
        for (const version of versions) { const option = document.createElement('option'); option.value = version.key; option.textContent = version.label; select.append(option); }
        label.append(title, select); container.append(label);
        select.addEventListener('change', () => {
          const chosen = versions.find(item => item.key === select.value);
          if (!chosen) return;
          const values = { ...state.values, version: chosen.version, niji: chosen.niji };
          if (chosen.modelId !== state.model.id && state.context.selectModel) {
            state.context.selectModel(chosen.modelId, values); return;
          }
          state.values = values;
          sync(state.node, state.model, state.values, state.context); state.node.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      for (const field of fields) {
        if (['version', 'niji'].includes(field.key)) continue;
        const label = document.createElement('label'), title = document.createElement('span'); title.textContent = field.label;
        const selectType = field.type === 'select' || field.type === 'boolean';
        const control = document.createElement(selectType ? 'select' : 'input');
        control.dataset.midjourneyField = field.key; control.setAttribute('aria-label', field.label);
        control.className = `canvas-midjourney-${field.key}`;
        if (selectType) {
          const choices = field.type === 'boolean' ? [{ value: '', label: '默认' }, { value: 'true', label: '开启' }, { value: 'false', label: '关闭' }]
            : [{ value: '', label: '默认' }, ...(field.options || [])];
          for (const choice of choices) { const option = document.createElement('option'); option.value = String(typeof choice === 'object' ? choice.value : choice); option.textContent = typeof choice === 'object' ? choice.label : String(choice); control.append(option); }
        } else {
          control.type = field.type === 'number' ? 'number' : 'text'; control.placeholder = '默认';
          for (const key of ['min', 'max', 'step']) if (field[key] !== undefined) control[key] = String(field[key]);
        }
        label.append(title, control);
        const descriptions = { raw: '减少模型自动添加的艺术风格', stylize: '越高越有艺术感，越低越贴近描述', chaos: '越高，同一组图片的差异越大', weird: '越高，结果越独特、越不寻常', iw: '越高，越接近参考图', seed: '相同种子有助于比较不同设置', hd: '高清输出可能增加耗时与费用', draft: '先快速探索构图', stop: '100 表示完整生成', tile: '生成可连续拼接的图案' };
        const description = field.description || descriptions[field.key] || '';
        if (description) { const help = document.createElement('small'); help.textContent = description; label.append(help); }
        container.append(label);
        const commit = () => {
          const value = readControl(control, field);
          if (value === undefined) delete state.values[field.key]; else state.values[field.key] = value;
          persist(state);
        };
        control.addEventListener('input', commit);
        control.addEventListener('change', () => { commit(); state.node.dispatchEvent(new Event('flora-midjourney-change', { bubbles: true })); });
      }
    }
    for (const control of container.querySelectorAll('[data-midjourney-field]')) {
      const key = control.dataset.midjourneyField;
      const value = key === 'variant' ? (versions.find(item => item.modelId === state.model.id && (rules().profile(state.model).fixedVersion || (item.version === state.values.version && item.niji === Boolean(state.values.niji))))?.key || '') : state.values[key] ?? '';
      if (control !== document.activeElement && control.value !== String(value)) control.value = String(value);
    }
    if (restoreFocus) container.querySelector(`[data-midjourney-field="${restoreFocus}"]`)?.focus();
  }
  function sync(node, model, preferred = {}, context = {}) {
    const container = node?.querySelector('.canvas-midjourney-options');
    if (!container || !rules()) return null;
    let state = states.get(node);
    if (!state || state.container !== container) {
      state = { node, container, model, context, values: { ...legacy(node), ...parse(node.dataset.canvasMidjourneyParameters) } };
      states.set(node, state);
    } else if (state.model.id !== model.id) state.values = {};
    state.model = model; state.context = context;
    const normalized = { ...preferred };
    if (normalized.__replace) state.values = {};
    delete normalized.__replace;
    if (normalized.mode !== undefined) normalized.niji = normalized.mode === 'niji';
    if (normalized.style !== undefined) normalized.raw = normalized.style === 'raw';
    if (normalized.quality === 'hd' || normalized.quality === 'sd') { normalized.hd = normalized.quality === 'hd'; delete normalized.quality; }
    for (const key of Object.keys(normalized)) if (normalized[key] === undefined) delete normalized[key];
    if (context.modelAvailable === false) {
      // A saved opaque ID may arrive before its catalog. Preserve its state
      // until the provider descriptor is available, then apply capability rules.
      state.values = { ...state.values, ...normalized };
      persist(state); container.hidden = true;
      root.FloraGeneratorParameters?.sync?.(node);
      return { known: false, values: { ...state.values }, fields: [] };
    }
    const description = rules().describe(model, { ...state.values, ...normalized }, context);
    state.values = { ...description.values };
    persist(state);
    const profile = { ...rules().profile(model), versions: versionChoices(model, context.catalog) };
    const show = rules().isMidjourney(model) && ((description.fields || []).length || (profile.versions || []).length);
    if (container.hidden === Boolean(show)) container.hidden = !show;
    if (show) render(state, description, profile);
    root.FloraGeneratorParameters?.sync?.(node);
    node.querySelector('.canvas-node-model')?.dispatchEvent(new CustomEvent('flora-model-presentation-refresh'));
    return description;
  }
  function payload(node) {
    const state = states.get(node);
    return state ? rules().payload(state.model, read(node), state.context) : {};
  }
  root.FloraMidjourneySettings = Object.freeze({ sync, read, payload, groupModels });
})(typeof window !== 'undefined' ? window : globalThis);
