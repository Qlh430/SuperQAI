const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.join(__dirname, "src/lib/skill-showcase.ts");
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, filename);

test("Skill 名称、标识和范围形成确定顺序，不受精选、启用或接口顺序影响", () => {
  const compare = compiled.exports.compareSkills;
  assert.equal(typeof compare, "function");
  const skills = [
    { id: "b", label: "同名", scope: "personal" },
    { id: "photo", label: "商业产品摄影" },
    { id: "a", label: "同名", scope: "public" },
    { id: "fashion", label: "服装电商" },
    { id: "a", label: "同名", scope: "personal" },
    { id: "z", name: "同名" },
  ];
  const keys = values => values.map(item => `${item.id}:${item.scope || ""}`);
  const expected = ["fashion:", "photo:", "a:personal", "a:public", "b:personal", "z:"];
  for (let offset = 0; offset < skills.length; offset++) {
    const input = [...skills.slice(offset), ...skills.slice(0, offset)].reverse();
    assert.deepEqual(keys(input.sort(compare)), expected);
    assert.deepEqual(keys(input.map(item => ({ ...item, enabled: false, featured: true })).sort(compare)), expected);
  }
});
