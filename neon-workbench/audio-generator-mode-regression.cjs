const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const audio = fs.readFileSync(path.join(root, 'design-sources/canvas-audio-generator.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'design-sources/canvas-audio-generator.css'), 'utf8');
const composer = fs.readFileSync(path.join(root, 'design-sources/flora-generator-composer.js'), 'utf8');
const components = fs.readFileSync(path.join(root, 'component-deploy.mjs'), 'utf8');

assert.match(audio, /canvas-audio-generator-mode/, '音频节点必须有音乐/语音模式控件');
assert.match(audio, /\[\['music',\s*'音乐'\]/, '必须支持音乐模式');
assert.match(audio, /\['speech',\s*'语音'\]/, '必须支持语音模式');
assert.match(audio, /canvas-audio-generator-lyrics/, '音乐模式必须有歌词输入区');
assert.match(audio, /canvas-audio-generator-speed/, '语音模式必须有语速控件');
assert.match(audio, /canvas-audio-generator-voice/, '语音模式必须有音色控件');
assert.match(audio, /keyscale.*调式|调式.*keyscale/, 'ACE-Step 的调式必须在设置中可选');
assert.match(audio, /BPM/, 'ACE-Step 的 BPM 必须在设置中配置');
assert.doesNotMatch(audio, /placeholder\s*=\s*['"][^'"]*BPM/, '音乐提示词占位说明不得再要求填写 BPM');
assert.match(audio, /modelMode|audio-speech/, '模型目录必须按音乐/语音模式过滤');
assert.match(audio, /getPrompt/, '生成请求必须读取当前模式的输入');
assert.doesNotMatch(audio, /canvas-audio-generator-cost|费用|价格/, '音频操作区不应增加费用按钮');
assert.match(css, /canvas-audio-generator-mode/, '模式控件必须有样式');
assert.match(css, /canvas-audio-generator-lyrics/, '歌词输入区必须有样式');
assert.match(composer, /canvas-audio-generator-lyrics/, '操作区必须接管歌词输入区');
assert.match(components, /canvas-audio-generator\.js/, '音频组件部署必须包含音频生成脚本');
console.log('audio generator mode contract passed');
