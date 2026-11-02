const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8');
const start = source.indexOf('function openCanvasImageOriginalPreview');
const end = source.indexOf('function deleteCanvasImageSelection', start);
assert.ok(start >= 0 && end > start, 'fullscreen preview source resolver must exist');
const body = source.slice(start, end);
const originalPriority = [
  'node?.dataset?.originalSrc',
  'node?.dataset?.resultDownloadUrl',
  'image?.getAttribute?.("data-original-src")',
  'node?.dataset?.imageSrc',
  'node?.dataset?.resultSrc',
];
let cursor = -1;
for (const token of originalPriority) {
  const next = body.indexOf(token);
  assert.ok(next > cursor, `fullscreen preview must prioritize ${token}`);
  cursor = next;
}
console.log('canvas fullscreen original source contract passed');
