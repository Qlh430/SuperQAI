const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('video generator registration and menus use the play-square icon', () => {
  const catalog = read('host-sources/app/canvas-node-catalog.js');
  const shell = read('neon-workbench/design-sources/flora-node-shell.js');
  const representation = read('neon-workbench/design-sources/canvas-representation-host.js');
  const bridge = read('neon-workbench/design-sources/script-before-save-bridge.js');

  assert.match(catalog, /id:\s*["']minimax-h3["'][^\n]*icon:\s*["']play-square["']/);
  assert.match(catalog, /id:\s*["']video-api["'][^\n]*icon:\s*["']play-square["']/);
  assert.match(shell, /["']minimax-h3["']:\s*\{[^\n]*icon:\s*["']play-square["']/);
  assert.match(shell, /["']video-api["']:\s*\{[^\n]*icon:\s*["']play-square["']/);
  assert.match(representation, /["']minimax-h3["']:\s*\{[^\n]*icon:\s*["']play-square["']/);
  assert.match(representation, /["']video-api["']:\s*\{[^\n]*icon:\s*["']play-square["']/);
  assert.equal((bridge.match(/data-canvas-node="video-generator"[^>]*>[\s\S]*?data-lucide="play-square"/g) || []).length, 1);
  assert.equal((bridge.match(/data-connect-node="video-generator"[^>]*>[\s\S]*?data-lucide="play-square"/g) || []).length, 1);
});

test('Flora image and video generator placeholders use larger centered icons without result labels', () => {
  const composer = read('neon-workbench/design-sources/flora-generator-composer.js');
  assert.match(composer, /rect\.setAttribute\("x", "2"\)[\s\S]*rect\.setAttribute\("y", "4"\)[\s\S]*rect\.setAttribute\("width", "20"\)[\s\S]*rect\.setAttribute\("height", "16"\)[\s\S]*rect\.setAttribute\("rx", "5"\)/);
  assert.match(composer, /play\.setAttribute\("d", "M9\.4 8\.2 Q8\.5 7\.7 8\.5 8\.8 L8\.5 15\.2 Q8\.5 16\.3 9\.4 15\.8 L15\.6 12\.4 Q16\.6 12 15\.6 11\.6 Z"\)/);
  assert.match(composer, /icon\.setAttribute\("viewBox", "0 0 24 24"\)/);
  assert.match(composer, /"video-api", "minimax-h3"/);
  assert.match(composer, /const imagePlaceholder = node\.dataset\.floraKind === "generator";/);
  assert.match(composer, /const audioPlaceholder = node\.dataset\.floraKind === "audio-generator";/);
  assert.match(composer, /if \(!videoPlaceholder && !imagePlaceholder && !audioPlaceholder\) placeholder\.append\(label\);/);
  const shellCss = read('neon-workbench/design-sources/flora-node-shell.css');
  assert.match(shellCss, /\.flora-generator-placeholder svg[\s\S]*?width:\s*80px[\s\S]*?height:\s*80px/);
  assert.match(shellCss, /\.flora-generator-placeholder \.flora-video-placeholder-icon[\s\S]*?width:\s*80px[\s\S]*?height:\s*80px/);
});

test('video light placeholder draws a rounded play-square instead of a camera glyph', () => {
  const visuals = read('neon-workbench/design-sources/canvas-node-visuals.js');
  assert.match(visuals, /const placeholder = \(video=false\) => \{/);
  assert.match(visuals, /roundRect\(video\?2:3,video\?4:3,video\?20:18,video\?16:18,video\?5:2\)/);
  assert.match(visuals, /moveTo\(9\.4,8\.2\);context\.quadraticCurveTo\(8\.5,7\.7,8\.5,8\.8\);context\.lineTo\(8\.5,15\.2\);context\.quadraticCurveTo\(8\.5,16\.3,9\.4,15\.8\);context\.lineTo\(15\.6,12\.4\);context\.quadraticCurveTo\(16\.6,12,15\.6,11\.6\)/);
  assert.ok(visuals.includes('const iconSize = 80;'));
  assert.ok(visuals.includes('if (video || visual.renderer === \'image-generator\') return;'));
  assert.doesNotMatch(visuals, /if\(video\)\{context\.beginPath\(\);context\.moveTo\(16,13\)/);
});
