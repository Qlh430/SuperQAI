'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { missingCanvasRepresentationMethods } = require('./canvas-representation-contract.cjs');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'neon-workbench/design-sources');
const bridge = fs.readFileSync(path.join(sourceRoot, 'script-before-save-bridge.js'), 'utf8');
const host = fs.readFileSync(path.join(sourceRoot, 'canvas-representation-host.js'), 'utf8');
const packager = fs.readFileSync(path.join(__dirname, 'package-v304.cjs'), 'utf8');

assert.deepEqual(missingCanvasRepresentationMethods(bridge, host), [], '开发源码中的画布 bridge 与 representation host 接口必须匹配');

const staleHost = host.replace(/^\s{4}restoreTextScroll\(node\)\s*\{[\s\S]*?^\s{4}\}\r?\n/m, '');
assert.deepEqual(
  missingCanvasRepresentationMethods(bridge, staleHost),
  ['restoreTextScroll'],
  '旧 Host 缺少滚动恢复方法时必须被接口审计识别'
);

assert.match(packager, /canvas-fullscreen-original-preview,canvas-light-visual/, '发布时必须同时装配画布 bridge 与 representation host');
assert.match(packager, /assertCanvasRepresentationCompatible\(/, '发布候选必须在写入清单前校验画布接口');

console.log('canvas representation release contract passed');
