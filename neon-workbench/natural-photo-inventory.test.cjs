const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

test("摄影执行拒绝自增展示支架并保留连续台面与构图变化", () => {
  const brief = {
    images: [], presentation: { support: "surface", placement: "组合整体斜放于连续石面", compositionChange: "由背视改为高位斜俯，对角线组织留白" },
  };
  const execute = text => photo.preparePresentation(brief, text, "高位斜俯", { required: true });
  assert.throws(() => execute("背面靠下的边缘由低矮透明支座稳固承托；支座不遮挡按键。"), /展示辅助件/);
  const prompt = execute("直接接触石面，以接触影表现重量；不添加亚克力支架。");
  assert.match(prompt, /组合整体斜放于连续石面/);
  assert.match(prompt, /由背视改为高位斜俯/);
  assert.equal(execute(prompt), prompt);
  assert.throws(() => photo.preparePresentation({ ...brief, presentation: null }, "自然光", "海报", { required: true }), /presentation/);
  assert.throws(() => photo.preparePresentation({ ...brief, presentation: { ...brief.presentation, support: "added" } }, "自然光", "海报"), /展示辅助件/);
});
const { naturalPhotoFidelity: photo } = require("../host-sources/app/canvas-agent-conversation");

const product = { nodeId: "product", url: "/output/product.jpg", type: "image", role: "product", sha256: "a".repeat(64) };
const style = { nodeId: "style", url: "/output/style.jpg", type: "image", role: "style", sha256: "b".repeat(64),
  libraryAssetId: "asset-01", refId: "REF-001", name: "柔光静物" };
const specimen = (id, name, count = 1) => ({
  id, name, count, appearance: "可见表面纹理", color: "米白", material: null,
  structure: "按可见轮廓记录结构", markings: "",
});
const scenarios = [
  ["香水与盒", "香水瓶", "包装盒", "packaging", "displayed-with", 1],
  ["护肤与泵头", "护肤瓶", "泵头", "components", "attached", 1],
  ["手机与壳", "手机", "手机壳", "components", "wrapped-by", 1],
  ["食品与包装", "饼干", "纸包装", "packaging", "inside", 4],
  ["鞋类", "鞋", "鞋带", "components", "attached", 2],
  ["服装", "外套", "纽扣", "components", "attached", 1],
  ["多商品", "杯", "碟", "targetObjects", "displayed-with", 2],
  ["连接部件", "相机", "镜头", "components", "attached", 1],
];
function fixture([, name, secondary, collection, kind, count]) {
  const subjectInventory = {
    targetObjects: [specimen("main", name, count)], components: [], accessories: [], packaging: [],
    props: [specimen("prop", "摄影布")],
    relationships: [{ id: "bond", from: "main", to: "related", kind, detail: "原图可见关系" }],
    unknowns: [{ targetId: "main", field: "material", detail: "实际材质无法确认", required: false }],
  };
  subjectInventory[collection].push(specimen("related", secondary));
  return {
    version: 2, analysis: "根据轮廓、视觉重心和展示面筛选构图。",
    images: [{
      nodeId: "product", subjectInventory,
      mustPreserve: [{ targetId: "main", aspect: "appearance" }],
      allowedTransformations: ["placement", "scale", "camera", "arrangement", "lighting"],
      prohibitedChanges: [{ targetId: "main", action: "remove" }],
    }],
  };
}
const parse = (brief, refs = [product]) =>
  photo.readBrief(JSON.stringify(brief), refs.map(ref => ref.nodeId), undefined, refs);

for (const row of scenarios) {
  test(row[0] + "逐图清单保存完整物理关系和创意空间", () => {
    const { images, references } = parse(fixture(row), [style, product]);
    const [item] = images;
    const { targetObjects, relationships, unknowns } = item.subjectInventory;
    assert.equal(targetObjects[0].name, row[1]);
    assert.equal(targetObjects[0].count, row[5]);
    assert.equal(relationships[0].kind, row[4]);
    assert.equal(unknowns[0].field, "material");
    assert.ok(item.mustPreserve.some(rule => rule.targetId === "related" && rule.aspect === "count"));
    assert.ok(!item.mustPreserve.some(rule => rule.targetId === "prop"));
    assert.deepEqual(references.map(ref => ref.role), ["style", "product"]);
    assert.equal(references[0].refId, "REF-001");
    const lock = photo.nodeLock(images, references, "后侧机位，右下留白，使用掠射光。");
    assert.deepEqual(photo.readNodeLock(JSON.stringify(lock)), lock);
    assert.match(lock.prompt, /【必须保留】[^]*【允许调整】[^]*【禁止改变】[^]*【未知信息】/);
    assert.doesNotMatch(lock.prompt, /禁止[：:]?\s*(保留|保持)/);
    assert.match(lock.prompt, /@图1.*仅参考摄影/);
    assert.match(lock.prompt, /@图2.*产品结构/);
    const packet = references.map(ref => ({ sourceNodeId: ref.nodeId, url: ref.url }));
    assert.deepEqual(photo.verifyRequest(lock, lock.prompt, packet), packet);
    assert.throws(() => photo.verifyRequest(lock, lock.prompt, packet.toReversed()), /重新确认/);
  });
}

test("通过对象与操作类型判定逻辑矛盾，不依赖保存或禁止字样", () => {
  const invalid = mutate => {
    const raw = fixture(scenarios[1]);
    mutate(raw.images[0]);
    assert.throws(() => parse(raw), /冲突|无效|不适用|未知|操作/);
  };
  invalid(item => item.prohibitedChanges.push({ targetId: "main", action: "preserve" }));
  invalid(item => item.prohibitedChanges.push({ targetId: "main", action: "reposition" }));
  invalid(item => item.allowedTransformations.push("detach"));
  invalid(item => item.mustPreserve.push({ targetId: "prop", aspect: "count" }));
  invalid(item => item.mustPreserve.push({ targetId: "main", aspect: "material" }));
  invalid(item => { item.subjectInventory.targetObjects[0].material = "玻璃"; });
  invalid(item => item.prohibitedChanges.push({ targetId: "main", action: "detach" }));
});

test("修改摄影方向时产品数据完全沿用，且关键未知阻止确认", () => {
  const original = parse(fixture(scenarios[2]));
  const changed = fixture(scenarios[0]);
  changed.analysis = "使用留白和侧逆光重做摄影方向。";
  const revised = photo.readBrief(JSON.stringify(changed), [product.nodeId], original.images, [product]);
  assert.deepEqual(revised.images, original.images);
  assert.notEqual(revised.analysis, original.analysis);
  changed.images[0].subjectInventory.unknowns[0].required = true;
  const unresolved = parse(changed);
  assert.throws(() => photo.nodeLock(unresolved.images, unresolved.references, "新布景"), /明确/);
});

test("模型提交只接受一次编码的完整 JSON，历史回读仍兼容围栏", () => {
  const data = fixture(scenarios[1]);
  const json = JSON.stringify(data);
  const fenced = "```json\n" + json + "\n```";
  const submit = value => photo.readBrief(value, [product.nodeId], undefined, [product], { modelSubmission: true });
  assert.deepEqual(photo.readBrief(fenced, [product.nodeId], undefined, [product]), parse(data));
  assert.deepEqual(submit(json), parse(data));
  for (const bad of [fenced, JSON.stringify(json), json.slice(0, -1), "保留包装", data]) {
    assert.throws(() => submit(bad), error => error.field === "known_context" && /JSON/.test(error.message));
  }
  delete data.images[0].subjectInventory.targetObjects[0].structure;
  assert.throws(() => submit(JSON.stringify(data)), error => /targetObjects\[0\]\.structure$/.test(error.field));
});

test("保留清楚的标识，安全归类不可辨细字，并保留真实冲突", () => {
  const data = fixture(scenarios[2]);
  const item = data.images[0];
  const inventory = item.subjectInventory;
  inventory.targetObjects[0].markings = "NILLKIN";
  inventory.unknowns = [{ targetId: "main", field: "markings", detail: "其余细小文字不可辨", required: false }];
  for (const field of ["mustPreserve", "allowedTransformations", "prohibitedChanges"]) delete item[field];
  const submit = () => photo.readBrief(JSON.stringify(data), [product.nodeId], undefined, [product], { modelSubmission: true });
  const [parsed] = submit().images;
  assert.equal(parsed.subjectInventory.unknowns[0].field, "unreadable-markings");
  assert.equal(parsed.subjectInventory.targetObjects[0].markings, "NILLKIN");
  assert.ok(parsed.mustPreserve.some(rule => rule.aspect === "markings"));
  inventory.unknowns[0].detail = "全部标识未知";
  assert.throws(submit, /markings.*冲突/);
  inventory.unknowns = "未知";
  assert.throws(submit, /未知项/);
  delete inventory.unknowns;
  assert.deepEqual(submit().images[0].subjectInventory.unknowns, []);
});

test("T16 与香水提示词只保留两个区块且旧节点可回读", () => {
  for (const scenario of [scenarios[0], scenarios[2]]) {
    const brief = parse(fixture(scenario));
    const creative = "低畸变机位，商品偏左，右上留白。窄侧逆光与哑光背景拉开轮廓。";
    const old = photo.nodeLock(brief.images, brief.references, creative);
    const compact = photo.nodeLock(brief.images, brief.references, creative, { compact: true });
    assert.ok(compact.prompt.length < old.prompt.length * 0.8, `${scenario[0]} ${compact.prompt.length}/${old.prompt.length}`);
    assert.deepEqual(compact.prompt.match(/【[^】]+】/gu), ["【产品依据】", "【摄影执行】"]);
    assert.match(compact.prompt, /× 1/);
    assert.equal(compact.mentions[0].sourceNodeId, product.nodeId);
    assert.doesNotMatch(compact.prompt, /支架|支座|底座|展示架/u);
    for (const lock of [old, compact]) assert.deepEqual(photo.readNodeLock(JSON.stringify(lock)), lock);
  }
});

test("仅将同一摄影运行中随后成功的失败记录标为已恢复", () => {
  const tool = (run, call, status) => ({ id: `tool_canvas_agent_123_${run}_call_${call}`, role: "tool",
    toolName: "request_design_brief", status, text: "known_context.images[0].subjectInventory.unknowns[1].field：markings 冲突" });
  const recovered = tool("abc1", "f", "failed");
  const unresolved = tool("abc2", "f", "failed");
  const later = tool("abc1", "g", "failed");
  assert.deepEqual([...photo.recoveredBriefIds([recovered, unresolved, tool("abc1", "s", "completed"), later])], [recovered.id]);
});

test("材质观感归入外观且保留未知实际材质，确认材质冲突仍拒绝", () => {
  const data = fixture(scenarios[2]);
  const image = data.images[0];
  image.subjectInventory.targetObjects[0].material = "半透明塑料观感";
  image.allowedTransformations.push("lighting");
  const submit = () => photo.readBrief(JSON.stringify(data), [product.nodeId], undefined, [product], { modelSubmission: true });
  const [normalized] = submit().images;
  assert.equal(normalized.subjectInventory.targetObjects[0].material, null);
  assert.match(normalized.subjectInventory.targetObjects[0].appearance, /半透明塑料观感/);
  assert.ok(normalized.allowedTransformations.includes("lighting"));
  assert.ok(normalized.mustPreserve.some(rule => rule.aspect === "appearance"));
  assert.equal(normalized.subjectInventory.unknowns[0].field, "material");
  image.subjectInventory.targetObjects[0].material = "铝合金";
  assert.throws(submit, error => /unknowns\[0\]\.field$/.test(error.field) && /main.*material/.test(error.message));
});

for (const shouldRecover of [true, false]) {
  test(shouldRecover ? "坏 JSON 后补救一次并进入确认卡" : "连续失败停止且保留具体字段和原资料", async () => {
    const source = fs.readFileSync(require.resolve("../host-sources/app/canvas-agent-ui.js"), "utf8");
    const effects = [];
    const run = { id: "qa", step: 2, maxSteps: 5, toolCallsUsed: 2, maxToolCalls: 5, photoSources: [product] };
    const valid = JSON.stringify(fixture(scenarios[2]));
    const context = vm.createContext({
      state: { currentRun: run },
      isCanvasAgentRunActive: () => true,
      executeCanvasAgentCallBatch: async calls => calls.map(call => {
        let output;
        try {
          const brief = photo.readBrief(call.raw, [product.nodeId], undefined, [product], { modelSubmission: true });
          output = { ok: true, decision_required: true, kind: "design_brief", brief };
        } catch (error) {
          output = { tool: "request_design_brief", ok: false, code: error.code, field: error.field, error: error.message };
        }
        return { output };
      }),
      continueCanvasAgentWithToolOutputs: async (feedback, responseId, runId, { repair }) => {
        effects.push(["retry", responseId, feedback[0].output.field, repair]);
        await context.executeCanvasAgentToolsAndContinue([{ raw: shouldRecover ? valid : "仍然不是 JSON" }], "repair", runId);
      },
      showCanvasAgentDesignBrief: async output => effects.push(["card", output.brief.images[0].nodeId]),
      restoreCanvasAgentWorkflowCard: () => effects.push(["restore"]),
      addCanvasAgentMessage: (_role, message) => effects.push(["message", message]),
      finishCanvasAgentRun: (status, message) => effects.push([status, message]),
    });
    for (const name of ["executeCanvasAgentToolsAndContinue", "repairNaturalPhotoBrief", "failNaturalPhotoBriefRepair"]) {
      const body = source.match(new RegExp(`^  async function ${name}\\([^]*?^  }`, "m"));
      vm.runInContext(body[0], context);
    }
    await context.executeCanvasAgentToolsAndContinue([{ raw: "```json\n{}\n```" }], "initial", run.id);
    assert.equal(effects.filter(([kind]) => kind === "retry").length, 1);
    assert.equal(effects[0][2], "known_context");
    assert.match(effects[0][3], /勿重新读(?:取)?资料/);
    assert.deepEqual(run.photoSources, [product]);
    if (shouldRecover) assert.deepEqual(effects.slice(1), [["card", "product"], ["waiting-brief", "等待确认需求"]]);
    else {
      assert.deepEqual(effects.map(([kind]) => kind), ["retry", "restore", "message", "failed"]);
      assert.match(effects.at(-1)[1], /known_context.*资料和素材已保留/);
    }
  });
}
