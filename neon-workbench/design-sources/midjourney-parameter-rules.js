(function exposeMidjourneyParameterRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MidjourneyParameterRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMidjourneyParameterRules() {
  "use strict";

  // The matrix is the intersection of the APIMart Imagine schema and MJ's
  // version compatibility tables, checked 2026-10-09. In particular q=4 is
  // native V7 but absent from APIMart's documented enum; V8 draft is web-only.
  // https://docs.apimart.ai/cn/api-reference/images/midjourney/imagine
  // https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version
  // https://docs.midjourney.com/hc/en-us/articles/33329788681101-Legacy-Features
  // https://docs.midjourney.com/hc/en-us/articles/32040250122381-Image-Prompts
  // https://docs.midjourney.com/hc/en-us/articles/35577175650957-Draft-Conversational-Modes
  const VERSIONS = Object.freeze([
    { key: "8.2", label: "Midjourney V8.2", version: "8.2", niji: false },
    { key: "8.1", label: "Midjourney V8.1", version: "8.1", niji: false },
    { key: "7", label: "Midjourney V7", version: "7", niji: false },
    { key: "6.1", label: "Midjourney V6.1", version: "6.1", niji: false },
    { key: "5.2", label: "Midjourney V5.2", version: "5.2", niji: false },
    { key: "5.1", label: "Midjourney V5.1", version: "5.1", niji: false },
    { key: "niji7", label: "Niji 7（动漫）", version: "7", niji: true },
    { key: "niji6", label: "Niji 6（动漫）", version: "6", niji: true },
  ]);
  const LABELS = Object.freeze({
    speed: "生成速度", quality: "生成质量", hd: "高清输出", raw: "更贴近提示词", stylize: "艺术风格强度",
    chaos: "变化程度", weird: "创意偏离", iw: "参考图影响", seed: "随机种子", tile: "无缝平铺",
    draft: "快速草图", stop: "完成程度", repeat: "重复生成次数", cw: "角色参考影响", sw: "风格参考影响",
    dw: "深度参考影响", cref: "角色参考图", sref: "风格参考图", dref: "深度参考图", negative_prompt: "排除内容",
    nsfw_check: "内容审核", metadata: "任务元数据", style: "风格", version: "模型版本", niji: "动漫模型",
  });
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function idOf(model) { return String(typeof model === "string" ? model : model?.modelId || model?.metadata?.upstreamModel || model?.upstreamModel || model?.id || model?.model || "").trim(); }
  function protocols(model) {
    const m = object(model), meta = object(m.metadata);
    return [m.protocol, m.modelProtocol, m.providerProtocol, m.platform, meta.protocol, meta.modelProtocol, meta.providerProtocol, meta.platform]
      .map(value => String(value || "").trim().toLowerCase()).filter(Boolean);
  }
  function isMidjourney(model) {
    return protocols(model).some(value => ["midjourney", "apimart-midjourney"].includes(value))
      || /midjourney|^mj(?:[@/_-]|$)|^niji(?:[\s_-]?\d|$)/i.test(idOf(model));
  }
  function verifiedCapabilities(model) {
    const meta = object(model?.metadata);
    const candidate = object(meta.midjourneyCapabilities || model?.midjourneyCapabilities);
    return candidate.verified === true ? candidate : {};
  }
  function parseVariant(value) {
    const text = String(value || "").toLowerCase().replace(/^v(?=\d)/, "");
    const match = text.match(/^(?:niji[\s_-]*)?(8\.2|8\.1|7|6\.1|6|5\.2|5\.1)$/);
    if (!match) return null;
    return VERSIONS.find(item => item.version === match[1] && item.niji === /^niji/.test(text)) || null;
  }
  function profile(model) {
    const mj = isMidjourney(model), ps = protocols(model), caps = verifiedCapabilities(model);
    const modelProtocol = String(model?.modelProtocol || model?.protocol || model?.metadata?.modelProtocol || "").toLowerCase();
    const host = String(model?.providerHost || model?.metadata?.providerHost || model?.baseUrl || "").toLowerCase();
    const explicit = ["midjourney", "apimart-midjourney"].includes(modelProtocol);
    const foreign = ps.some(value => ["runninghub", "comfyui", "image-relay"].includes(value));
    const known = mj && (explicit || (!foreign && (ps.some(value => ["apimart", "midjourney", "apimart-midjourney"].includes(value))
      || /(?:^|[/.])apimart\.ai(?:[/:]|$)/.test(host)
      || (idOf(model).toLowerCase() === "midjourney" && !ps.length))));
    const versions = known ? VERSIONS.map(item => ({ ...item })) : (Array.isArray(caps.versions) ? caps.versions.flatMap(value => {
      const item = parseVariant(typeof value === "object" ? value.key || `${value.niji ? "niji" : ""}${value.version}` : value);
      return item ? [{ ...item }] : [];
    }) : []);
    const id = idOf(model).toLowerCase();
    const fixed = id.match(/(?:^|[@/_-])(?:niji[\s_-]*|v)?(\d+(?:\.\d+)?)(?=$|[-_@/])/);
    const pinned = fixed && parseVariant(`${/niji/.test(id) ? "niji" : ""}${fixed[1]}`);
    const fixedSpeed = id.match(/(?:^|[-_@/])(relax|fast|turbo)$/)?.[1];
    // A version-specific catalog item is never expanded into invented sibling
    // models. Versions outside the verified matrix have metadata-only controls.
    return { known: known && (!fixed || Boolean(pinned)), versions: fixed && !pinned ? [] : versions,
      ...(known && fixed && !pinned ? { unsupportedVersion: true } : {}),
      ...(fixed ? { fixedVersion: fixed[1], fixedNiji: /niji/.test(id) } : {}), ...(fixedSpeed ? { fixedSpeed } : {}) };
  }
  function variants(model) { const p = profile(model); return p.fixedVersion ? [] : p.versions; }
  function defaults(model) {
    return { ...object(model?.metadata?.parameterOverrides), ...object(model?.parameterOverrides) };
  }
  function absent(value) { return value === undefined || value === null || (typeof value === "string" && ["", "auto", "default"].includes(value.trim().toLowerCase())); }
  function boolean(value) {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return undefined;
  }
  function numberField(key, min, max, step = 1) { return { key, label: LABELS[key], type: "number", min, max, step }; }
  function booleanField(key) { return { key, label: LABELS[key], type: "boolean" }; }
  function selectField(key, options) { return { key, label: LABELS[key], type: "select", options }; }
  function selection(model, values, strict) {
    const p = profile(model);
    if (strict && p.unsupportedVersion) invalid("version", "当前接入尚未确认支持这个独立版本，请选择已支持的模型版本。");
    let version = absent(values.version) ? "7" : String(values.version).trim();
    let niji = absent(values.niji) ? false : boolean(values.niji);
    const variant = parseVariant(version);
    if (variant?.niji) { version = variant.version; niji = true; }
    if (niji === undefined) { if (strict) invalid("niji"); niji = false; }
    if (p.fixedVersion) { version = p.fixedVersion; niji = p.fixedNiji; }
    const match = p.versions.find(item => item.version === version && item.niji === niji);
    if (!match && p.versions.length) {
      if (strict) invalid("version", "当前接入不支持此版本。");
      const fallback = p.versions.find(item => item.key === "7") || p.versions[0];
      version = fallback.version; niji = fallback.niji;
    }
    return { p, version, niji };
  }
  function schema(model, values, context, strict) {
    const selected = selection(model, values, strict), { p, version, niji } = selected;
    if (!isMidjourney(model)) return { ...selected, fields: [], allowed: {} };
    if (!p.known) {
      const allowed = {};
      for (const [key, spec] of Object.entries(object(verifiedCapabilities(model).parameters))) {
        if (!LABELS[key] || !["number", "boolean", "select", "text"].includes(spec?.type)) continue;
        if (key === "iw" && !context.hasImages) continue;
        if (spec.type === "select" && (!Array.isArray(spec.options) || !spec.options.length)) continue;
        allowed[key] = { ...spec, key, label: LABELS[key] };
      }
      return { ...selected, allowed, fields: Object.values(allowed).filter(field => !["version", "niji"].includes(field.key)) };
    }
    const v8 = !niji && /^8\./.test(version), v5 = !niji && /^5\./.test(version);
    const speed = [{ value: "relax", label: "慢速（省成本）" }, { value: "fast", label: "快速" }, ...(!v8 && !niji ? [{ value: "turbo", label: "极速" }] : [])];
    const fields = [selectField("speed", speed)];
    if (!v8 && !niji) fields.push(selectField("quality", (v5 ? ["0.25", "0.5", "1"] : version === "7" ? ["1", "2"] : ["0.5", "1", "2"]).map(value => ({ value, label: ({ "0.25": "省时 · 1/4", "0.5": "省时 · 1/2", "1": "标准", "2": "精细 · 2倍耗时" })[value] }))));
    if (v8) fields.push(booleanField("hd"));
    fields.push(booleanField("raw"), numberField("stylize", 0, 1000), numberField("chaos", 0, 100));
    if (!niji) fields.push(numberField("weird", 0, 3000));
    if (context.hasImages) fields.push(numberField("iw", v5 ? 0.5 : 0, v5 || (niji && version === "7") ? 2 : 3, 0.1));
    fields.push(numberField("seed", 0, 4294967295), booleanField("tile"));
    if (!niji && version === "7") fields.push(booleanField("draft"));
    if (v5 || version === "6.1" || (niji && version === "6")) fields.push(numberField("stop", 10, 100));
    const allowed = Object.fromEntries(fields.map(field => [field.key, field]));
    // These schema fields can come from verified model defaults / legacy nodes;
    // URL and text inputs stay with their existing reference/prompt controls.
    allowed.repeat = numberField("repeat", 2, 40);
    allowed.negative_prompt = { key: "negative_prompt", type: "text" };
    allowed.nsfw_check = booleanField("nsfw_check");
    allowed.metadata = { key: "metadata", type: "object" };
    if (!v5) {
      allowed.sref = { key: "sref", type: "text" };
      if (!absent(values.sref)) allowed.sw = numberField("sw", 0, 1000);
    }
    if (version === "6.1" || (niji && version === "6")) {
      allowed.cref = { key: "cref", type: "text" };
      if (!absent(values.cref)) allowed.cw = numberField("cw", 0, 100);
    }
    return { ...selected, fields: p.fixedSpeed ? fields.filter(field => field.key !== "speed") : fields, allowed };
  }
  function invalid(key, detail = "") {
    throw Object.assign(new Error(`Midjourney「${LABELS[key] || key}」无效。${detail}`), { code: "UPSTREAM_PROTOCOL", retryable: false, parameterValidation: true });
  }
  function normalize(field, value, strict) {
    if (field.type === "text" ? value === undefined || value === null || value === "" : absent(value)) return undefined;
    let normalized;
    if (field.type === "boolean") normalized = boolean(value);
    else if (field.type === "number") {
      normalized = typeof value === "number" || (typeof value === "string" && /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) ? Number(value) : NaN;
      if (!Number.isFinite(normalized) || normalized < field.min || normalized > field.max || (field.step === 1 && !Number.isInteger(normalized))) normalized = undefined;
    } else if (field.type === "select") {
      normalized = String(value).trim();
      if (!field.options.some(option => String(typeof option === "object" ? option.value : option) === normalized)) normalized = undefined;
    } else if (field.type === "text") normalized = typeof value === "string" ? value.trim() : undefined;
    else if (field.type === "object") normalized = value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
    if (normalized === undefined && strict) invalid(field.key, field.type === "number" ? `请输入 ${field.min} 到 ${field.max}${field.step === 1 ? " 的整数" : " 的数值"}。` : "请选择当前模型支持的选项。");
    // Keep bad numeric input visible, so submitting cannot silently clamp it.
    return normalized === undefined && !strict && field.type === "number" ? value : normalized;
  }
  function state(model, values = {}, context = {}, strict = false) {
    const merged = { ...defaults(model), ...Object.fromEntries(Object.entries(object(values)).filter(([, value]) => value !== undefined)) };
    if (absent(merged.raw) && merged.style === "raw") merged.raw = true;
    const info = schema(model, merged, context, strict), clean = {};
    if (info.p.versions.length) { clean.version = info.version; clean.niji = info.niji; }
    if (info.p.fixedSpeed) merged.speed = info.p.fixedSpeed;
    for (const [key, field] of Object.entries(info.allowed)) {
      const value = normalize(field, merged[key], strict);
      if (value !== undefined) clean[key] = value;
    }
    return { known: info.p.known, values: clean, fields: info.fields, version: info.p.versions.length ? info.version : "", niji: info.niji };
  }
  function describe(model, values = {}, context = {}) { return state(model, values, context, false); }
  function payload(model, values = {}, context = {}) {
    const clean = state(model, values, context, true).values;
    // Explicit off must survive a round trip: dropping false here would let
    // the backend reapply a provider's true parameter override.
    const configuredNiji = !absent(values.niji) || !absent(defaults(model).niji) || parseVariant(String(values.version || defaults(model).version || ""))?.niji;
    return Object.fromEntries(Object.entries(clean).filter(([key, value]) => key !== "niji" || value !== false || configuredNiji));
  }
  return Object.freeze({ isMidjourney, profile, variants, describe, payload });
});
