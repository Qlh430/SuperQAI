(function initCanvasAgentBroker(root, factory) {
  const capabilities = typeof module === "object" && module.exports
    ? require("./canvas-agent-capabilities")
    : root?.CanvasAgentCapabilities;
  const api = factory(capabilities);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentBroker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentBrokerApi(CanvasAgentCapabilities) {
  if (!CanvasAgentCapabilities) throw new Error("CanvasAgentCapabilities is required before CanvasAgentBroker.");
  const MAX_BATCH_TARGETS = CanvasAgentCapabilities.MAX_BATCH_TARGETS || 40;

  function createBroker(options = {}) {
    const getCurrentBoardId = typeof options.getCurrentBoardId === "function"
      ? options.getCurrentBoardId
      : () => "";
    const adapters = options.adapters && typeof options.adapters === "object" ? options.adapters : {};
    const nextFrame = typeof options.nextFrame === "function" ? options.nextFrame : defaultNextFrame;
    let scopeVersion = 0;
    let activeScope = null;
    let invalidationReason = "";
    const completed = new Map();

    function beginRun(input = {}) {
      const boardId = String(input.boardId || "").trim();
      const runId = String(input.runId || "").trim();
      if (!boardId) throw new Error("Canvas Agent scope requires boardId.");
      if (!runId) throw new Error("Canvas Agent scope requires runId.");
      scopeVersion += 1;
      completed.clear();
      invalidationReason = "";
      activeScope = Object.freeze({
        boardId,
        runId,
        scopeVersion,
        abortSignal: input.abortSignal || null,
      });
      return activeScope;
    }

    function invalidate(reason = "scope-invalidated") {
      invalidationReason = String(reason || "scope-invalidated");
      scopeVersion += 1;
      activeScope = null;
      completed.clear();
    }

    function isActive(scope) {
      return Boolean(
        scope
        && scope === activeScope
        && scope.scopeVersion === scopeVersion
        && !scope.abortSignal?.aborted
        && String(getCurrentBoardId() || "") === scope.boardId,
      );
    }

    function assertActive(scope) {
      if (isActive(scope)) return true;
      const error = new Error("当前画布已改变，旧任务已安全停止。");
      error.code = "scope_expired";
      error.reason = invalidationReason || "board-changed";
      throw error;
    }

    function validateEnvelope(scope, call) {
      const boardId = String(call?.board_id || scope.boardId);
      const runId = String(call?.run_id || scope.runId);
      if (boardId !== scope.boardId || runId !== scope.runId) {
        const error = new Error("工具调用不属于当前画布任务。");
        error.code = "scope_mismatch";
        throw error;
      }
      const callId = String(call?.call_id || "").trim();
      if (!callId) {
        const error = new Error("工具调用缺少有效标识。");
        error.code = "invalid_call";
        throw error;
      }
      return callId;
    }

    function validateCapability(call) {
      const capability = CanvasAgentCapabilities.getCapabilityByToolName(call?.name);
      if (!capability || typeof adapters[call.name] !== "function") {
        const error = new Error("这个画布操作当前不可用。");
        error.code = "unsupported_tool";
        throw error;
      }
      const args = applySchemaDefaults(capability.tool?.inputSchema, call?.arguments);
      call.arguments = args;
      validateSchema(capability.tool?.inputSchema, args, "参数");
      const count = getTargetCount(args);
      if (count > MAX_BATCH_TARGETS) {
        const error = new Error(`一次最多处理 ${MAX_BATCH_TARGETS} 个节点。`);
        error.code = "too_many_targets";
        throw error;
      }
      if (["create_grid_editor_node", "update_grid_editor"].includes(call.name)
        && Number.isInteger(args.rows)
        && Number.isInteger(args.columns)
        && args.rows * args.columns > MAX_BATCH_TARGETS) {
        const error = new Error(`Agent 一次最多处理 ${MAX_BATCH_TARGETS} 个宫格。`);
        error.code = "too_many_targets";
        throw error;
      }
      return capability;
    }

    async function execute(scope, call = {}) {
      let executionKey = "";
      let callFingerprint = "";
      try {
        assertActive(scope);
        const callId = validateEnvelope(scope, call);
        const capability = validateCapability(call);
        executionKey = `${scope.runId}:${callId}`;
        callFingerprint = createCallFingerprint(call);
        if (completed.has(executionKey)) {
          const existing = completed.get(executionKey);
          if (existing.fingerprint !== callFingerprint) {
            const error = new Error("同一个工具调用标识不能用于不同的操作。");
            error.code = "call_id_conflict";
            return createErrorOutput(call, error);
          }
          return await existing.value;
        }
        const execution = (async () => {
          try {
            const context = Object.freeze({
              scope,
              capability,
              assertActive,
              isActive,
              nextFrame,
              forEachBatched: (items, handler) => forEachBatched(items, handler, scope),
            });
            const value = await adapters[call.name](call.arguments || {}, context);
            assertActive(scope);
            return value?.ok === false
              ? { tool: call.name, ...value }
              : { ok: true, tool: call.name, ...(value && typeof value === "object" ? value : { result: value }) };
          } catch (error) {
            return createErrorOutput(call, error);
          }
        })();
        completed.set(executionKey, { fingerprint: callFingerprint, value: execution });
        const output = await execution;
        if (output.code === "scope_expired") completed.delete(executionKey);
        else completed.set(executionKey, { fingerprint: callFingerprint, value: output });
        return output;
      } catch (error) {
        const output = createErrorOutput(call, error);
        if (executionKey && callFingerprint && output.code !== "scope_expired") {
          completed.set(executionKey, { fingerprint: callFingerprint, value: output });
        }
        return output;
      }
    }

    async function forEachBatched(items, handler, scope = activeScope) {
      const list = Array.isArray(items) ? items.slice(0, MAX_BATCH_TARGETS) : [];
      const results = [];
      for (let index = 0; index < list.length; index += 1) {
        assertActive(scope);
        results.push(await handler(list[index], index));
        if ((index + 1) % 12 === 0 && index + 1 < list.length) {
          await nextFrame();
          assertActive(scope);
        }
      }
      return results;
    }

    function classifyCalls(calls) {
      return (Array.isArray(calls) ? calls : []).map((call) => ({
        ...call,
        risk: CanvasAgentCapabilities.getRisk(call?.name, call?.arguments || {}),
        targetCount: getTargetCount(call?.arguments || {}),
      }));
    }

    return Object.freeze({
      beginRun,
      invalidate,
      isActive,
      assertActive,
      execute,
      classifyCalls,
      getActiveScope: () => activeScope,
    });
  }

  function getTargetCount(args = {}) {
    const targetArrays = ["node_ids", "reference_node_ids", "image_ids", "remove_image_ids", "add_node_ids"];
    const arrayCount = targetArrays.reduce((total, key) => total + (Array.isArray(args[key]) ? args[key].length : 0), 0);
    if (arrayCount) return arrayCount;
    if (args.node_id || args.from_id || args.to_id || args.source_node_id || args.group_id) return 1;
    return 0;
  }

  function createCallFingerprint(call = {}) {
    return `${String(call.name || "")}\n${stableSerialize(call.arguments || {})}`;
  }

  function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function validateSchema(schema, value, path) {
    if (!schema || typeof schema !== "object") return;
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (schema.type && !allowedTypes.some((type) => matchesJsonType(value, type))) {
      throw createInvalidArgumentsError(`${path}类型不正确。`);
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      throw createInvalidArgumentsError(`${path}不是允许的值。`);
    }
    if (typeof value === "number") {
      if (Number.isFinite(schema.minimum) && value < schema.minimum) throw createInvalidArgumentsError(`${path}小于允许范围。`);
      if (Number.isFinite(schema.maximum) && value > schema.maximum) throw createInvalidArgumentsError(`${path}超过允许范围。`);
    }
    if (Array.isArray(value)) {
      if (Number.isInteger(schema.minItems) && value.length < schema.minItems) throw createInvalidArgumentsError(`${path}数量不足。`);
      if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) throw createInvalidArgumentsError(`${path}数量超过上限。`);
      value.forEach((item, index) => validateSchema(schema.items, item, `${path}[${index}]`));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const properties = schema.properties || {};
      for (const key of schema.required || []) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) throw createInvalidArgumentsError(`${path}.${key}缺失。`);
      }
      if (schema.additionalProperties === false) {
        const extra = Object.keys(value).find((key) => !Object.prototype.hasOwnProperty.call(properties, key));
        if (extra) throw createInvalidArgumentsError(`${path}.${extra}不受支持。`);
      }
      Object.entries(properties).forEach(([key, propertySchema]) => {
        if (Object.prototype.hasOwnProperty.call(value, key)) validateSchema(propertySchema, value[key], `${path}.${key}`);
      });
    }
  }

  function applySchemaDefaults(schema, value) {
    if (!schema || typeof schema !== "object") return value;
    if (Array.isArray(value)) {
      const itemSchema = schema.items;
      return value.map((item) => applySchemaDefaults(itemSchema, item));
    }
    if (!value || typeof value !== "object") return value;
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    const result = { ...value };
    Object.entries(properties).forEach(([key, propertySchema]) => {
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        result[key] = applySchemaDefaults(propertySchema, result[key]);
        return;
      }
      const inferredDefault = inferSchemaDefault(propertySchema);
      if (inferredDefault.hasDefault) {
        result[key] = cloneSchemaDefault(inferredDefault.value);
      }
    });
    return result;
  }

  function inferSchemaDefault(schema) {
    if (!schema || typeof schema !== "object") return { hasDefault: false, value: undefined };
    if (Object.prototype.hasOwnProperty.call(schema, "default")) {
      return { hasDefault: true, value: schema.default };
    }
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (types.includes("null")) return { hasDefault: true, value: null };
    if (schema.type === "array") return { hasDefault: true, value: [] };
    return { hasDefault: false, value: undefined };
  }

  function cloneSchemaDefault(value) {
    if (Array.isArray(value)) return value.map(cloneSchemaDefault);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneSchemaDefault(item)]));
    }
    return value;
  }

  function matchesJsonType(value, type) {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    if (type === "integer") return Number.isInteger(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    if (type === "string") return typeof value === "string";
    if (type === "boolean") return typeof value === "boolean";
    return true;
  }

  function createInvalidArgumentsError(message) {
    const error = new Error(message);
    error.code = "invalid_arguments";
    return error;
  }

  function createErrorOutput(call, error) {
    return {
      ok: false,
      tool: String(call?.name || ""),
      code: String(error?.code || "tool_failed"),
      error: getUserFacingError(error),
    };
  }

  function getUserFacingError(error) {
    if (error?.code === "scope_expired") return "当前画布已改变，旧任务已安全停止。";
    if (error?.code === "scope_mismatch") return "这个操作不属于当前画布，已阻止执行。";
    if (error?.code === "unsupported_tool") return "这个画布操作当前不可用。";
    return String(error?.message || "画布操作没有完成。").slice(0, 320);
  }

  function defaultNextFrame() {
    if (typeof requestAnimationFrame === "function") {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    return Promise.resolve();
  }

  return Object.freeze({ MAX_BATCH_TARGETS, createBroker });
});
