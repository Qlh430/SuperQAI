const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'host-sources', 'app', 'startup-overlay.js'),
  'utf8',
);

assert.match(
  source,
  /if \(finished && !gate\.classList\.contains\("has-error"\)\) return;/,
  '失败状态下点击“重新加载”必须允许继续释放启动遮罩',
);
assert.match(
  source,
  /gate\.classList\.remove\("has-error"\)/,
  '释放启动遮罩时必须清除错误状态',
);

console.log('startup overlay recovery contract passed');
