const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('empty audio generators use the centered title/menu waveform icon alone', () => {
  const composer = read('neon-workbench/design-sources/flora-generator-composer.js');
  const visuals = read('neon-workbench/design-sources/canvas-node-visuals.js');
  const css = read('neon-workbench/design-sources/flora-node-shell.css');

  assert.match(composer, /const audioPlaceholder = node\.dataset\.floraKind === "audio-generator";/);
  assert.match(composer, /if \(!videoPlaceholder && !imagePlaceholder && !audioPlaceholder\) placeholder\.append\(label\);/);
  assert.match(visuals, /if\(!visual\.mediaSource\)\{[\s\S]*?const iconSize=80[\s\S]*?context\.moveTo\(2,10\);context\.lineTo\(2,13\)[\s\S]*?context\.moveTo\(22,10\);context\.lineTo\(22,13\)[\s\S]*?break;\s*\}/);
  assert.match(css, /\.flora-generator-placeholder svg[\s\S]*?width:\s*80px[\s\S]*?height:\s*80px/);
  assert.match(css, /\.canvas-audio-generator-empty[\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /\.canvas-audio-generator-result:not\(:has\(\.canvas-audio-preview\[src\]\)\)[\s\S]*?display:\s*none\s*!important/);
});

test('audio nodes share the landscape player footprint while generated playback controls remain', () => {
  const shell = read('neon-workbench/design-sources/flora-node-shell.js');
  const visualBridge = read('neon-workbench/design-sources/script-before-save-bridge.js');
  const css = read('neon-workbench/design-sources/flora-node-shell.css');

  assert.match(shell, /const compactAudio = \["audio", "asset-audio", "audio-generator"\]\.includes\(kind\);[\s\S]*?compactAudio\s*\?\s*FLORA_AUDIO_HEIGHT/);
  assert.match(visualBridge, /\['audio','audio-generator'\]\.includes\(model\.kind\)\) \{ bodyWidth = 400; bodyHeight = 128; \}/);
  assert.match(css, /\.canvas-node\[data-flora-node="true"\]:is\(\[data-flora-kind="audio"\], \[data-flora-kind="asset-audio"\], \[data-flora-kind="audio-generator"\]\)[\s\S]*?height: calc\(var\(--flora-node-height, 128px\) \+ 48px\)/);
  assert.match(css, /\.flora-audio-play/);
  assert.match(css, /\.flora-audio-timeline/);
  assert.match(css, /\.flora-audio-time/);
  assert.match(shell, /className = "flora-audio-player"/);
  assert.match(shell, /className = "flora-audio-timeline"/);
});
