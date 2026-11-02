const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'src/pages/history.tsx'), 'utf8')

test('history page renders newly received records without a manual reveal step', () => {
  assert.doesNotMatch(source, /shownKeys|pendingCount|显示 \{pendingCount\} 条新记录/)
})
