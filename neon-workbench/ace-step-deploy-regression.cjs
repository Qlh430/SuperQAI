"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const deploy = fs.readFileSync(path.join(__dirname, "deploy.mjs"), "utf8").replaceAll("\r\n", "\n");
const patchSource = deploy.match(/export function patchAudioServerComposition[\s\S]*?\n}\n/)?.[0];
assert.ok(patchSource, "部署入口必须包含可验证的服务端接线");
const context = {};
vm.runInNewContext(patchSource.replace("export ", "") + "\nthis.patch = patchAudioServerComposition;", context);
const original = [
  "const assetLibrary = createAssetLibraryService({ db: systemDb });",
  "const createProviderHttpApiComponent = () => createProviderHttpApi({",
  "  store: providerStore,",
  "});",
].join("\n");
const patched = context.patch(original);
assert.equal(context.patch(patched), patched, "重复运行部署补丁必须保持幂等");
assert.match(patched, /aceStepTaskService: require\("\.\.\/ace-step-task-service\.cjs"\)/);
assert.match(patched, /ace-step-music\.json/);
assert.match(deploy, /"ace-step-task-service\.cjs"/);
assert.match(deploy, /"ace-step-music\.json"/);
const components = fs.readFileSync(path.join(__dirname, "component-deploy.mjs"), "utf8");
assert.match(components, /modules\["ace-step-backend"\]/);
assert.match(components, /"workflows\/ace-step-music\.json"/);
assert.match(components, /"server-components\/composition\.js"/);
new vm.Script(patched);
console.log("ACE-Step deployment composition and workflow packaging passed");
