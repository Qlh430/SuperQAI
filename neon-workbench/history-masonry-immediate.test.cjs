const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const source = fs.readFileSync(`${__dirname}/src/components/history-masonry.tsx`, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText
const componentModule = { exports: {} }
vm.runInNewContext(compiled, {
  module: componentModule,
  exports: componentModule.exports,
  require,
  setTimeout,
  AbortSignal,
  fetch,
})

const { HistoryMasonry } = componentModule.exports
const rows = [{
  key: 'image-1',
  entry: { resource: { type: 'image', metadata: {} }, preview: { url: '/output/image-1.png' } },
  render: () => React.createElement('article', { key: 'image-1', 'data-history-key': 'image-1' }, 'history image'),
}]
const markup = renderToStaticMarkup(React.createElement(HistoryMasonry, { rows }))

assert.match(markup, /data-history-key="image-1"/, 'history cards render before image dimensions resolve')
assert.doesNotMatch(markup, /正在准备原比例缩略图/, 'the page does not block its content on dimension preparation')
